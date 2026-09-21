//! Thin generation commands: start / poll / cancel for pipe-level tasks.
//! The progress modal polls `get_generation_task`; live state comes from the
//! in-memory registry, terminal tasks fall back to the DB row.

use serde::Deserialize;
use sqlx::Row;
use tauri::State;

use crate::generation::{
    EngineInput, GenerationStageView, GenerationTaskView, ModelSpecWire, TaskStatus,
};
use crate::AppState;

/// Unix ms since the epoch (0 on error, which the frontend treats as
/// "no timer" — pre-started_at DB rows carry 0 / NULL).
fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Resolve the session media root (E3/O6 resolution order) for the provider
/// engine: the owning project's `directory_path` when set, else the default
/// media tree under the app-data dir (created lazily by the engine).
async fn resolve_media_root(db: &crate::storage::db::Database, session_id: &str) -> Option<String> {
    let row = sqlx::query(
        "SELECT p.directory_path FROM sessions s \
                  JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
    )
    .bind(session_id)
    .fetch_optional(&db.pool)
    .await
    .ok()?
    .map(|r| r.try_get::<Option<String>, _>(0).ok())
    .flatten()
    .flatten();
    if let Some(dir) = row {
        let trimmed = dir.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    // Default: <appData>/com.visionmachine.desktop/media/<session_id>.
    if let Some(d) = dirs::data_local_dir() {
        return Some(
            d.join("com.visionmachine.desktop")
                .join("media")
                .join(session_id)
                .to_string_lossy()
                .into_owned(),
        );
    }
    Some(
        std::env::temp_dir()
            .join("visionmachine")
            .join("media")
            .join(session_id)
            .to_string_lossy()
            .into_owned(),
    )
}

#[derive(Deserialize)]
pub struct StartGenerationInput {
    pub session_id: String,
    pub pipe_id: String,
    /// Final prompt string built by the frontend prompt engine.
    pub prompt: String,
    /// Per-piece model override from the generate modal (Phase 4). None = use
    /// the global provider setting. Recorded in the generation log; the
    /// provider engine consumes these when it lands.
    #[serde(default)]
    pub image_model: Option<String>,
    #[serde(default)]
    pub video_model: Option<String>,
    /// Reproducibility seed (docs/agnes-model-catalog.md). None = the
    /// provider picks; the value is recorded in the generation log.
    #[serde(default)]
    pub seed: Option<i64>,
    /// Provider profile that owns the API slots (docs/provider-engine-tasks.md,
    /// Phase A). Keys are read from the profile settings blob at request time only.
    #[serde(default)]
    pub profile_id: Option<String>,
    /// Resolved model specs from the frontend catalog (Phase A). Tolerant:
    /// old callers send no specs and the fields default to None.
    #[serde(default)]
    pub image_spec: Option<ModelSpecWire>,
    #[serde(default)]
    pub video_spec: Option<ModelSpecWire>,
}

#[tauri::command]
pub async fn start_generation(
    input: StartGenerationInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let composer = {
        let db = &state.db.lock().await;
        db.get_composer(&input.session_id).await.map_err(|e| {
            log::error!(
                "[Generation] start_generation: get_composer {} failed: {e}",
                input.session_id
            );
            e.to_string()
        })?
    };
    let pipe = composer
        .pipes
        .iter()
        .find(|p| p.id == input.pipe_id)
        .ok_or_else(|| {
            log::warn!(
                "[Generation] start_generation: pipe {} not found in session {}",
                input.pipe_id,
                input.session_id
            );
            "Pipe not found".to_string()
        })?;

    let task_id = uuid::Uuid::new_v4().to_string();
    let media_root = {
        let db = &state.db.lock().await;
        resolve_media_root(db, &input.session_id).await
    };
    let mut view = GenerationTaskView {
        task_id: task_id.clone(),
        session_id: input.session_id.clone(),
        pipe_id: input.pipe_id.clone(),
        status: TaskStatus::Queued,
        progress: 0.0,
        stages: crate::generation::TaskRegistry::build_stages(&task_id, pipe),
        error: None,
        output_path: None,
        request_log: None,
        started_at: now_unix_ms(),
    };
    // Precompute the redacted request/response log path (E1) so the INITIAL
    // view the frontend receives already carries it — the progress modal's
    // expander is usable from the moment it opens, before any stage has
    // written to the file. Build it through `pipe_media_dirs` — the same
    // helper the engine uses to write the file — so the path matches the
    // on-disk layout exactly (`<root>/<pipe>/<task>/request.log`).
    if let Some(root) = media_root.as_deref().filter(|r| !r.trim().is_empty()) {
        if let Ok((_, task_dir, _task_images_dir)) = crate::generation::pipe_media_dirs(
            std::path::Path::new(root.trim()),
            &view.pipe_id,
            &view.task_id,
        ) {
            view.request_log = Some(task_dir.join("request.log").to_string_lossy().into_owned());
        }
    }
    let engine_input = EngineInput {
        task_id: task_id.clone(),
        media_root,
        prompt: input.prompt,
        pipe_id: input.pipe_id.clone(),
        fps: composer.fps,
        resolution: composer.resolution.clone(),
        orientation: composer.orientation.clone(),
        q_value: pipe.q_value,
        c_value: pipe.c_value,
        image_model: input.image_model,
        video_model: input.video_model,
        seed: input.seed,
        profile_id: input.profile_id,
        image_spec: input.image_spec,
        video_spec: input.video_spec,
        stage: None,
        upstream: Vec::new(),
    };

    match state
        .generation
        .registry
        .start(view.clone(), engine_input)
        .await
    {
        Ok(()) => {
            log::info!(
                "[Generation] start_generation: task {} queued for pipe {}",
                task_id,
                input.pipe_id
            );
            // Hand the frontend the INITIAL view (stages already built, request_log
            // path precomputed) so the progress modal renders the full state from
            // the moment it opens instead of waiting for the first refresh tick.
            Ok(serde_json::json!({
                "task_id": task_id,
                "view": view,
            }))
        }
        Err(e) => {
            log::error!(
                "[Generation] start_generation: task {} rejected: {}",
                task_id,
                e
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn get_generation_task(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    if let Some(view) = state.generation.registry.get(&task_id) {
        return Ok(serde_json::to_value(view).map_err(|e| e.to_string())?);
    }

    // Terminal fallback: rebuild from the DB row.
    let row = {
        let db = &state.db.lock().await;
        db.get_generation_task_row(&task_id)
            .await
            .map_err(|e| e.to_string())?
    }
    .ok_or_else(|| "Task not found".to_string())?;

    let stages: Vec<GenerationStageView> = row
        .stages_json
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default();
    let status = match row.status.as_str() {
        "queued" => TaskStatus::Queued,
        "running" => TaskStatus::Running,
        "done" => TaskStatus::Done,
        "cancelled" => TaskStatus::Cancelled,
        _ => TaskStatus::Error,
    };
    let view = GenerationTaskView {
        task_id: row.id,
        session_id: row.session_id,
        pipe_id: row.pipe_id,
        status,
        progress: row.progress as f32,
        stages,
        error: row.error,
        output_path: row.output_path,
        // Persisted at task start (0007) so the DB fallback can rebuild the
        // expander state after the in-memory registry evicted the task.
        request_log: row.request_log,
        // 0008: pre-migration rows carry NULL → 0 so the frontend shows no
        // elapsed timer rather than a garbage value.
        started_at: row.started_at.unwrap_or(0),
    };
    Ok(serde_json::to_value(view).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn cancel_generation(task_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.generation.registry.cancel(&task_id)
}

#[tauri::command]
/// Cancel every non-terminal task in one call (the close-guard's "cancel all
/// active tasks" path). Returns how many tasks were actually cancelled.
pub async fn cancel_all_generation(state: State<'_, AppState>) -> Result<usize, String> {
    Ok(state.generation.registry.cancel_all())
}

/// Number of generation tasks that are not yet terminal (queued + running).
/// The frontend's close-app guard queries this: closing the app while a task
/// is live cancels the provider job, so the user is warned first.
#[tauri::command]
pub async fn generation_active_task_count(state: State<'_, AppState>) -> Result<usize, String> {
    Ok(state.generation.registry.active_task_count())
}

#[derive(Deserialize)]
pub struct ReadMediaFileInput {
    pub path: String,
}

/// Serve a media-tree artifact to the webview (Phase E): per-project media
/// roots can't be a static asset-protocol scope, so the command validates the
/// requested path against a known session/project media root and returns the
/// raw bytes. No arbitrary file reads — a path outside the media roots is
/// rejected.
#[tauri::command]
pub async fn read_media_file(
    input: ReadMediaFileInput,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let requested = std::path::PathBuf::from(input.path.trim());
    let inside_root = {
        let db = &state.db.lock().await;
        let roots = media_roots(db).await;
        roots.iter().any(|root| requested.starts_with(root))
    };
    if !inside_root {
        return Err(format!(
            "path not inside a known media root: {}",
            input.path
        ));
    }
    if !requested.is_file() {
        return Err(format!("media file not found: {}", input.path));
    }
    std::fs::read(&requested).map_err(|e| format!("read {}: {e}", requested.display()))
}

/// All known media roots: the project `directory_path` tree + the default
/// app-data media tree (mirrors `resolve_media_root` in this module).
async fn media_roots(db: &crate::storage::db::Database) -> Vec<std::path::PathBuf> {
    let mut roots = Vec::new();
    if let Ok(rows) = sqlx::query("SELECT directory_path FROM projects WHERE directory_path IS NOT NULL AND directory_path != ''")
        .fetch_all(&db.pool)
        .await
    {
        for r in rows {
            if let Ok(Some(dir)) = r.try_get::<Option<String>, _>(0) {
                let trimmed = dir.trim().to_string();
                if !trimmed.is_empty() {
                    roots.push(std::path::PathBuf::from(trimmed));
                }
            }
        }
    }
    if let Some(d) = dirs::data_local_dir() {
        roots.push(d.join("com.visionmachine.desktop").join("media"));
    }
    roots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_generation_input_seed_is_optional() {
        // No seed key (pre-seed callers) → None.
        let without: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x"
        }))
        .unwrap();
        assert!(without.seed.is_none());

        // Explicit seed round-trips.
        let with: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x",
            "seed": 42
        }))
        .unwrap();
        assert_eq!(with.seed, Some(42));
    }

    #[test]
    fn start_generation_input_tolerates_missing_specs_and_profile() {
        // Pre-Phase-A caller: no profile_id / no specs → all None.
        let legacy: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x"
        }))
        .unwrap();
        assert!(legacy.profile_id.is_none());
        assert!(legacy.image_spec.is_none());
        assert!(legacy.video_spec.is_none());

        // New caller with a full spec round-trips into ModelSpecWire.
        let full: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x",
            "profile_id": "prof-1",
            "video_spec": {
                "id": "agnes-video-2.5-flash",
                "kind": "video",
                "endpoint": "/v1/videos",
                "sync": false,
                "requestFormat": "video-job-seconds",
                "limits": { "seconds": [4.0, 12.0], "sizeMap": { "720p": "720P" } },
                "supportsSeed": true
            }
        }))
        .unwrap();
        assert_eq!(full.profile_id.as_deref(), Some("prof-1"));
        let vspec = full.video_spec.as_ref().unwrap();
        assert_eq!(vspec.id, "agnes-video-2.5-flash");
        assert!(vspec.supports_seed());
        assert_eq!(vspec.limits.seconds, Some([4.0, 12.0]));
    }
}
