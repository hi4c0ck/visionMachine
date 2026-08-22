# VisionMachine - Quick Start Guide

## Run the Application

```bash
cd D:\work\horizonsMachine\VisionMachine\src-tauri
cargo tauri dev
```

## Expected Behavior

✅ Window opens with title "VisionMachine"  
✅ Dark theme applied (JetBrains Dark)  
✅ Welcome screen shows:
   - Title: "Welcome to VisionMachine"
   - Input field for username
   - "Get Started" button
✅ Theme dropdown in header
✅ Footer with status indicator

## If You See White Screen

1. **Check if app is running:**
   ```powershell
   Get-Process | Where-Object {$_.MainWindowTitle -like '*Vision*'}
   ```

2. **Kill all instances:**
   ```powershell
   taskkill /F /IM vision-machine.exe
   taskkill /F /IM msedgewebview2.exe
   ```

3. **Clean and rebuild:**
   ```bash
   cd D:\work\horizonsMachine\VisionMachine\src-tauri
   cargo clean
   cargo tauri dev
   ```

## Debug Logs

```bash
# Check for errors
type src-tauri\stderr.log

# Check if port 1420 is free
netstat -ano | findstr :1420
```

---

*Application version: 0.1.0*
