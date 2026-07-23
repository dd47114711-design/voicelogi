# -*- coding: utf-8 -*-
"""手動での起動確認前に、主要な画面・APIが一通り動くことを機械的に確認する
使い捨てスクリプト(pytestの正式なテストスイートはTask #7で別途整備する)。
実行方法: python3 scripts/smoke_test.py
"""
import datetime
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app  # noqa: E402


def check(label, condition):
    status = "OK" if condition else "NG"
    print(f"[{status}] {label}")
    if not condition:
        raise SystemExit(1)


def main():
    app = create_app()
    client = app.test_client()

    # ログインなしでトップにアクセス -> ログイン画面へリダイレクト
    r = client.get("/")
    check("未ログインで/にアクセスするとリダイレクトされる", r.status_code == 302)

    r = client.get("/login")
    check("ログイン画面が開く", r.status_code == 200 and "名前を選んでください".encode() in r.data)

    r = client.post("/login", data={"name": "テスト事務員"}, follow_redirects=True)
    check("名前を選んでログインできる", r.status_code == 200)

    r = client.get("/")
    check("ログイン後トップが開く", r.status_code == 200)

    r = client.get("/dispatch?date=2026-07-08")
    check("配車入力グリッドが開く", r.status_code == 200 and "配車入力".encode() in r.data)

    # クライアント一覧を取得して先頭のIDで行更新をテスト
    from app.db import get_connection
    from app import models
    conn = get_connection()
    client_row = models.list_clients(conn)[0]

    r = client.get("/dispatch?date=2026-07-08")
    entries = models.list_dispatch_entries(conn, entry_date="2026-07-08")
    check("配車入力を開くと空行が自動作成される", len(entries) >= 1)
    entry = entries[0]

    r = client.post(
        f"/dispatch/entries/{entry['id']}/update",
        json={"fields": {"client_id": client_row["id"], "count": 2}, "expected_version": entry["version"]},
    )
    check("配車行の自動下書き保存(update)が成功する", r.status_code == 200 and r.get_json()["ok"])

    r_stale = client.post(
        f"/dispatch/entries/{entry['id']}/update",
        json={"fields": {"count": 5}, "expected_version": entry["version"]},
    )
    check("古いversionでの更新は409で拒否される", r_stale.status_code == 409)

    r = client.post("/dispatch/entries", data={"entry_date": "2026-07-08"})
    check("行の追加(フラグメント返却)が成功する", r.status_code == 200 and b"dispatch-row" in r.data)

    entries2 = models.list_dispatch_entries(conn, entry_date="2026-07-08")
    new_entry_id = entries2[-1]["id"]
    r = client.post(f"/dispatch/entries/{new_entry_id}/duplicate")
    check("行の複製が成功する", r.status_code == 200 and b"dispatch-row" in r.data)

    r = client.post("/masters/quick-add/clients", json={"name": "テスト新規元請"})
    check("マスタのクイック追加が成功する", r.status_code == 200 and r.get_json().get("name") == "テスト新規元請")

    # 現場マスタ: 元請ごとのクイック追加・カスケード絞り込み・重複排除
    client2 = models.list_clients(conn)[2]
    r = client.post("/masters/quick-add/sites", json={"name": "テスト現場A", "client_id": client_row["id"]})
    site_a = r.get_json()
    check(
        "現場のクイック追加(元請あり)が成功する",
        r.status_code == 200 and site_a.get("name") == "テスト現場A" and site_a.get("client_id") == client_row["id"],
    )

    r = client.post("/masters/quick-add/sites", json={"name": "テスト現場A", "client_id": client2["id"]})
    site_a_other = r.get_json()
    check(
        "同名でも元請が違えば別レコードとして作成される",
        site_a_other.get("id") != site_a.get("id"),
    )

    r = client.post("/masters/quick-add/sites", json={"name": "テスト現場B(元請未設定)"})
    site_unassigned = r.get_json()
    check(
        "現場のクイック追加(元請未設定)が成功する",
        r.status_code == 200 and site_unassigned.get("client_id") is None,
    )
    id_dup1 = models.get_or_create_site(conn, "テスト現場B(元請未設定)", client_id=None)
    check(
        "元請未設定の現場を2回作っても重複しない(get_or_create_siteのNULL対応)",
        id_dup1 == site_unassigned["id"],
    )

    r = client.post(
        f"/dispatch/entries/{entry['id']}/update",
        json={"fields": {"site_id": site_a["id"]}, "expected_version": entry["version"] + 1},
    )
    check("配車行にsite_idを保存できる", r.status_code == 200 and r.get_json()["ok"])
    entry_with_site = models.get_dispatch_entry(conn, entry["id"])
    check(
        "site_id保存時にsite_name_snapshotがサーバー側で自動生成される",
        entry_with_site["site_id"] == site_a["id"] and entry_with_site["site_name_snapshot"] == "テスト現場A",
    )

    r = client.post(f"/dispatch/entries/{entry['id']}/duplicate")
    duplicated_html = r.data
    check("複製時にsite_idも複製される", (f'value="{site_a["id"]}"'.encode()) in duplicated_html)

    r = client.get("/masters")
    check("マスタ管理に現場マスタが表示される", r.status_code == 200 and "現場マスタ".encode() in r.data)

    # 実績確定 -> 請求書作成の一連の流れ
    models.confirm_entry_result(
        conn, entry["id"], category="昼", quantity=8.0, unit_price=38000, operator="テスト事務員",
    )
    r = client.get(f"/billing?client_id={client_row['id']}&period_start=2026-07-01&period_end=2026-07-08")
    check("実績整理画面が開く", r.status_code == 200)

    r = client.get(
        f"/invoices/new?client_id={client_row['id']}&period_start=2026-07-01&period_end=2026-07-08"
    )
    check("請求書プレビュー(作成前)が開く", r.status_code == 200)

    r = client.post(
        "/invoices",
        data={"client_id": client_row["id"], "period_start": "2026-07-01", "period_end": "2026-07-08"},
        follow_redirects=True,
    )
    check("請求書が発行できる", r.status_code == 200 and "請求書プレビュー".encode() in r.data)

    invoices = models.list_invoices(conn)
    check("invoicesテーブルにレコードが作られている", len(invoices) >= 1)
    invoice = invoices[0]
    check("xlsx/pdfが生成されている", invoice["xlsx_path"] and invoice["pdf_path"]
          and os.path.exists(invoice["xlsx_path"]) and os.path.exists(invoice["pdf_path"]))

    lines = models.list_invoice_lines(conn, invoice["id"])
    if lines:
        r = client.post(f"/invoices/{invoice['id']}/lines/{lines[0]['id']}/toggle-dash", follow_redirects=True)
        check("「〃」トグルが成功する", r.status_code == 200)

    r = client.get(f"/invoices/{invoice['id']}/download.xlsx")
    check("Excelダウンロードが成功する", r.status_code == 200)
    r = client.get(f"/invoices/{invoice['id']}/download.pdf")
    check("PDFダウンロードが成功する", r.status_code == 200)

    r = client.get("/invoices/closing")
    check("月末締め作業画面が開く", r.status_code == 200)

    r = client.get("/prices")
    check("単価表画面が開く", r.status_code == 200)
    r = client.get("/prices/needs-review")
    check("単価 要確認一覧が開く", r.status_code == 200 and b"TEL" in r.data)

    r = client.get("/masters")
    check("マスタ管理画面が開く", r.status_code == 200)

    r = client.post("/masters/company", data={"company_name": "テスト運送株式会社", "registration_number": "T1234567890123"})
    check("自社情報の保存が成功する", r.status_code in (200, 302))

    # 会長用画面(ログイン不要)
    r = client.get("/chairman/")
    check("会長トップが開く", r.status_code == 200 and "今日の配車を見る".encode() in r.data)
    check("会長トップに事務員へのリンクが含まれない", b"/login" not in r.data and b"masters" not in r.data)

    r = client.get("/chairman/today")
    check("会長『今日の配車を見る』が開く", r.status_code == 200)

    r = client.get("/chairman/invoices")
    check("会長『請求書の確認』一覧が開く", r.status_code == 200)

    r = client.post(f"/chairman/invoices/{invoice['id']}/review", follow_redirects=True)
    check("会長の『見ました』記録が成功する", r.status_code == 200 and "確認しました".encode() in r.data)

    invoice_after = models.get_invoice(conn, invoice["id"])
    check("invoices.last_reviewed_byが記録される", invoice_after["last_reviewed_by"] == "会長")

    r = client.post("/chairman/today/alert", follow_redirects=True)
    check("会長の『ちがう気がする』(配車)が成功する", r.status_code == 200 and "事務員に伝えました".encode() in r.data)

    r = client.get("/")
    check("事務員トップに会長からの連絡バッジが表示される", "会長からの連絡".encode() in r.data)

    # 音声配車入力: マスタ未整備を想定した準備(sites/vehicles/subcontractorsは初期状態で
    # 空のため、ここで明示的に必要な行だけ作る)
    kaida_client = next(c for c in models.list_clients(conn) if "カイダ建設" in c["name"])
    site_eijun_id = models.create_site(conn, "永順", client_id=kaida_client["id"])
    veh_ids = {n: models.create_vehicle(conn, n) for n in ["1", "12", "15", "19"]}
    sub_ids = {n: models.create_subcontractor(conn, n) for n in ["坂本", "山田", "久富", "松尾"]}

    r = client.get("/dispatch/voice")
    check("音声配車入力画面が開く", r.status_code == 200 and "音声配車入力".encode() in r.data)

    voice_text = (
        "明日、カイダ建設、永順に16台。\n自社は1番、12番、15番、19番。\n"
        "坂本2台、山田2台、久富4台、松尾1台。\n時間は7時半。"
    )
    r = client.post("/dispatch/voice/parse", json={"dispatch_date": "2026-07-10", "text": voice_text})
    check("音声配車の下書き作成APIが200を返す", r.status_code == 200)
    draft = r.get_json()
    check("元請がカイダ建設㈱に一致する", draft["client"]["matched"] and draft["client"]["id"] == kaida_client["id"])
    check(
        "現場が永順に一致する(永順産業㈱には誤爆しない)",
        draft["site"]["matched"] and draft["site"]["id"] == site_eijun_id,
    )
    check("申告台数16台を抽出できる", draft["total_trucks"] == 16)
    check("時間7時半 -> 07:30を抽出できる", draft["start_time"] == "07:30")
    check("自社車両4台を抽出できる", len(draft["own_vehicles"]) == 4)
    check("自社車両が全て車両マスタに一致する", all(v["matched"] for v in draft["own_vehicles"]))
    check("傭車4社を抽出できる", len(draft["subcontractors"]) == 4)
    check("傭車が全て傭車マスタに一致する", all(s["matched"] for s in draft["subcontractors"]))
    check("傭車の合計台数が9(2+2+4+1)", sum(s["count"] for s in draft["subcontractors"]) == 9)
    check("13(4自社+9傭車) != 16申告 で「3台不足」の警告が出る", any("3台不足" in w for w in draft["warnings"]))
    tomorrow_iso = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    check(f"日付候補が明日({tomorrow_iso})として抽出される", draft["dispatch_date_candidate"] == tomorrow_iso)

    commit_payload = {
        "dispatch_date": "2026-07-10",
        "client": {"id": kaida_client["id"]},
        "site": {"id": site_eijun_id},
        "start_time": draft["start_time"],
        "own_vehicles": [{"id": v["id"]} for v in draft["own_vehicles"]],
        "subcontractors": [{"id": s["id"], "count": s["count"]} for s in draft["subcontractors"]],
    }
    r = client.post("/dispatch/voice/commit", json=commit_payload)
    check("音声配車の登録APIが200を返す", r.status_code == 200 and r.get_json()["ok"])
    check("8行(自社4+傭車4)が作成される", r.get_json()["count"] == 8)

    committed = models.list_dispatch_entries(conn, entry_date="2026-07-10")
    own_rows = [e for e in committed if e["is_subcontractor"] == 0 and e["vehicle_id"] is not None]
    sub_rows = [e for e in committed if e["is_subcontractor"] == 1]
    check("自社行が4件、それぞれcount=1", len(own_rows) == 4 and all(e["count"] == 1 for e in own_rows))
    check("傭車行が4件、台数合計9", len(sub_rows) == 4 and sum(e["count"] for e in sub_rows) == 9)
    check("自社行の車両IDが1/12/15/19と一致", {e["vehicle_id"] for e in own_rows} == set(veh_ids.values()))
    check(
        "全行がカイダ建設㈱・永順に紐づく",
        all(e["client_id"] == kaida_client["id"] and e["site_id"] == site_eijun_id for e in committed),
    )
    check("memo欄に配車時刻が追記される", all(e["memo"] == "配車時刻 07:30" for e in committed))

    # 句点なしで見出しと時間が同一文に結合されていても見出しを読み飛ばさない
    # (以前のclassify_sentenceは1文=1種類の排他分類だったため、見出し文に
    # 「時間」というキーワードが同居すると見出しが丸ごと無視されるバグがあった)
    merged_text = "カイダ建設、永順に16台、時間は7時半。自社は1番。坂本2台。"
    r_merged = client.post("/dispatch/voice/parse", json={"dispatch_date": "2026-07-12", "text": merged_text})
    check("結合文の下書き作成APIが200を返す", r_merged.status_code == 200)
    draft_merged = r_merged.get_json()
    check("結合文でも元請を抽出できる", draft_merged["client"]["matched"] and draft_merged["client"]["id"] == kaida_client["id"])
    check("結合文でも現場を抽出できる", draft_merged["site"]["matched"] and draft_merged["site"]["id"] == site_eijun_id)
    check("結合文でも申告台数16台を抽出できる", draft_merged["total_trucks"] == 16)
    check("結合文でも時間7時半を抽出できる", draft_merged["start_time"] == "07:30")

    # 重複登録防止: 同じ元請・現場・配車日への登録が直近5分以内にあると409で警告される
    dup_payload = dict(commit_payload)
    r_dup = client.post("/dispatch/voice/commit", json=dup_payload)
    check(
        "直近重複登録は409(possible_duplicate)で警告される",
        r_dup.status_code == 409 and r_dup.get_json()["error"] == "possible_duplicate",
    )
    check("409応答では行が増えていない", len(models.list_dispatch_entries(conn, entry_date="2026-07-10")) == 8)

    dup_payload["confirm_duplicate"] = True
    r_dup_confirm = client.post("/dispatch/voice/commit", json=dup_payload)
    check("confirm_duplicate=trueなら重複でも登録できる", r_dup_confirm.status_code == 200 and r_dup_confirm.get_json()["ok"])
    check("確認後は8行追加されて16行になる", len(models.list_dispatch_entries(conn, entry_date="2026-07-10")) == 16)

    # 傭車台数の不正値(負数・小数)は400で拒否される
    r_neg = client.post("/dispatch/voice/commit", json={
        "dispatch_date": "2026-07-13",
        "client": {"id": kaida_client["id"]},
        "site": {"id": site_eijun_id},
        "own_vehicles": [],
        "subcontractors": [{"id": sub_ids["坂本"], "count": -1}],
    })
    check("台数が負数の傭車を含むcommitは400で拒否される", r_neg.status_code == 400)

    r_decimal = client.post("/dispatch/voice/commit", json={
        "dispatch_date": "2026-07-13",
        "client": {"id": kaida_client["id"]},
        "site": {"id": site_eijun_id},
        "own_vehicles": [],
        "subcontractors": [{"id": sub_ids["坂本"], "count": 1.5}],
    })
    check("台数が小数の傭車を含むcommitは400で拒否される", r_decimal.status_code == 400)

    r2 = client.post(
        "/dispatch/voice/parse",
        json={"dispatch_date": "2026-07-11", "text": "明日、未登録商事、未登録現場に5台。\n自社は99番。\n時間は9時。"},
    )
    check("未知の元請・現場・車番でも200を返す(クラッシュしない)", r2.status_code == 200)
    draft2 = r2.get_json()
    check(
        "未知の元請はmatched:falseでraw_textを保持する",
        draft2["client"]["matched"] is False and draft2["client"]["raw_text"] == "未登録商事",
    )
    check("未知の現場はmatched:falseで、clientsテーブルには誤爆しない", draft2["site"]["matched"] is False)
    check("未知の車番はmatched:falseで一覧に残る", len(draft2["own_vehicles"]) == 1 and draft2["own_vehicles"][0]["matched"] is False)

    r3 = client.post(
        "/dispatch/voice/commit",
        json={"dispatch_date": "2026-07-11", "client": {}, "site": {}, "own_vehicles": [], "subcontractors": []},
    )
    check("未確定のままcommitすると400で拒否される", r3.status_code == 400)
    check("エラーメッセージに元請未確定が含まれる", "元請が未確定です" in r3.get_json()["messages"])

    # 自社車両・傭車が「未確定のまま(idなし)」送られてきた場合は静かに無視せず400で拒否する
    r4 = client.post("/dispatch/voice/commit", json={
        "dispatch_date": "2026-07-10",
        "client": {"id": kaida_client["id"]},
        "site": {"id": site_eijun_id},
        "own_vehicles": [{"id": None}],
        "subcontractors": [],
    })
    check("未確定の自社車両を含むcommitは400で拒否される", r4.status_code == 400)
    check(
        "エラーメッセージに自社車両未確定が含まれる",
        any("自社車両" in m and "未確定" in m for m in r4.get_json()["messages"]),
    )

    r5 = client.post("/dispatch/voice/commit", json={
        "dispatch_date": "2026-07-10",
        "client": {"id": kaida_client["id"]},
        "site": {"id": site_eijun_id},
        "own_vehicles": [],
        "subcontractors": [{"id": sub_ids["坂本"], "count": 0}],
    })
    check("台数0の傭車を含むcommitは400で拒否される", r5.status_code == 400)
    check(
        "エラーメッセージに傭車の台数未入力が含まれる",
        any("傭車" in m and "台数" in m for m in r5.get_json()["messages"]),
    )

    conn.close()
    print("\n全項目OK")


if __name__ == "__main__":
    main()
