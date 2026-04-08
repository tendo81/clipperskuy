@echo off
title ClipperSkuy Bot - ALWAYS ON
color 0A

echo ========================================
echo   ClipperSkuy Bot - Auto Restart Mode
echo ========================================
echo.

cd /d "C:\Users\kuyka\Music\opus 1\telebot"

:start
echo [%date% %time%] Killing old instances...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 5 /nobreak >nul

echo [%date% %time%] Starting bot...
node index.js
echo.
echo [%date% %time%] Bot stopped! Restarting in 10 seconds...
timeout /t 10 /nobreak
goto start
