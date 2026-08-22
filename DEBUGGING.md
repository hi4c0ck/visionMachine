# VisionMachine Debugging Workflow

## Quick Start

### Development Mode (with logging)
```powershell
.\scripts\dev.ps1
```
- Starts Vite dev server on http://localhost:1420
- Launches Tauri with RUST_LOG=debug
- Console logs appear in the terminal
- App data logged to: `%LOCALAPPDATA%\VisionMachine\logs\`

### Release Build
```powershell
.\scripts\release.ps1
```
- Full frontend + Rust release build
- Produces MSI installer at: `src-tauri/target/release/bundle/msi/`

### Debug Build Only
```powershell
cargo build --manifest-path src-tauri/Cargo.toml
```
- Faster than full Tauri dev
- Produces: `src-tauri/target/debug/vision-machine.exe`

## Logging

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `RUST_LOG=debug` | Enable debug-level Rust logs |
| `RUST_BACKTRACE=1` | Include stack traces on panics |
| `TAURI_ENVIRONMENT_MODE=development` | Enable dev tools in app |

### Log Locations
- **Console**: During `tauri dev` or `cargo run`
- **File**: `%LOCALAPPDATA%\VisionMachine\logs\visionmachine_YYYYMMDD.log`

### Viewing Logs
```powershell
# Recent log entries
Get-ChildItem "$env:LOCALAPPDATA\VisionMachine\logs" -Filter "*.log" | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1 | 
    Get-Content -Tail 50

# Follow log in real-time
Get-Content "$env:LOCALAPPDATA\VisionMachine\logs\*.log" -Wait -Tail 10
```

## Debugging Tips

### Hot Reload
Changes to:
- `src/` (Svelte components) → Automatic via Vite
- `src-tauri/src/` (Rust code) → Run `cargo build` then restart app

### Checking if Frontend is Ready
```powershell
Invoke-WebRequest -Uri "http://localhost:1420" -TimeoutSec 2
```

### Port Conflicts
Default port is 1420. If occupied:
```powershell
netstat -ano | findstr :1420
```

## Build Targets

| Command | Output | Use Case |
|---------|--------|----------|
| `npm run dev` | Vite server | Frontend only |
| `.\scripts\dev.ps1` | Tauri app | Full dev with logging |
| `.\scripts\release.ps1` | MSI installer | Production build |
| `cargo build` | exe + dll | Rust-only rebuild |

## Troubleshooting

### Database Connection Issues
If you see "unable to open database file" error:
- The app uses `%LOCALAPPDATA%\com.visionmachine.desktop\visionmachine.db`
- Check directory permissions
- Delete the app folder and restart to create fresh

```powershell
# Clear app data and restart
Remove-Item "$env:LOCALAPPDATA\com.visionmachine.desktop" -Recurse -Force
.\scripts\dev.ps1
```

### "Waiting for dev server..." hangs
Frontend may not be ready. Check Vite output or restart with:
```powershell
npm run dev
```

### Build fails with PDB collision warning
This is a known Cargo issue, not an error. Build succeeds despite warning.

### Can't write to app data directory
Check permissions on `%LOCALAPPDATA%\com.visionmachine.desktop`. The app creates this automatically.

## Recent Fixes

### 2026-08-21: Database Connection Fix
- **Issue**: SQLite connection failed with "unable to open database file" (code: 14)
- **Root Cause**: Path encoding issue with special characters in Windows paths
- **Fix**: Changed to use direct `Path` object instead of string conversion in `new_sync_from_path()`
- **Status**: ✅ Fixed in debug and release builds

### 2026-08-21: UI Navigation & Theme Issues
- **Issue**: App couldn't proceed past welcome screen; theme changes not affecting UI
- **Root Cause**: TypeScript errors due to incorrect Svelte event handler syntax (`onclick` instead of `on:click`)
- **Fix**: 
  - Changed all event handlers to Svelte syntax: `on:click`, `on:change`, `on:keydown`
  - Added proper TypeScript types for event handlers
  - Fixed main.ts to include design system CSS
  - Updated index.html to load CSS from `/css/design-system.css`
- **Status**: ✅ Fixed - app now navigates correctly and themes work
