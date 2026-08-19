@echo off
chcp 65001 >nul
title VisionMachine Launcher

:: Explicit paths to all tools (no PowerShell, no script detection)
set CARGO_EXE=C:\Users\user\.cargo\bin\cargo.exe
set RUSTC_EXE=C:\Users\user\.cargo\bin\rustc.exe
set NODE_EXE=C:\Program Files\nodejs\node.exe
set NPM_EXE=C:\Program Files\nodejs\npm.cmd
set TAURI_EXE=C:\Users\user\AppData\Roaming\npm\tauri.cmd
set LINK_EXE=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe

:: Add all to PATH
set PATH=C:\Users\user\.cargo\bin;C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;%PATH%

:: Change to project directory
cd /d D:\work\horizonsMachine\VisionMachine

echo.
echo ============================================================
echo   VISIONMACHINE - Desktop App Launcher
echo ============================================================
echo.

:: Check each tool exists
if exist "%RUSTC_EXE%" (
    echo [OK] Rust: %RUSTC_EXE%
) else (
    echo [FAIL] Rust not found
)

if exist "%CARGO_EXE%" (
    echo [OK] Cargo: %CARGO_EXE%
) else (
    echo [FAIL] Cargo not found
)

if exist "%NODE_EXE%" (
    echo [OK] Node.js: %NODE_EXE%
) else (
    echo [FAIL] Node.js not found
)

if exist "%TAURI_EXE%" (
    echo [OK] Tauri CLI: %TAURI_EXE%
) else (
    echo [WARN] Tauri CLI not found
)

if exist "%LINK_EXE%" (
    echo [OK] MSVC Linker: %LINK_EXE%
) else (
    echo [FAIL] MSVC Build Tools not found
    echo        Install: scripts\install-build-tools.cmd
)

echo.
echo ============================================================
echo.
echo Select action:
echo   1 - Start dev server (tauri dev)
echo   2 - Build installer (tauri build)
echo   3 - Web version only
echo   0 - Exit
echo.

set /p choice="Enter choice: "

if "%choice%"=="1" goto devmode
if "%choice%"=="2" goto buildmode
if "%choice%"=="3" goto webmode
goto end

:devmode
echo.
echo Starting development server...
call "%TAURI_EXE%" dev
goto end

:buildmode
echo.
echo Building production installer...
call "%TAURI_EXE%" build
echo.
echo Done! Check src-tauri\target\release\bundle\ for outputs.
goto end

:webmode
echo.
echo Starting web version...
start "" cmd /c "python api_server.py"
timeout /t 2 /nobreak >nul
start "" cmd /c "python -m http.server 9876 --directory ."
timeout /t 3 /nobreak >nul
start http://localhost:9876
echo Opened browser at http://localhost:9876
goto end

:end
echo.
pause
