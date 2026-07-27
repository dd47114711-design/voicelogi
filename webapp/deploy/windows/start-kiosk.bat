@echo off
REM サーバー起動を待ってから、ブラウザをキオスク(全画面)モードで開く。
REM start-koehaisha.bat の後に実行されるよう、タスクスケジューラに登録する。
set URL=http://localhost:3000
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe

:WAIT
powershell -Command "try { (Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  timeout /t 1 >nul
  goto WAIT
)

"%CHROME%" --kiosk --noerrdialogs --disable-infobars %URL%
