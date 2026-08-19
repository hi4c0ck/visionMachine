# VisionMachine - Quick Start Guide

## 🚀 First Time Setup

### Prerequisites
```powershell
# Check if installed
rustc --version       # Should be 1.77+
cargo --version       # Should be 1.77+
node --version        # Should be 18+
python --version      # Should be 3.12+
uv --version          # Should exist
```

### Clone & Install
```powershell
git clone https://github.com/hi4c0ck/visionMachine.git
cd visionMachine

# Python dependencies
uv venv --python 3.12
uv pip install -e ".[dev]"

# Tauri CLI (if not installed)
npm install -g @tauri-apps/cli
```

---

## 🎨 Welcome Page Features

### What You'll See on First Launch
1. **Header**
   - Logo: "🎬 VisionMachine"
   - Language switcher (EN/RU/DE/JA)
   - Theme selector (4 themes)

2. **Main Content**
   - New users: Name input → "Get Started"
   - Returning users: "Hello, {name}!" → "Continue"

3. **Footer**
   - Build Info button
   - About button
   - "Check for updates" checkbox
   - Version badge (v0.1.0)

---

## 🎨 Theme System

### Four Themes Available

| Theme | Light | Dark | Vibe |
|-------|-------|------|------|
| **JetBrains Gray** | Soft white-gray | Dark charcoal | IDE-like, professional |
| **Steel Machinery** | Steel blue-gray | Deep navy | Industrial, modern |

**How to switch:**
1. Click "Theme" button in header
2. Select from dropdown with color previews
3. Instant update (no restart needed)
4. Automatically saved to localStorage

---

## 🛠️ Development Workflow

### Daily Development
```powershell
# Terminal 1: Start Tauri dev server
cargo tauri dev

# Terminal 2: Run Python backend
uv run python -m uvicorn src.api:app --reload
```

### Testing
```powershell
# Run all tests
uv run pytest tests/ -v

# Run with coverage
uv run pytest tests/ --cov=src --cov-report=html
```

### Building
```powershell
# Development build (faster)
cargo tauri dev

# Production build (optimized)
cargo tauri build

# Output:
# - MSI installer: target/release/bundle/msi/
# - Portable ZIP: target/release/bundle/windows-portable/
```

---

## 📱 User Journey

### First-Time User
```
1. Launch app
2. Enter your name
3. Choose theme (optional)
4. Click "Get Started"
5. Welcome to main interface
```

### Returning User
```
1. Launch app
2. Auto-login with saved name
3. Theme/language preserved
4. Ready to generate videos
```

### Settings Changes
```
- Change theme: Header > Theme dropdown
- Change language: Header > Language dropdown
- Check for updates: Footer checkbox
```

---

## 🔧 Architecture Overview

```
┌─────────────────────────────────────────┐
│            Svelte Frontend              │
│  • App.svelte (Welcome + Main)          │
│  • Components (Sidebar, Status, etc.)   │
│  • Design system (CSS variables)        │
├─────────────────────────────────────────┤
│           Tauri Backend (Rust)          │
│  • main.rs (Commands)                   │
│  • IPC bridge to Python                 │
├─────────────────────────────────────────┤
│           Python Backend                │
│  • src/api.py (FastAPI)                 │
│  • src/security/ (Key management)       │
│  • src/providers/ (AI integrations)     │
│  • src/services/ (Video generation)     │
└─────────────────────────────────────────┘
```

---

## ⚡ Quick Commands Cheat Sheet

```powershell
# Development
cargo tauri dev                    # Start desktop app
uv run pytest tests/ -v           # Run tests
uv run python scripts/check-history.py  # Security audit

# Build
cargo tauri build                 # Production build
cargo tauri icon path/to/logo.png # Generate icons

# Git
git checkout -b feature/name      # New feature
git push origin develop           # Sync to remote
```

---

## 🎯 Next Steps

After setting up, you can:

1. **Test the Welcome Page**
   - Run `cargo tauri dev`
   - Enter your name
   - Try switching themes
   - Check language switching

2. **Add Video Generation**
   - Implement Agnes API call
   - Connect to UI buttons
   - Add video preview player

3. **Build for Distribution**
   - Run `cargo tauri build`
   - Test MSI installer
   - Prepare for release

---

*Ready to build amazing videos? Start with `cargo tauri dev`!* 🚀
