# -*- coding: utf-8 -*-
"""音声文字起こしテキストから配車の下書きを作る解析ロジック。

方針(レビュー・すり合わせ済み):
- AI/LLMは使わず、正規表現+既存マスタ照合のみ(将来AI連携に置き換え可能な形にしておく)
- 曖昧・未一致は絶対に自動確定しない。呼び出し側(ルート)が人間の確認を必ず挟む
- 現場(sites)照合は sites テーブルのみを見る。clients には絶対にフォールバックしない
  (実データに「永順産業㈱」という元請名があり、「永順」という現場名の抽出結果と
  紛れる恐れがあるため、混同を防ぐガードレールとして明確に分離している)
- Flaskに依存しない純粋関数群(conn + 素の引数を受け取りdict/listを返す)。
  ルート層(app/routes/dispatch.py)から呼ばれる。
"""
import datetime
import re

from . import models

_HEADER_RE = re.compile(r"^(?P<client>[^、,]+)[、,]\s*(?P<site>[^に]+?)に\s*(?P<total>\d+)\s*台")
# ヘッダー文の先頭に付く日付語(「明日、カイダ建設、...」の「明日」)は元請名として
# 誤抽出しないよう先に取り除く。相対語(今日/明日/明後日/昨日)・「M月D日」・
# 「M/D」・「YYYY-MM-DD」のいずれにも対応する。
_LEADING_DATE_RE = re.compile(
    r"^(今日|明日|明後日|昨日|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}/\d{1,2}|\d{1,2}月\d{1,2}日)[、,]\s*"
)
# 日付候補抽出用(テキスト中のどこにあってもよい)。画面の日付入力欄は別に存在するため、
# ここでの抽出結果はあくまで「候補」であり、dispatch_dateを上書きすることはしない。
_RELATIVE_DATE_WORDS = (("明後日", 2), ("明日", 1), ("昨日", -1), ("今日", 0))
_ABS_DATE_ISO_RE = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})")
_ABS_DATE_MD_KANJI_RE = re.compile(r"(\d{1,2})月(\d{1,2})日")
_ABS_DATE_MD_SLASH_RE = re.compile(r"(\d{1,2})/(\d{1,2})(?!\d)")
_OWN_VEHICLE_KEYWORDS = ("自社",)
_TIME_KEYWORDS = ("時間",)
_HEADER_HINT_RE = re.compile(r"[、,].*に\s*\d+\s*台")
_SUBCONTRACTOR_HINT_RE = re.compile(r"[一-龥ぁ-んァ-ンー㈱㈲]{1,10}\s*\d+\s*台")
_SUBCONTRACTOR_TOKEN_RE = re.compile(r"([一-龥ぁ-んァ-ンー㈱㈲]{1,10}?)\s*(\d+)\s*台")
_OWN_VEHICLE_TOKEN_RE = re.compile(r"(\d+)\s*番")
_TRAILING_DIGITS_RE = re.compile(r"(\d+)\D*$")

_TIME_PATTERNS = [
    (re.compile(r"(\d{1,2})時半"), lambda m: (int(m.group(1)), 30)),
    (re.compile(r"(\d{1,2})時\s*(\d{1,2})分"), lambda m: (int(m.group(1)), int(m.group(2)))),
    (re.compile(r"(\d{1,2}):(\d{2})"), lambda m: (int(m.group(1)), int(m.group(2)))),
    (re.compile(r"(\d{1,2})時(?!\d)"), lambda m: (int(m.group(1)), 0)),
]


_POSITIVE_INT_STR_RE = re.compile(r"-?\d+")


def parse_positive_int(value):
    """傭車の台数など「正の整数のみ許可」の値を検証する。
    int()は int(1.5) -> 1 のように小数を黙って切り捨ててしまうため、
    小数・真偽値・不正な文字列を確実に拒否できるよう専用に用意する。
    正の整数として解釈できなければ None を返す。"""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        n = value
    elif isinstance(value, float):
        if not value.is_integer():
            return None
        n = int(value)
    elif isinstance(value, str):
        s = value.strip()
        if not _POSITIVE_INT_STR_RE.fullmatch(s):
            return None
        n = int(s)
    else:
        return None
    return n if n > 0 else None


def split_sentences(text):
    parts = re.split(r"[。\n]+", text or "")
    return [p.strip() for p in parts if p.strip()]


def match_header(sentence):
    """文の先頭が「元請、現場に◯台」の見出しパターンかどうかを判定する。
    マッチすれば (client_name, site_name, total, remainder) を返す。remainder は
    見出し部分を取り除いた残りの文字列で、他の抽出(自社車両・時間・傭車)は
    この remainder に対して行う(現場名が傭車名として誤抽出されるのを防ぐため)。
    マッチしなければ None。"""
    stripped = _LEADING_DATE_RE.sub("", sentence)
    m = _HEADER_RE.match(stripped)
    if not m:
        return None
    return {
        "client_name": m.group("client").strip(),
        "site_name": m.group("site").strip(),
        "total": int(m.group("total")),
        "remainder": stripped[m.end():],
    }


def match_master(candidates, raw_name):
    """candidates: sqlite3.Rowのリスト(idとnameを持つ)。
    完全一致→部分一致(どちらかがどちらかを含む)の順で1件に絞れれば確定。
    0件または複数件(曖昧)なら未確定として候補を返す。"""
    exact = [c for c in candidates if c["name"] == raw_name]
    if len(exact) == 1:
        return {"matched": True, "id": exact[0]["id"], "name": exact[0]["name"], "match_type": "exact"}

    # 部分一致は raw_name が短すぎる(1文字)と無関係な名前に誤爆しやすいため、
    # 部分一致による確定はガードする(完全一致は上で既に確定済みなので対象外)。
    substr = [c for c in candidates if len(raw_name) >= 2 and (raw_name in c["name"] or c["name"] in raw_name)]
    if len(substr) == 1:
        return {"matched": True, "id": substr[0]["id"], "name": substr[0]["name"], "match_type": "substring"}

    pool = substr or candidates
    return {"matched": False, "raw_text": raw_name, "candidates": [dict(c) for c in pool[:8]]}


def match_client(conn, raw_name):
    return match_master(models.list_clients(conn), raw_name)


def match_site(conn, raw_name, client_id=None):
    """現場は sites テーブルのみを検索する(clients へのフォールバックは絶対にしない)。
    client_idで絞り込んでヒットしなければ、絞り込みなしで再試行する。"""
    result = match_master(models.list_sites(conn, client_id=client_id), raw_name)
    if not result["matched"] and client_id is not None:
        result = match_master(models.list_sites(conn), raw_name)
    return result


def _normalize_vehicle_number(text):
    m = _TRAILING_DIGITS_RE.search(text or "")
    if not m:
        return None
    return m.group(1).lstrip("0") or "0"


def match_vehicle(conn, raw_token):
    target = _normalize_vehicle_number(raw_token)
    if target is None:
        return {"matched": False, "raw_text": raw_token, "candidates": []}

    vehicles = models.list_vehicles(conn)
    hits = [v for v in vehicles if _normalize_vehicle_number(v["plate_no"]) == target]
    if len(hits) == 1:
        return {"matched": True, "id": hits[0]["id"], "name": hits[0]["plate_no"], "match_type": "digit"}
    if len(hits) > 1:
        return {"matched": False, "raw_text": raw_token, "candidates": [dict(h) for h in hits[:8]]}
    return {"matched": False, "raw_text": raw_token, "candidates": []}


def extract_own_vehicle_tokens(sentence):
    return [m.group(0) for m in _OWN_VEHICLE_TOKEN_RE.finditer(sentence)]


def extract_subcontractor_tokens(sentence):
    return _SUBCONTRACTOR_TOKEN_RE.findall(sentence)


def extract_date_candidate(text, today=None):
    """テキスト全体から日付表現(相対語・M月D日・M/D・YYYY-MM-DD)を1つ探し、
    ISO形式(YYYY-MM-DD)の候補として返す。見つからなければNone。
    画面の日付入力欄が正であり、これはあくまで候補の提示に使う。"""
    today = today or datetime.date.today()
    text = text or ""

    for word, offset in _RELATIVE_DATE_WORDS:
        if word in text:
            return (today + datetime.timedelta(days=offset)).isoformat()

    m = _ABS_DATE_ISO_RE.search(text)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            pass

    m = _ABS_DATE_MD_KANJI_RE.search(text)
    if m:
        try:
            return datetime.date(today.year, int(m.group(1)), int(m.group(2))).isoformat()
        except ValueError:
            pass

    m = _ABS_DATE_MD_SLASH_RE.search(text)
    if m:
        try:
            return datetime.date(today.year, int(m.group(1)), int(m.group(2))).isoformat()
        except ValueError:
            pass

    return None


def extract_start_time(sentence):
    for pattern, extractor in _TIME_PATTERNS:
        m = pattern.search(sentence)
        if m:
            hour, minute = extractor(m)
            if 0 <= hour <= 29 and 0 <= minute < 60:
                return f"{hour:02d}:{minute:02d}"
    return None


def parse_transcript(conn, dispatch_date, text):
    # 1文ごとに「見出し(元請・現場・台数)」「自社車両」「時間」「傭車」を排他的でなく
    # 独立に判定する。句点が省略された文字起こしでは
    # 「カイダ建設、永順に16台、時間は7時半」のように1文に見出しと時間が同居する
    # ことがあり、以前の排他分類(1文=1種類)ではこの場合に見出しが丸ごと読み飛ばされる
    # バグがあったため。
    sentences = split_sentences(text)

    result = {
        "dispatch_date": dispatch_date,
        "dispatch_date_candidate": extract_date_candidate(text),
        "client": {"matched": False, "raw_text": None, "candidates": []},
        "site": {"matched": False, "raw_text": None, "candidates": []},
        "total_trucks": None,
        "start_time": None,
        "own_vehicles": [],
        "subcontractors": [],
        "warnings": [],
    }
    warnings = []

    header_matched = False
    header_hint_seen = False
    time_keyword_seen = False

    for s in sentences:
        header = match_header(s) if not header_matched else None
        if header:
            header_matched = True
            result["client"] = match_client(conn, header["client_name"])
            client_id = result["client"]["id"] if result["client"]["matched"] else None
            result["site"] = match_site(conn, header["site_name"], client_id=client_id)
            result["total_trucks"] = header["total"]
            # 見出し部分を取り除いた残りだけを他の抽出対象にする。現場名(例:「永順」)が
            # 傭車名として誤抽出されるのを防ぐため。
            remainder = header["remainder"]
        else:
            remainder = s
            if not header_matched and _HEADER_HINT_RE.search(s):
                header_hint_seen = True

        if any(k in remainder for k in _OWN_VEHICLE_KEYWORDS):
            for token in extract_own_vehicle_tokens(remainder):
                v = match_vehicle(conn, token)
                v["raw_text"] = token
                result["own_vehicles"].append(v)

        if any(k in remainder for k in _TIME_KEYWORDS):
            time_keyword_seen = True
            t = extract_start_time(remainder)
            if t:
                result["start_time"] = t

        if _SUBCONTRACTOR_HINT_RE.search(remainder) and "に" not in remainder:
            for name, count in extract_subcontractor_tokens(remainder):
                m = match_master(models.list_subcontractors(conn), name)
                m["raw_text"] = name
                m["count"] = int(count)
                result["subcontractors"].append(m)

    if not header_matched:
        if header_hint_seen:
            warnings.append("見出し文(元請・現場・台数)の形式を認識できませんでした")
        else:
            warnings.append("元請・現場・台数の記載が見つかりませんでした")

    if time_keyword_seen and result["start_time"] is None:
        warnings.append("時間の記載を認識できませんでした")

    extracted_total = len(result["own_vehicles"]) + sum(x["count"] for x in result["subcontractors"])
    if result["total_trucks"] is not None and extracted_total != result["total_trucks"]:
        diff = result["total_trucks"] - extracted_total
        if diff > 0:
            warnings.append(
                f"必要台数{result['total_trucks']}台に対して、抽出台数は{extracted_total}台です。"
                f"{diff}台不足しています。"
            )
        else:
            warnings.append(
                f"必要台数{result['total_trucks']}台に対して、抽出台数は{extracted_total}台です。"
                f"{-diff}台超過しています。"
            )

    if not result["client"]["matched"]:
        warnings.append("元請を特定できませんでした(候補から選択してください)")
    if not result["site"]["matched"]:
        warnings.append("現場を特定できませんでした(候補から選択するか、現場マスタで登録してください)")
    for v in result["own_vehicles"]:
        if not v["matched"]:
            warnings.append(f"自社車両「{v['raw_text']}」を車両マスタで特定できませんでした")
    for sc in result["subcontractors"]:
        if not sc["matched"]:
            warnings.append(f"傭車「{sc['raw_text']}」を傭車マスタで特定できませんでした")

    result["warnings"] = warnings
    return result
