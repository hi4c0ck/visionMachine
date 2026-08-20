@echo off
chcp 65001 >nul
set PATH=C:\Users\user\.cargo\bin;C:\Program Files\nodejs;%PATH%
cd /d D:\work\horizonsMachine\VisionMachine

:: Check if release build exists, otherwise build
if exist "src-tauri\target\release\visionmachine.exe" (
    echo Starting VisionMachine...
    start "" src-tauri\target\release\visionmachine.exe
) else (
    echo Building VisionMachine...
    npm run build
    npm run tauri:build
)
