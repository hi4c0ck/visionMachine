# File Management Pattern

Add project files that are auto-included when creating sessions.

## Schema

```sql
CREATE TABLE project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT DEFAULT 'other',
    file_size INTEGER DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

## Backend Commands

**artifacts.rs** - File CRUD:
```rust
#[tauri::command]
pub async fn add_project_file(
    input: AddFileInput,  // { project_id, file_name, file_path, file_type?, file_size? }
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.add_file(&input.project_id, &input.file_name, &input.file_path,
                input.file_type.as_deref().unwrap_or("other"),
                input.file_size.unwrap_or(0)).await?
}

#[tauri::command]
pub async fn list_project_files(
    input: ListFilesInput,  // { project_id }
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().await;
    db.list_files(&input.project_id).await?
}

#[tauri::command]
pub async fn delete_project_file(
    input: DeleteFileInput,  // { file_id }
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_file(&input.file_id).await?
}
```

## Frontend Usage

**Workspace.svelte** - Load files on project load:
```typescript
let userProjectsFiles = $state<Record<string, ProjectFile[]>>({});

// In loadProjects(), after loading projects:
for (const proj of projects) {
  const filesResult = await invoke('list_project_files', { projectId: proj.id });
  const files = (filesResult as any[]).map((f: any) => ({
    id: f.id,
    fileName: f.file_name,
    filePath: f.file_path,
    fileType: f.file_type,
    fileSize: f.file_size,
    addedAt: new Date(f.added_at).getTime()
  }));
  userProjectsFiles = { ...userProjectsFiles, [proj.id]: files };
}
```

## Auto-Include on Session Creation

**Workspace.svelte** - Include files in session:
```typescript
async function handleCreateSession(projectId: string) {
  const projectFiles = userProjectsFiles[projectId] || [];
  const filesMetadata = projectFiles.map(f => ({
    id: f.id,
    fileName: f.fileName,
    filePath: f.filePath,
    fileType: f.fileType,
    fileSize: f.fileSize
  }));

  const result = await invoke('create_session', {
    input: {
      project_id: projectId,
      name: sessionName,
      pipes_json: pipesJson,
      files_metadata: filesMetadata.length > 0 ? JSON.stringify(filesMetadata) : null
    }
  });
}
```

**sessions.rs** - Accept files_metadata:
```rust
#[derive(Deserialize)]
pub struct CreateSessionInput {
    pub project_id: String,
    pub name: String,
    pub pipes_json: Option<String>,
    pub files_metadata: Option<String>,  // JSON array of file metadata
}
```

**db.rs** - Store in sessions table:
```rust
pub async fn create_session(
    &self, 
    project_id: &str, 
    name: &str, 
    pipes_json: Option<&str>,
    files_metadata: Option<&str>  // Added parameter
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO sessions (id, project_id, name, pipes_json, files_metadata) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(project_id)
    .bind(name)
    .bind(pipes_json)
    .bind(files_metadata)
    .execute(&self.pool).await?;
    Ok(id)
}
```

## Migration

Add to `run_additive_columns()`:
```rust
"ALTER TABLE sessions ADD COLUMN files_metadata TEXT",
"CREATE TABLE IF NOT EXISTS project_files (...)"
```

## Pitfalls

- **Forgetting to register commands**: Add to `lib.rs` generate_handler list:
  ```rust
  commands::artifacts::add_project_file,
  commands::artifacts::list_project_files,
  commands::artifacts::delete_project_file,
  ```

- **Missing module declaration**: Add to `commands/mod.rs`:
  ```rust
  pub mod artifacts;
  ```

- **files_metadata format**: Must be JSON string if provided, null if empty
  ```typescript
  files_metadata: filesMetadata.length > 0 ? JSON.stringify(filesMetadata) : null
  ```

- **Cascading deletes**: project_files deletes when project deletes (ON DELETE CASCADE)

## Verification

1. Add file to project → check project_files table
2. Create session → check files_metadata column in sessions table
3. Delete project → verify project_files cascade deleted
4. List files → verify correct project files returned
