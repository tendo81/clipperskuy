@echo off
echo Restarting backend...

:: Kill only the process using port 5000 (not ALL node.exe!)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr LISTENING') do (
    echo Killing PID %%a on port 5000...
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 >nul
start "ClipperSkuy Backend" /MIN cmd /k "cd /d "%~dp0backend" && node src/server.js"
timeout /t 3 >nul
echo Backend restarted! Check the "ClipperSkuy Backend" window for logs.
echo.
echo Now render a clip and check logs in the backend window.
pause
