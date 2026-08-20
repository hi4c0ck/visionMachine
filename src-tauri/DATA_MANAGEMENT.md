# VisionMachine Data Management System

## Overview

VisionMachine uses a layered data management architecture with SQLite local storage, MVI-style ViewModels, and section controllers for each UI area. The system supports configurable storage paths (with app restart on change), async composer writes, and hierarchical project/session/composer data.

## Architecture

```
Profile
├── Project
│   └── Session
│       ├── Composer (Pipes → PromptRows)
│       └── Artifacts (images, videos, configs)
└── Settings (including storage path)
```

### Key Abstractions

- **Profile**: User-level configuration, can have multiple profiles
- **Project**: Top-level container with name, logo, and metadata
- **Session**: Concrete work environment with state and composer
- **Composer**: Set of named Pipes for video generation via taskId chain
- **Pipe**: Segment of a composition with config, keyframes, and prompt tree
- **PromptRow**: XML-tagged value with nesting/inheritance (composition pattern)

## Storage Layer

### SQLite Database

Located at `<storage_path>/visionmachine.db` by default. The storage path is:
- **Default**: Windows temp directory (`%TEMP%\VisionMachine`)
- **Configurable**: Via Settings panel; requires app restart to apply

### Schema Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles with settings JSON |
| `projects` | Projects linked to profiles |
| `sessions` | Work sessions with state machine |
| `composers` | Serialized composer YAML/JSON config |
| `artifacts` | Linked files (images, videos, texts, configs) |
| `app_settings` | Global app settings (e.g., storage_path) |

### Database Access

```rust
let db = Database::new(storage_path).await?;

// CRUD operations
let profile = db.create_profile("John", Some("john@example.com")).await?;
let projects = db.list_projects(&profile.id).await?;
```

## Model Layer (ViewModels - MVI Pattern)

### Base ViewModel

All section ViewModels inherit from a base `ViewModel` that provides:
- Observable loading state
- Opacity controls (for fade transitions)
- Visibility toggles (show/hide)
- Container size management
- Error handling

### Section Controllers

Each UI section has a controller wrapping its ViewModel:

| Controller | ViewModel | Responsibilities |
|------------|-----------|------------------|
| `FrameController` | `FrameViewModel` | GPU rendering layer, video playback, frame navigation |
| `ProjectsController` | `ProjectViewModel` | Project/session list, expansion state |
| `ProfileController` | `ProfileViewModel` | Profile switching, avatar display |
| `ComposerController` | `ComposerViewModel` | Dual-instance composer management |
| `ToolsController` | `ToolsViewModel` | Tool registration and activation |

### FrameViewModel Details

Two-layer view model:
```rust
pub struct FrameViewModel {
    pub base: ViewModel,           // Loading, opacity, visibility
    pub current_frame_index: watch::Sender<usize>,
    pub video_playing: watch::Sender<bool>,
    pub resolution: Mutex<(u32, u32)>,
    pub video_duration: watch::Sender<f64>,
}
```

- **Layer 1 (Background)**: Heavy GPU render for video/frames
- **Layer 2 (Overlay)**: Control panel with opacity masking
- Touch events pass through overlay for frame swiping

## Composer Data Model

### Pipe Structure

```yaml
id: pipe-001
name: "Opening Shot"
order: 1
config:
  model: "stable-video-diffusion"
  temperature: 0.5
  max_tokens: 1024
keyframes:
  - index: 1
    file_path: "C:/data/keyframe1.png"
prompt_rows:
  - id: root
    tag: "subject"
    value: "mountain landscape"
    weight: 1.0
  - id: child-1
    tag: "style"
    value: "cinematic"
    parent_id: root
```

### Prompt Tree

The `PromptTree` class manages hierarchical prompt rows:
- Each row has a tag, value, weight, parent reference, and children list
- XML-like serialization: `<tag>value<tag>`
- Weight prefix: `(tag:weight)` format when weight ≠ 1.0

### Async Write Mode

The `AsyncWriter` prevents UI blocking during file operations:

```rust
let (writer, handle) = AsyncWriter::new("composer.yaml", WriteFormat::YAML);

// Non-blocking save
writer.save(&composer_json).await?;

// Append a pipe
writer.append_pipe(&pipe_json).await?;

// Update existing pipe
writer.update_pipe("pipe-001", &new_content).await?;
```

## Data Flow

### Creating a New Project

1. User clicks "+" in Projects sidebar
2. `ProjectsController` broadcasts `Intent::LoadData`
3. Tauri command `create_project` inserts into SQLite
4. Frontend receives new project via event
5. ViewModel updates `selected_project_id` watch channel

### Starting a Session

1. User creates session within project
2. `create_session` command runs with FK constraint to project
3. Auto-creates empty composer if none exists
4. Session state set to `"idle"`
5. Composer loaded asynchronously into `ComposerViewModel`

### Composer Edit Flow

1. User modifies pipe parameters in UI
2. Changes queued as `Intent::Custom("update-pipe")`
3. `debounce(300ms)` triggers async write
4. `AsyncWriter` persists to YAML/JSON file
5. Tauri plugin updates SQLite `composers` table
6. Other UI components observe ViewModel changes

## MVI State Machine

### App-Level State Transitions

```
[Idle] → [Loading] → [Loaded] → [Generating] → [Paused] → [Completed]
   ↓         ↓                      ↓
[Error] ← [Hidden]              [Error]
```

### Intent Types

| Intent | Description |
|--------|-------------|
| `LoadData` | Fetch from SQLite/async store |
| `UpdateData(key)` | Patch specific field |
| `DeleteData(id)` | Remove entity |
| `SwitchState` | Transition state machine |
| `Refresh` | Reload current view |
| `Custom` | App-specific action |

## Files Reference

| File | Purpose |
|------|---------|
| `migrations/0001_create_schema.sql` | SQL schema for all tables |
| `src/storage/db.rs` | Database wrapper with CRUD methods |
| `src/storage/settings.rs` | Storage path management |
| `src/models/viewmodel.rs` | All ViewModel classes |
| `src/models/composer.rs` | Composer, Pipe, PromptRow structs |
| `src/models/async_writer.rs` | Async file writer |
| `src/controllers/*.rs` | Section controllers |
| `src/commands/*.rs` | Tauri command handlers |

## Configuration

### tauri.conf.json

```json
{
  "plugins": {
    "sql": {
      "preload": ["sqlite:.vm_data/visionmachine.db"]
    }
  }
}
```

### Default Storage Path

```rust
// src/storage/settings.rs
fn get_default_storage_path() -> String {
    std::env::temp_dir()
        .join("VisionMachine")
        .to_string_lossy()
        .to_string()
}
```

## Error Handling

All database operations return `Result<T, Box<dyn Error>>`. UI errors are stored in ViewModel's `error` field and displayed to users.

## Security Notes

- SQLite database is local-only, no network exposure
- File paths are validated before use (no path traversal)
- Artifacts are scanned for type restrictions
- Migration system ensures schema integrity
