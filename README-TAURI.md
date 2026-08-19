# VisionMachine Desktop App (Tauri v2)

## 🚀 Quick Start

### Prerequisites
```powershell
# 1. Install Rust (required for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Install Node.js (for frontend tooling)
# Download from https://nodejs.org/

# 3. Install Tauri CLI globally
npm install -g @tauri-apps/cli
```

### Running in Development Mode
```powershell
cd D:\work\horizonsMachine\VisionMachine

# Set up Python environment
uv venv --python 3.12
uv pip install -e ".[dev]"

# Start development server
cargo tauri dev
```

This will:
1. Start the Python backend on port 8000
2. Launch the Tauri window with the web interface
3. Enable hot-reload for both frontend and backend

---

## 📁 Project Structure

```
VisionMachine/
├── src-tauri/                 # Tauri Rust backend
│   ├── src/main.rs           # Entry point + commands
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # App configuration
│   └── capabilities/         # Permission configs
│
├── src/frontend/              # Web interface
│   ├── index.html            # Main UI
│   ├── css/app.css           # Styling
│   └── js/app.js             # Application logic
│
├── src/                       # Python backend
│   ├── security/             # Encrypted key storage
│   ├── providers/            # AI provider abstraction
│   ├── services/             # Video generation service
│   └── core.py               # Core utilities
│
├── scripts/                   # CLI scripts (not committed)
│   └── generate_video.py     # Python video generation
│
├── tests/                     # Test suite
├── docs/                      # Documentation
└── pyproject.toml             # Python dependencies
```

---

## 🔧 Configuration

### Environment Variables
```powershell
# Required: Master password for key encryption
$env:VISION_MACHINE_PASSWORD = "your-secure-password-here"

# Optional: Custom Python path
$env:PYTHON_PATH = "C:\Python312\python.exe"
```

### Provider Configuration
Edit `config/.env.example` to add your API keys:
```bash
# Agnes (primary, hardcoded endpoint)
AGNES_API_KEY=your-key-here

# OpenAI-compatible (optional)
OPENAI_ENDPOINT=https://api.openai.com/v1
OPENAI_API_KEY=your-key-here
```

Keys are stored encrypted in `%USERPROFILE%\.config\visionmachine\keys.db`

---

## 🎨 UI Features

The desktop app includes:

### Left Panel: Generation Controls
- **Prompt input** - Describe your video
- **Duration slider** - 3 to 60 seconds
- **Shot count slider** - 4 to 12 shots
- **Style selector** - Cinematic, Anime, Realistic, Artistic
- **Resolution selector** - 480p, 720p, 1080p

### Center: Video Preview
- **Video player** with controls
- **Overlay buttons**: Play/Pause, Download, Retry
- **Timeline** showing shot sequence
- **Progress bar** during generation

### Right Panel: History
- **Generation history** (last 10 videos)
- **Quick replay** by clicking history items
- **Clear history** button

---

## 🔐 Security Architecture

### API Key Storage
- Keys encrypted with Fernet (AES-128-CBC + HMAC)
- Master password derived via PBKDF2 (100k iterations)
- Keys loaded into memory only during active sessions
- No keys logged or cached to disk in plaintext

### Provider Isolation
```rust
// Rust backend
#[tauri::command]
async fn generate_video(
    prompt: String,
    duration: u32,
    shots: u32,
    style: String,
    resolution: String,
) -> Result<GenerationResult, String> {
    // Validates inputs
    // Calls Python backend via subprocess
    // Returns JSON result
}
```

---

## 🏗️ Build for Distribution

### Windows Installer
```powershell
cargo tauri build
```

Output location:
```
src-tauri/target/release/bundle/
├── msi/VisionMachine_0.1.0_x64_en-US.msi  # Installer
└── windows-portable/VisionMachine.zip      # Portable version
```

### Package Size
- **Portable zip**: ~50MB (includes WebView2 runtime if not present)
- **MSI installer**: ~10MB (assumes WebView2 is installed)

---

## 🔄 Python ↔ Rust Communication

### Method 1: Subprocess (Current)
```rust
Command::new("uv")
    .arg("run")
    .arg("python")
    .arg("scripts/generate_video.py")
    .arg("--prompt")
    .arg(&prompt)
    .output()
```

### Method 2: HTTP API (Future)
Start Python FastAPI server:
```powershell
uv run uvicorn src.api:app --port 8000
```

Rust calls REST endpoints:
```rust
let response = reqwest::Client::new()
    .post("http://127.0.0.1:8000/generate")
    .json(&payload)
    .send()
    .await?;
```

---

## 🧪 Testing

### Run Python Tests
```powershell
uv run pytest tests/ -v
```

### Run Frontend Tests
```powershell
# Using Vitest (configured in vitest.config.js)
npx vitest run
```

### Integration Test
```powershell
cargo test --all
```

---

## 📝 Development Workflow

1. **Frontend changes**: Edit files in `src/frontend/`, auto-reloads
2. **Backend changes**: Edit `src-tauri/src/main.rs`, restart app
3. **Python changes**: Edit files in `src/`, subprocess picks up changes
4. **Configuration changes**: Update `tauri.conf.json`, rebuild

---

## 🚨 Troubleshooting

### "WebView2 not found"
Install Microsoft Edge or WebView2 runtime:
```powershell
# Check if installed
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
```

### Python path issues
```powershell
# Ensure Python is in PATH
where.exe python
```

### Port already in use
```powershell
# Kill existing process on port 8000
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

---

## 📚 Additional Resources

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Python IPC Patterns](https://tauri.app/v1/guides/features/webview/#using-ipc)
- [Rust FFI](https://doc.rust-lang.org/book/ch19-FFI.html)
- [Security Best Practices](./docs/SECURITY.md)

---

*Ready to build your first video?*

```powershell
cd D:\work\horizonsMachine\VisionMachine
cargo tauri dev
```