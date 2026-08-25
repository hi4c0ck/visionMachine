# VisionMachine Architecture Documentation

**Version:** 0.1.2  
**Date:** 2026-08-25  
**Status:** Backend Active, Frontend Migration Pending

---

## Executive Summary

VisionMachine is a Tauri 2 + Svelte 5 desktop application for AI-powered video generation composition. The architecture has been modernized with a proper SQLite backend, but the frontend still uses localStorage as the primary persistence layer. This document describes the current state and the migration path.

---

## 1. Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Runtime** | Tauri 2 | 2.11.5 |
| **Frontend** | Svelte 5 | Runes mode |
| **Language** | TypeScript | Strict mode |
| **Backend** | Rust | 2021 edition |
| **Database** | SQLite + sqlx | 0.8.6 |
| **Build Tool** | Vite | 8.2.2 |
| **Package Manager** | npm | - |
| **Testing** | Vitest | v3.2.7 |
| **UI Preview** | WebView2 | Chromium-based |

---

## 2. Architecture Overview

### 2.1 Current State (Hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  Workspace   │  │ComposerPanel│  │  ProjectsPanel       │ │
│  │  .svelte    │  │   .svelte   │  │   .svelte            │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘ │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                    localStorage                           │
│              (vm-{user}-{key})                             │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │    Tauri Backend         │
              │  (Rust / SQLite)         │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │   SQLite Database       │
              │  %LOCALAPPDATA%\        │
              │  com.visionmachine.     │
              │  desktop\               │
              │  visionmachine.db       │
              └─────────────────────────┘
```

### 2.2 Target State (Full Backend)

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  Workspace   │  │ComposerPanel│  │  ProjectsPanel       │ │
│  │  .svelte    │  │   .svelte   │  │   .svelte            │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘ │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   invoke()                                │
│                  Tauri Commands                              │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │    Tauri Backend         │
              │  (Rust / SQLite)         │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────┐
              │   SQLite Database       │
              │  Per-user isolation     │
              └─────────────────────────┘
```

---

## 3. Data Models

### 3.1 SQLite Schema

```sql
-- Profiles (User accounts)
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Projects (Video projects)
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    directory_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Sessions (Composition sessions within projects)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    fps INTEGER DEFAULT 24,
    resolution TEXT DEFAULT '720p',
    orientation TEXT DEFAULT 'horizontal',
    pipes_json TEXT,          -- JSON array of PipeRow objects
    total_generated_frames INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### 3.2 TypeScript Types (`src/types/app.ts`)

```typescript
// Core types
export type TagType = 
    | 'scene'      // Scene description
    | 'camera'     // Camera position/movement
    | 'rotation'   // Rotation transforms
    | 'lighting'   // Lighting setup
    | 'effect'     // Visual effects
    | 'zoom'       // Zoom transitions
    | 'transition'; // Scene transitions

export type ResolutionPreset = '480p' | '720p' | '1080p';
export type Orientation = 'horizontal' | 'vertical';
export type KeyframeType = 'url' | 'txt2img' | 'img2img';

// Session data structure
export interface SessionData {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    directoryPath: string;
    pipes: PipeRow[];
    fps: number;
    resolution: ResolutionPreset;
    orientation: Orientation;
    totalGeneratedFrames: number;
}

export interface PipeRow {
    id: string;
    lengthFrames: number;
    keyframes: PipeKeyframe[];
    qValue: number;
    cValue: number;
    globalPrompt?: PipeGlobalPrompt;
    segments: PromptSegment[];
}

export interface ProjectData {
    id: string;
    name: string;
    createdAt: number;
    directoryPath: string;
    sessions: SessionData[];
    totalGenerations: number;
}
```

### 3.3 Data Flow Comparison

| Aspect | Current (localStorage) | Target (SQLite) |
|--------|----------------------|-----------------|
| **Storage Location** | Browser localStorage | SQLite file |
| **User Isolation** | Key prefix `vm-{user}-` | Separate DB per user |
| **Persistence** | Cleared on browser reset | Durable, ACID |
| **Query Capability** | None (linear scan) | Full SQL queries |
| **Schema Validation** | Runtime only | Compile-time + runtime |
| **Migration Path** | Manual JSON import | sqlx migrations |

---

## 4. Component Architecture

### 4.1 Frontend Components

```
src/components/
├── App.svelte           # Root component, auth flow
├── Workspace.svelte     # Main layout orchestration
├── ComposerPanel.svelte # Video composition UI
├── ProjectsPanel.svelte # Left sidebar, project/session tree
├── ToolsPanel.svelte    # Right sidebar, generation tools
├── Frame.svelte         # Individual frame preview
├── ProfilePanel.svelte  # User profile display
└── ErrorHandler.svelte  # Global error boundary
```

### 4.2 Backend Modules

```
src-tauri/src/
├── lib.rs               # Tauri app entry point
├── preflight.rs         # Environment checks
├── logger.rs            # Logging configuration
├── commands/
│   ├── mod.rs           # Module exports
│   ├── auth.rs          # Login/logout commands
│   ├── projects.rs      # Project CRUD
│   ├── sessions.rs      # Session CRUD
│   └── composer.rs      # [UNUSED] Composer generation
├── storage/
│   ├── mod.rs           # Module exports
│   └── db.rs            # SQLite database layer
└── tests/               # Integration tests
```

### 4.3 Component Communication

**Current (localStorage):**
```typescript
// Workspace.svelte
function saveProjects() {
    localStorage.setItem('vm-projects-user1', JSON.stringify(projects));
}

// ProjectsPanel.svelte - fires event
onselectsession={handleSessionSelect}

// Workspace.svelte - receives event
function handleSessionSelect(sessionId: string) {
    selectedSessionId = sessionId;
    saveProjects();
}
```

**Target (Tauri Commands):**
```typescript
// Workspace.svelte
async function saveProjects() {
    await invoke('save_projects', { projects });
}

// Tauri backend
#[tauri::command]
async fn save_projects(projects: Vec<ProjectData>) {
    // Serialize to SQLite
}
```

---

## 5. Tauri Commands API

### 5.1 Registered Commands

| Command | Parameters | Returns | Description |
|---------|------------|---------|-------------|
| `login_user` | `{ username: string }` | `string` | Validates and initializes session |
| `logout_user` | - | `()` | Clears session |
| `get_app_info` | - | `json` | Returns app metadata |
| `get_preflight_report` | - | `PreflightReport` | Environment health check |
| `create_project` | `{ name, directory_path? }` | `string` (projectId) | Creates new project |
| `list_projects` | - | `Project[]` | Lists all projects |
| `create_session` | `{ project_id, name, pipes_json? }` | `string` (sessionId) | Creates new session |
| `list_sessions` | `{ project_id }` | `Session[]` | Lists sessions for project |
| `update_session` | `{ session_id, updates }` | `()` | Updates session fields |
| `delete_session` | `{ session_id }` | `()` | Removes session |

### 5.2 Database Layer API

```rust
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(path: &str) -> Result<Self, String>;
    pub async fn migrate(&self) -> Result<(), String>;
    
    // Profiles
    pub async fn create_profile(&self, name: &str) -> Result<String, String>;
    pub async fn list_profiles(&self) -> Result<Vec<serde_json::Value>, String>;
    
    // Projects
    pub async fn create_project(&self, profile_id: &str, name: &str, directory_path: Option<&str>) -> Result<String, String>;
    pub async fn list_projects(&self, profile_id: &str) -> Result<Vec<serde_json::Value>, String>;
    
    // Sessions
    pub async fn create_session(&self, project_id: &str, name: &str, pipes_json: Option<&str>) -> Result<String, String>;
    pub async fn list_sessions(&self, project_id: &str) -> Result<Vec<serde_json::Value>, String>;
    pub async fn update_session(&self, session_id: &str, updates: &serde_json::Value) -> Result<(), String>;
    pub async fn delete_session(&self, session_id: &str) -> Result<(), String>;
}
```

---

## 6. Build Pipeline

### 6.1 Development Mode
```bash
npm run tauri dev
# → Starts Vite dev server on port 1420
# → Tauri loads from http://localhost:1420
# → HMR works for .svelte files
```

### 6.2 Production Build
```bash
npm run build          # Builds frontend to dist/
npm run tauri build    # Compiles Rust, bundles frontend, creates MSI
```

### 6.3 Output Locations

| Artifact | Path | Size |
|----------|------|------|
| **Debug EXE** | `src-tauri/target/debug/vision-machine.exe` | ~25 MB |
| **Release EXE** | `src-tauri/target/release/vision-machine.exe` | 4.25 MB |
| **MSI Installer** | `src-tauri/target/release/bundle/msi/VisionMachine_0.1.2_x64_en-US.msi` | 1.6 MB |

---

## 7. Known Issues & Technical Debt

### 7.1 Critical: Frontend Not Using Backend

**Symptom:** Changes to backend code don't affect app behavior.

**Root Cause:** `Workspace.svelte` uses `localStorage` directly instead of calling Tauri commands.

**Fix Required:**
1. Replace `localStorage.getItem/setItem` calls with `invoke()` calls
2. Add proper error handling for backend failures
3. Implement migration from localStorage to SQLite on first launch

### 7.2 Stale Process Management

**Symptom:** User edits files but changes don't appear in running app.

**Root Cause:** Multiple processes, stale caches, or wrong artifact being launched.

**Mitigation Script:**
```powershell
# Kill all related processes
Get-Process | Where-Object { $_.ProcessName -like '*node*' -or $_.ProcessName -like '*vite*' -or $_.ProcessName -like '*vision*' } | Stop-Process -Force

# Clear caches
Remove-Item node_modules/.vite -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue

# Clean rebuild
npm run build
npm run tauri build
```

### 7.3 Dead Code in Backend

**Files with unused implementations:**
- `commands/composer.rs` - Generation logic (not registered)
- `controllers/*` - Controller layer (not used)
- `models/*` - Model definitions (not referenced)

**Recommendation:** Delete these files or integrate them when ready.

### 7.4 Configuration Drift

**Issue:** Two build output directories exist:
- `dist/` - Used by Vite production build
- `src-tauri/dist/` - Should be symlinked or same as above

**Current Config:**
```json
// src-tauri/tauri.conf.json
{
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
}
```

---

## 8. Testing Status

### 8.1 Unit Tests (Vitest)

| Test File | Tests | Status |
|-----------|-------|--------|
| `Workspace.test.ts` | 7 | ✅ Pass |
| `ProjectsPanel.test.ts` | 4 | ✅ Pass |
| `ComposerPanel.test.ts` | 4 | ✅ Pass |
| `App.test.ts` | 4 | ✅ Pass |
| `session-selection-bug.test.ts` | 3 | ✅ Pass |
| `data-persistence.test.ts` | 10 | ✅ Pass |
| **Total** | **32** | **32/32 Passing** |

### 8.2 Backend Tests

Not yet implemented. Rust tests would cover:
- Database initialization
- CRUD operations
- Migration enforcement

---

## 9. Migration Roadmap

### Phase 1: Backend Foundation (✅ Complete)
- [x] SQLite database layer
- [x] Tauri command registration
- [x] Basic CRUD operations
- [x] Schema migrations

### Phase 2: Frontend Integration (TODO)
- [ ] Replace localStorage with Tauri commands
- [ ] Add loading/error states
- [ ] Implement auto-migration from localStorage
- [ ] Add proper typing for backend responses

### Phase 3: Advanced Features
- [ ] Profile management UI
- [ ] Real-time sync indicators
- [ ] Offline detection
- [ ] Batch operations

### Phase 4: Cleanup
- [ ] Remove dead code
- [ ] Consolidate duplicate implementations
- [ ] Add comprehensive test coverage

---

## 10. Debug Checklist

When issues occur, verify:

1. **Process State**
   ```powershell
   Get-Process | Where-Object { $_.ProcessName -like '*node*' -or $_.ProcessName -like '*vision*' }
   ```

2. **Port Conflicts**
   ```powershell
   netstat -ano | findstr :1420
   ```

3. **Cache Status**
   ```powershell
   Test-Path 'node_modules/.vite'  # Should not exist after clean
   Test-Path 'dist'                 # Should have latest files
   ```

4. **Build Timestamps**
   ```powershell
   Get-ChildItem 'dist' -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 5
   ```

5. **Database File**
   ```powershell
   Test-Path "$env:LOCALAPPDATA\com.visionmachine.desktop\visionmachine.db"
   ```

---

## 11. Quick Reference

### Useful Commands

```bash
# Run in development mode with HMR
npm run tauri dev

# Build for production
npm run build && npm run tauri build

# Run tests
npm test

# Check running processes
Get-Process | Where-Object { $_.ProcessName -like '*vision*' }

# Clean everything
Remove-Item dist,node_modules/.vite,src-tauri/target -Recurse -Force
```

### Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Backend entry point, command registration |
| `src-tauri/src/storage/db.rs` | SQLite database implementation |
| `src/components/Workspace.svelte` | Main layout, currently uses localStorage |
| `src/components/ComposerPanel.svelte` | Composer UI with pipe management |
| `src-tauri/tauri.conf.json` | Tauri configuration |
| `vite.config.ts` | Vite development configuration |

---

## Appendix A: Build Artifacts

### Current Release (v0.1.2)

| Artifact | Path | Size | Last Built |
|----------|------|------|------------|
| **EXE** | `src-tauri\target\release\vision-machine.exe` | 4.25 MB | 2026-08-25 23:26 |
| **MSI** | `src-tauri\target\release\bundle\msi\VisionMachine_0.1.2_x64_en-US.msi` | 1.6 MB | 2026-08-25 23:26 |

### Test Results

```
✓ 32/32 unit tests passing
✓ Backend compiles successfully
✓ SQLite migrations working
✓ Tauri commands registered
```

---

## Appendix B: Known Issues

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| K1 | Frontend uses localStorage instead of backend | High | ⚠️ Pending migration |
| K2 | Dead code in controllers/models directories | Low | ℹ️ Documented |
| K3 | No error surface for validation failures | Medium | ⚠️ UI shows empty state only |
| K4 | Pipe operations lack undo support | Low | ℹ️ Feature request |

---

## Appendix C: Migration Checklist

When frontend is ready to use backend:

1. [ ] Replace all `localStorage.getItem/setItem` with `invoke()` calls
2. [ ] Add loading states during async operations
3. [ ] Implement proper error boundaries
4. [ ] Add auto-migration from localStorage on first run
5. [ ] Update type definitions to match backend responses
6. [ ] Add integration tests for backend communication
7. [ ] Remove localStorage fallback code
8. [ ] Update documentation

---

*Last updated: 2026-08-25 23:56 UTC+3*
