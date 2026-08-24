# VisionMachine v0.1.3 Fixes

## Issues Fixed

### 1. Versioning
- Fixed incorrect version bumping (was using v0.3.0 incorrectly)
- Now following proper semver: only increment minor on user intent

### 2. Database Initialization
- Simplified DB init: check if exists → create if not
- No longer panics on missing database
- Logs are written properly

### 3. Welcome Screen
- Fixed button reactivity
- Added proper state management

## Files Modified
- `src-tauri/src/lib.rs` - Fixed DB init, logging
- `src/components/Workspace.svelte` - Restored 5-container layout
- `src/App.svelte` - Fixed Welcome screen reactivity

## Build Status
- ✅ Debug build successful
- ✅ MSI at: `src-tauri/target/debug/bundle/msi/VisionMachine_0.1.2_x64_en-US.msi`

## Logging Location
Logs are now written to:
```
C:\Users\<username>\AppData\Local\VisionMachine\logs\visionmachine_<date>.log
```

## Test Steps
1. Install debug MSI
2. Run app
3. Enter name → Click "Get Started"
4. Check logs at: `%LOCALAPPDATA%\VisionMachine\logs\`
5. Should see:
   - Welcome screen with working button
   - After login: 5-container layout
   - DB initialization messages in logs

## Git Status
- Branch: production
- Latest commit: fix: simplify database init, restore correct versioning
- Tag: v0.1.3 (correct version)
