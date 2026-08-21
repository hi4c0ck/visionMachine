use serde::{Deserialize, Serialize};

pub mod commands;
pub mod models;
pub mod storage;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Auth commands from profiles.rs
            commands::profiles::create_profile,
            commands::profiles::list_profiles,
            commands::profiles::get_current_profile,
            commands::profiles::login_profile,
            commands::profiles::logout_profile,
            // Projects commands
            commands::projects::create_project,
            commands::projects::list_projects,
            // Sessions commands
            commands::sessions::create_session,
            commands::sessions::list_sessions,
            // Composer commands
            commands::composer::get_composer,
            commands::composer::save_composer,
            // Artifacts commands
            commands::artifacts::create_artifact,
            commands::artifacts::list_artifacts_by_session,
            // Settings commands
            commands::settings::get_storage_path,
            commands::settings::get_database_stats,
            // Legacy video commands
            get_config,
            save_config,
            generate_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_config() -> AppConfig {
    AppConfig::default()
}

#[tauri::command]
fn save_config(_config: AppConfig) -> Result<(), String> {
    Ok(())
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
