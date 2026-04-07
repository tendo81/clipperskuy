@echo off
title ClipperSkuy Bot - ALWAYS ON
color 0A

echo ========================================
echo   ClipperSkuy Bot - Auto Restart Mode
echo ========================================
echo.

cd /d "C:\Users\kuyka\Music\opus 1\telebot"

:start
echo [%date% %time%] Starting bot...
node index.js
echo.
echo [%date% %time%] Bot crashed or stopped! Restarting in 5 seconds...
timeout /t 5 /nobreak
goto start
