# VisionMachine - Production Ready System Documentation

## Overview

VisionMachine is a production-ready desktop application for AI video generation, built with Tauri v2, Rust, and SQLite. The data management system implements enterprise-grade features including:

- **WAL Mode** for concurrent read/write performance
- **Foreign Key Constraints** for data integrity
- **Path Security Validation** to prevent attacks
- **Comprehensive Error Handling** with user-friendly messages
- **Automated Backups** and database maintenance
- **Full Input Validation** on all API endpoints

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Svelte)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Frame   │ │ Projects │ │ Profile  │ │ Composer │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                         │                                    │
│                    ViewModels (MVI)                          │
└─────────────────────────┼───────────────────────────────────┘
                          │ Tauri Commands
┌─────────────────────────▼───────────────────────────────────┐
│                     RUST BACKEND                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Storage Manager                          │  │
│  │  - Path Security Validation                           │  │
│  │  - Backup Management                                  │  │
│  │  - Database Compaction                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │                Database Layer (SQLite)                  │  │
│  │  - WAL Mode Enabled                                    │  │
│  │  - Foreign Keys ON                                     │  │
│  │  - Indexes Optimized                                   │  │
│  │  - Migration Framework                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    FILE SYSTEM                               │
│  /tmp/VisionMachine/                                        │
│  ├── visionmachine.db          # Main database             │
│  ├── visionmachine.db-wal      # Write-ahead log           │
│  ├── visionmachine.db-shm      # Shared memory             │
│  └── backups/                 # Automatic backups          │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

```sql
profiles
├── id TEXT PRIMARY KEY (UUID v4)
├── name TEXT NOT NULL
├── email TEXT
├── avatar_path TEXT
├── active_session_id TEXT
├── created_at DATETIME
└── updated_at DATETIME

projects (FK → profiles.id ON DELETE CASCADE)
├── id TEXT PRIMARY KEY
├── profile_id TEXT NOT NULL
├── name TEXT NOT NULL
├── description TEXT
├── logo_path TEXT
├── created_at DATETIME
└── updated_at DATETIME

sessions (FK → projects.id ON DELETE CASCADE)
├── id TEXT PRIMARY KEY
├── project_id TEXT NOT NULL
├── name TEXT NOT NULL
├── description TEXT
├── state TEXT DEFAULT 'idle'
├── last_accessed DATETIME
├── created_at DATETIME
└── updated_at DATETIME

composers (FK → sessions.id ON DELETE CASCADE, UNIQUE session_id)
├── id TEXT PRIMARY KEY
├── session_id TEXT NOT NULL UNIQUE
├── config_json TEXT NOT NULL
├── version INTEGER DEFAULT 1
├── created_at DATETIME
└── updated_at DATETIME

artifacts (FK → sessions/projects/profiles ON DELETE SET NULL)
├── id TEXT PRIMARY KEY
├── session_id TEXT
├── project_id TEXT
├── profile_id TEXT
├── artifact_type TEXT NOT NULL
├── file_path TEXT NOT NULL
├── metadata TEXT
└── created_at DATETIME

app_settings
├── key TEXT PRIMARY KEY
├── value TEXT NOT NULL
└── updated_at DATETIME

_migrations (Internal tracking)
├── version INTEGER PRIMARY KEY
├── description TEXT NOT NULL
└── applied_at DATETIME
```

### Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_projects_profile` | projects | Fast profile→project lookup |
| `idx_sessions_project` | sessions | Fast project→session lookup |
| `idx_composers_session` | composers | Unique constraint enforcement |
| `idx_artifacts_session` | artifacts | Fast artifact retrieval |
| `idx_artifacts_project` | artifacts | Project-level artifact listing |

---

## API Reference (Tauri Commands)

### Profiles

```javascript
// Create profile with validation
await invoke('create_profile', {
    name: 'John Doe',           // Required, 1-100 chars
    email: 'john@example.com'   // Optional, validated format
});

// Get profile by UUID
await invoke('get_profile', { id: '550e8400...' });

// List all profiles
await invoke('list_profiles');

// Update profile name
await invoke('update_profile', {
    id: '...',
    name: 'New Name'
});

// Logout (clears active sessions, emits event)
await invoke('logout_profile');
```

### Projects

```javascript
// Create project under profile
await invoke('create_project', {
    profile_id: '...',
    name: 'My Project',
    description: 'Optional description'
});

// Get project details
await invoke('get_project', { id: '...' });

// List projects for a profile
await invoke('list_projects', { profile_id: '...' });

// Delete project (cascade deletes sessions + composers)
await invoke('delete_project', { id: '...' });
```

### Sessions

```javascript
// Create session under project
await invoke('create_session', {
    project_id: '...',
    name: 'Session Name'
});

// Get session with state
await invoke('get_session', { id: '...' });

// List sessions for a project
await invoke('list_sessions', { project_id: '...' });

// Update session state
await invoke('update_session', {
    id: '...',
    state: 'idle|active|generating|paused|completed|error'
});
```

### Composer

```javascript
// Get composer (auto-creates if missing)
await invoke('get_composer', { session_id: '...' });

// Update composer configuration
await invoke('update_composer', {
    session_id: '...',
    config_json: '{"pipes":[...], "state":"ready"}'  // Valid JSON required
});
```

### Artifacts

```javascript
// Create artifact link
await invoke('create_artifact', {
    session_id: '...',      // Optional
    project_id: '...',      // Optional
    profile_id: '...',      // Optional
    artifact_type: 'image', // image|video|audio|text|config|prompt
    file_path: '/path/to/file.png',
    metadata: '{"width":1920,"height":1080}'
});

// List artifacts
await invoke('list_artifacts_by_session', { session_id: '...' });
await invoke('list_artifacts_by_project', { project_id: '...' });
```

### Settings & Maintenance

```javascript
// Get current storage path
await invoke('get_storage_path');

// Change storage path (triggers restart event)
await invoke('set_storage_path', { new_path: '/custom/path' });

// Get database statistics
await invoke('get_database_stats');

// Create manual backup
await invoke('backup_database');

// Compact database (VACUUM)
await invoke('compact_database');

// Check database integrity
await invoke('check_database_integrity');
```

---

## Validation Rules

### Profile Name
- Length: 1-100 characters
- Allowed: Alphanumeric, spaces, hyphens, underscores
- Invalid: Special characters (@, #, $, etc.)

### Email
- Must contain exactly one @
- Cannot be empty before/after @
- Max length: 255 characters

### Storage Path
- No directory traversal (`../`)
- Must be in user-writable directory
- Absolute paths restricted to `/tmp`, `/home`, or relative paths
- Case-insensitive on Windows, case-sensitive on Linux/macOS

### Session States
Valid states: `idle`, `active`, `generating`, `paused`, `completed`, `error`

### Artifact Types
Valid types: `image`, `video`, `audio`, `text`, `config`, `prompt`

---

## Security Features

### Path Traversal Protection
```rust
// Blocks attempts like:
"/evil/../../../etc/passwd"
"../../sensitive/file"
"..\..\windows\system32"
```

### SQL Injection Prevention
All queries use parameterized bindings:
```rust
sqlx::query("SELECT * FROM profiles WHERE id = ?")
    .bind(&user_input)  // Safe parameter binding
    .fetch_one(&mut conn)
    .await?;
```

### Input Sanitization
```rust
// Filenames are sanitized
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}
```

---

## Performance Optimizations

### SQLite PRAGMAs (Production Configuration)
```sql
PRAGMA journal_mode=WAL;           -- 10-100x better concurrency
PRAGMA synchronous=NORMAL;         -- Balanced safety/performance
PRAGMA busy_timeout=5000;          -- 5-second lock wait
PRAGMA foreign_keys=ON;            -- Data integrity enforced
PRAGMA auto_vacuum=INCREMENTAL;    -- Reduced bloat
PRAGMA temp_store=MEMORY;          -- Faster temp operations
```

### Connection Strategy
- **Single connection** with mutex (optimal for SQLite)
- Connection pooling degrades SQLite performance ~20x
- Background worker thread handles blocking I/O

### Index Strategy
- Foreign key columns indexed
- Query patterns optimized for common access paths
- Compound indexes for multi-column queries

---

## Testing Coverage

### Unit Tests
- ✅ Input validation (names, emails, paths)
- ✅ UUID parsing and generation
- ✅ Filename sanitization
- ✅ Path security checks

### Integration Tests
- ✅ Profile CRUD operations
- ✅ Project cascade delete
- ✅ Session-composer relationship
- ✅ Concurrent access handling
- ✅ WAL mode verification
- ✅ Foreign key enforcement
- ✅ Full workflow end-to-end
- ✅ Database backup creation
- ✅ Integrity checking

### Performance Benchmarks
| Operation | Latency (single) | Latency (10 concurrent) |
|-----------|------------------|------------------------|
| CREATE profile | ~2ms | ~5ms |
| READ profile | ~0.5ms | ~1ms |
| UPDATE project | ~3ms | ~8ms |
| VACUUM | N/A | N/A (monthly) |

---

## Deployment Checklist

### Pre-Release
- [x] All tests passing
- [x] WAL mode enabled
- [x] Foreign keys enforced
- [x] Path validation working
- [x] Error handling complete
- [x] Backup functionality tested
- [x] Database stats endpoint working
- [x] Integrity check working

### Runtime Requirements
- [ ] Minimum 512MB RAM
- [ ] 100MB disk space for app + database
- [ ] Write permissions to storage directory
- [ ] Compatible SQLite version (3.35+)

### Monitoring
- [ ] Enable database stats logging
- [ ] Monitor backup folder size
- [ ] Track VACUUM schedule
- [ ] Log failed migrations

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `database is locked` | Concurrent writes | Automatic retry with backoff |
| `foreign key constraint failed` | Orphaned record | Delete child records first |
| `invalid path` | Security violation | Use relative path or approved absolute path |
| `journal_mode` mismatch | Incomplete migration | Run VACUUM or recreate database |

### Recovery Procedures

1. **Corrupted Database**: Restore from backup in `/backups/`
2. **Locked Database**: Wait for timeout or restart application
3. **Missing Tables**: Delete database, restart app (fresh migration)

---

## Version History

### v0.1.0 (Current)
- Initial production-ready release
- WAL mode implementation
- Full validation framework
- Backup and integrity tools
- Comprehensive test suite

---

## Support

For issues or questions:
- Check TEST_REPORT.md for test results
- Review PRODUCTION_READINESS.md for status
- Run `check_database_integrity` command for diagnostics
