use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Emitter;

#[derive(Clone)]
pub struct AppState {
    pub current_profile: Arc<Mutex<Option<(String, String)>>>, // (id, name)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub api_key: Option<String>,
    pub api_url: String,
    pub model: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            api_url: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoRequest {
    pub prompt: String,
    pub duration: u32,
    pub resolution: String,
    pub style: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VideoResult {
    pub id: String,
    pub status: String,
    pub output_url: Option<String>,
    pub error: Option<String>,
}

pub fn run() {
    use tauri::Manager;
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let state = AppState {
                current_profile: Arc::new(Mutex::new(None)),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_profile,
            list_profiles,
            get_current_profile,
            login_profile,
            logout_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn create_profile(name: String, email: Option<String>) -> Result<serde_json::Value, String> {
    use uuid::Uuid;
    Ok(serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "name": name,
        "email": email,
        "created_at": chrono::Utc::now().to_rfc3339()
    }))
}

#[tauri::command]
async fn list_profiles() -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

#[tauri::command]
async fn get_current_profile() -> Result<Option<serde_json::Value>, String> {
    Ok(None)
}

#[tauri::command]
async fn login_profile(profile_id: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "id": profile_id,
        "name": "User",
        "active": true
    }))
}

#[tauri::command]
async fn logout_profile(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("profile_logged_out", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}
