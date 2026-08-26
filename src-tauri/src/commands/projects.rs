use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub directory_path: Option<String>,
}

#[tauri::command]
pub async fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Use "default" profile_id for anonymous users
    let db = state.db.lock().await;
    db.create_project("default", &input.name, input.directory_path.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().await;
    db.list_projects("default").await.map_err(|e| e.to_string())
}
