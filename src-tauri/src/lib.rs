use std::sync::Arc;
use tauri::Manager;

mod preflight;
pub use preflight::{run_preflight_checks, PreflightReport};

#[derive(Clone)]
pub struct AppState {
    pub username: Arc<std::sync::Mutex<Option<String>>>,
    pub preflight_report: Arc<std::sync::Mutex<PreflightReport>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            username: Arc::new(std::sync::Mutex::new(None)),
            preflight_report: Arc::new(std::sync::Mutex::new(PreflightReport::new())),
        }
    }
}

#[tauri::command]
async fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "appName": "VisionMachine",
        "version": env!("CARGO_PKG_VERSION")
    })
}

#[tauri::command]
async fn login_user(username: String) -> Result<String, String> {
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    Ok(format!("Welcome, {}!", username))
}

#[tauri::command]
async fn get_preflight_report() -> Result<PreflightReport, String> {
    Ok(run_preflight_checks())
}

fn init_database(app_data_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let db_path = app_data_dir.join("visionmachine.db");
    
    // Remove existing file to ensure clean state
    if db_path.exists() {
        std::fs::remove_file(&db_path).ok();
    }
    
    // Create parent directory
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // Create empty SQLite file with proper header
    // SQLite header: "SQLite format 3\000" (16 bytes)
    let header = b"SQLite format 3\x00";
    std::fs::write(&db_path, header)
        .map_err(|e| format!("Failed to create database file: {}", e))?;
    
    log::info!("[DB] Database initialized at: {:?}", db_path);
    Ok(db_path)
}

pub fn run() {
    let report = run_preflight_checks();
    let report_str = report.format_report();
    eprintln!("{}", report_str);
    
    if !report.passed {
        eprintln!("\nCritical environment issues detected. Application cannot start.");
        std::process::exit(1);
    }
    
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(move |app| {
            log::info!("[Setup] Application starting...");
            
            let app_data_dir = app.path().app_local_data_dir()
                .map_err(|e| format!("Failed to get app data directory: {}", e))?;
            
            log::info!("[Setup] App data directory: {:?}", app_data_dir);
            
            match init_database(&app_data_dir) {
                Ok(db_path) => {
                    log::info!("[Setup] Database ready at: {:?}", db_path);
                }
                Err(e) => {
                    log::error!("[Setup] Database initialization failed: {}", e);
                    // Continue anyway - app can work without DB
                }
            }
            
            log::info!("[Setup] Setup complete!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login_user,
            get_app_info,
            get_preflight_report,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run app");
}
