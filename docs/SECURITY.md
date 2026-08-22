# Security Architecture

## Overview

VisionMachine uses encryption-first security for all sensitive data, particularly API keys. This document describes the threat model and implementation.

## Threat Model

| Threat | Mitigation |
|--------|------------|
| API key leakage in logs | Keys never logged; sanitized error messages |
| Plain text key storage | Fernet encryption with PBKDF2 key derivation |
| Database corruption | Transaction support + migration integrity checks |
| Path traversal attacks | Input validation on all file paths |
| SQL injection | Parameterized queries throughout |
| Man-in-the-middle | HTTPS-only connections to providers |

## Key Management

### Encryption Strategy

```python
class EncryptedKeyStore:
    # Storage: SQLite database at ~/.config/visionmachine/keys.db
    # Encryption: Fernet (symmetric, HMAC-signed)
    # Key derivation: PBKDF2-HMAC-SHA256 (100k iterations)
    
    def save_key(self, provider: str, api_key: str) -> None
    def get_key(self, provider: str) -> str
    def delete_key(self, provider: str) -> bool
    def list_providers(self) -> List[str]
```

### Master Password

```powershell
# Set environment variable
$env:VISION_MACHINE_PASSWORD = "your-secure-password"

# Or set permanently in Windows System Properties
[System.Environment]::SetEnvironmentVariable(
    "VISION_MACHINE_PASSWORD", 
    "your-password", 
    "User"
)
```

**Warning:** If you forget your master password, all stored API keys are unrecoverable. This is by design — security over convenience.

## Configuration Isolation

Each provider has isolated configuration:

```json
{
  "providers": {
    "primary": {
      "type": "agnes",
      "endpoint": "https://api.agnes.ai/v1",
      "model": "agnes-video-v1"
    },
    "custom_openai": {
      "type": "openai_compatible", 
      "endpoint": "https://api.openai.com/v1",
      "model": "gpt-4o"
    }
  }
}
```

## Provider Security Characteristics

### Agnes Provider (Hardcoded Endpoint)

- ✅ Endpoint cannot be changed by user (security feature)
- ✅ Requires valid Agnes API key
- ✅ Full video generation support

### OpenAI-Compatible Provider (Configurable)

- ⚠️ User-configurable endpoint (trust the user)
- ⚠️ Verify HTTPS is used for all requests
- ✅ Supports Azure OpenAI, Ollama, and other compatible endpoints

## Runtime Security

1. **Memory handling**: Keys loaded into memory only during active sessions
2. **Process isolation**: Python subprocess for sensitive operations
3. **No credential logging**: Debug output strips sensitive data
4. **Graceful degradation**: Generic error messages (no provider details)

## Data Storage Locations

| Data Type | Location | Encryption |
|-----------|----------|------------|
| API Keys | `%USERPROFILE%\.config\visionmachine\keys.db` | Fernet |
| App Settings | `%USERPROFILE%\.config\visionmachine\settings.json` | Plain (no secrets) |
| Project Data | `<storage_path>\visionmachine.db` | Local SQLite |
| Generated Videos | `<output_path>\videos\` | N/A |
| Logs | `%APPDATA%\VisionMachine\logs\` | No secrets |

## Security Best Practices

### For Users

1. Use a strong, unique master password
2. Never share `VISION_MACHINE_PASSWORD` in scripts or logs
3. Keep your system updated
4. Review provider endpoints before use

### For Developers

1. Add tests for new security features
2. Run security audit before merging: `python scripts/security-audit.py`
3. Use parameterized queries (never string concatenation)
4. Log security events without sensitive data

## Incident Response

### Compromised API Key

1. Revoke key at provider dashboard immediately
2. Delete corrupted key store:
   ```powershell
   Remove-Item "$env:USERPROFILE\.config\visionmachine\keys.db" -Force
   ```
3. Re-enter clean keys via UI
4. Rotate master password

### Suspected Data Breach

1. Stop all app processes
2. Backup (don't delete) current data
3. Clear app state:
   ```powershell
   Remove-Item "$env:APPDATA\VisionMachine" -Recurse -Force
   Remove-Item "$env:USERPROFILE\.config\visionmachine" -Recurse -Force
   ```
4. Rebuild from source to verify integrity
5. Report incident to maintainers

---

*Document version: 1.0*
*Last updated: 2026-08-21*
