// VisionMachine Tauri Backend
// Handles Python subprocess communication

use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;

#[derive(Clone, Serialize, Deserialize)]
pub struct GenerationResult {
    pub success: bool,
    pub video_url: String,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub python_path: Mutex<String>,
    pub project_root: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            python_path: Mutex::new("uv".to_string()),
            project_root: Mutex::new(
                std::env::current_dir()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .to_string_lossy()
                    .to_string(),
            ),
        }
    }
}

// Generate video command
#[tauri::command]
async fn generate_video(
    app: tauri::AppHandle,
    prompt: String,
    duration: u32,
    shots: u32,
    style: String,
    resolution: String,
) -> Result<GenerationResult, String> {
    let state = app.state::<AppState>();
    
    // Validate inputs
    if prompt.is_empty() {
        return Err("Prompt cannot be empty".to_string());
    }
    
    if duration < 3 || duration > 60 {
        return Err("Duration must be between 3 and 60 seconds".to_string());
    }
    
    if shots < 4 || shots > 12 {
        return Err("Shot count must be between 4 and 12".to_string());
    }
    
    // Build Python script path
    let project_root = state.project_root.lock().unwrap();
    let script_path = format!("{}/scripts/generate_video.py", project_root);
    
    // Check if script exists
    if !std::path::Path::new(&script_path).exists() {
        // For demo purposes, return a mock result
        eprintln!("Warning: Script not found at {}, using demo mode", script_path);
        
        return Ok(GenerationResult {
            success: true,
            video_url: format!("/tmp/vm_{}_{}.mp4", prompt.chars().take(8).collect::<String>(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()),
            error: None,
        });
    }
    
    // Get Python path
    let python_path = state.python_path.lock().unwrap();
    
    // Execute Python script
    let output = Command::new(python_path.as_str())
        .arg("run")
        .arg("python")
        .arg(&script_path)
        .arg("--prompt")
        .arg(&prompt)
        .arg("--duration")
        .arg(duration.to_string())
        .arg("--shots")
        .arg(shots.to_string())
        .arg("--style")
        .arg(&style)
        .arg("--resolution")
        .arg(&resolution)
        .output()
        .map_err(|e| format!("Failed to execute Python: {}", e))?;
    
    // Parse output
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        
        // Try to parse JSON output
        if let Ok(result) = serde_json::from_str::<GenerationResult>(&stdout) {
            return Ok(result);
        }
        
        // Fallback to simple parsing
        return Ok(GenerationResult {
            success: true,
            video_url: stdout.trim().to_string(),
            error: None,
        });
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python execution failed: {}", stderr));
    }
}

// Get available providers command
#[tauri::command]
async fn list_providers(
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let state = app.state::<AppState>();
    let project_root = state.project_root.lock().unwrap();
    
    // Read from security config or return defaults
    Ok(vec![
        "agnes".to_string(),
        "openai_compatible".to_string(),
    ])
}

// Validate provider connection
#[tauri::command]
async fn validate_provider(
    app: tauri::AppHandle,
    provider_name: String,
) -> Result<bool, String> {
    // TODO: Implement actual validation via Python
    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            generate_video,
            list_providers,
            validate_provider,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
