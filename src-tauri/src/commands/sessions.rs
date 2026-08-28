use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct CreateSessionInput {
    pub project_id: String,
    pub name: String,
    pub pipes_json: Option<String>,
    pub files_metadata: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateSessionInput {
    pub session_id: String,
    pub updates: serde_json::Value,
}

#[derive(Deserialize)]
pub struct DeleteSessionInput {
    pub session_id: String,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub directory_path: String,
    pub pipes_json: Option<String>,
    pub fps: f64,
    pub resolution: String,
    pub orientation: String,
    pub total_generated_frames: u32,
}

#[tauri::command]
pub async fn create_session(
    input: CreateSessionInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.create_session(&input.project_id, &input.name, input.pipes_json.as_deref(), input.files_metadata.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    input: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let project_id = input.get("project_id")
        .and_then(|v| v.as_str())
        .ok_or("project_id is required")?
        .to_string();
    let db = state.db.lock().await;
    db.list_sessions(&project_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_session(
    input: UpdateSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_session(&input.session_id, &input.updates)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    input: DeleteSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_session(&input.session_id).await.map_err(|e| e.to_string())
}
