@echo off
chcp 65001 >nul

:: Get GitHub info from user
echo ========================================
echo   GitHub Contribution Setup
echo ========================================
echo.

set /p NAME="Enter your GitHub display name: "
set /p EMAIL="Enter your GitHub verified email: "

echo.
echo Setting git config...
git config user.name "%NAME%"
git config user.email "%EMAIL%"

echo.
echo Verifying...
git config --get user.name
git config --get user.email

echo.
echo ========================================
echo Done! Future commits will use this info.
echo ========================================
pause
