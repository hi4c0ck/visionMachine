# Troubleshooting Guide

Common issues and solutions for VisionMachine.

---

## 🔑 API Key Issues

### Error: "No API key found"
**Cause**: API key not configured or master password not set

**Solution**:
```powershell
# Set master password
$env:VISION_MACHINE_PASSWORD = "your-secure-password"

# Configure API key via UI
# Settings → Providers → Agnes → Enter API key
```

### Error: "Invalid API key"
**Cause**: Key is incorrect or expired

**Solution**:
1. Verify your API key at https://api.agnes.ai/dashboard
2. Update key in Settings → Providers
3. Test connection with Validate button

### Error: "Failed to decrypt key"
**Cause**: Master password changed or corrupted database

**Solution**:
```powershell
# Backup current (broken) database
Move-Item "$env:USERPROFILE\.config\visionmachine\keys.db" keys_backup.db

# Reset - you'll need to re-enter all keys
Remove-Item "$env:USERPROFILE\.config\visionmachine\keys.db"
```

---

## 🎬 Video Generation Issues

### Error: "Generation timed out"
**Cause**: Network slow or video too long

**Solutions**:
1. Reduce duration (max 60s)
2. Reduce shot count (4-6 shots)
3. Check internet speed
4. Retry after 30 seconds

### Error: "Rate limit exceeded"
**Cause**: Too many requests in short time

**Solution**: Wait 1-5 minutes between generations, or upgrade your API plan.

### Error: "Network error"
**Cause**: Connection issue or firewall

**Solutions**:
```powershell
# Test connectivity
curl -I https://api.agnes.ai/v1

# If using proxy, configure it
$env:HTTPS_PROXY = "http://your-proxy:port"
```

---

## 💻 Desktop App Issues

### Error: "WebView2 not found"
**Cause**: Microsoft Edge WebView2 runtime not installed

**Solution**:
```powershell
# Download and install WebView2
Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkID=2093589" -OutFile "WebView2.exe"
Start-Process -FilePath ".\WebView2.exe" -Wait
```

Or install Microsoft Edge: https://www.microsoft.com/edge

### Error: "Port 8000 already in use"
**Cause**: Another process using the port

**Solution**:
```powershell
# Find and kill the process
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

### App crashes on startup
**Solutions**:
1. Clear cache: `Remove-Item "$env:APPDATA\VisionMachine" -Recurse -Force`
2. Reinstall: `cargo tauri build && msiexec /i target/release/bundle/msi/VisionMachine_*.msi`
3. Check logs: `%APPDATA%\VisionMachine\logs\`

---

## 🐍 Python Issues

### Error: "Module not found"
**Cause**: Dependencies not installed

**Solution**:
```powershell
cd D:\work\horizonsMachine\VisionMachine
uv pip install -e ".[dev]"
```

### Error: "Python 3.12 not found"
**Cause**: uv Python not installed or PATH issue

**Solution**:
```powershell
# Install Python 3.12
uv python install 3.12

# Or add to PATH
$env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
```

### Error: "Cannot import torch"
**Cause**: torch not installed or incompatible

**Solution**:
```powershell
# Reinstall with correct version
uv pip install torch==2.13.0 torchvision==0.28.0
```

---

## 🔒 Security Issues

### Forgot master password
**Cannot be recovered** - this is by design for security.

**Solution**:
```powershell
# Delete old encrypted database
Remove-Item "$env:USERPROFILE\.config\visionmachine\keys.db"

# Start fresh with new password
$env:VISION_MACHINE_PASSWORD = "new-password"
```

**Warning**: All stored API keys will be lost!

### Keys not working after update
**Cause**: Database format changed

**Solution**: Export old keys manually and re-enter them.

---

## 📁 File/Permission Issues

### "Permission denied" when saving
**Cause**: Write permissions issue

**Solution**:
```powershell
# Run as administrator or fix permissions
icacls "$env:USERPROFILE\.config\visionmachine" /grant "%USERNAME%:(F)"
```

### "Disk full" error
**Solution**:
```powershell
# Clean up old videos
Remove-Item "$env:USERPROFILE\Videos\VisionMachine\*" -Recurse -Force -ErrorAction SilentlyContinue

# Or change output directory in settings
```

---

## 🌐 Network Issues

### Cannot connect to API
**Check**:
1. Internet connection
2. Firewall settings
3. Proxy configuration
4. DNS resolution

```powershell
# Test API endpoint
curl https://api.agnes.ai/v1/health

# Check DNS
nslookup api.agnes.ai
```

### Slow generation
**Possible causes**:
- Slow internet upload speed
- Large video duration/resolution
- Server load (try off-peak hours)
- Many concurrent shots

---

## 🔧 Advanced Troubleshooting

### Enable Debug Logging
```powershell
# For Rust/Tauri
$env:RUST_LOG = "debug"
cargo tauri dev

# For Python
$env:PYTHON_LOG_LEVEL = "DEBUG"
uv run python -m src.main
```

Logs location:
- Tauri: `%APPDATA%\VisionMachine\logs\`
- Python: stdout/stderr

### Check System Info
```powershell
# Python environment
uv run python -c "import sys; print(sys.version)"
uv run python -c "import torch; print('torch:', torch.__version__)"

# Rust environment
rustc --version
cargo --version

# Node.js
node --version
npm --version
```

### Reset Everything
```powershell
# Backup first!
Copy-Item "$env:USERPROFILE\.config\visionmachine" "$env:USERPROFILE\.config\visionmachine_backup" -Recurse

# Reset config
Remove-Item "$env:USERPROFILE\.config\visionmachine" -Recurse -Force

# Reset app data
Remove-Item "$env:APPDATA\VisionMachine" -Recurse -Force

# Reinstall
cargo tauri build
msiexec /i target/release/bundle/msi/VisionMachine_*.msi
```

---

## 📞 Getting Help

If none of these solutions work:

1. **Check logs**: Look in `%APPDATA%\VisionMachine\logs\`
2. **Run diagnostics**:
   ```powershell
   uv run python scripts/diagnose.py
   ```
3. **Open GitHub issue**: Include logs and system info
4. **Join Discord**: Community support available

---

*Troubleshooting guide v1.0*
*Last updated: 2026-08-19*