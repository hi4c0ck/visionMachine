@echo off
echo Starting VisionMachine debug test...
echo.

REM Kill any existing instances
taskkill /F /IM vision-machine.exe 2>nul
taskkill /F /IM msedgewebview2.exe 2>nul
timeout /t 2 /nobreak >nul

REM Start the app and redirect output
echo Starting app...
start "" "D:\work\horizonsMachine\VisionMachine\src-tauri\target\release\vision-machine.exe"

REM Wait a bit
timeout /t 5 /nobreak >nul

REM Check if still running
echo.
echo Checking process status...
tasklist | findstr vision-machine
tasklist | findstr msedgewebview2

REM Check logs
echo.
echo Checking logs...
if exist "%LOCALAPPDATA%\VisionMachine\logs" (
    dir "%LOCALAPPDATA%\VisionMachine\logs"
    type "%LOCALAPPDATA%\VisionMachine\logs\*.log" 2>nul | more +5
) else (
    echo No logs directory found
)

echo.
echo Test complete. Check the window that should have opened.
pause
