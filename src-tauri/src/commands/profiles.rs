use crate::AppState;
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use tauri::State;

#[derive(Deserialize)]
pub struct GetProfileInput {
    pub user_name: String,
}

#[derive(Deserialize)]
pub struct CreateProfileInput {
    pub name: String,
}

/// Generate a stable profile ID from username
fn hash_username(name: &str) -> String {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[tauri::command]
pub async fn get_user_profile(
    input: GetProfileInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;

    // Generate a stable profile ID from username
    let profile_id = format!("profile_{}", hash_username(&input.user_name));

    // Get or create profile
    let profile = db
        .get_or_create_profile(&profile_id, &input.user_name)
        .await
        .map_err(|e| e.to_string())?;

    Ok(profile["id"].as_str().unwrap_or("").to_string())
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
