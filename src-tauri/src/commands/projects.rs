use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub directory_path: Option<String>,
    pub profile_id: String,
}

#[derive(Deserialize)]
pub struct ListProjectsInput {
    pub profile_id: String,
}

#[tauri::command]
pub async fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.create_project(
        &input.profile_id,
        &input.name,
        input.directory_path.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    input: ListProjectsInput,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().await;
    db.list_projects(&input.profile_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct DeleteProjectInput {
    pub project_id: String,
}

/// Delete a project and cascade-remove its sessions, composers, files, and
/// generated frames (FK-safe order, single transaction).
#[tauri::command]
pub async fn delete_project(
    input: DeleteProjectInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_project(&input.project_id)
        .await
        .map_err(|e| e.to_string())
}
