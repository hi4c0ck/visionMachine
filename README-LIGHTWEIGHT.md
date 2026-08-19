# VisionMachine - Lightweight Launcher

## 🚀 Quick Start (Zero Installation)

### Option 1: Double-Click to Run
```
run.bat
```
This will:
1. Create Python virtual environment (if needed)
2. Install dependencies
3. Start API server on port 8000
4. Start web server on port 8080
5. Open browser automatically

### Option 2: Open HTML Directly
```
double-click index.html
```
Works immediately - no servers needed for basic UI testing.

---

## 📋 Requirements

**Only Python 3.12+ is required.**

That's it! No Rust, no Node.js build tools, no Visual Studio.

```powershell
# Check if Python is installed
python --version

# If not installed, download from:
# https://www.python.org/downloads/
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Browser (index.html)            │
│  • Theme switching                      │
│  • User authentication                  │
│  • Video generation UI                  │
└─────────────────────────────────────────┘
              ↓ HTTP API
┌─────────────────────────────────────────┐
│     Python FastAPI Server               │
│  • Port: 8000                           │
│  • Handles video generation requests    │
│  • Manages user sessions                │
└─────────────────────────────────────────┘
```

**Why this works everywhere:**
- ✅ No native compilation required
- ✅ Pure Python + HTML (runs anywhere)
- ✅ Single `pip install` for all dependencies
- ✅ Can be wrapped in WebView later if needed

---

## 🔧 Manual Start

```powershell
# Terminal 1: Start backend
cd D:\work\horizonsMachine\VisionMachine
python api_server.py

# Terminal 2: Start frontend (or just open index.html)
python -m http.server 8080 --directory .
```

Then open: http://localhost:8080

---

## 📦 Future: Convert to Desktop App

When ready for native desktop:
```powershell
# Install PyWebView (optional)
pip install pywebview

# Run with native window
python launch.py --mode webview
```

Or package with PyInstaller:
```powershell
pip install pyinstaller
pyinstaller --onefile --windowed launch.py
```

---

## 🎯 Current Status

| Feature | Status |
|---------|--------|
| Welcome page | ✅ Working |
| Theme switching | ✅ Working |
| User authentication | ✅ LocalStorage |
| API server | ✅ Running |
| Video generation | ⏳ Mock (replace with real AI) |
| Native desktop | 📦 Optional (PyWebView) |

---

*Simple, portable, works on any machine with Python.*
