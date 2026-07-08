# -*- coding: utf-8 -*-
"""data/price_master.json と既存build_dispatch.pyの運転手ロースターを
SQLiteに初期投入するスクリプト。

冪等な設計: get_or_create/upsert のみを使うため、途中で失敗しても
再実行すれば安全に再開できる(「clientsだけ投入済みでdriversが空」のような
半端な状態が固定化されることはない)。

実行方法: python3 scripts/seed_db.py
(先に python3 scripts/migrate_price_data.py を実行して data/price_master.json を作っておくこと)
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db import init_db, get_connection
from app import models

PRICE_MASTER_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "price_master.json")

# build_dispatch.py に実データとして埋め込まれていた運転手18名(配車入力の写真に基づく)
DRIVER_ROSTER = ["坂本", "松興", "興栄", "山田", "竹本", "中村", "金子", "フジタ", "永井",
                  "久富", "水谷", "渡辺", "小田", "青木", "中本", "木内", "山住", "西本"]


def seed_clients_and_prices(conn):
    with open(PRICE_MASTER_PATH, encoding="utf-8") as f:
        clients = json.load(f)

    for entry in clients:
        client_id = models.get_or_create_client(conn, entry["client"])
        for price in entry["prices"]:
            models.upsert_price(
                conn, client_id, price["category"],
                amount=price["amount"], note=price["note"],
                updated_by="初期移行(migrate_price_data.py)",
            )
    return len(clients)


def seed_drivers(conn):
    for name in DRIVER_ROSTER:
        models.get_or_create_driver(conn, name)
    return len(DRIVER_ROSTER)


def seed_company_profile(conn):
    """自社の登録番号・住所等は個人情報のためリポジトリに実データを持たせず、
    ここではプレースホルダのみ投入する。単価表画面と同様、後で運用者が
    マスタ管理画面(未実装)または直接DBで実際の値に置き換える想定。"""
    if models.get_company_profile(conn):
        return
    models.set_company_profile(
        conn,
        company_name="(要設定: 自社名)",
        registration_number="(要設定: 登録番号 T+13桁)",
    )


def main():
    if not os.path.exists(PRICE_MASTER_PATH):
        raise SystemExit(
            f"{PRICE_MASTER_PATH} が見つかりません。先に scripts/migrate_price_data.py を実行してください。"
        )

    init_db()
    conn = get_connection()

    n_clients = seed_clients_and_prices(conn)
    n_drivers = seed_drivers(conn)
    seed_company_profile(conn)
    conn.close()

    print(f"投入完了(冪等・再実行安全): 元請{n_clients}社, 運転手{n_drivers}名")


if __name__ == "__main__":
    main()
