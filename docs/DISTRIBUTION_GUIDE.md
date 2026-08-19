# VisionMachine - Distribution & Deployment Guide

## 🔑 Critical Distinction: BUILD vs RUN

### For Users to BUILD the Project
If you distribute source code and users run `npm run tauri build` themselves, they need:

| Tool | Purpose | Size |
|------|---------|------|
| **Visual C++ Build Tools** | Compile Rust native code | ~5GB |
| **Rust Toolchain** | Cargo, rustc compiler | ~0.5GB |
| **Node.js** | Frontend dependencies | ~30MB |
| **WebView2 Runtime** | UI rendering (usually pre-installed) | Included in Windows 10/11 |

### For Users to RUN the Finished App
If you build once and distribute the executable, users only need:

| Component | Required? | Notes |
|-----------|-----------|-------|
| **WebView2 Runtime** | ✅ Yes | Pre-installed on Windows 10/11 |
| **VC++ Redistributable** | ✅ Yes | ~5MB, available from Microsoft |
| **Build Tools** | ❌ No | Not needed for end users |
| **Rust** | ❌ No | Only needed by developers |
| **Node.js** | ❌ No | Only needed by developers |

---

## 💡 Key Insight: BUILD vs RUN Requirements

### What You Shared (Critical Distinction)

**For Users to BUILD the Project:**
- Visual C++ Build Tools (~5GB) - "Desktop development with C++" workload
- Rust Toolchain (via rustup)
- Node.js (for frontend)
- WebView2 Runtime (usually pre-installed on Windows 10/11)

**For Users to RUN the Finished App:**
- Only WebView2 Runtime + VC++ Redistributable (~5MB)
- NO Build Tools needed
- NO Rust installation required
- Just download and run the .exe/.msi

### Implication for VisionMachine

If we use Tauri (Rust-based), we MUST build on our machine and distribute the executable. Users cannot (and should not need to) install 5GB of build tools just to run the app.

**Solution:** We have TWO paths:
1. **Lightweight Web Version** (current) - No build tools needed anywhere
2. **Tauri Desktop Version** (future) - We build once, users just run

---

## 📦 Distribution Strategy

### Option 1: Built Installer (Recommended for Production)
**You build → User downloads**

```powershell
# On your development machine (with all tools installed):
cargo tauri build

# Output:
# - MSI installer: src-tauri/target/release/bundle/msi/VisionMachine_0.1.0_x64_en-US.msi
# - Portable ZIP: src-tauri/target/release/bundle/windows-portable/VisionMachine.zip
```

**User experience:**
- Download `.msi` or `.exe`
- Run installer (or extract ZIP)
- Double-click to launch
- No installation of dev tools required

### Option 2: Lightweight Web App (Current Implementation)
**Works immediately, no build tools needed**

```
Requirements: Python 3.12+ (optional) or just a browser
```

**User experience:**
- Download repository
- Double-click `run.bat` (creates venv, installs deps, starts servers)
- OR open `index.html` directly in browser
- Works on any machine with Python OR just HTML

---

## 🚀 Current Lightweight Launcher

### File Structure
```
VisionMachine/
├── index.html              # Standalone web UI (works immediately)
├── api_server.py           # FastAPI backend (port 8765)
├── launch.py               # Python launcher script
├── run.bat                 # Windows batch launcher
├── requirements.txt        # Minimal Python dependencies
└── src/frontend/           # Svelte frontend (optional enhancement)
```

### Ports Used (Non-Standard)
| Service | Port | Purpose |
|---------|------|---------|
| API Backend | **8765** | FastAPI server |
| Frontend | **9876** | Static files / Vite dev |
| WebView (if used) | N/A | Embeds local server |

**Why non-standard?**
- Avoid conflicts with other services (8080, 3000 common)
- Clear separation from development defaults
- Easy to remember pattern (reverse of 6789)

---

## 🎯 Quick Start Methods

### Method A: Pure Web (No Installation)
```powershell
# Just open in browser
start index.html
```
**Pros:** Instant, works everywhere  
**Cons:** No backend integration yet

### Method B: Full Stack (With Python)
```powershell
# Double-click launcher
run.bat
```
Or manually:
```powershell
# Terminal 1: Backend
python api_server.py

# Terminal 2: Frontend
python -m http.server 9876 --directory .

# Open browser
start http://localhost:9876
```

### Method C: Desktop Wrapper (Future)
```powershell
# Install pywebview
pip install pywebview

# Launch in native window
python launch.py --mode webview
```

---

## 📋 Prerequisites Matrix

| User Type | Needs Build Tools? | Needs Python? | Action |
|-----------|-------------------|---------------|--------|
| **End user (download .exe)** | ❌ No | ❌ No | Just run installer |
| **End user (web version)** | ❌ No | ⚠️ Optional | Open HTML or run.bat |
| **Developer (build from source)** | ✅ Yes | ✅ Yes | Clone + cargo tauri build |
| **Contributor** | ✅ Yes | ✅ Yes | PR workflow |

---

## 🔧 Building for Distribution

### Step 1: Set Up Development Environment
Only needed ONCE on your machine:
```powershell
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Visual C++ Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select: "Desktop development with C++" workload

# Install Node.js
# Download from: https://nodejs.org/

# Install Tauri CLI
npm install -g @tauri-apps/cli
```

### Step 2: Build
```powershell
cd D:\work\horizonsMachine\VisionMachine
cargo tauri build
```

### Step 3: Distribute
Share these files:
- `target/release/bundle/msi/VisionMachine_0.1.0_x64_en-US.msi` (installer)
- `target/release/bundle/windows-portable/VisionMachine.zip` (portable)

---

## 🌐 Web-First Strategy

Since we're starting with a web-based approach:

1. **Immediate testing**: Open `index.html` in any browser
2. **Local development**: Run `run.bat` for full stack
3. **Future desktop**: Wrap with PyWebView when ready
4. **Final product**: Build Tauri app once tools are available

This allows development without requiring heavy toolchains upfront.

---

*Last updated: 2026-08-19 23:15 UTC+3*
