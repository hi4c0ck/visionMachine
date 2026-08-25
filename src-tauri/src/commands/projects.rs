use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub directory_path: Option<String>,
}

#[tauri::command]
pub async fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // For now, use a dummy profile_id (in real app this would come from auth)
    let db = state.db.as_ref();
    let project_id = uuid::Uuid::new_v4().to_string();
    
    db.create_project(&project_id, &input.name, input.directory_path.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    _state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    // Return empty for now - would need proper filtering in real app
    Ok(vec![])
}
