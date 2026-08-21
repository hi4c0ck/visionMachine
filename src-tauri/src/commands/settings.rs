use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn get_storage_path() -> String {
    std::env::temp_dir().join("VisionMachine")
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub async fn get_database_stats(db: State<'_, Database>) -> Result<serde_json::Value, String> {
    db.stats()
        .await
        .map_err(|e| e.to_string())
}
