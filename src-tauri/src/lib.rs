use std::sync::Arc;
use tauri::Manager;

mod preflight;
pub use preflight::{run_preflight_checks, PreflightReport};
mod commands;
mod models;
mod storage;
pub use storage::db::Database;

#[derive(Clone)]
pub struct AppState {
    pub username: Arc<tokio::sync::Mutex<Option<String>>>,
    pub preflight_report: Arc<tokio::sync::Mutex<PreflightReport>>,
    pub db: Arc<tokio::sync::Mutex<Database>>,
}

impl AppState {
    pub fn new(db: Database) -> Self {
        Self {
            username: Arc::new(tokio::sync::Mutex::new(None)),
            preflight_report: Arc::new(tokio::sync::Mutex::new(PreflightReport::new())),
            db: Arc::new(tokio::sync::Mutex::new(db)),
        }
    }
}

/// Initialize database synchronously before Tauri app starts.
fn init_database_sync(app_data_dir: &std::path::Path) -> Result<Database, String> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create Tokio runtime: {}", e))?;

    rt.block_on(async {
        let db_path = app_data_dir.join("visionmachine.db");

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        log::info!("[DB] Creating database at: {:?}", db_path);
        let db = Database::new(db_path.to_string_lossy().as_ref())
            .await
            .map_err(|e| format!("Failed to create database: {}", e))?;

        log::info!("[DB] Running migrations...");
        db.migrate()
            .await
            .map_err(|e| format!("Migration failed: {}", e))?;
        log::info!("[DB] Migrations completed successfully");

        log::info!("[DB] Seeding default profile...");
        db.seed_default_profile()
            .await
            .map_err(|e| format!("Failed to seed profile: {}", e))?;
        log::info!("[DB] Default profile seeded");

        Ok::<Database, String>(db)
    })
}

pub fn run() {
    // Force WebView2 to use a unique isolated profile per process to avoid resource conflicts
    let unique_profile = format!(
        "C:\\Users\\Public\\Documents\\visionmachine_webview_{}",
        std::process::id()
    );
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &unique_profile);

    if let Err(e) = std::fs::create_dir_all(&unique_profile) {
        eprintln!("Warning: Failed to create webview profile: {}", e);
    }

    log::info!("[WebView2] Using isolated profile: {}", unique_profile);

    // Run pre-flight checks
    let report = run_preflight_checks();
    let report_str = report.format_report();
    eprintln!("{}", report_str);

    if !report.passed {
        eprintln!("\nCritical environment issues detected. Application cannot start.");
        std::process::exit(1);
    }

    // Get app data directory early (before Tauri builder)
    let app_data_dir = dirs::data_local_dir()
        .map(|d| d.join("com.visionmachine.desktop"))
        .unwrap_or_else(|| std::env::temp_dir().join("visionmachine"));

    log::info!("[Setup] App data directory: {:?}", app_data_dir);

    // Initialize database synchronously (outside Tauri runtime)
    let db = match init_database_sync(&app_data_dir) {
        Ok(db) => db,
        Err(e) => {
            eprintln!("\n[FATAL] Database initialization failed: {}", e);
            std::process::exit(1);
        }
    };

    log::info!("[Setup] Starting Tauri app...");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(AppState::new(db))
        .invoke_handler(tauri::generate_handler![
            commands::auth::login_user,
            commands::auth::logout_user,
            commands::profiles::create_profile,
            commands::profiles::list_profiles,
            commands::profiles::get_user_profile,
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::sessions::create_session,
            commands::sessions::list_sessions,
            commands::sessions::update_session,
            commands::sessions::delete_session,
            commands::composer::get_composer,
            commands::composer::save_composer,
            // File management commands
            commands::artifacts::add_project_file,
            commands::artifacts::list_project_files,
            commands::artifacts::delete_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run app");
}
