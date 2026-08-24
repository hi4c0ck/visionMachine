# VisionMachine v0.1.3 Fixes

## Issues Fixed

### 1. Versioning
- Fixed incorrect version bumping (was using v0.3.0 incorrectly)
- Now following proper semver: only increment minor on user intent
- Previous incorrect tags deleted (v0.2.x, v0.3.0)
- New correct tag: v0.1.3

### 2. Database Initialization
- Simplified DB init: check if exists → create if not
- No longer panics on missing database
- Proper error handling with logging

### 3. Logging System
- Fixed logger initialization to work with log crate
- Logs now write to app data directory
- Console output also preserved for debugging

### 4. Welcome Screen
- Fixed button reactivity (Get Started now works)
- Added proper state management

## Files Modified
- `src-tauri/src/lib.rs` - Fixed DB init, logging, removed complex logger module
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
   - After login: 5-container layout with Frame, ProjectsPanel, ProfilePanel, ComposerPanel, ToolsPanel
   - DB initialization messages in logs
   - Application state changes logged

## Git Status
- Branch: production
- Latest commit: fix: proper database init, logging, and correct versioning v0.1.3
- Tag: v0.1.3 (correct version)
- Previous incorrect tags deleted
