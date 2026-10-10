use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use tauri::{Emitter, Manager, WindowEvent};

mod preflight;
pub use preflight::{run_preflight_checks, PreflightReport};
mod commands;
mod models;
mod storage;
pub use storage::db::Database;

pub mod generation;

#[derive(Clone)]
pub struct AppState {
    pub username: Arc<tokio::sync::Mutex<Option<String>>>,
    pub preflight_report: Arc<tokio::sync::Mutex<PreflightReport>>,
    pub db: Arc<tokio::sync::Mutex<Database>>,
    pub generation: Arc<generation::GenerationService>,
    pub group: Arc<generation::group::GroupCoordinator>,
    pub compose_registry: generation::ComposeRegistry,
    /// Close watchdog: set when the backend force-closes the window after
    /// the frontend never confirmed a blocked close (dead/wedged UI).
    pub close_force: Arc<AtomicBool>,
    /// One watchdog task per blocked-close attempt (idempotent arm).
    pub close_watchdog_armed: Arc<AtomicBool>,
    /// Unix ms of the last renderer heartbeat (`ui_heartbeat`); 0 = none yet.
    pub last_ui_heartbeat_ms: Arc<AtomicU64>,
}

fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl AppState {
    pub fn new(db: Database) -> Self {
        let db_arc = Arc::new(tokio::sync::Mutex::new(db.clone()));
        let generation = Arc::new(generation::GenerationService::new(db.clone()));
        let compose_registry = generation::ComposeRegistry::default();
        let group = Arc::new(generation::group::GroupCoordinator::new(
            generation.as_ref().clone(),
            db,
            compose_registry.clone(),
        ));
        Self {
            username: Arc::new(tokio::sync::Mutex::new(None)),
            preflight_report: Arc::new(tokio::sync::Mutex::new(PreflightReport::new())),
            db: Arc::clone(&db_arc),
            generation,
            group,
            compose_registry,
            close_force: Arc::new(AtomicBool::new(false)),
            close_watchdog_armed: Arc::new(AtomicBool::new(false)),
            last_ui_heartbeat_ms: Arc::new(AtomicU64::new(0)),
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

    // Self-heal a hard-killed previous run: its 'running' task/group rows
    // have no live owner in this process (the registry/coordinator are
    // in-memory), so mark them interrupted. Without this the session-
    // restore fallback resurfaces the dead run as a live one on every
    // launch — the "same hang" that returns after every force-close.
    // `run()` is sync and Tauri's runtime is not up yet, so use a
    // throwaway runtime exactly like `init_database_sync` does (the sqlx
    // SQLite pool is in-process — it is safe across runtimes).
    let healed = match tokio::runtime::Runtime::new() {
        Ok(rt) => {
            let tasks = rt.block_on(db.heal_stale_generation_tasks());
            let groups = rt.block_on(db.heal_stale_generation_groups());
            (tasks, groups)
        }
        Err(e) => {
            eprintln!("[DB] heal: failed to create runtime: {e}");
            (Ok(0), Ok(0))
        }
    };
    match healed {
        (Ok(t), Ok(g)) if t > 0 || g > 0 => {
            log::warn!(
                "[DB] healed {t} stale task / {g} group row(s) from a hard-killed run (marked interrupted)"
            );
        }
        (Err(e), _) => log::error!("[DB] stale task heal failed: {e}"),
        (_, Err(e)) => log::error!("[DB] stale group heal failed: {e}"),
        _ => {}
    }

    log::info!("[Setup] Starting Tauri app...");

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                // The plugin defaults are hostile to our diagnostics: global
                // level Trace + a 40 KB KeepOne rotation means the h2/reqwest
                // TRACE spam from provider polling rotates the file every few
                // seconds, erasing every app line we otherwise write
                // (heartbeat-stale, close-watchdog, generation flow) seconds
                // after it lands. Cap the global level, keep our crate at
                // debug, and retain rotated files for forensics.
                .level(log::LevelFilter::Info)
                .level_for("vision_machine", log::LevelFilter::Debug)
                .max_file_size(10 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(10))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(db))
        .on_window_event(|window, event| {
            // Close guard: closing the app while a generation task is live
            // would cancel the provider job, so block the close and let the
            // frontend warn the user (it re-issues the close after the user
            // confirms). No-op when no task is active.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let handle = window.app_handle();
                let state = handle.state::<AppState>();
                let active = state.generation.registry.active_task_count();
                if active > 0 && !state.close_force.load(Ordering::Acquire) {
                    let label = window.label();
                    let _ = handle.emit_to(label, "close-blocked", active);
                    api.prevent_close();
                    // Fail-safe: if the frontend never confirms (it called
                    // `close_dismissed` for "Keep working", the close
                    // succeeded on its own, or the UI is dead — frozen
                    // webview / wedged event loop), cancel the task(s) and
                    // force the close after a grace period, so the app is
                    // never unclosable.
                    if state
                        .close_watchdog_armed
                        .compare_exchange(false, true, Ordering::Acquire, Ordering::Acquire)
                        .is_ok()
                    {
                        let app_handle = window.app_handle().clone();
                        let label_owned = label.to_string();
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                            // `State` guards are short-lived: re-fetch the
                            // managed state after every `.await` so no
                            // borrow crosses an await point (E0521).
                            let state = app_handle.state::<AppState>();
                            if state.close_force.load(Ordering::Acquire) {
                                return;
                            }
                            let remaining = state.generation.registry.active_task_count();
                            drop(state);
                            if remaining == 0 {
                                // Settled while we waited (the normal JS
                                // flow finished its cancel-then-close).
                                let state = app_handle.state::<AppState>();
                                state.close_watchdog_armed
                                    .store(false, Ordering::Release);
                                return;
                            }
                            log::warn!(
                                "[Close] no confirmation within 60 s — cancelling {} task(s) and forcing close",
                                remaining
                            );
                            let state = app_handle.state::<AppState>();
                            let _ = state.generation.registry.cancel_all();
                            drop(state);
                            for _ in 0..240 {
                                let state = app_handle.state::<AppState>();
                                let active = state.generation.registry.active_task_count();
                                drop(state);
                                if active == 0 {
                                    break;
                                }
                                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                            }
                            let state = app_handle.state::<AppState>();
                            state.close_force.store(true, Ordering::Release);
                            state.close_watchdog_armed
                                .store(false, Ordering::Release);
                            drop(state);
                            if let Some(w) = app_handle.get_webview_window(&label_owned) {
                                let _ = w.close();
                            }
                        });
                    }
                } else {
                    state
                        .close_watchdog_armed
                        .store(false, Ordering::Release);
                }
            }
        })
        .setup(|app| {
            // Wire the generation state machine's event sink to the UI window
            // ("backend owns state, frontend renders"): every meaningful
            // task transition is pushed to `main` on the `gen-task` event so
            // the progress modal renders live instead of only via the 1 s poll.
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            let group = state.group.clone();
            let handle2 = handle.clone();
            let hb_handle = handle.clone();
            state.generation.set_event_sink(move |event| {
                let _ = handle.emit_to("main", "gen-task", &event);
                if event.kind == "terminal" {
                    let group2 = group.clone();
                    tokio::spawn(async move {
                        group2.on_pipe_terminal(&event).await;
                    });
                }
            });
            state.group.set_event_sink(move |event| {
                let _ = handle2.emit_to("main", "group-event", &event);
            });
            // Renderer liveness checker: the UI pings `ui_heartbeat` every 5
            // s; if the pings stop (renderer crashed / wedged) log it — that
            // is the signature of a "frozen window" and the evidence needed
            // to diagnose one instead of guessing. Re-fetch the managed
            // state after the sleep: a `State` guard may not cross an
            // `.await` (E0521), and `hb_handle` is the owned AppHandle that
            // outlives this closure (a clone, since `handle` itself moves
            // into the generation event sink above).
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    let state = hb_handle.state::<AppState>();
                    let last = state.last_ui_heartbeat_ms.load(Ordering::Acquire);
                    drop(state);
                    if last == 0 {
                        continue; // UI not ready yet
                    }
                    let age_ms = now_unix_ms().saturating_sub(last);
                    if age_ms > 60_000 {
                        log::error!(
                            "[UI] renderer heartbeat stale for {} s — the webview is likely unresponsive (frozen window); tasks keep running in the backend, and the close watchdog will force-close the app on demand",
                            age_ms / 1000
                        );
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::close_dismissed,
            commands::app::ui_heartbeat,
            commands::app::js_error_log,
            commands::auth::login_user,
            commands::auth::logout_user,
            commands::accounts::list_accounts,
            commands::accounts::delete_account,
            commands::profiles::create_profile,
            commands::profiles::list_profiles,
            commands::profiles::get_user_profile,
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::delete_project,
            commands::sessions::create_session,
            commands::sessions::list_sessions,
            commands::sessions::update_session,
            commands::sessions::delete_session,
            commands::sessions::duplicate_session,
            commands::composer::get_composer,
            commands::composer::save_composer,
            commands::generation::start_generation,
            commands::generation::start_session_generation,
            commands::generation::get_generation_group,
            commands::generation::get_latest_session_generation_group,
            commands::generation::cancel_generation_group,
            commands::generation::get_generation_task,
            commands::generation::cancel_generation,
            commands::generation::cancel_all_generation,
            commands::generation::generation_active_task_count,
            commands::generation::compose_session_video,
            commands::generation::cancel_session_video_composition,
            commands::generation::read_media_file,
            commands::generation::open_media_in_player,
            commands::generation::reveal_media_folder,
            // Settings & provider system (Phase 1)
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::test_provider,
            commands::settings::log_generation,
            commands::settings::get_generation_log,
            commands::settings::list_generation_logs,
            commands::settings::probe_ffmpeg,
            commands::settings::probe_ffmpeg_path,
            commands::settings::set_ffmpeg_user_path,
            // File management commands
            commands::artifacts::add_project_file,
            commands::artifacts::list_project_files,
            commands::artifacts::delete_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run app");
}
