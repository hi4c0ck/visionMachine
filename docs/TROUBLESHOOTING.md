# Troubleshooting Guide

Common issues and solutions for VisionMachine (Tauri 2 + Svelte 5).

## Build Issues

### Error: "Port 1420 already in use"
**Cause:** Another process using the Vite dev server port.

**Solution:**
```powershell
# Find and kill the process
netstat -ano | findstr :1420
taskkill /PID <pid> /F
```

### Error: "Svelte 5 syntax error"
Common causes and fixes:

| Error | Cause | Fix |
|-------|-------|-----|
| `$props() is not defined` | Using Svelte 4 syntax | Use `let { ... } = $props()` instead of `export let` |
| `$state() can only be used as variable declaration` | Using $state in wrong context | Only declare at top level of script, not in destructuring |
| `$:` is not allowed in runes mode | Using Svelte 4 reactive statements | Replace with `$derived()` or `$effect()` |
| Mixed event syntax (`on:event` + `onEvent`) | Mixing old and new syntax | Use ONLY `onEvent` (lowercase) throughout |
| `createEventDispatcher` not found | Using Svelte 4 events | Remove it; use callback props instead |

### Error: "component_api_invalid_new"
**Cause:** Using Svelte 4 `new App()` pattern in main.ts.

**Solution:** Use Svelte 5 mount API:
```typescript
import { mount } from 'svelte';
import App from './App.svelte';
mount(App, { target: document.getElementById('app')! });
```

---

## Runtime Issues

### Blank Screen After Login
**Possible causes:**
1. `showWelcome` state not properly set to `false`
2. Missing prop passed to Workspace component
3. JavaScript error in console

**Fix:**
1. Check browser DevTools Console (F12) for errors
2. Verify `handleLogin()` in App.svelte sets `showWelcome = false`
3. Ensure all props are passed correctly to Workspace

### App Won't Start - Pre-flight Check Failure
**Check WebView2:**
```powershell
# Verify WebView2 is installed
Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
```

**If missing:**
```powershell
# Download WebView2 runtime
Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkID=2093589" -OutFile "$env:TEMP\WebView2.exe"
Start-Process -FilePath "$env:TEMP\WebView2.exe" -Wait
Remove-Item "$env:TEMP\WebView2.exe"
```

---

## Rust/Tauri Build Issues

### Error: "link.exe not found"
**Cause:** Visual C++ Build Tools not installed.

**Solution:** Install via Visual Studio Installer:
- Workload: "Desktop development with C++"
- Required components: MSVC v143, Windows 10/11 SDK

### Error: "output filename collision"
This is a **warning only**, not an error. The build still succeeds.
The bin and lib targets have the same .pdb filename. This does not affect functionality.

### Error: "mutex deadlock in async function"
**Cause:** Using `std::sync::Mutex` instead of `tokio::sync::Mutex`.

**Fix:**
```rust
// WRONG - will deadlock across .await
use std::sync::Mutex;
state.lock().unwrap(); // Deadlock if held across await

// CORRECT - async-aware mutex
use tokio::sync::Mutex;
state.lock().await; // Safe across await points
```

---

## Tauri Command Not Found

If you see "Command X not found" error:

1. Check the command exists in `src-tauri/src/lib.rs` with `#[tauri::command]` attribute
2. Ensure it's registered in `generate_handler![]`
3. Rebuild after adding new commands

```rust
// In lib.rs - ensure command is registered
.invoke_handler(tauri::generate_handler![
    login_user,
    logout_user,
    get_app_info,
    get_preflight_report,
    report_error,
    get_errors,
    set_theme,
])
```

---

## Theme/Display Issues

### Wrong Colors Showing
**Cause:** `data-theme` attribute not set on `<html>` element.

**Fix in App.svelte:**
```typescript
onMount(async () => {
  const savedTheme = localStorage.getItem('vm-theme');
  if (savedTheme) {
    selectedTheme = savedTheme;
  }
  document.documentElement.setAttribute('data-theme', selectedTheme);
});
```

---

## Development Workflow

### Hot Reload Not Working
1. Ensure Vite dev server is running on port 1420
2. Check `tauri.conf.json` has correct `devUrl`:
```json
{
  "tauri": {
    "withGlobalTauri": true,
    "devUrl": "http://localhost:1420"
  }
}
```

### Cleaning Build Artifacts
```powershell
# Clean frontend build
Remove-Item dist -Recurse -Force

# Clean Tauri build
Remove-Item src-tauri/target -Recurse -Force

# Rebuild
npm run tauri:dev
```

---

## Getting Help

1. Check logs: `%APPDATA%\VisionMachine\logs\`
2. Run diagnostics:
   ```powershell
   npm run check
   ```
3. View console output in app DevTools (Ctrl+Shift+I)
