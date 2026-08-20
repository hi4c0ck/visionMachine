# VisionMachine Deployment Guide

## Prerequisites

### Windows Development Environment
```bash
# Rust (required)
cargo --version
rustc --version

# Node.js (for frontend build)
node --version
npm --version

# Python (for testing)
python --version
pip --version
```

### Recommended Tools
- Visual Studio Code with Rust Analyzer extension
- Windows SDK for Tauri packaging
- Git for version control

---

## Build Commands

### Development Mode
```bash
cd D:\work\horizonsMachine\VisionMachine\src-tauri

# Run dev server with hot reload
cargo tauri dev

# Or use the batch file
cd .. && dev.bat
```

### Production Build
```bash
# Build release version
cargo tauri build

# This creates platform-specific bundles:
# - Windows: target/release/bundle/
#   - MSI installer
#   - Portable EXE
```

### Quick Build Scripts
```batch
rem From project root
run.bat              # Full production build
build.bat            # Build only
launch.bat           # Launch development mode
start.bat            # Quick start
```

---

## Distribution Targets

### Windows (Primary)
```bash
cargo tauri build
```

Output locations:
- `target/release/bundle/msi/VisionMachine_0.1.0_x64-setup.msi`
- `target/release/bundle/nsis/VisionMachine_0.1.0_x64-setup.exe`
- `target/release/visionmachine.exe` (portable)

### macOS (If needed)
```bash
cargo tauri build --target x86_64-apple-darwin
cargo tauri build --target aarch64-apple-darwin
```

### Linux (If needed)
```bash
cargo tauri build --target x86_64-unknown-linux-gnu
```

---

## Configuration

### Tauri Configuration
File: `src-tauri/tauri.conf.json`

```json
{
  "productName": "VisionMachine",
  "version": "0.1.0",
  "identifier": "com.visionmachine.app",
  "build": {
    "frontendDist": "../src/frontend",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "withGlobalTauri": true
  }
}
```

### Database Storage
Default path: `%TEMP%\VisionMachine\visionmachine.db`

To change, modify in `lib.rs`:
```rust
let default_path = std::env::temp_dir().join("VisionMachine");
```

---

## Testing

### Run All Tests
```bash
# Rust integration tests
cd src-tauri && cargo test --lib

# Python security tests
cd .. && python -m pytest tests/ -v
```

### Verify Build
```bash
# Run verification script
node final_verification.cjs
```

---

## Security Notes

### Data Storage
- Database stored in OS temp directory by default
- Keys encrypted with Fernet (symmetric encryption)
- Path validation prevents directory traversal attacks
- SQL injection prevention via parameterized queries

### Distribution Considerations
- Sign executables for Windows SmartScreen
- Use NSIS or MSI for proper installer experience
- Include license and privacy policy
- Test on clean Windows installation

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Cargo not found | Add `~\.cargo\bin` to PATH |
| Node not found | Install Node.js from nodejs.org |
| SQLite errors | Ensure SQLite3 is available |
| Build fails | Run `cargo clean` and retry |

### Verification Steps
1. Check all dependencies installed
2. Run `cargo check` to verify compilation
3. Run tests: `cargo test --lib`
4. Check paths in verification script

---

## Version Management

Bump version in two places:
1. `package.json` → `"version": "x.y.z"`
2. `src-tauri/Cargo.toml` → `version = "x.y.z"`

Then rebuild.

---

**Status:** ✅ READY FOR PRODUCTION
