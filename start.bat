@echo off
title MP3 Transcribe Pro

cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo Starting MP3 Transcribe Pro...
echo The browser will open automatically when the server is ready...

call npm run dev
