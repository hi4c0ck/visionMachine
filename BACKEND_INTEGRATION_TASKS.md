# Backend Integration Task List — VisionMachine v0.3.0

**Created:** 2026-08-26  
**Status:** Ready for fresh session implementation  
**Current Version:** 0.2.0 (stub backend, no real persistence)

---

## Critical Context

### What Works
- ✅ SQLite database initialization (empty file created at startup)
- ✅ Tauri app launches without crash
- ✅ Frontend components exist (ComposerPanel, ProjectsPanel, Workspace)
- ✅ 32/32 unit tests passing
- ✅ Pipe management UI (add/delete/duplicate/move pipes)

### What's Broken / Missing
- ❌ Backend commands are **STUBS** — they return dummy data, never touch DB
- ❌ `create_project()` returns random UUID, doesn't save to SQLite
- ❌ `list_projects()` always returns `[]`
- ❌ `create_session()` returns random UUID, doesn't save to SQLite
- ❌ `list_sessions()` always returns `[]`
- ❌ `update_session()` does nothing
- ❌ `delete_session()` does nothing
- ❌ Frontend falls back to localStorage because backend fails silently
- ❌ No schema migrations run (tables don't exist in DB)

### Root Cause
The Rust commands were written but never connected to the database. The `AppState` struct has no `db` field. Commands take `State<'_, AppState>` but ignore it.

---

## Implementation Tasks

### Task 1: Add Database to AppState

**File:** `src-tauri/src/lib.rs`

```rust
#[derive(Clone)]
pub struct AppState {
    pub username: Arc<std::sync::Mutex<Option<String>>>,
    pub preflight_report: Arc<std::sync::Mutex<PreflightReport>>,
    pub db: Arc<Mutex<Database>>,  // ADD THIS
}

impl AppState {
    pub fn new(db: Database) -> Self {  // ADD PARAM
        Self {
            username: Arc::new(std::sync::Mutex::new(None)),
            preflight_report: Arc::new(std::sync::Mutex::new(PreflightReport::new())),
            db: Arc::new(std::sync::Mutex::new(db)),  // ADD THIS
        }
    }
}
```

In `run()`, after creating the pool:
```rust
let db = Database::from_pool(pool);
app.manage(Arc::new(AppState::new(db)));
```

---

### Task 2: Implement Session CRUD Commands

**File:** `src-tauri/src/commands/sessions.rs`

Replace stubs with real implementations:

```rust
use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateSessionInput {
    pub project_id: String,
    pub name: String,
    pub pipes_json: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateSessionInput {
    pub session_id: String,
    pub updates: serde_json::Value,
}

#[tauri::command]
pub async fn create_session(
    input: CreateSessionInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_session(&input.project_id, &input.name, input.pipes_json.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_sessions(&project_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_session(
    input: UpdateSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_session(&input.session_id, &input.updates)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_session(&session_id).await.map_err(|e| e.to_string())
}
```

---

### Task 3: Implement Project CRUD Commands

**File:** `src-tauri/src/commands/projects.rs`

```rust
use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateProjectInput {
    pub profile_id: String,
    pub name: String,
    pub directory_path: Option<String>,
}

#[tauri::command]
pub async fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_project(&input.profile_id, &input.name, input.directory_path.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_projects(&profile_id).await.map_err(|e| e.to_string())
}
```

---

### Task 4: Run Migrations on Startup

**File:** `src-tauri/src/lib.rs`

After creating the DB connection, run migrations:

```rust
// In setup handler:
rt.block_on(async {
    db.migrate().await.map_err(|e| format!("Migration failed: {}", e))?;
    Ok::<(), String>(())
})?;
```

**OR** add migration call in `Database::new()`:

```rust
impl Database {
    pub async fn new(path: &str) -> Result<Self, String> {
        // ... existing connection code ...
        
        // Run migrations
        Self::migrate(&pool).await?;
        
        Ok(Self { pool })
    }
    
    async fn migrate(pool: &SqlitePool) -> Result<(), String> {
        sqlx::query("CREATE TABLE IF NOT EXISTS profiles (...)")
            .execute(pool).await.map_err(|e| e.to_string())?;
        // ... other tables ...
        Ok(())
    }
}
```

---

### Task 5: Update Frontend to Handle Backend Responses

**File:** `src/components/Workspace.svelte`

The frontend already calls `invoke()` — just fix the type handling:

```typescript
async function loadProjects() {
    try {
        const result = await invoke('list_projects', { profileId: '' });
        projects = (result as any[]).map(p => ({
            id: p.id,
            name: p.name,
            createdAt: new Date(p.created_at).getTime(),
            directoryPath: p.directory_path || '',
            sessions: [],
            totalGenerations: 0,
            updatedAt: Date.now(),
            profileId: p.profile_id || ''
        })) as ProjectData[];
    } catch (e) {
        console.error('[Workspace] Failed to load projects:', e);
        // Fallback to localStorage
    }
}
```

Also fix `handleCreateSession` to use real session ID from backend.

---

### Task 6: Verify End-to-End Flow

Test this sequence manually:
1. Login with username "testuser"
2. Click "Create Project" → Verify DB has row in `projects` table
3. Click "+" on project → Create session → Verify DB has row in `sessions` table
4. Click session → Composer opens
5. Modify session (change FPS, add pipe) → Verify `update_session` writes to DB
6. Logout/login as different user → Verify no cross-contamination

---

## Files to Modify

| File | Action |
|------|--------|
| `src-tauri/src/lib.rs` | Add `db` field to AppState, run migrations |
| `src-tauri/src/commands/sessions.rs` | Replace stubs with real impl |
| `src-tauri/src/commands/projects.rs` | Replace stubs with real impl |
| `src/components/Workspace.svelte` | Fix type handling for backend responses |
| `src-tauri/src/storage/db.rs` | Ensure migrations are public |

---

## Success Criteria for v0.3.0

- [ ] `list_projects()` returns actual projects from SQLite
- [ ] `create_project()` saves to SQLite and returns persisted ID
- [ ] `list_sessions()` returns actual sessions from SQLite
- [ ] `create_session()` saves to SQLite and returns persisted ID
- [ ] `update_session()` persists changes to SQLite
- [ ] `delete_session()` removes from SQLite
- [ ] Database schema is created automatically on first run
- [ ] All CRUD operations survive app restart
- [ ] Build succeeds with `npm run tauri build`

---

## Rollback Plan

If integration breaks things:
```bash
git revert HEAD~1..HEAD  # Revert the v0.2.0 commit
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0
```

Then re-commit properly after full integration works.

---

*Last updated: 2026-08-26 01:08 UTC+3*
