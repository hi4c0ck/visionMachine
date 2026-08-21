use crate::storage::Database;
use tauri::State;

#[tauri::command]
pub async fn create_profile(
    name: String,
    email: Option<String>,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    db.create_profile(&name, email.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_profiles(
    db: State<Database>,
) -> Result<Vec<serde_json::Value>, String> {
    db.list_profiles()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn logout_profile(
    db: State<Database>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    db.logout_user()
        .await
        .map_err(|e| e.to_string())?;
    
    app.emit("profile_logged_out", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}
