use crate::AppState;
use serde::Deserialize;
use sqlx::Row;
use std::fs;
use std::path::Path;
use tauri::State;

#[derive(Deserialize)]
pub struct CreateSessionInput {
    pub project_id: String,
    pub name: String,
    pub pipes_json: Option<String>,
    pub files_metadata: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateSessionInput {
    pub session_id: String,
    pub updates: serde_json::Value,
}

#[derive(Deserialize)]
pub struct DeleteSessionInput {
    pub session_id: String,
}

#[tauri::command]
pub async fn create_session(
    input: CreateSessionInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.create_session(
        &input.project_id,
        &input.name,
        input.pipes_json.as_deref(),
        input.files_metadata.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(
    input: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let project_id = input
        .get("project_id")
        .and_then(|v| v.as_str())
        .ok_or("project_id is required")?
        .to_string();
    let db = state.db.lock().await;
    db.list_sessions(&project_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct DuplicateSessionInput {
    pub session_id: String,
    pub new_name: Option<String>,
}

/// Full session duplication:
/// 1. brand-new session row (fresh id, copyable fields carried over);
/// 2. composer mirrored into the copy with re-minted piece ids (Pipe::rekeyed)
///    so the two sessions never share keys (Svelte 5 each_key_duplicate);
/// 3. the source session's media tree (generated images/videos) is copied
///    into the new session's media dir, and the carried-over last-generation
///    paths + keyframe/subject previews are re-rooted to the copy so the copy
///    shows the same last artifacts instead of a blank state.
#[tauri::command]
pub async fn duplicate_session(
    input: DuplicateSessionInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let new_id = db
        .duplicate_session(&input.session_id, input.new_name.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    // Best-effort composer mirror: a missing source composer row just means
    // the copy starts empty; the duplicate itself succeeded.
    if let Ok(composer) = db.get_composer(&input.session_id).await {
        // Copy the source's media tree into the new session's media dir, then
        // re-root the carried-over artifact paths so the copy's previews +
        // last-generation refs point at its own copies.
        let (src_root, dst_root) = resolve_copy_media_dirs(
            &db,
            &input.session_id,
            &composer.name,
            &new_id,
            input.new_name.as_deref(),
        )
        .await;
        let remap = |p: &str| -> String {
            if let (Some(s), Some(d)) = (&src_root, &dst_root) {
                let s = s.to_string_lossy();
                let d = d.to_string_lossy();
                if p.starts_with(&*s) {
                    return format!("{}{}", d, &p[s.len()..]);
                }
            }
            p.to_string()
        };

        let mut copy = crate::models::ComposerConfig::new(&new_id, &composer.name);
        copy.session_id = new_id.clone();
        copy.name = input
            .new_name
            .clone()
            .unwrap_or_else(|| format!("{} (copy)", composer.name));
        copy.fps = composer.fps;
        copy.resolution = composer.resolution.clone();
        copy.orientation = composer.orientation.clone();
        copy.total_generated_frames = composer.total_generated_frames;
        copy.pipes = composer
            .pipes
            .iter()
            .map(|p| crate::models::Pipe::rekeyed(p, &remap))
            .collect();

        if let (Some(s), Some(d)) = (&src_root, &dst_root) {
            if s.exists() {
                if let Err(e) = copy_dir_recursive(s, d) {
                    log::warn!(
                        "[Sessions] duplicate_session {}: media copy failed: {e}",
                        new_id
                    );
                }
            }
        }

        if let Err(e) = db.save_composer(&copy).await {
            log::warn!(
                "[Sessions] duplicate_session {}: copy row created, composer mirror failed: {e}",
                new_id
            );
        }
    }
    Ok(new_id)
}

/// Resolve the source + destination session media dirs for a copy.
/// Both are computed the same way `start_generation` computes `session_root`:
/// `resolve_media_root` precedence (session dir → project dir → app-data tree)
/// joined with the session name. The destination uses the NEW session name so
/// the copy's media tree lives under its own folder.
async fn resolve_copy_media_dirs(
    db: &crate::storage::db::Database,
    source_session_id: &str,
    source_name: &str,
    new_session_id: &str,
    new_name: Option<&str>,
) -> (Option<std::path::PathBuf>, Option<std::path::PathBuf>) {
    async fn base_root(db: &crate::storage::db::Database, session_id: &str) -> Option<String> {
        // 1. session's own directory_path.
        let sdir = sqlx::query("SELECT directory_path FROM sessions WHERE id = ?")
            .bind(session_id)
            .fetch_optional(&db.pool)
            .await
            .ok()
            .flatten()
            .and_then(|r| r.try_get::<Option<String>, _>(0).ok())
            .flatten();
        if let Some(d) = sdir {
            let t = d.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
        // 2. owning project's directory_path.
        let pdir = sqlx::query(
            "SELECT p.directory_path FROM sessions s \
                  JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
        )
        .bind(session_id)
        .fetch_optional(&db.pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.try_get::<Option<String>, _>(0).ok())
        .flatten();
        pdir
    }

    async fn dir_for(
        db: &crate::storage::db::Database,
        session_id: &str,
        name: &str,
    ) -> Option<std::path::PathBuf> {
        let base = base_root(db, session_id).await;
        let root = match base.filter(|s| !s.trim().is_empty()) {
            Some(b) => std::path::PathBuf::from(b.trim()),
            None => dirs::data_local_dir()
                .map(|d| d.join("com.visionmachine.desktop").join("media"))
                .unwrap_or_else(std::env::temp_dir),
        };
        Some(root.join(crate::commands::generation::safe_session_name(name)))
    }

    let src = dir_for(db, source_session_id, source_name).await;
    let dst = dir_for(db, new_session_id, new_name.unwrap_or(source_name)).await;
    (src, dst)
}

/// Recursive directory copy (last-state media tree). Best-effort per file:
/// a single unreadable file is logged, not fatal.
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("create {}: {e}", dst.display()))?;
    let entries = fs::read_dir(src).map_err(|e| format!("read {}: {e}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            if let Err(e) = fs::copy(&from, &to) {
                log::warn!("[Sessions] copy {} → {}: {e}", from.display(), to.display());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn update_session(
    input: UpdateSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.update_session(&input.session_id, &input.updates)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_session(
    input: DeleteSessionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_session(&input.session_id)
        .await
        .map_err(|e| e.to_string())
}
