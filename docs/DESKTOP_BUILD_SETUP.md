# VisionMachine - Desktop Build Setup Guide

## 🎯 Goal
Build native desktop application with Tauri v2 for optimal performance.

## ✅ Prerequisites Checklist

### 1. Visual C++ Build Tools (REQUIRED)
**Purpose:** Compile Rust native code for Windows

**Download:** https://visualstudio.microsoft.com/visual-cpp-build-tools/

**Installation Steps:**
1. Run installer
2. Select "Desktop development with C++" workload
3. Ensure these components are checked:
   - ✅ MSVC v143 - VS 2022 C++ x64/x86 build tools
   - ✅ Windows 10 SDK (or Windows 11 SDK)
   - ✅ C++ ATL for latest build tools
   - ✅ C++ MFC for latest build tools
4. Click Install (~5GB download)

**Verify Installation:**
```powershell
# Should show path to link.exe
where.exe link
# Expected: C:\Program Files\Microsoft Visual Studio\...\VC\Tools\MSVC\...\bin\Hostx64\x64\link.exe
```

---

### 2. Rust Toolchain (Already Installed ✓)
```powershell
rustc --version  # Should be 1.77+
cargo --version  # Should be 1.77+
```

---

### 3. Node.js (Already Installed ✓)
```powershell
node --version   # Should be 18+
npm --version    # Should be 9+
```

---

### 4. Tauri CLI (Already Installed ✓)
```powershell
tauri --version  # Should be 2.x
```

---

## 🔧 Build Commands

### Development Mode
```powershell
cd D:\work\horizonsMachine\VisionMachine
cargo tauri dev
```

### Production Build
```powershell
cargo tauri build
```

### Output Locations
- **MSI Installer:** `src-tauri/target/release/bundle/msi/VisionMachine_0.1.0_x64_en-US.msi`
- **Portable ZIP:** `src-tauri/target/release/bundle/windows-portable/VisionMachine.zip`
- **Native EXE:** `src-tauri/target/release/bundle/windows/portable/VisionMachine.exe`

---

## ⚡ First Build Process

### Step 1: Install Visual C++ Build Tools
Download and install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

### Step 2: Verify Installation
```powershell
where.exe link
where.exe cl
```

### Step 3: Build the App
```powershell
cd D:\work\horizonsMachine\VisionMachine
cargo tauri build
```

**First build time:** ~10-20 minutes (compiles all dependencies)  
**Subsequent builds:** ~2-5 minutes (incremental compilation)

---

## 📦 Distribution

After successful build, you can distribute:

| File Type | Size | Use Case |
|-----------|------|----------|
| `.msi` | ~15MB | Standard installer with Start Menu shortcuts |
| `.exe` (portable) | ~12MB | No installation needed, run anywhere |
| `.zip` | ~12MB | Complete portable package |

**User requirements to RUN (not build):**
- Windows 10/11 (WebView2 pre-installed)
- No Visual C++ Build Tools needed
- Just download and run!

---

## 🐛 Troubleshooting

### Error: "link.exe not found"
**Solution:** Install Visual C++ Build Tools with "Desktop development with C++" workload.

### Error: "cargo: command not found"
**Solution:** Restart terminal or add to PATH:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

### Error: WebView2 not found
**Solution:** Usually pre-installed on Windows 10/11. If missing:
```powershell
# Download WebView2 runtime
https://go.microsoft.com/fwlink/p/?LinkID=2093589
```

---

*Ready to build? Install Visual C++ Build Tools first, then run `cargo tauri build*
