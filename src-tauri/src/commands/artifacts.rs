use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn create_artifact(
    session_id: String,
    artifact_type: String,
    file_path: String,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    db.create_artifact(&session_id, &artifact_type, &file_path)
        .await
        .map_err(|e| e.to_string())
}
