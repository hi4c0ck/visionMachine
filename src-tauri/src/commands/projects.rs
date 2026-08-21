use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn create_project(
    profile_id: String,
    name: String,
    description: Option<String>,
    db: State<'_, Database>,
) -> Result<serde_json::Value, String> {
    db.create_project(&profile_id, &name, description.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project(
    id: String,
    db: State<'_, Database>,
) -> Result<serde_json::Value, String> {
    db.get_project(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    profile_id: String,
    db: State<'_, Database>,
) -> Result<Vec<serde_json::Value>, String> {
    db.list_projects(&profile_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_project(
    id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.delete_project(&id)
        .await
        .map_err(|e| e.to_string())
}
