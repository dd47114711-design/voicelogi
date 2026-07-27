@echo off
REM KoeHaisha サーバーを起動する。タスクスケジューラの「ログオン時」トリガーに登録する。
REM 実際の配置場所に合わせて書き換える。
cd /d C:\voicelogi\webapp
call npm start
