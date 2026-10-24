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

/// One-time sweep of the orphaned per-PID webview profiles the old build
/// left in `C:\Users\Public\Documents\visionmachine_webview_{pid}`.
/// Best-effort: it never blocks startup, and it SKIPS any folder still in
/// use (recently modified) so a concurrently running *legacy* build is not
/// broken mid-session.
fn cleanup_legacy_webview_profiles() {
    // Legacy location (the old per-PID hack). Nothing new is ever written
    // here anymore, so this is safe to reclaim over time.
    let base = std::path::Path::new(r"C:\Users\Public\Documents");
    let Ok(entries) = base.read_dir() else {
        return;
    };

    let fresh = std::time::SystemTime::now();
    let mut removed = 0usize;
    let mut skipped = 0usize;
    for entry in entries.flatten() {
        let fname = entry.file_name(); // owned, outlives the `to_string_lossy` borrow
        let name_str = fname.to_string_lossy();
        // Only the exact legacy pattern; never touch anything else.
        if !name_str.starts_with("visionmachine_webview_") {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Freshness guard: if ANY file under it was modified within the last
        // 2 hours, a legacy instance may still own it → leave it alone.
        let newest =
            newest_item_mtime(&path, 3).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if fresh.duration_since(newest).is_ok_and(|d| d < std::time::Duration::from_secs(2 * 3600)) {
            skipped += 1;
            continue;
        }
        match std::fs::remove_dir_all(&path) {
            Ok(()) => {
                removed += 1;
                log::info!("[Cleanup] removed legacy webview profile {path:?}");
            }
            Err(e) => {
                log::warn!("[Cleanup] could not remove {path:?}: {e}");
            }
        }
    }
    if removed > 0 || skipped > 0 {
        log::info!(
            "[Cleanup] legacy webview profiles: {removed} removed, {skipped} still-in-use kept"
        );
    }
}

/// Most-recently-modified file under `root` (bounded to `depth` levels).
/// `None` when the tree is empty or unreadable.
fn newest_item_mtime(root: &std::path::Path, depth: u32) -> Option<std::time::SystemTime> {
    let mut newest: Option<std::time::SystemTime> = None;
    fn walk(dir: &std::path::Path, depth: u32, newest: &mut Option<std::time::SystemTime>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let mtime = entry.metadata().ok().and_then(|m| m.modified().ok());
            if let Some(m) = mtime {
                if newest.is_none() || m > newest.unwrap() {
                    *newest = Some(m);
                }
            }
            if depth > 0 && entry.path().is_dir() {
                walk(&entry.path(), depth - 1, newest);
            }
        }
    }
    walk(root, depth, &mut newest);
    newest
}

/// One-time recovery of the UI state (theme, username, layout, settings)
/// that the old per-PID profile wiped on every launch: copy the most recent
/// legacy profile's Local Storage into the new stable profile — but ONLY
/// when the stable profile has no Local Storage yet (i.e. first launch
/// after the fix). A leveldb store is a set of plain files, so a recursive
/// copy while no WebView is holding it is safe; on a running *legacy*
/// build the source may be in use, so this is best-effort and never
/// blocks startup.
fn migrate_legacy_webview_profile(stable_dir: &std::path::Path) {
    let target = stable_dir.join("EBWebView").join("Default").join("Local Storage");
    if target.exists() {
        return; // stable profile already owns a Local Storage — don't clobber
    }
    let base = std::path::Path::new(r"C:\Users\Public\Documents");
    let Ok(entries) = base.read_dir() else {
        return;
    };
    // Most recently touched legacy profile that actually has a leveldb store.
    let mut newest: Option<(std::time::SystemTime, std::path::PathBuf)> = None;
    for entry in entries.flatten() {
        let fname = entry.file_name(); // owned, outlives the `to_string_lossy` borrow
        if !fname.to_string_lossy().starts_with("visionmachine_webview_") {
            continue;
        }
        let ls = entry.path().join("EBWebView").join("Default").join("Local Storage");
        if !ls.join("leveldb").exists() {
            continue;
        }
        let mtime = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if newest
            .as_ref()
            .map(|(t, _)| *t)
            .is_none_or(|t| mtime > t)
        {
            newest = Some((mtime, ls));
        }
    }
    match newest {
        Some((_, src)) => {
            match copy_dir_recursive(&src, &target) {
                Ok(()) => log::info!(
                    "[Migration] restored Local Storage into the stable webview profile (from {src:?})"
                ),
                Err(e) => log::warn!("[Migration] could not copy {src:?} -> {target:?}: {e}"),
            }
        }
        None => {}
    }
}

/// Copy a directory tree (files only are meaningful here — a leveldb is a
/// handful of top-level files). Best-effort, used once at startup.
fn copy_dir_recursive(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub fn run() {
    // ── App data directory (before the Tauri builder) ───────────────────
    // One stable home for all app state: SQLite DB, media trees, logs — and
    // the WebView2 profile (where localStorage lives: vm-theme, vm-username,
    // vm-layout, vm-settings-*).
    let app_data_dir = dirs::data_local_dir()
        .map(|d| d.join("com.visionmachine.desktop"))
        .unwrap_or_else(|| std::env::temp_dir().join("visionmachine"));

    // WebView2 user data folder: ONE stable profile per app. WebView2 stores
    // localStorage inside it. (Former bug: a unique per-PID profile under
    // C:\Users\Public\Documents, so every launch started with a FRESH EMPTY
    // localStorage — theme/username/layout never survived a restart, and
    // hundreds of MB of orphaned profile folders piled up.)
    //
    // Sharing the folder across concurrent instances is safe: they all use
    // the same (default) CoreWebView2EnvironmentOptions, which is the only
    // case WebView2 allows on one user-data folder.
    let webview_profile = app_data_dir.clone();
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &webview_profile);
    if let Err(e) = std::fs::create_dir_all(&webview_profile) {
        eprintln!("Warning: Failed to create webview profile dir: {e}");
    }
    log::info!(
        "[Setup] App data directory: {:?} (WebView2 profile: {}/EBWebView)",
        app_data_dir,
        app_data_dir.display()
    );

    // One-time sweep of the orphaned per-PID profiles the old build left
    // behind (best-effort; recent ones are skipped so a still-running
    // legacy build is never broken).
    cleanup_legacy_webview_profiles();

    // One-time recovery of the UI state (theme / username / layout /
    // settings) the old per-PID profile kept wiping: seed the new stable
    // profile's Local Storage from the most recent legacy profile, but ONLY
    // when the stable profile has none yet (first launch after the fix).
    // Runs before the Tauri webview boots, so the leveldb is not locked.
    migrate_legacy_webview_profile(&webview_profile);

    // Run pre-flight checks
    let report = run_preflight_checks();
    let report_str = report.format_report();
    eprintln!("{}", report_str);

    if !report.passed {
        eprintln!("\nCritical environment issues detected. Application cannot start.");
        std::process::exit(1);
    }

    // Initialize database synchronously (outside Tauri runtime)
    // (`app_data_dir` + WebView2 profile were resolved above, before the
    // webview boots — that ordering is what makes localStorage persist).
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
commands::generation::generate_piece_image,
commands::generation::list_piece_history,
commands::generation::list_session_images,
commands::generation::read_user_image,
commands::generation::extract_pipe_last_frame,
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
