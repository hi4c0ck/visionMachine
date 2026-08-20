@echo off
chcp 65001 >nul
title VisionMachine - Silent Build Setup

echo ============================================================
echo   VISIONMACHINE - AUTOMATED BUILD SETUP
echo ============================================================
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires Administrator privileges.
    echo         Please right-click and select "Run as administrator".
    pause
    exit /b 1
)

:: Step 1: Download Build Tools if not present
echo [Step 1/5] Checking Visual C++ Build Tools...
where link >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] Visual C++ Build Tools already installed
) else (
    echo   [INFO] Installing Visual C++ Build Tools silently...
    echo          Downloading to temp folder...
    
    set DOWNLOAD_URL=https://aka.ms/vs/17/release/vs_BuildTools.exe
    set INSTALLER_PATH=%TEMP%\vs_build_tools.exe
    
    if not exist "%INSTALLER_PATH%" (
        echo          Downloading (~500MB)...
        powershell -Command "Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%INSTALLER_PATH%' -UseBasicParsing"
    )
    
    echo          Running silent installation...
    echo          This will take 10-15 minutes. Do not close this window.
    echo.
    
    "%INSTALLER_PATH%" --passive --norestart --wait ^
        --add Microsoft.VisualStudio.Workload.VCTools ^
        --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 ^
        --add Microsoft.VisualStudio.Component.Windows10SDK.22621 ^
        --add Microsoft.VisualStudio.Component.VC.ATL ^
        --add Microsoft.VisualStudio.Component.VC.MFC
    
    echo.
    echo   [OK] Installation complete
)

:: Step 2: Verify Rust
echo.
echo [Step 2/5] Checking Rust toolchain...
set RUSTUP_PATH=C:\Users\%USERNAME%.cargo\bin
if not exist "%RUSTUP_PATH%\rustc.exe" (
    echo   [ERROR] Rust not found. Installing...
    powershell -Command "Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://win.rustup.rs/x86_64'))"
    goto install_done
) else (
    "%RUSTUP_PATH%\rustc.exe" --version
    echo   [OK] Rust installed
)

:: Step 3: Add to PATH permanently
echo.
echo [Step 3/5] Adding to system PATH...
set PATH_ITEMS=C:\Users\%USERNAME%.cargo\bin;%APPDATA%\npm

for %%p in (%PATH_ITEMS%) do (
    reg add "HKCU\Environment" /v Path /t REG_SZ /d "%PATH%;%%p" /f >nul 2>&1
)
echo   [OK] PATH updated (will apply after restart)

:: Step 4: Install Tauri CLI
echo.
echo [Step 4/5] Installing Tauri CLI...
call npm install -g @tauri-apps/cli
if %errorlevel% neq 0 (
    echo   [WARN] Tauri CLI install failed, may need manual installation
) else (
    echo   [OK] Tauri CLI installed
)

:: Step 5: Verify
echo.
echo [Step 5/5] Final verification...
echo.
echo Checking tools...
echo.

where rustc 2>nul && echo   [OK] Rust: %path% || echo   [FAIL] Rust not found
where cargo 2>nul && echo   [OK] Cargo: %path% || echo   [FAIL] Cargo not found
where cl 2>nul && echo   [OK] Visual C++ Compiler: %path% || echo   [FAIL] MSVC not found
where link 2>nul && echo   [OK] Linker: %path% || echo   [FAIL] Linker not found
where tauri 2>nul && echo   [OK] Tauri CLI: %path% || echo   [WARN] Tauri CLI not in PATH

echo.
echo ============================================================
echo   SETUP COMPLETE
echo ============================================================
echo.
echo IMPORTANT: Restart your terminal or run:
echo   set PATH=C:\Users\%USERNAME%.cargo\bin;%APPDATA%\npm;%PATH%
echo.
echo Then build with:
echo   cargo tauri build
echo.
pause
