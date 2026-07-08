# -*- coding: utf-8 -*-
"""SQLite接続ヘルパー。社内PC1台でのローカルサーバー運用を想定し、
外部DBサーバーは使わずファイル1つ(data/voicelogi.db)で完結させる。"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "voicelogi.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def get_connection(db_path=DB_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path=DB_PATH):
    conn = get_connection(db_path)
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
