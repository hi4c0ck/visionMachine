@echo off
chcp 65001 >nul

:: Set paths
set PATH=C:\Users\user\.cargo\bin;C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;%PATH%

:: Change to project directory
cd /d D:\work\horizonsMachine\VisionMachine

:: Auto-detect and start appropriate mode
where tauri >nul 2>&1
if %errorlevel% equ 0 (
    :: Tauri available - start desktop dev mode
    tauri dev
) else (
    :: Fallback to web version
    python api_server.py
)
