# VisionMachine Desktop Build - Installation Guide

## 🎯 Objective
Build native Windows desktop application with optimal performance.

## ✅ Prerequisites Status

| Tool | Required | Current Status | Action Needed |
|------|----------|----------------|---------------|
| Rust/Cargo | ✅ Yes | ✅ Installed (v1.97.1) | None |
| Node.js/npm | ✅ Yes | ✅ Installed (v24.15.0) | None |
| Tauri CLI | ✅ Yes | ⚠️ Installed (needs PATH) | Fix PATH |
| **Visual C++ Build Tools** | ✅ **Critical** | ❌ **NOT INSTALLED** | **INSTALL NOW** |

---

## 🔧 Step 1: Install Visual C++ Build Tools (REQUIRED)

### Download Link
**https://visualstudio.microsoft.com/visual-cpp-build-tools/**

### Installation Steps
1. Download `BuildTools_for_Visual_Studio_2022.exe`
2. Run the installer
3. **CRITICAL:** Select these workloads:
   - ✅ **"Desktop development with C++"** (main workload)
4. In右侧的 "Installation details", ensure these are checked:
   - ✅ **MSVC v143 - VS 2022 C++ x64/x86 build tools**
   - ✅ **Windows 10 SDK (10.0.22621.0)** or newer
   - ✅ **C++ ATL for latest build tools**
   - ✅ **C++ MFC for latest build tools**
5. Click **Install**
6. Wait for download (~5GB) and installation (~10-15 minutes)

### Alternative: Direct Download
If the above link doesn't work, use:
```
https://aka.ms/vs/17/release/vs_BuildTools.exe
```

---

## 🔧 Step 2: Verify Installation

After installation completes:

```powershell
# Check if link.exe is available
where.exe link

# Should output something like:
# C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.42.34433\bin\Hostx64\x64\link.exe
```

If `where.exe link` returns nothing, restart your terminal and try again.

---

## 🔧 Step 3: Fix Tauri CLI PATH (Optional but Recommended)

The Tauri CLI is installed but not in your PowerShell PATH.

### Option A: Add to PATH Permanently
```powershell
# Add npm global path to user PATH
[Environment]::SetEnvironmentVariable(
    "PATH", 
    $env:PATH + ";C:\Users\user\AppData\Roaming\npm", 
    "User"
)

# Restart terminal and verify
tauri --version
```

### Option B: Use Full Path (Temporary)
```powershell
& "C:\Users\user\AppData\Roaming\npm\tauri.cmd" --version
```

---

## 🔧 Step 4: Build the Application

Once Visual C++ Build Tools are installed:

```powershell
cd D:\work\horizonsMachine\VisionMachine

# Clean build (first time takes longer)
cargo clean

# Build for production
cargo tauri build
```

### Expected Output Locations
```
src-tauri/target/release/bundle/
├── msi/
│   └── VisionMachine_0.1.0_x64_en-US.msi    # Installer (~15MB)
└── windows-portable/
    └── VisionMachine.zip                     # Portable (~12MB)
    
src-tauri/target/release/
└── vision-machine.exe                        # Native executable (~10MB)
```

---

## ⏱️ Timeline Estimates

| Task | Time | Notes |
|------|------|-------|
| Download Build Tools | 5-10 min | ~5GB download |
| Install Build Tools | 10-15 min | One-time setup |
| First cargo build | 15-30 min | Compiles all dependencies |
| Subsequent builds | 2-5 min | Incremental compilation |

---

## 🎉 Success Criteria

After building successfully:
- ✅ No compilation errors
- ✅ `.msi` file generated
- ✅ `.exe` file works when double-clicked
- ✅ App opens in native window (not browser)

---

## 📝 What Happens After Build

**For You (Developer):**
- Can distribute `.msi` or `.exe` to users
- No need for users to install build tools
- Just WebView2 Runtime (pre-installed on Windows 10/11)

**For Users:**
- Download `.msi` → Double-click → Install
- OR Download `.zip` → Extract → Run `.exe`
- No development tools required!

---

**Ready? Start with Step 1: Install Visual C++ Build Tools.**
