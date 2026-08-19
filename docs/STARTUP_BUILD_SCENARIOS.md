# VisionMachine - Startup & Build Scenarios

## 🚀 App Startup Flow

### Scenario 1: First Run (No User Data)
```
User launches VisionMachine.exe
    ↓
Tauri Window Opens
    ↓
Svelte App initializes (App.svelte)
    ↓
Check localStorage for 'vm-username'
    ↓
NOT FOUND → Show Welcome Page
    - Display "Welcome to VisionMachine"
    - Input field for name
    - Language/Theme selectors in header
    ↓
User enters name → Click "Get Started"
    ↓
Save to localStorage → Switch to Main App
```

### Scenario 2: Returning User
```
User launches VisionMachine.exe
    ↓
Tauri Window Opens
    ↓
Check localStorage for 'vm-username'
    ↓
FOUND → Show Main App
    - Display "Hello, {name}!"
    - Load saved theme preference
    - Ready to generate videos
```

### Scenario 3: Theme/Language Change
```
User clicks Theme dropdown (header)
    ↓
Select new theme (e.g., "Steel Dark")
    ↓
Apply to document.documentElement
    ↓
Save to localStorage ('vm-theme')
    ↓
Instant UI update (no reload needed)
```

---

## 🛠️ Build Scenarios

### Development Mode
```powershell
# Command
cargo tauri dev

# What happens:
1. Rust backend compiles (incremental)
2. Svelte frontend compiles (Vite HMR)
3. Python backend NOT auto-started (manual)
4. Opens dev window with browser tools
5. Hot-reload on file changes

# To test Python integration:
# Terminal 1: cargo tauri dev
# Terminal 2: uv run python -m src.api

# Port: http://localhost:1420 (internal)
```

### Production Build (Windows)
```powershell
# Command
cargo tauri build

# Output locations:
# x64 installer:
#   src-tauri/target/release/bundle/msi/VisionMachine_0.1.0_x64_en-US.msi

# Portable version:
#   src-tauri/target/release/bundle/windows-portable/VisionMachine.zip

# Size: ~10-15MB (includes WebView2 runtime check)
```

### Cross-Platform Build
```powershell
# Windows only
cargo tauri build

# With macOS support (requires macOS)
cargo tauri build --target x86_64-apple-darwin

# With Linux support
cargo tauri build --target x86_64-unknown-linux-gnu
```

---

## 🔌 Component Interaction Flow

### Frontend → Backend Communication
```
Svelte Button Click
    ↓
invoke('generate_video', { prompt, duration })
    ↓
Tauri Rust Command (main.rs)
    ↓
Validate inputs
    ↓
Spawn Python subprocess
    ↓
Execute: uv run python scripts/generate_video.py
    ↓
Parse JSON response
    ↓
Return to Rust
    ↓
Return to Svelte
    ↓
Update UI (show video)
```

### Direct HTTP Alternative (Future)
```
Svelte Button Click
    ↓
Fetch POST http://127.0.0.1:8000/generate
    ↓
FastAPI Python Service (uvicorn)
    ↓
Process request
    ↓
Call AI provider
    ↓
Return JSON
    ↓
Update UI
```

---

## 📁 File Watch & Reload Behavior

### Development
| File Change | Auto-Reload? | Notes |
|-------------|--------------|-------|
| `*.svelte` | ✅ Yes | Hot Module Replacement |
| `*.css` | ✅ Yes | Instant style update |
| `src-tauri/*.rs` | ❌ No | Requires restart |
| `src/*.py` | ❌ No | Subprocess spawns fresh |

### Production
- All files bundled and minified
- No hot reload
- Optimized build output

---

## 🎯 Key Scenarios Summary

### For Developers
1. **Daily Dev**: `cargo tauri dev` + `uv run pytest`
2. **Testing UI**: Edit `.svelte` files, see changes instantly
3. **Testing Backend**: Edit `.py` files, restart subprocess
4. **Debugging**: Use DevTools (F12) in Tauri window

### For Users
1. **First Install**: Double-click MSI → Follow setup wizard
2. **First Launch**: Enter name, choose theme/language
3. **Daily Use**: Open app → Enter prompt → Generate
4. **Updates**: Check "Check for updates" checkbox

### For CI/CD
1. **Build**: `cargo tauri build`
2. **Test**: Run pytest suite
3. **Package**: Create MSI/ZIP for distribution
4. **Deploy**: Upload to GitHub Releases

---

## ⚡ Performance Considerations

| Aspect | Development | Production |
|--------|-------------|------------|
| Startup Time | ~2-3 seconds | ~1-2 seconds |
| Memory Usage | ~150MB | ~80MB |
| Bundle Size | N/A | ~10MB |
| Hot Reload | ✅ Fast | ❌ Disabled |

---

*Last updated: 2026-08-19 22:48 UTC+3*
