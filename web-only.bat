@echo off
chcp 65001 >nul

:: Start web version only (no Rust required)
set PATH=C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;%PATH%
cd /d D:\work\horizonsMachine\VisionMachine

python api_server.py
