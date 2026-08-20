# VisionMachine - Complete Project Guide

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [Development Workflow](#development-workflow)
4. [Build Pipeline](#build-pipeline)
5. [Test Pipeline](#test-pipeline)
6. [Git Workflow](#git-workflow)
7. [Troubleshooting](#troubleshooting)
8. [Component Structure](#component-structure)

---

## Project Overview

### What is VisionMachine?
A lightweight Windows desktop application for AI-powered video generation using Tauri v2 + Svelte + Python.

### Technology Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Desktop Shell** | Tauri v2 | Native desktop wrapper |
| **Frontend** | Svelte 4 + TypeScript | UI components |
| **Backend API** | Python FastAPI | Video generation logic |
| **AI Providers** | Agnes/OpenAI-compatible | Video/image generation |
| **Security** | Fernet encryption | API key management |
| **Database** | SQLite | Local metadata storage |

### Architecture
```
┌─────────────────────────────────────────┐
│         Svelte Frontend                 │
│  • WelcomeScreen.svelte                 │
│  • Workspace.svelte                     │
│  • WorkScreen.svelte                    │
│  • Components (sliders, modals, etc.)   │
├─────────────────────────────────────────┤
│         Tauri Backend (Rust)            │
│  • main.rs / lib.rs                     │
│  • IPC bridge to Python                 │
├─────────────────────────────────────────┤
│         Python Backend                  │
│  • api_server.py (FastAPI)              │
│  • src/security/ (key management)       │
│  • src/providers/ (AI providers)        │
│  • src/services/ (video generation)     │
└─────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- **Rust**: v1.97.1+ (via rustup)
- **Node.js**: v24.15.0+
- **Python**: 3.12+ (managed by uv)
- **Visual C++ Build Tools**: Required for Tauri compilation
- **Windows SDK**: For native compilation

### One-Click Launch
```powershell
cd D:\work\horizonsMachine\VisionMachine
.\launch.bat
```

This automatically:
1. Sets up environment paths
2. Installs dependencies if needed
3. Starts Tauri dev server
4. Opens the desktop app

### Manual Development
```powershell
# Terminal 1: Start Tauri dev mode
cargo tauri dev

# Terminal 2: Start Python API (if needed)
uv run python api_server.py
```

---

## Development Workflow

### Project Structure
```
VisionMachine/
├── src-tauri/                    # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs              # Entry point
│   │   └── lib.rs               # Tauri builder
│   ├── tauri.conf.json          # App configuration
│   ├── Cargo.toml               # Rust dependencies
│   └── build.rs                 # Build script
│
├── src/frontend/                 # Svelte frontend
│   ├── App.svelte               # Main app component
│   ├── components/
│   │   ├── WelcomeScreen.svelte # Login screen
│   │   ├── Workspace.svelte     # Main workspace layout
│   │   └── views/
│   │       └── WorkScreen.svelte # Work view
│   └── css/
│       └── design-system.css    # Theme variables
│
├── src/                          # Python backend
│   ├── security/                # Encryption, config
│   ├── providers/               # AI providers
│   ├── services/                # Business logic
│   └── cli.py                   # CLI entry
│
├── tests/                        # Test suite
│   ├── test_core.py
│   ├── test_providers.py
│   ├── test_security.py
│   └── test_imports.py
│
├── scripts/                      # Utility scripts
│   ├── push-to-github.cjs       # GitHub automation
│   ├── create-icon.py           # Icon generation
│   └── setup-git-author.cjs     # Author config
│
├── launch.bat                    # One-click launcher
├── run.bat                       # Alternative launcher
└── build.bat                     # Production build
```

### Starting Development

#### Method 1: Single Command (Recommended)
```powershell
.\launch.bat
```

#### Method 2: Manual Steps
```powershell
# Set up environment
set PATH=C:\Users\user\.cargo\bin;C:\Users\user\AppData\Roaming\npm;C:\Program Files\nodejs;%PATH%

# Navigate to project
cd D:\work\horizonsMachine\VisionMachine

# Install frontend dependencies (first time only)
npm install --prefix src/frontend

# Start Tauri dev mode
cargo tauri dev
```

---

## Build Pipeline

### Development Build
```powershell
# Full development mode with hot reload
cargo tauri dev
```

**What it does:**
1. Compiles Rust backend (incremental)
2. Starts Vite dev server for frontend (port 5173)
3. Watches for changes and auto-reloads
4. Opens Tauri window with WebView

**Expected Output:**
```
Running DevCommand (`cargo run --no-default-features`)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in Xs
     Running `target\debug\visionmachine.exe`
```

### Production Build
```powershell
# Optimized build for distribution
cargo tauri build
```

**Output Locations:**
```
src-tauri/target/release/bundle/
├── msi/
│   └── VisionMachine_0.1.0_x64_en-US.msi    # Installer (~15MB)
└── windows-portable/
    └── VisionMachine.zip                     # Portable (~12MB)
```

**Build Time:**
- First build: 10-20 minutes (downloads dependencies)
- Subsequent builds: 2-5 minutes (incremental)

---

## Test Pipeline

### Run All Tests
```powershell
# Python tests
uv run pytest tests/ -v

# With coverage
uv run pytest tests/ --cov=src --cov-report=html
```

### Test Breakdown
| Test File | Coverage | Status |
|-----------|----------|--------|
| `test_core.py` | Core functions | ✅ Passing |
| `test_providers.py` | Provider abstraction | ✅ Passing |
| `test_security.py` | Encryption, key storage | ✅ Passing |
| `test_imports.py` | Module imports | ✅ Passing |

**Total: 35 tests passing**

### Test Commands Reference
```powershell
# Quick test run
uv run pytest -q

# Verbose output
uv run pytest -v

# Specific test file
uv run pytest tests/test_security.py -v

# With coverage report
uv run pytest --cov=src --cov-report=term-missing

# Watch mode (auto-run on changes)
uv run pytest-watch
```

---

## Git Workflow

### Branch Strategy
```
master      ← Production releases (protected)
    ↑
production  ← Staging/testing (protected)
    ↑
develop     ← Main development (default branch)
    ↑
feature/*   ← Feature branches
```

### Branch Protection Rules
| Branch | Protected | Required Reviews | Status Checks |
|--------|-----------|------------------|---------------|
| `master` | ✅ | 2 | ✅ CI pass |
| `production` | ✅ | 1 | ✅ CI pass |
| `develop` | ❌ | 0 | ✅ None |

### Commit Convention
```bash
# Format: type: description

# Types:
feat:     New feature
fix:      Bug fix
docs:     Documentation
style:    Code style (formatting, semicolons, etc.)
refactor: Code refactoring
test:     Test additions/changes
chore:    Build process, dependencies
```

### Git Configuration
```bash
# User info (configured for hi4c0ck)
git config user.name "hi4c0ck"
git config user.email "bogdawkin@yandex.ru"

# Verify
git config --list --local
```

### Common Git Operations
```powershell
# Check status
git status

# View recent commits
git log --oneline -10

# Create feature branch
git checkout -b feature/name

# Push to remote
git push origin develop

# Pull latest changes
git pull origin develop
```

---

## Troubleshooting

### Issue: "link.exe not found"
**Cause:** Visual C++ Build Tools not installed or not in PATH

**Solution:**
```powershell
# Verify installation
where link.exe

# If missing, install from:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select: "Desktop development with C++" workload
```

### Issue: "tauri command not found"
**Cause:** Tauri CLI not installed or not in PATH

**Solution:**
```powershell
# Install globally
npm install -g @tauri-apps/cli

# Verify
tauri --version
```

### Issue: "Python not found"
**Cause:** Python not in PATH

**Solution:**
```powershell
# Add to PATH
[Environment]::SetEnvironmentVariable(
    "PATH",
    $env:PATH + ";C:\Users\user\AppData\Local\Programs\Python\Python312",
    "User"
)

# Or use uv (recommended)
uv python install 3.12
```

### Issue: "Svelte compilation error"
**Common causes:**
1. Multiple `<script>` tags → Merge into one
2. Invalid Svelte directives → Check syntax
3. Missing imports → Verify paths

**Fix:**
```bash
# Check for multiple script tags
Select-String "<script" src/frontend/components/*.svelte | Group-Object Path

# Fix import paths
# Use relative paths: './Component.svelte'
```

### Issue: "GitHub authentication failed"
**Cause:** Expired or invalid token

**Solution:**
```powershell
# Regenerate token via GitHub App
node scripts/push-to-github.cjs

# Update remote URL
git remote set-url origin https://x-access-token:TOKEN@github.com/OWNER/REPO.git
```

---

## Component Structure

### WelcomeScreen.svelte
**Purpose:** Initial login screen

**Features:**
- Name input with validation
- Theme selector (JetBrains/Steel light/dark)
- Language selector (EN/RU/DE/JA)
- Footer with Build Info, About, Update check

**Props:**
```svelte
<WelcomeScreen on:login={handleLogin} />
```

**State:**
- `userName`: Current user name
- `selectedTheme`: Active theme ID
- `selectedLang`: Active language code

---

### Workspace.svelte
**Purpose:** Main application layout

**Features:**
- 5 transformable containers
- Layout modes: Landscape/Portrait/Single
- Resizable panels
- Modal system

**Containers:**
1. **Frame** (top): Header with controls
2. **Projects** (left): Project list sidebar
3. **Composer** (center): Main workspace
4. **Profile** (right): User settings
5. **Tools** (far right): Tool palette

**Props:**
```svelte
<Workspace 
  userName={userName} 
  on:logout={handleLogout} 
/>
```

**Layout Modes:**
| Mode | Projects | Profile | Tools | Composer |
|------|----------|---------|-------|----------|
| Landscape | ✅ Visible | Hidden | ✅ Visible | ✅ Main |
| Portrait | ✅ Collapsed | ✅ Visible | ✅ Visible | ✅ Center |
| Single | Hidden | Hidden | Hidden | ✅ Fullscreen |

---

### WorkScreen.svelte
**Purpose:** Individual work view within composer

**Features:**
- State machine for screens (idle/generating/loading/error)
- Modal dialogs for actions
- Timeline visualization
- Generation controls

**Screens:**
- `idle`: Empty state with action buttons
- `generating`: Video generation in progress
- `loading`: Post-processing
- `error`: Error display with recovery

**Modals:**
- New Project form
- Generate Video form
- Settings panel
- Theme selector
- Delete confirmation

---

## Useful Commands Cheat Sheet

### Development
```powershell
# Start app
.\launch.bat

# Run tests
uv run pytest tests/ -v

# Check health
python -c "import torch; print('PyTorch:', torch.__version__)"
```

### Git Operations
```powershell
# View status
git status

# Stage changes
git add -A

# Commit
git commit -m "feat: add new feature"

# Push
git push origin develop
```

### Build Commands
```powershell
# Check compilation
cargo check --manifest-path src-tauri/Cargo.toml

# Build debug
cargo build --manifest-path src-tauri/Cargo.toml

# Build release
cargo build --release --manifest-path src-tauri/Cargo.toml
```

### Python Environment
```powershell
# Activate virtual environment
uv venv --python 3.12
.venv\Scripts\activate

# Install dependencies
uv pip install -e ".[dev]"

# Run Python directly
uv run python script.py
```

---

## Security Notes

### API Key Management
- Keys stored in encrypted SQLite database
- Master password via environment variable
- Never commit `.env` files
- Rotate keys immediately if compromised

### Git Security
- Sensitive files added to `.gitignore`
- History cleaned of tokens/secrets
- Use signed commits for production

---

## Resources

### Documentation
- [Architecture](./ARCHITECTURE.md)
- [Security](./SECURITY.md)
- [API Reference](./API_REFERENCE.md)
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md)
- [Branching Strategy](./BRANCHING_STRATEGY.md)

### External Links
- [Tauri Documentation](https://tauri.app/)
- [Svelte Documentation](https://svelte.dev/docs)
- [Rust Documentation](https://doc.rust-lang.org/book/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

*Last Updated: 2026-08-20*
*Author: hi4c0ck <bogdawkin@yandex.ru>*
