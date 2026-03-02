@echo off
title ClipperSkuy Dev Server
color 0A

echo.
echo  =========================================
echo    ClipperSkuy - Starting All Servers...
echo  =========================================
echo.

:: Kill any stale node processes from previous run
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 1 >nul

:: Start Frontend (Vite) — no restart needed, stable
echo  [1/2] Starting Frontend (port 5173)...
start "ClipperSkuy Frontend" /MIN cmd /c "cd /d "%~dp0frontend" && node node_modules/vite/bin/vite.js --port 5173"
timeout /t 2 >nul

:: Start Telebot
echo  [2/2] Starting Telebot...
start "ClipperSkuy Telebot" /MIN cmd /c "cd /d "%~dp0telebot" && node index.js"
timeout /t 1 >nul

echo.
echo  =========================================
echo    Frontend : http://localhost:5173
echo    Backend  : http://localhost:5000 (auto-restart)
echo  =========================================
echo.
echo  [Backend] Starting with auto-restart...
echo  Press Ctrl+C to stop everything.
echo.

:: Backend with AUTO-RESTART loop
:: If it crashes, it will restart automatically after 2 seconds
:RESTART_BACKEND
echo  [%time%] [Backend] Starting...
cd /d "%~dp0backend"
node src/server.js
echo.
echo  [%time%] [Backend] CRASHED or stopped! Restarting in 2 seconds...
timeout /t 2 >nul
goto RESTART_BACKEND
