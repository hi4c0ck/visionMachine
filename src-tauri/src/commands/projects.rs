use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateProjectInput {
    pub profile_id: String,
    pub name: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    db.create_project(&input.profile_id, &input.name, input.description.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().await;
    db.list_projects(&profile_id)
        .await
        .map_err(|e| e.to_string())
}
