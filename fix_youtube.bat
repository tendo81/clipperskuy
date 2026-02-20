@echo off
echo ========================================
echo  ClipperSkuy - Fix YouTube Download
echo ========================================
echo.

set "APP_DIR=C:\Program Files\ClipperSkuy\resources"
set "SRC_DIR=%~dp0"
set "DENO_SRC=%USERPROFILE%\.deno\bin\deno.exe"

echo [1/3] Copying Deno binary...
mkdir "%APP_DIR%\deno" 2>nul
copy /Y "%DENO_SRC%" "%APP_DIR%\deno\deno.exe"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Gagal copy deno.exe - Pastikan jalankan sebagai Administrator!
    pause
    exit /b 1
)
echo     OK - deno.exe copied

echo [2/3] Updating youtube.js...
copy /Y "%SRC_DIR%backend\src\services\youtube.js" "%APP_DIR%\app\backend\src\services\youtube.js"
echo     OK - youtube.js updated

echo [3/3] Updating main.js...
copy /Y "%SRC_DIR%electron\main.js" "%APP_DIR%\app\electron\main.js"
echo     OK - main.js updated

echo.
echo ========================================
echo  DONE! Sekarang restart ClipperSkuy app
echo ========================================
echo.
pause
