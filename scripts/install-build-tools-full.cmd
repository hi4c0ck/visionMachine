@echo off
chcp 65001 >nul
title VisionMachine - Full Build Environment Setup

echo ============================================================
echo   Installing Complete Build Environment
echo   (Visual C++ Build Tools + Windows SDK)
echo ============================================================
echo.

:: Check if already installed
where link.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Visual C++ Build Tools already installed
    where link.exe
    goto :check_sdk
)

echo [INFO] Downloading Visual Studio Build Tools...
echo        This will take 10-15 minutes (~5GB download).
echo.

:: Download Build Tools
set DOWNLOAD_URL=https://aka.ms/vs/17/release/vs_BuildTools.exe
set INSTALLER=%TEMP%\vs_build_tools.exe

powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%INSTALLER%' -UseBasicParsing"

if not exist "%INSTALLER%" (
    echo [ERROR] Failed to download installer
    pause
    exit /b 1
)

echo [OK] Download complete.
echo [INFO] Installing Visual C++ Build Tools with Windows SDK...
echo.
echo IMPORTANT: This will install the following components:
echo   - MSVC v143 build tools
echo   - Windows 10/11 SDK
echo   - C++ ATL, MFC
echo.
echo Do NOT close this window!
echo.

:: Install with Windows SDK included
"%INSTALLER%" --passive --wait ^
    --add Microsoft.VisualStudio.Workload.VCTools ^
    --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 ^
    --add Microsoft.VisualStudio.Component.Windows10SDK.22621 ^
    --add Microsoft.VisualStudio.Component.Windows11SDK.22621 ^
    --add Microsoft.VisualStudio.Component.VC.ATL ^
    --add Microsoft.VisualStudio.Component.VC.MFC

set EXIT_CODE=%errorlevel%

:: Clean up
del "%INSTALLER%" 2>nul

echo.
if %EXIT_CODE% equ 0 (
    echo ============================================================
    echo   SUCCESS! Build environment installed.
    echo ============================================================
) else (
    echo ============================================================
    echo   INSTALLATION FAILED (Exit code: %EXIT_CODE%)
    echo ============================================================
    echo.
    echo Please try installing manually from:
    echo https://visualstudio.microsoft.com/visual-cpp-build-tools/
)

:check_sdk
echo.
echo Checking Windows SDK...
dir "C:\Program Files (x86)\Windows Kits\10\Lib" /b 2>nul | findstr /i "10."
if %errorlevel% neq 0 (
    echo [WARN] Windows SDK not found at expected location
    echo        You may need to run the installer again and ensure
    echo        "Windows 10/11 SDK" is selected.
)

echo.
pause
