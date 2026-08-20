@echo off
chcp 65001 >nul
set PATH=C:\Users\user\.cargo\bin;C:\Program Files\nodejs;%PATH%
cd /d D:\work\horizonsMachine\VisionMachine

echo Starting VisionMachine dev mode...
npm run tauri:dev
