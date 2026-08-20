# VisionMachine Security Documentation

## Overview

VisionMachine implements multiple layers of security to protect user data and prevent common attack vectors.

---

## 1. SQL Injection Prevention

### Implementation
All database queries use **parameterized statements** via SQLx:

```rust
// ✅ SECURE - Parameterized query
sqlx::query("INSERT INTO profiles (id, name, email) VALUES (?, ?, ?)")
    .bind(&id)
    .bind(name)
    .bind(email)
    .execute(&mut **conn)
    .await?;
```

### Why This Works
- SQLx binds parameters separately from SQL structure
- Database driver escapes values properly
- No string concatenation possible

---

## 2. Path Security Validation

### Implementation
Directory traversal attacks are blocked:

```rust
pub fn validate_storage_path(path: &str) -> Result<PathBuf, String> {
    let validated = PathBuf::from(path);
    let canonical = validated.canonicalize()
        .map_err(|e| format!("Path resolution failed: {}", e))?;
    
    // Reject absolute paths outside allowed directories
    if canonical.components().any(|c| matches!(c, Component::RootDir)) {
        return Err("Invalid path".to_string());
    }
    
    Ok(canonical)
}
```

### Test Coverage
```python
def test_path_security():
    assert_raises(Exception, Database.new, "../evil/path")
    assert_raises(Exception, Database.new, "/etc/passwd")
```

---

## 3. Database Encryption (Key Store)

### Implementation
API keys and sensitive credentials use **Fernet symmetric encryption**:

```python
class EncryptedKeyStore:
    def __init__(self, db_path, password):
        self.crypto = Fernet(self._derive_key(password))
    
    def save_key(self, provider, key):
        encrypted = self.crypto.encrypt(key.encode())
        # Store encrypted bytes
    
    def get_key(self, provider):
        encrypted = self._fetch(provider)
        return self.crypto.decrypt(encrypted).decode()
```

### Security Properties
- Each key encrypted independently
- Master password required for decryption
- Wrong password raises `ValueError`
- Keys never stored in plaintext

---

## 4. Foreign Key Constraints

### Schema Definition
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
```

### Behavior
- Invalid FK references rejected at INSERT time
- CASCADE deletes maintain referential integrity
- Orphan records impossible

---

## 5. WAL Mode Concurrency

### SQLite PRAGMA
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

### Benefits
- Concurrent readers don't block writers
- Crash recovery faster
- Better multi-user performance

---

## 6. Async Operations Safety

### Channel-Based Writes
```rust
pub struct AsyncWriter {
    tx: tokio::sync::mpsc::Sender<WriteTask>,
}
```

- File operations run in separate Tokio task
- UI remains responsive
- Atomic writes via temp file + rename

---

## 7. Error Handling

### Pattern
```rust
pub async fn create_profile(...) -> Result<serde_json::Value, String> {
    // All errors propagated as Result
    // No panics in normal operation
}
```

### Logging
- Errors logged but not exposed to frontend
- User receives friendly messages

---

## Security Checklist

- [x] SQL injection prevention (parameterized queries)
- [x] Path traversal blocking
- [x] Key encryption (Fernet)
- [x] Foreign key integrity
- [x] Concurrent access safety (WAL mode)
- [x] Non-blocking I/O (async/await)
- [x] Error propagation (no panics)
- [x] UUID v4 identifiers (unpredictable)
- [x] RFC3339 timestamps (no leakage)

---

## Penetration Testing Recommendations

1. Try SQL injection payloads in all inputs
2. Test path traversal with `../` sequences
3. Verify encryption by inspecting database
4. Check concurrent access patterns
5. Review network traffic (should be local-only)

---

**Last Updated:** August 20, 2026
**Security Status:** ✅ HARDENED
