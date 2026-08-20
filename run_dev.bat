@echo off
echo ╔════════════════════════════════════════════════════════╗
echo ║           VisionMachine - Development Setup          ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

REM Check if cargo is installed
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Rust/Cargo is not installed or not in PATH
    echo Please install Rust from https://rustup.rs
    pause
    exit /b 1
)

echo Cargo found:
cargo --version
echo.

cd /d "%~dp0src\frontend"
echo Installing frontend dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)
echo.

echo ╔════════════════════════════════════════════════════════╗
echo ║              Starting Development Servers            ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo Press Ctrl+C in each terminal to stop the servers
echo.
echo [TERMINAL 1] Starting Vite dev server on http://localhost:5173
start cmd /k "cd /d %~dp0src\frontend && npm run dev"
timeout /t 3 /nobreak >nul
echo.
echo [TERMINAL 2] Starting Tauri desktop app
start cmd /k "cd /d %~dp0src-tauri && cargo tauri dev"

echo.
echo Both servers should now be starting...
echo.
pause
