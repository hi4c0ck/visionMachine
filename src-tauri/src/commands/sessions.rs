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
    let db = state.db.as_ref();
    db.create_session(&input.project_id, &input.name, input.pipes_json.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.as_ref();
    db.list_sessions(&project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_session(
    input: UpdateSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.as_ref();
    db.update_session(&input.session_id, &input.updates)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.as_ref();
    db.delete_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}
