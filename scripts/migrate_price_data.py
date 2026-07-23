# -*- coding: utf-8 -*-
"""
scripts/price_data.json ([会社名, 昼, 夜, その他] のリスト) を読み込み、
data/price_master.json (構造化された単価マスタ) に変換するワンタイム移行スクリプト。

価格欄に日付・電話番号等のメモが混入した文字列（例:「4/2　  40,000」「TEL  37000」）は、
自動では数値に分解しない。無理な自動判定は誤ったデータを生みかねないため、
そのまま note 欄に原文を保持し、amount は null とする。あとで人間が単価表画面から
実際の単価を確認して入力し直す運用とする。

実行方法: python3 scripts/migrate_price_data.py
"""
import json
import os

SRC_PATH = os.path.join(os.path.dirname(__file__), "price_data.json")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "price_master.json")

CATEGORIES = ["昼", "夜", "その他"]


def build_price_entry(value):
    if value is None:
        return {"amount": None, "note": None}
    if isinstance(value, (int, float)):
        return {"amount": value, "note": None}
    # 文字列(日付・電話番号等が混入している可能性がある) -> 自動分解せず原文を note に保持
    return {"amount": None, "note": str(value)}


def migrate(src_path=SRC_PATH):
    with open(src_path, encoding="utf-8") as f:
        raw_rows = json.load(f)

    clients = []
    ambiguous_report = []

    for name, hiru, yoru, sonota in raw_rows:
        prices = []
        for category, value in zip(CATEGORIES, (hiru, yoru, sonota)):
            entry = build_price_entry(value)
            entry["category"] = category
            prices.append(entry)
            if entry["note"] is not None:
                ambiguous_report.append((name, category, entry["note"]))
        clients.append({"client": name, "prices": prices})

    return clients, ambiguous_report, len(raw_rows)


def main():
    clients, ambiguous_report, n_raw = migrate()

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(clients, f, ensure_ascii=False, indent=2)

    print(f"移行完了: {n_raw}社 -> {len(clients)}社 ({OUT_PATH})")
    if ambiguous_report:
        print(f"\n要確認(自動判定できず備考として残した項目): {len(ambiguous_report)}件")
        for name, category, note in ambiguous_report:
            print(f"  - {name} / {category}: {note!r}")
        print("\n単価表画面（app/routes/prices.py）から実際の単価を確認のうえ、備考を金額に置き換えてください。")


if __name__ == "__main__":
    main()
