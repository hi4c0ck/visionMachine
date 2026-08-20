# VisionMachine - Quick Reference Card

## 🚀 One-Command Launch
```powershell
cd D:\work\horizonsMachine\VisionMachine
.\launch.bat
```

---

## 🔧 Common Commands

### Daily Development
| Task | Command |
|------|---------|
| **Start app** | `.\launch.bat` |
| **Run tests** | `uv run pytest tests/ -v` |
| **Check build** | `cargo check --manifest-path src-tauri/Cargo.toml` |
| **View logs** | Check Tauri dev console (F12 in window) |

### Git Operations
| Task | Command |
|------|---------|
| **Status** | `git status` |
| **Commit** | `git commit -m "type: message"` |
| **Push** | `git push origin develop` |
| **Pull** | `git pull origin develop` |
| **Branch** | `git checkout -b feature/name` |

### Python Commands
| Task | Command |
|------|---------|
| **Activate env** | `.venv\Scripts\activate` |
| **Run script** | `uv run python script.py` |
| **Install pkg** | `uv pip install package` |
| **List pkgs** | `uv pip list` |

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `launch.bat` | One-click launcher |
| `src/frontend/App.svelte` | Main app component |
| `src/frontend/components/Workspace.svelte` | Layout with 5 containers |
| `src-tauri/src/main.rs` | Rust entry point |
| `api_server.py` | Python FastAPI server |
| `pyproject.toml` | Python dependencies |
| `tauri.conf.json` | Tauri configuration |

---

## 🐛 Quick Fixes

### Issue | Solution
--- | ---
**Build fails** | Run `cargo clean && cargo build`
**Python missing** | Install via `uv python install 3.12`
**Tauri not found** | Run `npm install -g @tauri-apps/cli`
**Svelte error** | Check for multiple `<script>` tags
**Git auth fail** | Regenerate token via GitHub App

---

## ✅ Health Check

Run this to verify everything works:
```powershell
# Test all components
Write-Host "=== VisionMachine Health Check ===" -ForegroundColor Cyan
Write-Host ""

# Check tools
Write-Host "Tools:" -ForegroundColor Yellow
Write-Host "  Rust: $(rustc --version 2>$null || 'NOT FOUND')" -ForegroundColor $(if ($?) { 'Green' } else { 'Red' })
Write-Host "  Cargo: $(cargo --version 2>$null || 'NOT FOUND')" -ForegroundColor $(if ($?) { 'Green' } else { 'Red' })
Write-Host "  Node: $(node --version 2>$null || 'NOT FOUND')" -ForegroundColor $(if ($?) { 'Green' } else { 'Red' })
Write-Host "  Tauri: $(tauri --version 2>$null || 'NOT FOUND')" -ForegroundColor $(if ($?) { 'Green' } else { 'Red' })
Write-Host ""

# Check project
Write-Host "Project:" -ForegroundColor Yellow
Write-Host "  Branch: $(git branch --show-current 2>$null)" -ForegroundColor Green
Write-Host "  Tests: $(uv run pytest tests/ -q 2>&1 | Select-String 'passed')" -ForegroundColor Green
Write-Host ""

Write-Host "Ready to launch: .\launch.bat" -ForegroundColor Green
```

---

## 🎯 Next Steps

After reading this guide:
1. ✅ Run `.\launch.bat` to start the app
2. ✅ Enter your name on welcome screen
3. ✅ Explore the workspace layout
4. ✅ Try switching themes (header button)
5. ✅ Start building features!

---

## 📚 Full Documentation

For complete details, see:
- `docs/PROJECT_GUIDE.md` - Complete project guide
- `docs/ARCHITECTURE.md` - System architecture
- `docs/DEVELOPMENT_WORKFLOW.md` - Development processes

---

*Keep this card handy for quick reference!* 📝
