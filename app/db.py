# -*- coding: utf-8 -*-
"""SQLite接続ヘルパー。社内PC1台でのローカルサーバー運用を想定し、
外部DBサーバーは使わずファイル1つ(data/voicelogi.db)で完結させる。"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "voicelogi.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def get_connection(db_path=DB_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # 複数タブレット/PCからの同時アクセスを想定し、WALモード+busy_timeoutで
    # "database is locked" を避ける(書き込み中でも他接続が読み取り可能になる)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def init_db(db_path=DB_PATH):
    conn = get_connection(db_path)
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
