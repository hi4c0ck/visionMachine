@echo off
chcp 65001 >nul

:: Set paths
set PATH=C:\Users\user\.cargo\bin;C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;%PATH%

:: Go to project
cd /d D:\work\horizonsMachine\VisionMachine

:: Install frontend dependencies if needed
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
)

:: Start Tauri dev mode
echo Starting VisionMachine Desktop App...
tauri dev