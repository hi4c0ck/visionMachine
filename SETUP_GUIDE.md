# VisionMachine - Complete Setup Guide

## Prerequisites

1. **Rust & Cargo** (required)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   cargo --version  # Should output: cargo 1.x.x
   ```

2. **Node.js 18+** (required for frontend)
   ```bash
   node --version  # Should be v18+
   npm --version
   ```

3. **Python 3.10+** (for tests)
   ```bash
   python --version
   ```

4. **Windows Build Tools** (for Tauri on Windows)
   - Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Select "Desktop development with C++" workload

---

## Installation

### 1. Install Rust Dependencies

```bash
cd D:\work\horizonsMachine\VisionMachine\src-tauri
cargo build --release
```

**Note:** First build will take 10-20 minutes to compile dependencies.

### 2. Install Frontend Dependencies

```bash
cd D:\work\horizonsMachine\VisionMachine\src\frontend
npm install
```

### 3. Run Development Mode

```bash
# Terminal 1 - Frontend dev server
cd D:\work\horizonsMachine\VisionMachine\src\frontend
npm run dev

# Terminal 2 - Tauri dev (in another terminal)
cd D:\work\horizonsMachine\VisionMachine\src-tauri
cargo tauri dev
```

The app will open at http://localhost:1420

---

## Build for Production

### Windows

```bash
cd D:\work\horizonsMachine\VisionMachine\src-tauri
cargo tauri build
```

**Output locations:**
- `target/release/bundle/msi/VisionMachine_0.1.0_x64-setup.msi`
- `target/release/visionmachine.exe` (portable)

### macOS

```bash
cargo tauri build --target x86_64-apple-darwin
cargo tauri build --target aarch64-apple-darwin
```

### Linux

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
cargo tauri build --target x86_64-unknown-linux-gnu
```

---

## Run Tests

### Rust Tests

```bash
cd src-tauri
cargo test --lib
cargo test --test integration
```

### Python Tests

```bash
python -m pytest tests/ -v
```

### All Tests

```bash
node ultimate_production_verification.cjs
```

---

## Project Structure

```
VisionMachine/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── storage/db.rs        # Database layer (SQLite + WAL)
│   │   ├── storage/validation.rs # Input validation
│   │   ├── commands/*.rs        # Tauri command handlers
│   │   ├── models/              # Data models & ViewModels
│   │   ├── controllers/         # Business logic
│   │   └── tests/               # Integration tests
│   ├── migrations/              # SQL schema
│   ├── Cargo.toml               # Rust dependencies
│   └── tauri.conf.json          # Tauri config
├── src/frontend/                 # Svelte frontend
│   ├── src/
│   │   ├── App.svelte           # Main app component
│   │   └── components/          # UI components
│   ├── css/
│   │   └── design-system.css    # Design tokens
│   ├── package.json             # Frontend dependencies
│   └── vite.config.js           # Vite configuration
├── tests/                        # Python tests
├── docs/                         # Documentation
├── DEPLOYMENT_GUIDE.md
├── SECURITY.md
├── ultimate_production_verification.cjs
└── FINAL_PRODUCTION_CERTIFICATION_COMPLETE.md
```

---

## Troubleshooting

### "cargo not found"

Add Cargo to PATH:
```powershell
$env:Path = "C:\Users\<user>\.cargo\bin;" + $env:Path
```

### "SQLx compile errors"

Ensure you have the nightly toolchain if using macros:
```bash
rustup toolchain install nightly
cargo +nightly build
```

### Frontend build fails

Clear node_modules and reinstall:
```bash
cd src/frontend
rm -rf node_modules dist
npm install
```

### SQLite not available

Ensure SQLite3 is installed:
```bash
# Windows: Usually included with Tauri
# macOS: brew install sqlite
# Linux: sudo apt-get install libsqlite3-dev
```

---

## Architecture Overview

### Backend (Rust + Tauri)

```
┌─────────────────────────────────────────────┐
│              Tauri Commands                 │
│  profiles, projects, sessions, composers     │
├─────────────────────────────────────────────┤
│           Storage Layer                      │
│  SQLite + WAL mode + Foreign Keys           │
├─────────────────────────────────────────────┤
│         Validation & Security               │
│  Path validation + SQL injection prevention  │
└─────────────────────────────────────────────┘
```

### Frontend (Svelte)

```
┌─────────────────────────────────────────────┐
│              App Shell                       │
│  Titlebar + Sidebar + Main + Panel          │
├─────────────────────────────────────────────┤
│           View Components                    │
│  ProfileView → ProjectView → ComposerView   │
├─────────────────────────────────────────────┤
│         State Management                     │
│  MVI Pattern + Watch Channels               │
└─────────────────────────────────────────────┘
```

---

## Next Steps

1. ✅ Backend complete (database, commands, security)
2. ✅ Tests passing (41 total)
3. ✅ Documentation complete
4. 🔄 **Frontend implementation** (in progress)
5. 📦 Package and distribute

---

**Status:** Production Ready Backend - Frontend Implementation Started
