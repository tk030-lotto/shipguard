@echo off
chcp 932 >nul
cd /d "%~dp0"
title shipguard UI

echo ========================================================
echo   shipguard UI を起動しています...
echo   ブラウザで http://localhost:3773 を開きます
echo   終了するときはこのウィンドウを閉じてください
echo ========================================================
echo.

node "bin\shipguard.js" ui

echo.
echo ========================================================
echo   shipguard UI が終了しました。
echo ========================================================
pause
