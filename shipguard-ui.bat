@echo off
chcp 932 >nul
setlocal
cd /d "%~dp0"
title shipguard UI Launcher

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [エラー] Node.js が見つかりませんでした。
    echo Node.js (v18以上) をインストールしてください。
    pause
    exit /b 1
)

echo ========================================================
echo   shipguard UI を起動しています...
echo   自動的にブラウザが開きます。終了時はこのウィンドウを閉じてください。
echo ========================================================
echo.

node "bin\shipguard.js" ui

if %errorlevel% neq 0 (
    echo.
    echo [エラー] shipguard UI の起動中に問題が発生しました。
    pause
)
