@echo off
chcp 65001 >nul

:: Set paths
set PATH=C:\Users\user\.cargo\bin;C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;%PATH%

:: Go to project
cd /d D:\work\horizonsMachine\VisionMachine

:: Run tests first
echo Running build tests...
node scripts\test-build.js

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build tests failed. Fix errors before starting.
    pause
    exit /b 1
)

echo.
echo All tests passed. Starting VisionMachine...
echo.

:: Start Tauri
tauri dev
