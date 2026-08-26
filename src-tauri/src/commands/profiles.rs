use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateProfileInput {
    pub name: String,
}

#[tauri::command]
pub async fn create_profile(
    input: CreateProfileInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.create_profile(&input.name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().await;
    db.list_profiles()
        .await
        .map_err(|e| e.to_string())
}
