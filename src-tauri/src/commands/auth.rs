use crate::AppState;
use serde::Deserialize;
use tauri::{Emitter, State};

#[derive(Deserialize)]
pub struct CreateProfileInput {
    pub name: String,
    pub email: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginProfileInput {
    pub profile_id: String,
}

#[tauri::command]
pub async fn create_profile(
    input: CreateProfileInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    db.create_profile(&input.name, input.email.as_deref())
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

#[tauri::command]
pub async fn get_current_profile(
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let current_id = state.current_profile_id.lock().await;
    
    if let Some(id) = current_id.as_ref() {
        let db = state.db.lock().await;
        return db.get_profile(id)
            .await
            .map(Some)
            .map_err(|e| e.to_string());
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn login_profile(
    input: LoginProfileInput,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    let profile = db.get_profile(&input.profile_id)
        .await
        .map_err(|_| "Profile not found".to_string())?;
    
    let mut current_id = state.current_profile_id.lock().await;
    *current_id = Some(input.profile_id);
    drop(current_id);
    
    // Emit login event via Tauri 2.0 API
    let _ = app.emit("profile_logged_in", &profile["name"]);
    
    Ok(profile)
}

#[tauri::command]
pub async fn logout_profile(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut current_id = state.current_profile_id.lock().await;
    *current_id = None;
    drop(current_id);
    
    app.emit("profile_logged_out", ()).map_err(|e| e.to_string())?;
    Ok(())
}
