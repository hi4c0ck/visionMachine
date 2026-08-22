use std::sync::{Arc, Mutex};
use tauri::Manager;

mod preflight;
pub use preflight::{run_preflight_checks, PreflightReport};

#[derive(Clone)]
pub struct AppState {
    pub username: Arc<Mutex<Option<String>>>,
    pub preflight_report: Arc<Mutex<PreflightReport>>,
    pub error_log: Arc<Mutex<Vec<(String, String)>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            username: Arc::new(Mutex::new(None)),
            preflight_report: Arc::new(Mutex::new(PreflightReport::new())),
            error_log: Arc::new(Mutex::new(Vec::new())),
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
async fn login_user(username: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    
    let mut user = state.username.lock().map_err(|e| e.to_string())?;
    *user = Some(username.clone());
    Ok(format!("Welcome, {}!", username))
}

#[tauri::command]
async fn logout_user(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut user = state.username.lock().map_err(|e| e.to_string())?;
    *user = None;
    Ok(())
}

#[tauri::command]
fn get_preflight_report(state: tauri::State<'_, AppState>) -> Result<PreflightReport, String> {
    let report = state.preflight_report.lock().map_err(|e| e.to_string())?;
    Ok(report.clone())
}

#[tauri::command]
async fn report_error(error_msg: String, context: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let timestamp = chrono::Local::now().to_rfc3339();
    let mut log = state.error_log.lock().map_err(|e| e.to_string())?;
    log.push((timestamp, format!("{}: {}", context, error_msg)));
    // Keep only last 100 errors
    while log.len() > 100 {
        log.remove(0);
    }
    Ok(())
}

#[tauri::command]
async fn get_errors(limit: u32, state: tauri::State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
    let log = state.error_log.lock().map_err(|e| e.to_string())?;
    let limit = limit as usize;
    Ok(log.iter().rev().take(limit).cloned().collect())
}

#[tauri::command]
async fn set_theme(_theme: String, _state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Theme is managed client-side via localStorage
    Ok(())
}

fn setup_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()));
        let msg = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };
        eprintln!("PANIC: {} at {:?}", msg, location);
    }));
}

pub fn run() {
    // Setup panic hook FIRST
    setup_panic_hook();
    
    // Run pre-flight checks
    let report = run_preflight_checks();
    let report_str = report.format_report();
    eprintln!("{}", report_str);
    
    if !report.passed {
        eprintln!("\nCritical environment issues detected. Application cannot start.");
        eprintln!("\nFor troubleshooting, visit: https://docs.visionmachine.app/troubleshooting");
        std::process::exit(1);
    }
    
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            let _ = app.path().app_local_data_dir();
            
            // Store preflight report in state
            let state = app.state::<AppState>();
            let mut report_lock = state.preflight_report.lock().unwrap();
            *report_lock = report;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login_user,
            logout_user,
            get_app_info,
            get_preflight_report,
            report_error,
            get_errors,
            set_theme,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run app");
}