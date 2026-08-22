# VisionMachine Quick Start

## Run the Application
```bash
cd D:\work\horizonsMachine\VisionMachine\src-tauri
cargo tauri dev
```

## Verify it's Working
```powershell
Get-Process | Where-Object {$_.MainWindowTitle -like '*Vision*'}
Invoke-WebRequest -Uri 'http://localhost:1420/' -UseBasicParsing
```

## Features
- Welcome screen with username input
- Login/logout functionality
- Dark theme UI
- localStorage persistence

## Status
✅ App running (PID varies)
✅ HTTP server on port 1420
✅ Clean compilation
