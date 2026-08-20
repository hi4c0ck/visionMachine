@echo off
setlocal enabledelayedexpansion

echo ╔════════════════════════════════════════════════════════════╗
echo ║           VisionMachine - Development Mode               ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check prerequisites
echo [CHECK] Verifying environment...
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cargo/Rust not found!
    echo Please install Rust: https://rustup.rs
    pause
    exit /b 1
)

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js: https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Rust found
echo [OK] Node.js found
echo.

REM Install Tauri CLI if needed
echo [CHECK] Checking Tauri CLI...
where cargo-tauri >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INSTALL] Installing Tauri CLI (first time only)...
    echo [INFO] This may take several minutes...
    call cargo install tauri-cli --version "^2" --locked
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install Tauri CLI
        pause
        exit /b 1
    )
) else (
    echo [OK] Tauri CLI found
)
echo.

REM Install frontend dependencies
cd /d "%~dp0src\frontend"
if not exist "node_modules\" (
    echo [INSTALL] Installing frontend dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install frontend dependencies
        pause
        exit /b 1
    )
) else (
    echo [SKIP] Frontend dependencies already installed
)
echo.

REM Start Tauri dev mode
echo ════════════════════════════════════════════════════════════
echo [START] Launching VisionMachine Desktop App...
echo [INFO] A native Windows window will open shortly
echo [INFO] Press Ctrl+C in this terminal to stop
echo ════════════════════════════════════════════════════════════
echo.
cd /d "%~dp0src-tauri"
call cargo tauri dev

echo.
echo [DONE] Application closed.
pause
