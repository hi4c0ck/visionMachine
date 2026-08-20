# VisionMachine - Quick Start Guide

## 🚀 Running the App

### Option 1: Development Mode (Easiest)

```bash
# Terminal 1 - Frontend dev server
cd D:\work\horizonsMachine\VisionMachine\src\frontend
npm install
npm run dev

# Terminal 2 - Tauri desktop app
cd D:\work\horizonsMachine\VisionMachine\src-tauri
cargo tauri dev
```

Then open http://localhost:5173 in your browser to test the frontend.

### Option 2: Production Build

```bash
# Build frontend first
cd D:\work\horizonsMachine\VisionMachine\src\frontend
npm install
npm run build

# Build Tauri app
cd ..\..\src-tauri
cargo build --release
```

---

## 📁 Project Structure

```
VisionMachine/
├── src-tauri/                    # Rust backend (Tauri + SQLite)
│   ├── src/
│   │   ├── storage/db.rs        # Database layer
│   │   ├── commands/*.rs        # Tauri commands
│   │   ├── models/              # Data models
│   │   └── tests/               # Tests
│   └── Cargo.toml               # Rust dependencies
├── src/frontend/                 # Svelte frontend
│   ├── src/
│   │   ├── App.svelte           # Main component
│   │   └── main.js              # Entry point
│   ├── index.html               # HTML template
│   ├── vite.config.js           # Vite config
│   └── package.json             # npm dependencies
├── tests/                        # Python tests
└── docs/                         # Documentation
```

---

## 🔧 Prerequisites

1. **Rust** - Install from https://www.rust-lang.org/tools/install
2. **Node.js 18+** - Install from https://nodejs.org
3. **Python 3.10+** - For running tests
4. **Windows Build Tools** - For Tauri packaging on Windows

---

## ⚡ Quick Commands

```bash
# Install all dependencies
npm install --prefix src/frontend
cargo install tauri-cli --version "^2"

# Run in development mode
npm run dev --prefix src/frontend
cargo tauri dev --prefix src-tauri

# Build for production
npm run build --prefix src/frontend
cargo tauri build --prefix src-tauri
```

---

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Database | ✅ Complete | SQLite + WAL mode |
| Tauri Commands | ✅ Complete | 14 commands |
| Frontend UI | 🔄 Working | Basic version ready |
| Tests | ✅ Passing | 41 tests |
| Documentation | ✅ Complete | 4,800+ lines |

---

## 🎯 Next Steps

1. Run `npm install` in `src/frontend`
2. Run `npm run dev` to start frontend
3. Open `http://localhost:5173` to see the UI
4. Run `cargo tauri dev` for desktop app with Tauri
