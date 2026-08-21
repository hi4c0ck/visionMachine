use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn create_session(
    project_id: String,
    name: String,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    db.create_session(&project_id, &name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_composer(
    session_id: String,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    db.get_composer(&session_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_composer(
    session_id: String,
    config_json: String,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    db.update_composer(&session_id, &config_json)
        .await
        .map_err(|e| e.to_string())
}
