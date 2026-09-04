use crate::AppState;
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct LoginInput {
    pub username: String,
}

#[tauri::command]
pub async fn login_user(input: LoginInput, state: State<'_, AppState>) -> Result<String, String> {
    if input.username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    let mut username = state.username.lock().await;
    *username = Some(input.username.clone());

    Ok(format!("Welcome, {}!", input.username))
}

#[tauri::command]
pub async fn logout_user(state: State<'_, AppState>) -> Result<(), String> {
    let mut username = state.username.lock().await;
    *username = None;
    Ok(())
}
