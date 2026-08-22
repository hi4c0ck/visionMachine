use std::sync::{Arc, Mutex};
use tauri::Manager;

mod preflight;
pub use preflight::{run_preflight_checks, PreflightReport};

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
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run app");
}
