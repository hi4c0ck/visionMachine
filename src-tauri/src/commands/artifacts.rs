use crate::AppState;
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct AddFileInput {
    pub project_id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_type: Option<String>,
    pub file_size: Option<i64>,
}

#[derive(Deserialize)]
pub struct ListFilesInput {
    pub project_id: String,
}

#[derive(Deserialize)]
pub struct DeleteFileInput {
    pub file_id: String,
}

#[tauri::command]
pub async fn add_project_file(
    input: AddFileInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.add_file(
        &input.project_id,
        &input.file_name,
        &input.file_path,
        input.file_type.as_deref().unwrap_or("other"),
        input.file_size.unwrap_or(0),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_project_files(
    input: ListFilesInput,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().await;
    db.list_files(&input.project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_project_file(
    input: DeleteFileInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_file(&input.file_id)
        .await
        .map_err(|e| e.to_string())
}
