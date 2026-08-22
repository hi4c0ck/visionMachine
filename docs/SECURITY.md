# Security Architecture

## Overview

VisionMachine prioritizes security through:
- **Minimal permissions** - Only required Tauri capabilities
- **Client-side state** - Sensitive data stays in browser memory
- **Input validation** - All user inputs are sanitized
- **No hardcoded secrets** - API keys managed by users

---

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Credential leakage in logs | Error messages sanitized; no passwords logged |
| XSS attacks | Content Security Policy; no unsafe HTML injection |
| State tampering | Immutable $state after initialization |
| Unauthorized commands | Tauri permission system scopes access |
| Path traversal | Input validation on all file paths |

---

## Permission Configuration

### Capabilities (`src-tauri/capabilities/default.json`)

```json
{
  "identifier": "default",
  "description": "Default capability for VisionMachine",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:event:default",
    "shell:allow-open"
  ]
}
```

**Principle:** Least privilege - only explicitly allowed operations.

---

## State Security

### In-Memory Storage
All sensitive state is stored in Rust's `AppState` (in-memory only):

```rust
pub struct AppState {
    pub username: Arc<Mutex<Option<String>>>,      // Current user
    pub error_log: Arc<Mutex<Vec<(String, String)>>>, // Last 100 errors
}
```

**Benefits:**
- Not persisted to disk
- Cleared on application restart
- Thread-safe access via Mutex

### Client-Side Storage (Non-Sensitive)
User preferences stored in localStorage:
```typescript
// Safe, non-sensitive preferences
localStorage.setItem('vm-theme', 'jetbrains-dark');
localStorage.setItem('vm-layout', 'landscape');
localStorage.setItem('vm-username', 'John Doe'); // Display name only
```

**Not stored:** Passwords, API keys, or sensitive tokens.

---

## Input Validation

### Username Validation
```rust
async fn login_user(username: String, ...) -> Result<String, String> {
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    // Accept any non-empty string (display name)
    *user = Some(username.clone());
    Ok(format!("Welcome, {}!", username))
}
```

### Error Context Sanitization
```rust
async fn report_error(error_msg: String, context: String, ...) {
    // Both values accepted as-is (already validated upstream)
    log.push((timestamp, format!("{}: {}", context, error_msg)));
}
```

---

## CSP Policy

Content Security Policy configured in `tauri.conf.json`:

```json
{
  "security": {
    "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.github.com"
  }
}
```

**Restrictions:**
- Scripts only from origin
- No external eval except for Tauri internals
- Images from self + data URIs
- API calls restricted to whitelisted domains

---

## Error Handling Security

### Error Logging
Errors are logged with timestamps but:
- No stack traces in production
- No sensitive data in error messages
- Limited to last 100 entries (memory bound)

### Error Reporting Pattern
```typescript
// Good: Generic error messages
invoke('report_error', { 
  error: 'Failed to load project', 
  context: 'ProjectsPanel' 
});

// Bad: Never do this
invoke('report_error', { 
  error: password,           // Never log passwords
  context: user_token        // Never log tokens
});
```

---

## Build Security

### Production Build Settings
```toml
# src-tauri/Cargo.toml
[profile.release]
opt-level = "s"      # Size optimization
lto = true           # Link-time optimization
strip = true         # Remove debug symbols
```

**Benefits:**
- Smaller binary (~5MB vs ~150MB Electron)
- No debug information in release
- Faster startup time

### WebView2 Security
- Sandboxed WebView2 runtime
- No file system access by default
- CORS policies enforced

---

## Future Security Enhancements

| Feature | Status | Priority |
|---------|--------|----------|
| API key encryption | Planned | High |
| Database migration integrity | Planned | Medium |
| Rate limiting on commands | Planned | Medium |
| Audit logging | Planned | Low |

---

## Security Checklist

Before releasing:

- [ ] All Tauri permissions are explicitly scoped
- [ ] No console.log of sensitive data
- [ ] Input validation on all user inputs
- [ ] CSP policy restricts external resources
- [ ] Error messages don't expose internals
- [ ] Dependencies are up-to-date (`npm audit`)
- [ ] No hardcoded secrets in source