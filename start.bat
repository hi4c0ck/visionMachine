@echo off
echo ╔════════════════════════════════════════════════════════════╗
echo ║            VisionMachine - Quick Start                   ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Available commands:
echo.
echo   .\dev.bat      - Start development mode (with hot reload)
echo   .\test.bat     - Run all tests
echo   .\build.bat    - Build standalone desktop app (.exe + .msi)
echo   .\publish.bat  - Prepare release package
echo.
echo Example workflow:
echo   1. .\dev.bat       (develop features)
echo   2. .\test.bat      (verify everything works)
echo   3. .\build.bat     (create standalone .exe)
echo   4. .\publish.bat   (prepare for distribution)
echo.
echo Output locations:
echo   - Build: src-tauri\target\release\
echo   - Release: release\
echo.
echo ════════════════════════════════════════════════════════════
echo IMPORTANT: First run installs Tauri CLI (takes 5-10 minutes)
echo ════════════════════════════════════════════════════════════
echo.
pause
