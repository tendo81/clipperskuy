@echo off
echo ========================================
echo   ClipperSkuy - Rebuild + Restart
echo ========================================
echo.

:: Step 1: Build frontend
echo [1/3] Building frontend...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed!
    pause
    exit /b 1
)
echo Frontend built successfully!
echo.

:: Step 2: Kill backend pada port 5000
echo [2/3] Stopping backend...
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr LISTENING') do (
    echo Killing PID %%a on port 5000...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 >nul

:: Step 3: Start backend
echo [3/3] Starting backend...
start "ClipperSkuy Backend" /MIN cmd /k "cd /d "%~dp0backend" && node src/server.js"
timeout /t 3 >nul

echo.
echo ========================================
echo   DONE! Frontend rebuilt + Backend restarted
echo   Open: http://localhost:5000
echo   Ctrl+Shift+R di browser untuk hard refresh!
echo ========================================
echo.
pause
