use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn create_session(
    project_id: String,
    name: String,
    db: State<'_, Database>,
) -> Result<serde_json::Value, String> {
    db.create_session(&project_id, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    project_id: String,
    db: State<'_, Database>,
) -> Result<Vec<serde_json::Value>, String> {
    db.list_sessions(&project_id)
        .await
        .map_err(|e| e.to_string())
}
