# VisionMachine v0.1.4 - Testing Guide

## Build Information
- **Version**: v0.1.4
- **Build Type**: Debug
- **MSI Location**: `src-tauri/target/debug/bundle/msi/VisionMachine_0.1.2_x64_en-US.msi`
- **Executable**: `src-tauri/target/debug/vision-machine.exe`

## Fixes Applied
1. ✅ Restored 5-container layout (Frame, ProjectsPanel, ProfilePanel, ComposerPanel, ToolsPanel)
2. ✅ Fixed database initialization (check-exist-create pattern)
3. ✅ Added proper file logging to disk
4. ✅ Fixed Welcome screen reactivity
5. ✅ Removed incorrect version tags (v0.2.x, v0.3.0)

## How to Test

### Step 1: Install/Run
```bash
# Option A: Run debug executable directly
Start-Process "D:\work\horizonsMachine\VisionMachine\src-tauri\target\debug\vision-machine.exe"

# Option B: Install from MSI
# Double-click: src-tauri/target/debug/bundle/msi/VisionMachine_0.1.2_x64_en-US.msi
```

### Step 2: Welcome Screen Test
1. Enter your name in the input field
2. Verify button becomes enabled (blue, not grayed out)
3. Click "Get Started" or press Enter
4. Should transition to workspace immediately

### Step 3: Layout Verification
You should see the 5-container layout:
- **Top**: Frame header with logo, preview area, theme selector
- **Left**: ProjectsPanel + ProfilePanel (bottom-left)
- **Center**: ComposerPanel (main canvas area)
- **Right**: ToolsPanel (tools sidebar)

### Step 4: Log Verification
Logs should be written to:
```
C:\Users\<username>\AppData\Local\com.visionmachine.desktop\logs\visionmachine_YYYYMMDD.log
```

To view logs:
```powershell
Get-Content "$env:LOCALAPPDATA\com.visionmachine.desktop\logs\visionmachine_$(Get-Date -Format 'yyyyMMdd').log"
```

Expected log content:
```
[2026-08-24 XX:XX:XX.XXX] [INFO] Application starting...
[2026-08-24 XX:XX:XX.XXX] [INFO] Preflight checks: PASSED
[2026-08-24 XX:XX:XX.XXX] [INFO] [Setup] Database initialized at: ...
```

### Step 5: Functionality Test
1. Click "+" in ProjectsPanel to create a project
2. Enter project name → Create
3. Project should appear in the list
4. Click the project to select it
5. Composer should show empty state or default scene

## Known Issues
- None currently known

## Git Status
- Branch: production
- Latest commit: `52e7d11 fix: add proper logging, restore 5-container layout, fix DB init`
- Tag: v0.1.4
