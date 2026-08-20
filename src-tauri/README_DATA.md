# VisionMachine Data Management System

## Quick Start

### 1. Initialize Storage
```rust
use visionmachine_lib::storage::{StorageManager, Database};

// Get default path (%TEMP%\VisionMachine)
let storage_path = StorageManager::get_default_storage_path();

// Create database
let db = Database::new(&storage_path).await?;

// Initialize manager
let manager = StorageManager::new(db, app_handle);
manager.initialize().await?;
```

### 2. Profile Operations
```rust
// Create profile
let profile = manager.db.lock().await
    .create_profile("John Doe", Some("john@example.com"))
    .await?;

// List profiles
let profiles = manager.db.lock().await
    .list_profiles()
    .await?;

// Logout clears active sessions
sqlx::query("UPDATE sessions SET state = 'idle'")
    .execute(&mut *db)
    .await?;
```

### 3. Project & Session Flow
```rust
// Create project under profile
let project = manager.db.lock().await
    .create_project(&profile.id, "My First Project", None)
    .await?;

// Create session under project
let session = manager.db.lock().await
    .create_session(&project.id, "Video Generation")
    .await?;
```

### 4. Composer Management
```rust
// Get or create composer
let composer = manager.db.lock().await
    .get_composer(&session.id)
    .await?;

// Update composer config
let config_json = serde_json::json!({
    "pipes": [/* pipe definitions */],
    "state": "ready"
}).to_string();

manager.db.lock().await
    .create_or_update_composer(&session.id, &config_json)
    .await?;
```

## Tauri Commands

### Available Commands
| Command | Parameters | Returns |
|---------|-----------|---------|
| `create_profile` | `{name, email?}` | `ProfileDto` |
| `get_profile` | `id` | `ProfileDto` |
| `list_profiles` | - | `Vec<ProfileDto>` |
| `update_profile` | `{id, input}` | `Result<(), String>` |
| `logout_profile` | - | `Result<(), String>` |
| `create_project` | `{profile_id, name, description?}` | `ProjectDto` |
| `get_project` | `id` | `ProjectDto` |
| `list_projects` | `profile_id` | `Vec<ProjectDto>` |
| `create_session` | `{project_id, name}` | `SessionDto` |
| `get_composer` | `session_id` | `ComposerDto` |
| `update_composer` | `{session_id, config_json}` | `ComposerDto` |
| `get_storage_path` | - | `String` |
| `set_storage_path` | `new_path` | `Result<(), String>` |

### Frontend Usage
```javascript
import { invoke } from '@tauri-apps/api/core';

// Create profile
const profile = await invoke('create_profile', {
    input: { name: 'John Doe', email: 'john@example.com' }
});

// Get all profiles
const profiles = await invoke('list_profiles');

// Logout
await invoke('logout_profile');

// Listen for logout event
window.addEventListener('profile_logged_out', () => {
    console.log('User logged out, redirect to login');
});
```

## Storage Configuration

### Default Path
- **Windows**: `%TEMP%\VisionMachine`
- **Linux**: `~/.cache/VisionMachine`
- **macOS**: `~/Library/Caches/com.visionmachine.app`

### Changing Storage Path
```rust
// Via Tauri command
await invoke('set_storage_path', { newPath: '/custom/path' });

// App will emit 'storage_path_changed' event
// Frontend should restart application
```

## File Structure

```
src-tauri/
├── migrations/
│   └── 0001_create_schema.sql    # Database schema
├── src/
│   ├── storage/
│   │   ├── db.rs                 # Database wrapper
│   │   └── settings.rs           # Storage manager
│   ├── models/
│   │   ├── viewmodel.rs          # MVI ViewModels
│   │   ├── composer.rs           # Composer/Pipe/PromptRow
│   │   └── async_writer.rs       # Async file writer
│   ├── controllers/
│   │   ├── frame.rs              # Frame controller
│   │   ├── projects.rs           # Projects controller
│   │   ├── profile.rs            # Profile controller
│   │   ├── composer.rs           # Composer controller
│   │   └── tools.rs              # Tools controller
│   ├── commands/
│   │   ├── profiles.rs           # Profile commands
│   │   ├── projects.rs           # Project commands
│   │   ├── sessions.rs           # Session commands
│   │   ├── artifacts.rs          # Artifact commands
│   │   └── settings.rs           # Settings commands
│   ├── lib.rs                    # Plugin registration
│   └── main.rs                   # Entry point
├── tauri.conf.json               # Plugin config
├── capabilities/
│   └── default.json              # SQL permissions
└── DATA_MANAGEMENT.md            # This file
```

## Key Design Decisions

1. **UUID v4** for all IDs (random, non-sequential)
2. **SQLx** for async database operations
3. **tokio** for async runtime
4. **serde** for serialization (JSON/YAML support)
5. **watch channels** for reactive ViewModel updates
6. **AsyncWriter** with temp-file atomic writes
7. **Cascade deletes** for data consistency

## Error Handling

All commands return `Result<T, String>`:
```rust
#[tauri::command]
async fn create_project(...) -> Result<ProjectDto, String> {
    // ... error handling ...
    .map_err(|e| e.to_string())
}
```

## Security Notes

- All file paths validated before use
- No path traversal vulnerabilities
- Local SQLite only (no network exposure)
- Migration system ensures schema integrity
