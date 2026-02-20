@echo off
echo ==========================================
echo   ClipperSkuy - Build Electron App
echo ==========================================
echo.

:: Check if GH_TOKEN is set
if "%GH_TOKEN%"=="" (
    echo [!] GH_TOKEN not set. Auto-update publish will be skipped.
    echo [!] To enable: set GH_TOKEN=your_github_personal_access_token
    echo.
    echo Building WITHOUT publish...
    npm run build:frontend && electron-builder --win
) else (
    echo [OK] GH_TOKEN found. Building WITH publish...
    npm run build:frontend && electron-builder --win --publish always
)

echo.
echo ==========================================
echo   Build complete! Check /dist folder
echo ==========================================
pause
