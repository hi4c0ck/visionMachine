# VisionMachine Development Workflow

## 🎯 Project Overview

VisionMachine is a lightweight Windows desktop application for AI-powered video generation. It uses:
- **Tauri v2** for the desktop shell (Rust backend + web frontend)
- **Python** for ML/AI logic (providers, video generation, security)
- **SQLite** for local metadata storage
- **Fernet encryption** for secure API key storage

---

## 📋 Pre-Development Checklist

Before starting development, ensure you have:

### Required Tools
```powershell
# Check installed tools
rustc --version       # Rust compiler
cargo --version       # Rust package manager  
node --version        # Node.js (for npm packages)
python --version      # Python 3.12+
uv --version          # Fast Python package manager
```

### Environment Setup
```powershell
# Create and activate virtual environment
cd D:\work\horizonsMachine\VisionMachine
uv venv --python 3.12
.venv\Scripts\activate

# Install dependencies
uv pip install -e ".[dev]"

# Set master password (required for key encryption)
$env:VISION_MACHINE_PASSWORD = "your-secure-password"
```

---

## 🏗️ Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                  Tauri Frontend                      │
│  (HTML/CSS/JS)  ← User Interface Layer              │
├─────────────────────────────────────────────────────┤
│                  Tauri Backend                       │
│  (Rust)         ← IPC Handler + Validation          │
├─────────────────────────────────────────────────────┤
│                Python Service Layer                  │
│  (FastAPI/subprocess) ← Business Logic              │
├─────────────────────────────────────────────────────┤
│               Provider Abstraction                   │
│  (Agnes/OpenAI-compatible) ← AI Integration         │
├─────────────────────────────────────────────────────┤
│                Security Layer                        │
│  (EncryptedKeyStore) ← Key Management               │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Development Cycle

### 1. Frontend Development (UI Changes)
```powershell
# Edit files in src/frontend/
# Changes auto-reload in dev mode

cargo tauri dev
```

**Hot Reload**: CSS/JS changes update instantly without restart.

### 2. Backend Development (Rust Commands)
```rust
// src/main.rs
#[tauri::command]
async fn my_new_command(param: String) -> Result<String, String> {
    // Your logic here
    Ok(format!("Result: {}", param))
}
```

After changes, rebuild:
```powershell
cargo build
```

### 3. Python Logic Updates
```python
# Any file in src/
# Changes picked up automatically via subprocess
```

No rebuild needed - subprocess spawns fresh Python process each time.

### 4. Testing
```powershell
# Run all tests
uv run pytest tests/ -v

# Run specific test
uv run pytest tests/test_security.py -v

# Run with coverage
uv run pytest tests/ --cov=src --cov-report=html
```

---

## 📝 Coding Standards

### Python
```python
"""Module docstring with brief description."""

from typing import Optional, Dict, Any
import asyncio


class VideoGenerator:
    """Class docstring with details."""
    
    MAX_DURATION = 60  # Constants at class level
    
    def __init__(self, provider: BaseProvider):
        """Constructor with parameter docs."""
        self.provider = provider
        self._session = None
    
    async def generate(
        self,
        prompt: str,
        duration: int = 30,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate video from prompt.
        
        Args:
            prompt: Video description
            duration: Duration in seconds (default 30)
            **kwargs: Additional parameters
            
        Returns:
            Dictionary with generation results
            
        Raises:
            ProviderError: If generation fails
        """
        # Implementation
        pass
```

### Rust
```rust
use serde::{Deserialize, Serialize};

/// Documentation comment for struct
#[derive(Clone, Serialize, Deserialize)]
pub struct VideoResult {
    pub success: bool,
    pub video_url: String,
    pub error: Option<String>,
}

/// Command documentation
#[tauri::command]
async fn generate_video(
    prompt: String,
    duration: u32,
) -> Result<VideoResult, String> {
    // Implementation
}
```

### JavaScript/TypeScript
```javascript
/**
 * Application class documentation
 */
class VisionMachineApp {
  constructor() {
    this.state = {
      isGenerating: false,
      currentVideo: null
    };
  }

  /**
   * Generate video method
   * @param {string} prompt - Video description
   * @returns {Promise<void>}
   */
  async generateVideo(prompt) {
    // Implementation
  }
}
```

---

## 🔐 Security Guidelines

### Never Commit
```
❌ .env files
❌ *.pem private keys
❌ config/*.txt with tokens
❌ __pycache__/ directories
❌ .venv/ virtual environments
```

### Always Use
```python
# ✅ Load secrets from environment
from src.security import ConfigManager

config = ConfigManager()
api_key = config.get_api_key("agnes")
```

### Encryption Best Practices
1. Use `cryptography.fernet` for symmetric encryption
2. Derive keys with PBKDF2 (100k+ iterations)
3. Store IVs separately from ciphertext
4. Zero sensitive buffers after use

---

## 🧪 Testing Strategy

### Unit Tests (pytest)
Location: `tests/test_*.py`

```python
def test_encryption_decryption():
    """Test that encrypted keys can be decrypted."""
    store = EncryptedKeyStore(":memory:", "test-pass")
    store.save_key("test", "secret-key")
    assert store.get_key("test") == "secret-key"
```

### Integration Tests
Test full pipeline: Rust → Python → Provider

```python
@pytest.mark.asyncio
async def test_full_generation():
    """End-to-end test with mocked provider."""
    # ... test implementation
```

### Frontend Tests (Vitest)
```javascript
test('slider updates duration value', () => {
  const slider = document.getElementById('duration-slider');
  slider.value = 45;
  slider.dispatchEvent(new Event('input'));
  expect(document.getElementById('duration-value').textContent).toBe('45');
});
```

---

## 🚀 Build & Distribution

### Development Build
```powershell
cargo tauri dev
```

### Production Build (Windows)
```powershell
cargo tauri build
```

Outputs:
- `src-tauri/target/release/bundle/msi/VisionMachine_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/windows-portable/VisionMachine.zip`

### Creating App Icons
```powershell
# Generate icons from source image
cargo tauri icon path/to/logo.png
```

Supports: PNG, SVG, ICO (will auto-generate all sizes)

---

## 📦 Dependency Management

### Python Dependencies
```toml
# pyproject.toml
[project]
dependencies = [
    "aiohttp>=3.9.0",
    "cryptography>=42.0.0",
    # ... other deps
]

[project.optional-dependencies]
dev = ["pytest>=9.1.1", "pytest-asyncio>=0.23.0"]
serve = ["fastapi>=0.115.0"]
desktop = ["pyinstaller>=6.0.0"]
```

Update with:
```powershell
uv pip add package-name
uv pip add -U  # Update all
```

### Rust Dependencies
```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
```

Update with:
```powershell
cargo update
```

---

## 🐛 Debugging Guide

### Enable Logging
```powershell
# Set log level
$env:RUST_LOG="debug"
$env:PYTHON_LOG_LEVEL="DEBUG"

# Then run
cargo tauri dev
```

### Browser DevTools
1. Right-click app window → Inspect Element
2. Console tab: JavaScript errors
3. Network tab: HTTP requests
4. Elements tab: HTML/CSS debugging

### Python Debugger
```python
import pdb; pdb.set_trace()
# or
import breakpoint; breakpoint()  # Python 3.9+
```

### Rust Panic Backtrace
```powershell
$env:RUST_BACKTRACE="full"
cargo tauri dev
```

---

## 📊 Performance Optimization

### Frontend
- Use `requestAnimationFrame` for animations
- Debounce slider input events
- Lazy-load video thumbnails
- Virtual scroll for long lists

### Backend (Rust)
- Use `tokio` for async operations
- Pool connections for repeated calls
- Profile with `cargo flamegraph`

### Python
- Use async/await for I/O bound operations
- Cache expensive computations
- Stream large responses

---

## 🔄 CI/CD Pipeline

### GitHub Actions (.github/workflows/ci.yml)
```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install -e ".[dev]"
          cargo install tauri-cli
        
      - name: Run tests
        run: pytest tests/ -v
      
      - name: Build
        run: cargo tauri build
```

---

## 📚 Resources

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Python asyncio Guide](https://docs.python.org/3/library/asyncio.html)
- [cryptography Fernet Docs](https://cryptography.io/en/latest/fernet/)

---

*Last updated: 2026-08-19*