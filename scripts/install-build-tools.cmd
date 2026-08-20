@echo off
chcp 65001 >nul
title VisionMachine - Build Tools Installer

echo ============================================================
echo   Installing Visual C++ Build Tools (Silent Mode)
echo ============================================================
echo.

:: Check if already installed
where link >nul 2>&1
if %errorlevel% equ 0 (
    echo OK: Visual C++ Build Tools are already installed.
    where link
    goto end
)

echo INFO: Downloading Visual C++ Build Tools...
echo       This may take a few minutes (approximately 500MB download).
echo.

:: Set paths
set DOWNLOAD_URL=https://aka.ms/vs/17/release/vs_BuildTools.exe
set INSTALLER=%TEMP%\vs_build_tools.exe

:: Download using PowerShell
powershell -Command "Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%INSTALLER%' -UseBasicParsing"

if not exist "%INSTALLER%" (
    echo ERROR: Failed to download installer.
    echo        Please download manually from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
    pause
    exit /b 1
)

echo OK: Download complete.
echo.
echo INFO: Starting silent installation...
echo       This will take 10-15 minutes. Do NOT close this window.
echo.

:: Install with required components
"%INSTALLER%" --passive --wait ^
    --add Microsoft.VisualStudio.Workload.VCTools ^
    --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 ^
    --add Microsoft.VisualStudio.Component.Windows10SDK.22621

set INSTALL_EXIT_CODE=%errorlevel%

:: Clean up installer
del "%INSTALLER%" >nul 2>&1

echo.
if %INSTALL_EXIT_CODE% equ 0 (
    echo ============================================================
    echo   SUCCESS! Visual C++ Build Tools installed.
    echo ============================================================
    echo.
    echo Next steps:
    echo   1. Close this window
    echo   2. Open a NEW terminal
    echo   3. Run: cd D:\work\horizonsMachine\VisionMachine
    echo   4. Run: run.bat
    echo.
) else (
    echo ============================================================
    echo   INSTALLATION FAILED (Exit code: %INSTALL_EXIT_CODE%)
    echo ============================================================
    echo.
    echo Troubleshooting:
    echo   - Run as Administrator
    echo   - Check Windows Update is enabled
    echo   - Ensure sufficient disk space (>5GB)
    echo.
)

pause

:end
