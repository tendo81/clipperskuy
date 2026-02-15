@echo off
title ClipperSkuy Launcher
color 0A

echo.
echo   ======================================
echo    ⚡ C L I P P E R S K U Y            
echo    AI Video Clipping Engine           
echo   ======================================
echo.

echo [1/2] Starting Backend Server (Port 5000)...
start "ClipperSkuy Backend" cmd /k "cd backend && npm start"

echo [2/2] Starting Frontend (Port 5173)...
start "ClipperSkuy Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Opening browser in 5 seconds...
timeout /t 5 >nul
start http://localhost:5173

echo.
echo ======================================
echo  ClipperSkuy is running!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:5000
echo ======================================
echo.
echo Press any key to close this window...
pause >nul
