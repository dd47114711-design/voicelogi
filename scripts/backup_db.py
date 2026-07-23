# -*- coding: utf-8 -*-
"""data/voicelogi.db を日次バックアップする。IT担当者不在のため、
WALモードのDBファイルを直接cpするのではなく、sqlite3の正式なbackup APIを使い
実行中でも壊れないバックアップを取る。cronに登録して毎日実行する想定。

例: 0 3 * * * cd /path/to/voicelogi && python3 scripts/backup_db.py

古いバックアップは30日分だけ残し、それより古いものは自動的に削除する。
"""
import datetime
import os
import sqlite3
import sys

BASE_DIR = os.path.join(os.path.dirname(__file__), "..")
DB_PATH = os.path.join(BASE_DIR, "data", "voicelogi.db")
BACKUP_DIR = os.path.join(BASE_DIR, "data", "backups")
KEEP_DAYS = 30


def backup():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"{DB_PATH} が見つかりません。先にアプリを起動してDBを作成してください。")

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_path = os.path.join(BACKUP_DIR, f"voicelogi_{timestamp}.db")

    src = sqlite3.connect(DB_PATH)
    dest = sqlite3.connect(dest_path)
    with dest:
        src.backup(dest)
    src.close()
    dest.close()

    print(f"バックアップ完了: {dest_path}")
    _cleanup_old_backups()


def _cleanup_old_backups():
    cutoff = datetime.datetime.now() - datetime.timedelta(days=KEEP_DAYS)
    for name in os.listdir(BACKUP_DIR):
        path = os.path.join(BACKUP_DIR, name)
        if not name.startswith("voicelogi_") or not name.endswith(".db"):
            continue
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(path))
        if mtime < cutoff:
            os.remove(path)
            print(f"古いバックアップを削除: {path}")


if __name__ == "__main__":
    try:
        backup()
    except Exception as e:
        print(f"バックアップに失敗しました: {e}", file=sys.stderr)
        sys.exit(1)
