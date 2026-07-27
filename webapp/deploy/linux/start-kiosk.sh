#!/bin/sh
# サーバー起動を待ってから、ブラウザをキオスク(全画面)モードで開く。
# デスクトップ環境の自動起動アプリ(~/.config/autostart等)に登録する。
set -eu

URL="http://localhost:3000"
CHROMIUM_BIN="chromium-browser"  # 端末によって chromium / google-chrome 等に読み替える

until curl -s -o /dev/null "$URL"; do
  sleep 1
done

"$CHROMIUM_BIN" --kiosk --noerrdialogs --disable-infobars "$URL"
