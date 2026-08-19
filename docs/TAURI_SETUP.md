# VisionMachine - Tauri v2 Setup Guide

## Why Tauri v2?

| Factor | Decision |
|--------|----------|
| **Cross-platform** | Windows first, macOS/Linux later |
| **Bundle size** | ~5-10MB vs Electron's 150MB+ |
| **Memory usage** | ~50MB vs Electron's 300MB+ |
| **WebView** | System WebView2 (already on Windows 10+) |
| **Ecosystem** | Huge npm/JS library support |
| **Learning curve** | React/Vue/Svelte + Rust basics |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (HTML/JS)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Video      │  │  Controls   │  │  Settings   │    │
│  │  Preview    │  │  (Sliders)  │  │  Panel      │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────┤
│                    Tauri Backend (Rust)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Commands   │  │  Window     │  │  File I/O   │    │
│  │  (API calls)│  │  Manager    │  │  Handler    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
├─────────────────────────────────────────────────────────┤
│                    Python Backend                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Provider   │  │  Video      │  │  Security   │    │
│  │  Layer      │  │  Generator  │  │  Module     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework**: Vanilla JS (no build step needed) or React if preferred
- **Styling**: CSS (Tailwind optional)
- **UI Components**: Custom (sliders, overlays, video player)

### Backend
- **Runtime**: Tauri v2 (Rust)
- **Python Integration**: Subprocess IPC
- **Package**: pyproject.toml (existing)

### Desktop Distribution
- **Format**: Installer (.exe) or portable zip
- **Size**: ~10-15MB compressed

---

## Project Structure

```
VisionMachine/
├── src/                      # Python backend (unchanged)
│   ├── security/
│   ├── providers/
│   ├── services/
│   └── core.py
├── src-tauri/               # Tauri project
│   ├── src/
│   │   └── main.rs         # Entry point
│   ├── capabilities/
│   │   └── default.json     # Permissions
│   ├── gen/                 # Generated (auto)
│   ├── icons/               # App icons
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # Tauri configuration
│   └── build.rs             # Build script
├── src/frontend/            # Web interface
│   ├── index.html
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   └── app.js
│   └── components/
│       ├── VideoPlayer.vue
│       └── Controls.vue
├── pyproject.toml          # Python dependencies
├── package.json            # Frontend dependencies (optional)
└── README.md
```

---

## Installation Steps

### Prerequisites
```powershell
# 1. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Install Node.js (for frontend tooling)
# Download from https://nodejs.org/

# 3. Install Tauri CLI
npm install -g @tauri-apps/cli
```

### Initialize Tauri Project
```powershell
cd D:\work\horizonsMachine\VisionMachine
cargo tauri init
```

### Configure tauri.conf.json
```json
{
  "build": {
    "frontendDist": "../src/frontend",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [
      {
        "title": "VisionMachine",
        "width": 1280,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

---

## Development Workflow

### Start Development Server
```powershell
# Terminal 1: Python backend
uv run python -m uvicorn src.api:app --reload

# Terminal 2: Tauri development
cargo tauri dev
```

### Build for Production
```powershell
# Build everything
cargo tauri build

# Output location: src-tauri/target/release/bundle/
```

---

## Python ↔ Rust Communication

### Option 1: REST API (Recommended for simplicity)
```python
# src/api.py
from fastapi import FastAPI
import asyncio

app = FastAPI()

@app.post("/generate")
async def generate_video(prompt: str, duration: int):
    # Call your Python service
    result = await video_service.generate(prompt, duration)
    return {"status": "success", "video_url": result.url}
```

```rust
// src/main.rs
use tauri::Manager;

#[tauri::command]
async fn generate_video(app: tauri::AppHandle, prompt: String, duration: u32) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:8000/generate")
        .json(&serde_json::json!({
            "prompt": prompt,
            "duration": duration
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let result: GenerateResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(result.video_url)
}
```

### Option 2: Direct Subprocess (No server needed)
```rust
#[tauri::command]
async fn generate_video_direct(prompt: String, duration: u32) -> Result<String, String> {
    let output = std::process::Command::new("uv")
        .args(["run", "python", "scripts/generate.py"])
        .arg(&prompt)
        .arg(&duration.to_string())
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    // Parse output...
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

---

## Recommended Approach

Given your requirements (lightweight, easy support, Python ML stack):

### Phase 1: MVP with HTTP API
- Run Python FastAPI server in background
- Tauri calls REST endpoints
- Simple, debuggable, works immediately

### Phase 2: Optimize with PyO3 (optional)
- Embed Python directly in Rust
- Zero IPC overhead
- More complex setup

### Phase 3: Native Features
- Custom window management
- GPU-accelerated preview
- System tray integration

---

## Testing the Setup

```powershell
# 1. Test Python backend
cd D:\work\horizonsMachine\VisionMachine
uv run python -m pytest tests/

# 2. Start Tauri dev mode
cargo tauri dev

# 3. Open browser DevTools (F12)
# 4. Check Console and Network tabs
```

---

*Setup documentation for VisionMachine Tauri v2 integration*