use std::sync::{Arc, Mutex};
use tauri::Manager;
use std::path::PathBuf;

mod preflight;
pub use preflight::{run_preflight_checks, PreflightReport};
mod logger;

#[derive(Clone)]
pub struct AppState {
    pub username: Arc<Mutex<Option<String>>>,
    pub preflight_report: Arc<Mutex<PreflightReport>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            username: Arc::new(Mutex::new(None)),
            preflight_report: Arc::new(Mutex::new(PreflightReport::new())),
        }
    }
}

#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "appName": "VisionMachine",
        "version": env!("CARGO_PKG_VERSION")
    })
}

#[tauri::command]
fn login_user(username: String) -> Result<String, String> {
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    Ok(format!("Welcome, {}!", username))
}

#[tauri::command]
fn get_preflight_report() -> Result<PreflightReport, String> {
    Ok(run_preflight_checks())
}

/// Simple database initialization: check if exists, create if not
fn init_database(app_data_dir: &PathBuf) -> Result<PathBuf, String> {
    let db_path = app_data_dir.join("visionmachine.db");
    
    // Check if database already exists
    if db_path.exists() {
        eprintln!("[DB] Database already exists at: {:?}", db_path);
        return Ok(db_path);
    }
    
    // Create parent directories if needed
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // Create empty database file
    std::fs::File::create(&db_path)
        .map_err(|e| format!("Failed to create database: {}", e))?;
    
    eprintln!("[DB] Created new database at: {:?}", db_path);
    Ok(db_path)
}

pub fn run() {
    // Initialize logging FIRST
    let mut log = logger::SimpleLogger::new();
    log.log("INFO", "Application starting...");
    
    // Run pre-flight checks
    let report = run_preflight_checks();
    let report_str = report.format_report();
    eprintln!("{}", report_str);
    log.log("INFO", &format!("Preflight checks: {}", if report.passed { "PASSED" } else { "FAILED" }));
    
    if !report.passed {
        eprintln!("\nCritical environment issues detected. Application cannot start.");
        log.log("ERROR", "Critical environment issues detected");
        std::process::exit(1);
    }
    
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            log.log("INFO", "[Setup] Application starting...");
            
            // Get app data directory
            let app_data_dir = app.path().app_local_data_dir()
                .map_err(|e| format!("Failed to get app data directory: {}", e))?;
            
            log.log("INFO", &format!("[Setup] App data directory: {:?}", app_data_dir));
            
            // Initialize database (check if exists, create if not)
            match init_database(&app_data_dir) {
                Ok(db_path) => {
                    log.log("INFO", &format!("[Setup] Database initialized at: {:?}", db_path));
                }
                Err(e) => {
                    log.log("WARN", &format!("[Setup] Could not initialize database: {}", e));
                    // Continue anyway - app can work without DB for now
                }
            }
            
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
