@echo off
setlocal enabledelayedexpansion

echo ╔════════════════════════════════════════════════════════════╗
echo ║           VisionMachine - Production Build               ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check prerequisites
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cargo/Rust not found!
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found!
    pause
    exit /b 1
)

echo [OK] Prerequisites checked
echo.

REM Step 1: Run tests
echo ════════════════════════════════════════════════════════════
echo [STEP 1/4] Running tests...
echo ════════════════════════════════════════════════════════════
call "%~dp0test.bat"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Tests failed. Fix issues before building.
    pause
    exit /b 1
)
echo.

REM Step 2: Install Tauri CLI if needed
echo ════════════════════════════════════════════════════════════
echo [STEP 2/4] Checking Tauri CLI...
echo ════════════════════════════════════════════════════════════
where cargo-tauri >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INSTALL] Installing Tauri CLI (this may take several minutes)...
    call cargo install tauri-cli --version "^2" --locked
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install Tauri CLI
        pause
        exit /b 1
    )
) else (
    echo [OK] Tauri CLI already installed
)
echo.

REM Step 3: Build frontend
echo ════════════════════════════════════════════════════════════
echo [STEP 3/4] Building frontend...
echo ════════════════════════════════════════════════════════════
cd /d "%~dp0src\frontend"
if not exist "node_modules\" (
    echo [INSTALL] Installing npm dependencies...
    call npm install
)
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)
echo [OK] Frontend built successfully
echo.

REM Step 4: Build desktop app
echo ════════════════════════════════════════════════════════════
echo [STEP 4/4] Building desktop application...
echo ════════════════════════════════════════════════════════════
echo [INFO] This creates a standalone .exe file
echo [INFO] First build may take 10-20 minutes
echo.
cd /d "%~dp0src-tauri"
call cargo tauri build 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Desktop app build failed
    echo.
    echo Common issues:
    echo   1. Missing Windows Build Tools
    echo      Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo      Select: "Desktop development with C++" workload
    echo.
    echo   2. WebView2 not installed
    echo      Download from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
    echo.
    pause
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                    BUILD SUCCESSFUL!                       ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Your STANDALONE desktop app is ready:
echo.
echo   Location: src-tauri\target\release\
echo.
echo Files created:
echo   - visionmachine.exe          (portable standalone app)
echo   - bundle\msi\VisionMachine_*.msi  (installer)
echo.
echo To distribute:
echo   1. Copy visionmachine.exe to share it
echo   2. Or use the .msi installer
echo.
echo No web server required!
echo No Node.js required to run!
echo Just double-click and run!
echo.
pause
