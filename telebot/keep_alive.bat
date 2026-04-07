@echo off
:: ClipperSkuy Bot Keep-Alive Script
:: Cek apakah bot masih jalan, kalau mati auto-start

cd /d "C:\Users\kuyka\Music\opus 1\telebot"

pm2 describe telebot >nul 2>&1
if %errorlevel% neq 0 (
    echo [%date% %time%] Bot mati, starting...
    pm2 start index.js --name telebot
    pm2 save
) else (
    echo [%date% %time%] Bot masih jalan.
)
