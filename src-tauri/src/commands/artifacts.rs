use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn create_artifact(
    session_id: String,
    artifact_type: String,
    file_path: String,
    db: State<'_, Database>,
) -> Result<serde_json::Value, String> {
    db.create_artifact(Some(&session_id), None, None, &artifact_type, &file_path, None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_artifacts_by_session(
    session_id: String,
    db: State<'_, Database>,
) -> Result<Vec<serde_json::Value>, String> {
    db.list_artifacts_by_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}
