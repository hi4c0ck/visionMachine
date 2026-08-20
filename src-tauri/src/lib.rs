use serde::{Deserialize, Serialize};

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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            create_project,
            list_projects,
            generate_video
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
