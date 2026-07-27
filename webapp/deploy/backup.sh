#!/bin/sh
# KoeHaisha の SQLiteデータを日付付きでバックアップする。
# cron 等で1日1回実行することを想定(deploy/README.md 参照)。
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBAPP_DIR="$(dirname "$SCRIPT_DIR")"
DB_FILE="$WEBAPP_DIR/dev.db"
BACKUP_DIR="$WEBAPP_DIR/backups"
KEEP_DAYS=30

if [ ! -f "$DB_FILE" ]; then
  echo "バックアップ対象が見つかりません: $DB_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$DB_FILE" "$BACKUP_DIR/dev-$STAMP.db"

# 古いバックアップを削除(既定30日)
find "$BACKUP_DIR" -name "dev-*.db" -mtime +"$KEEP_DAYS" -delete

echo "バックアップ完了: $BACKUP_DIR/dev-$STAMP.db"
