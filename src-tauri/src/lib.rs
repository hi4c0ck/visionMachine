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

fn setup_panic_hook() {
    let original_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        eprintln!("\n=== PANIC OCCURRED ===");
        eprintln!("Location: {:?}", info.location());
        if let Some(s) = info.payload().downcast_ref::<&str>() {
            eprintln!("Message: {}", s);
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            eprintln!("Message: {}", s);
        }
        original_hook(info);
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
        std::process::exit(1);
    }
    
    let app_handle = tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            eprintln!("[Setup] Application starting...");
            
            // Get app data directory
            if let Ok(app_data_dir) = app.path().app_local_data_dir() {
                eprintln!("[Setup] App data directory: {:?}", app_data_dir);
                
                // Create logs subdirectory
                let logs_dir = app_data_dir.join("logs");
                if let Err(e) = std::fs::create_dir_all(&logs_dir) {
                    eprintln!("[Setup] Warning: Could not create logs dir: {}", e);
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login_user,
            get_app_info,
            get_preflight_report,
        ]);
    
    // Run the app
    app_handle.run(tauri::generate_context!())
        .expect("Failed to run app");
}
