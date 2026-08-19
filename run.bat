@echo off
chcp 65001 >nul
title VisionMachine - AI Video Generator

echo ========================================
echo   VISIONMACHINE LAUNCHER
echo ========================================
echo.

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    echo Please install Python 3.12+ from https://python.org
    pause
    exit /b 1
)

:: Check if virtual environment exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

:: Activate virtual environment
call .venv\Scripts\activate.bat

:: Install dependencies if needed
if not exist ".venv\Lib\site-packages\fastapi" (
    echo Installing dependencies...
    pip install -r requirements.txt
)

echo.
echo Starting servers...
echo.
echo [1/2] Backend API server (port 8765)
echo [2/2] Frontend web server (port 9876)
echo.
echo Press Ctrl+C to stop all servers
echo.

:: Start backend in background
start "VisionMachine API" cmd /c "python api_server.py"

:: Wait for backend to start
timeout /t 2 /nobreak >nul

:: Start frontend
echo Opening browser...
start http://localhost:9876

:: Start frontend server in current window
python -m http.server 9876 --directory src/frontend
