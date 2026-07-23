# -*- coding: utf-8 -*-
"""現場名マスタ(sites)をコード側で使うように切り替える前の安全確認スクリプト。

dispatch_entries.site_name_snapshot が入っているのに site_id が
未設定(NULL)の行が実在するかどうかだけを数えて報告する。本番運用前で
dispatch_entries が空であることが分かっているため、恒久的な移行ロジックは
書かず、この確認だけを行う。もし0件でなければ、当時のデータを見て
個別に対応方針を決める。

実行方法: python3 scripts/check_site_migration_needed.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db import get_connection


def main():
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) AS n FROM dispatch_entries").fetchone()["n"]
    needs_migration = conn.execute(
        "SELECT COUNT(*) AS n FROM dispatch_entries "
        "WHERE site_id IS NULL AND site_name_snapshot IS NOT NULL AND TRIM(site_name_snapshot) != ''"
    ).fetchone()["n"]

    print(f"dispatch_entries 総数: {total}")
    print(f"site_name_snapshotはあるがsite_id未設定の行: {needs_migration}")

    if needs_migration == 0:
        print("移行対象なし。site_idベースのコードへ切り替えて問題ありません。")
    else:
        rows = conn.execute(
            "SELECT id, entry_date, client_id, site_name_snapshot FROM dispatch_entries "
            "WHERE site_id IS NULL AND site_name_snapshot IS NOT NULL AND TRIM(site_name_snapshot) != '' "
            "LIMIT 20"
        ).fetchall()
        print("\n該当行の例(最大20件) — 個別に対応方針を検討してください:")
        for r in rows:
            print(f"  id={r['id']} date={r['entry_date']} client_id={r['client_id']} site='{r['site_name_snapshot']}'")

    conn.close()


if __name__ == "__main__":
    main()
