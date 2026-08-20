@echo off
chcp 65001 >nul

:: Set paths
set PATH=C:\Users\user\.cargo\bin;C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;%PATH%

:: Go to project
cd /d D:\work\horizonsMachine\VisionMachine

:: Start Tauri dev mode (handles Vite automatically)
tauri dev
