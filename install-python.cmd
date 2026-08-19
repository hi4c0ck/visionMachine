@echo off
chcp 65001 >nul
title Installing Python 3.12

echo ============================================================
echo   Installing Python 3.12 (Required for VisionMachine)
echo ============================================================
echo.

:: Check if already installed
where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python is already installed
    python --version
    goto :end
)

echo [INFO] Downloading Python 3.12...
powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe' -OutFile '%TEMP%\python-installer.exe'"

echo [INFO] Installing Python (silent mode)...
echo        This will add Python to your PATH automatically.
echo.
"%TEMP%\python-installer.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0
set INSTALL_EXIT=%errorlevel%

:: Clean up
del "%TEMP%\python-installer.exe" 2>nul

echo.
if %INSTALL_EXIT% equ 0 (
    echo ============================================================
    echo   SUCCESS! Python 3.12 installed.
    echo ============================================================
    echo.
    echo IMPORTANT: Close this window and open a NEW terminal.
    echo Then run: launch.bat
    echo.
) else (
    echo ============================================================
    echo   INSTALLATION FAILED (Exit code: %INSTALL_EXIT%)
    echo ============================================================
    echo.
    echo Please install manually from:
    echo https://www.python.org/downloads/release/python-3127/
    echo.
    echo Make sure to check: [x] Add Python to PATH
)

:end
pause
