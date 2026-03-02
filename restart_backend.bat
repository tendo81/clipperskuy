@echo off
echo Restarting backend with render logging...
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 >nul
start "ClipperSkuy Backend" /MIN cmd /k "cd /d "%~dp0backend" && node src/server.js"
timeout /t 3 >nul
echo Backend restarted! Check the "ClipperSkuy Backend" window for logs.
echo.
echo Now render a clip and check logs in the backend window.
pause
