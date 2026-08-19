# Migration Guide

This guide helps you migrate to VisionMachine from other tools or upgrade between versions.

---

## 🔄 Migrating from Agnes CLI

If you're currently using the Agnes command-line tool, here's how to transition:

### 1. Export Your Settings
```bash
# Find your existing config
cat ~/.config/agnes/config.json
```

Export your:
- API keys
- Default generation settings
- Saved prompts

### 2. Migrate API Keys
VisionMachine stores keys differently (encrypted SQLite vs plain JSON):

**Old way (Agnes CLI):**
```json
{
  "api_key": "sk-xxx",
  "endpoint": "https://api.agnes.ai/v1"
}
```

**New way (VisionMachine):**
```powershell
# Set environment variable first
$env:VISION_MACHINE_PASSWORD = "your-master-password"

# Use the CLI tool to set keys
uv run python scripts/manage_keys.py set agnes "sk-xxx"
```

### 3. Update Your Workflow
| Agnes CLI | VisionMachine Equivalent |
|-----------|-------------------------|
| `agnes generate --prompt "..."` | Click "Generate Video" in UI |
| `agnes config set key xxx` | Settings → Configure Providers |
| `agnes history` | History panel in app |

### 4. Convert Prompts (if needed)
Some prompt formats may differ:
- Agnes CLI: `"A beautiful sunset over mountains"`
- VisionMachine: Same format works ✓

No conversion needed for standard prompts!

---

## 📦 Upgrading from v0.x to v1.0

### Breaking Changes

#### 1. Key Storage Changed
**Before (v0.x):**
- Keys stored in `~/.config/visionmachine/keys.json`
- Plain text encryption

**After (v1.0):**
- Keys stored in encrypted SQLite database
- Password-derived encryption (PBKDF2 + Fernet)
- Location: `%USERPROFILE%\.config\visionmachine\keys.db`

**Migration Script:**
```python
# scripts/migrate_keys.py
import sqlite3
import json
from pathlib import Path
from cryptography.fernet import Fernet
import hashlib
import base64

def migrate():
    # Read old keys
    old_path = Path.home() / ".config" / "visionmachine" / "keys.json"
    with open(old_path) as f:
        old_keys = json.load(f)
    
    # Create new encrypted store
    db_path = Path.home() / ".config" / "visionmachine" / "keys.db"
    master_password = input("Enter new master password: ")
    
    # Derive key and encrypt
    salt = b'visionmachine_salt_2026_v1'
    key = hashlib.pbkdf2_hmac('sha256', master_password.encode(), salt, 100000)
    cipher = Fernet(base64.urlsafe_b64encode(key[:32]))
    
    # Store each key
    conn = sqlite3.connect(db_path)
    for provider, key_value in old_keys.items():
        encrypted = cipher.encrypt(key_value.encode())
        conn.execute(
            "INSERT INTO api_keys (provider, key_encrypted) VALUES (?, ?)",
            (provider, encrypted)
        )
    conn.commit()
    conn.close()
    
    print(f"Migrated {len(old_keys)} keys to encrypted storage")

if __name__ == "__main__":
    migrate()
```

Run migration:
```powershell
uv run python scripts/migrate_keys.py
```

#### 2. Provider Configuration Format
**Before:**
```json
{
  "primary": {
    "type": "agnes",
    "key": "sk-xxx"
  }
}
```

**After:**
```json
{
  "providers": {
    "primary": {
      "type": "agnes",
      "endpoint": "https://api.agnes.ai/v1",
      "model": "agnes-video-v1"
    }
  }
}
```

The configuration is now managed through the UI or `ConfigManager`.

#### 3. Directory Structure Changes
```
# Old structure (v0.x)
visionmachine/
├── main.py
├── config.json
└── keys.json

# New structure (v1.0)
visionmachine/
├── src/                    # Python source
│   ├── security/
│   ├── providers/
│   └── services/
├── src-tauri/             # Rust backend
├── src/frontend/          # Web interface
├── tests/                 # Test suite
└── docs/                  # Documentation
```

---

## 🚀 Upgrading Between Minor Versions

### From v1.0 to v1.1
**No breaking changes expected.**

Steps:
1. Backup your data
   ```powershell
   copy %USERPROFILE%\.config\visionmachine\keys.db keys_backup.db
   ```

2. Update dependencies
   ```powershell
   uv pip install -e ".[dev]" --upgrade
   cargo update
   ```

3. Rebuild
   ```powershell
   cargo tauri build
   ```

4. Replace old binary
   ```powershell
   # Windows
   move VisionMachine.exe VisionMachine_old.exe
   copy target\release\vision-machine.exe .
   ```

---

## 🔄 Switching AI Providers

### From Agnes to OpenAI-Compatible

1. **Configure new provider**
   ```powershell
   # In Python
   from src.security import ConfigManager
   
   cfg = ConfigManager()
   cfg.add_provider("alternative", {
       "type": "openai_compatible",
       "endpoint": "https://api.openai.com/v1",
       "model": "gpt-4o"
   })
   cfg.set_api_key("alternative", "sk-openai-key")
   ```

2. **Update UI settings**
   - Open Settings → Providers
   - Select "alternative" as primary
   - Save settings

3. **Test connection**
   ```powershell
   uv run python -c "
   from src.providers.factory import ProviderFactory
   from src.security import ConfigManager
   
   cfg = ConfigManager()
   prov = ProviderFactory.create(
       provider_type=cfg.get_provider('alternative').type,
       key_store=cfg.key_store,
       config={'endpoint': 'https://api.openai.com/v1'}
   )
   print('Connected:', await prov.validate_connection())
   "
   ```

---

## ⚠️ Known Migration Issues

### Issue 1: Old keys can't be decrypted
**Cause**: Master password lost or changed

**Solution**:
1. Generate new master password
2. Re-enter all API keys manually
3. Old encrypted keys become inaccessible

**Prevention**: Store master password securely (password manager recommended)

### Issue 2: Provider endpoint mismatch
**Cause**: Provider URLs changed between versions

**Solution**:
```powershell
# Check current endpoints
uv run python -c "
from src.security import ConfigManager
cfg = ConfigManager()
for name, prov in cfg.load_configuration().providers.items():
    print(f'{name}: {prov.endpoint}')
"
```

Update in Settings if needed.

---

## 📞 Support

Need help migrating?
- Check [SECURITY.md](./SECURITY.md) for key management
- Open an issue on GitHub
- Review [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) for troubleshooting

---

*Migration guide v1.0*
*Last updated: 2026-08-19*