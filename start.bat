@echo off
title MP3 Transcribe Pro

cd /d "%~dp0"

echo Current directory: %cd%
echo.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Found npm:
call npm --version
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
)

echo Starting MP3 Transcribe Pro...
echo The browser will open automatically when the server is ready...
echo If it doesn't, open http://localhost:5173/app in your browser.
echo.
echo Press Ctrl+C to stop the servers.
echo.

call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start dev servers.
    pause
)
