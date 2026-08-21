use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};

#[derive(Clone)]
pub struct AppState {
    pub profiles: Arc<Mutex<Vec<serde_json::Value>>>,
    pub current_profile_id: Arc<Mutex<Option<String>>>,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn run() {
    use tauri::Manager;
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let state = AppState {
                profiles: Arc::new(Mutex::new(Vec::new())),
                current_profile_id: Arc::new(Mutex::new(None)),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            create_profile,
            list_profiles,
            get_current_profile,
            login_profile,
            logout_profile,
            // Existing commands
            get_config,
            save_config,
            create_project,
            list_projects,
            generate_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ========== Auth Commands ==========

#[tauri::command]
async fn create_profile(
    name: String,
    email: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use uuid::Uuid;
    use chrono::Utc;
    
    let profile = serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "name": name,
        "email": email,
        "created_at": Utc::now().to_rfc3339(),
        "active": false
    });
    
    let mut profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    profiles.push(profile.clone());
    
    Ok(profile)
}

#[tauri::command]
async fn list_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    Ok(profiles.clone())
}

#[tauri::command]
async fn get_current_profile(
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, String> {
    let current_id = state.current_profile_id.lock().map_err(|e| e.to_string())?;
    let profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    
    if let Some(id) = current_id.as_ref() {
        if let Some(profile) = profiles.iter().find(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(id)
        }) {
            return Ok(Some(profile.clone()));
        }
    }
    Ok(None)
}

#[tauri::command]
async fn login_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    let mut current_id = state.current_profile_id.lock().map_err(|e| e.to_string())?;
    
    if let Some(profile) = profiles.iter_mut().find(|p| {
        p.get("id").and_then(|v| v.as_str()) == Some(&profile_id)
    }) {
        if let Some(active) = profile.get_mut("active") {
            *active = serde_json::json!(true);
        }
        *current_id = Some(profile_id.clone());
        
        return Ok(profile.clone());
    }
    
    Err("Profile not found".to_string())
}

#[tauri::command]
async fn logout_profile(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    let mut current_id = state.current_profile_id.lock().map_err(|e| e.to_string())?;
    
    if let Some(id) = current_id.clone() {
        if let Some(profile) = profiles.iter_mut().find(|p| {
            p.get("id").and_then(|v| v.as_str()) == Some(&id)
        }) {
            if let Some(active) = profile.get_mut("active") {
                *active = serde_json::json!(false);
            }
        }
    }
    
    *current_id = None;
    drop(profiles);
    drop(current_id);
    
    app.emit("profile_logged_out", ()).map_err(|e| e.to_string())?;
    Ok(())
}

// ========== Existing Commands ==========

#[tauri::command]
fn get_config() -> AppConfig {
    AppConfig::default()
}

#[tauri::command]
fn save_config(_config: AppConfig) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn create_project(name: String) -> Result<Project, String> {
    use uuid::Uuid;
    use chrono::Utc;
    
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    };
    Ok(project)
}

#[tauri::command]
fn list_projects() -> Vec<Project> {
    Vec::new()
}

#[tauri::command]
async fn generate_video(_request: VideoRequest) -> Result<VideoResult, String> {
    use uuid::Uuid;
    
    let result = VideoResult {
        id: Uuid::new_v4().to_string(),
        status: "processing".to_string(),
        output_url: None,
        error: None,
    };
    Ok(result)
}
