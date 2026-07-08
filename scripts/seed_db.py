# -*- coding: utf-8 -*-
"""data/price_master.json と既存build_dispatch.pyの運転手ロースターを
SQLiteに初期投入するワンタイムスクリプト。

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
        client_id = models.create_client(conn, entry["client"])
        for price in entry["prices"]:
            models.upsert_price(
                conn, client_id, price["category"],
                amount=price["amount"], note=price["note"],
            )
    return len(clients)


def seed_drivers(conn):
    for name in DRIVER_ROSTER:
        models.create_driver(conn, name)
    return len(DRIVER_ROSTER)


def main():
    if not os.path.exists(PRICE_MASTER_PATH):
        raise SystemExit(
            f"{PRICE_MASTER_PATH} が見つかりません。先に scripts/migrate_price_data.py を実行してください。"
        )

    init_db()
    conn = get_connection()

    existing = conn.execute("SELECT COUNT(*) AS n FROM clients").fetchone()["n"]
    if existing:
        print(f"既にclientsが{existing}件あるため、投入をスキップします(二重投入防止)。")
        conn.close()
        return

    n_clients = seed_clients_and_prices(conn)
    n_drivers = seed_drivers(conn)
    conn.close()

    print(f"投入完了: 元請{n_clients}社, 運転手{n_drivers}名")


if __name__ == "__main__":
    main()
