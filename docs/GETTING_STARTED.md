# Getting Started with VisionMachine

Welcome to VisionMachine! This guide will help you set up and run the application.

---

## ⚡ Quick Start (5 Minutes)

### Prerequisites Check
```powershell
# Verify all tools are installed
rustc --version       # Should be 1.77+
cargo --version       # Should be 1.77+
node --version        # Should be 18+
python --version      # Should be 3.12+
uv --version          # Should be present
```

### One-Command Setup
```powershell
# Clone and setup in one go
git clone https://github.com/hi4c0ck/visionMachine.git
cd VisionMachine
.\scripts\setup.ps1
```

This script will:
1. Create Python virtual environment
2. Install all dependencies
3. Set up Rust toolchain if needed
4. Configure environment variables
5. Verify everything works

---

## 🚀 Running the Application

### Development Mode
```powershell
# Terminal 1: Start Python backend
uv run python -m uvicorn src.api:app --reload --port 8000

# Terminal 2: Start Tauri dev server
cargo tauri dev
```

### Production Build
```powershell
# Build for Windows
cargo tauri build

# Output location
src-tauri/target/release/bundle/msi/VisionMachine_0.1.0_x64_en-US.msi
```

---

## 🔑 Configuration

### Environment Variables
Create a `.env` file in the project root:
```env
# Required
VISION_MACHINE_PASSWORD=your-master-password-here

# Optional
PYTHON_PATH=C:\Python312\python.exe
RUST_LOG=info
LOG_LEVEL=INFO
```

### API Keys
Keys are stored encrypted. First-time setup:
1. Open the app
2. Go to Settings ⚙️
3. Click "Configure Providers"
4. Enter your Agnes API key (or other provider)
5. Keys are encrypted and stored locally

---

## 📖 Understanding the Architecture

### The Stack
```
┌─────────────────┐
│   Tauri Front   │ ← HTML/CSS/JS (what you see)
├─────────────────┤
│  Tauri Backend  │ ← Rust (handles commands)
├─────────────────┤
│  Python Layer   │ ← Business logic & AI
├─────────────────┤
│  Providers      │ ← Agnes, OpenAI-compatible
└─────────────────┘
```

### Data Flow
1. User clicks "Generate" in the UI
2. JavaScript calls Tauri command
3. Rust validates inputs and calls Python
4. Python generates video using provider
5. Result flows back through layers
6. UI displays the video

---

## 🛠️ Development Setup

### For Frontend Developers
Focus on `src/frontend/`:
- `index.html` - Main page structure
- `css/app.css` - Styling
- `js/app.js` - Application logic

No build step required! Changes reload automatically.

### For Backend Developers
Focus on `src/`:
- `security/` - Key management
- `providers/` - AI integration
- `services/` - Video generation

Use Python's asyncio for async operations.

### For Rust Developers
Focus on `src-tauri/src/`:
- `main.rs` - Entry point and commands
- Commands exposed to frontend

---

## 🧪 Testing

### Run All Tests
```powershell
# Python tests
uv run pytest tests/ -v

# Rust tests
cargo test

# Combined
.\scripts\test-all.ps1
```

### Test Coverage
```powershell
# Generate coverage report
uv run pytest tests/ --cov=src --cov-report=html

# Open in browser
start htmlcov\index.html
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue: "WebView2 not found"**
```powershell
# Check if WebView2 is installed
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

# If missing, install Microsoft Edge or WebView2 runtime
```

**Issue: Port 8000 already in use**
```powershell
# Find and kill the process
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

**Issue: Python module not found**
```powershell
# Reinstall dependencies
uv pip install -e ".[dev]"
```

**Issue: Tauri commands not working**
```powershell
# Check Rust installation
rustup update
cargo build
```

---

## 📚 Next Steps

After getting started:
1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions
2. Review [API_REFERENCE.md](./API_REFERENCE.md) for technical details
3. Check [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) for best practices
4. Explore [SECURITY.md](./SECURITY.md) for security guidelines

---

## 💬 Need Help?

- **Documentation**: See docs/ folder
- **Issues**: Open GitHub issue
- **Discussions**: Join our community

---

*Ready to create amazing videos? Run `cargo tauri dev` and start generating!*