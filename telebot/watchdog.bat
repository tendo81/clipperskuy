@echo off
:: ClipperSkuy Bot Starter - Run at startup
:: This script checks if PM2 telebot is running, starts it if not

cd /d "C:\Users\kuyka\Music\opus 1\telebot"

:loop
echo [%date% %time%] Checking bot status...

:: Check if node process exists
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe" >NUL
if "%ERRORLEVEL%"=="1" (
    echo [%date% %time%] Bot MATI! Starting...
    call npx pm2 start index.js --name telebot 2>NUL
    call npx pm2 save 2>NUL
    echo [%date% %time%] Bot started!
) else (
    echo [%date% %time%] Bot masih jalan.
)

:: Wait 3 minutes then check again
timeout /t 180 /nobreak >NUL
goto loop
