//! Thin generation commands: start / poll / cancel for pipe-level tasks.
//! The progress modal polls `get_generation_task`; live state comes from the
//! in-memory registry, terminal tasks fall back to the DB row.

use serde::Deserialize;
use sqlx::Row;
use tauri::{AppHandle, Emitter, State};

use crate::generation::{
    ComposeError, EngineInput, FfmpegAvailability, GenerationStageView, GenerationTaskView,
    ModelSpecWire, SourceVideo, TaskStatus,
};
use crate::AppState;

/// Sanitize a human-readable session/pipe name for use as a directory
/// component (the name-consistent media layout). Rejects path-traversal
/// characters and empty names; falls back to "unnamed".
pub fn safe_session_name(name: &str) -> String {
    let base = std::path::Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let trimmed = base.trim();
    if trimmed.is_empty() {
        "unnamed".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Unix ms since the epoch (0 on error, which the frontend treats as
/// "no timer" — pre-started_at DB rows carry 0 / NULL).
fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Resolve the session media root for the provider engine. Precedence:
/// 1. the session's own `directory_path` (the "open folder" action, 0009),
/// 2. the owning project's `directory_path`,
/// 3. the default media tree under the app-data dir (created lazily).
async fn resolve_media_root(db: &crate::storage::db::Database, session_id: &str) -> Option<String> {
    // 1. session's own directory (0009).
    let session_dir = sqlx::query("SELECT directory_path FROM sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&db.pool)
        .await
        .ok()?
        .map(|r| r.try_get::<Option<String>, _>(0).ok())
        .flatten()
        .flatten();
    if let Some(dir) = session_dir {
        let trimmed = dir.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    // 2. owning project's directory_path.
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
    // 3. Default: <appData>/com.visionmachine.desktop/media/<session_id>.
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
    // Name-consistent layout: <projectDir>/<session-name>/<pipe-name>/<gen-hash>.
    // composer.name is the session's name; pipe.name is the pipe's name.
    let session_name = composer.name.clone();
    let pipe_name = pipe.name.clone();

    let task_id = uuid::Uuid::new_v4().to_string();
    // The media root already resolves in precedence: session's own dir (0009)
    // → project dir → default app-data tree. That root is the session root —
    // append the session name so the layout is <root>/<session-name>/...
    // even when the root is a project dir.
    let media_root = {
        let db = &state.db.lock().await;
        resolve_media_root(db, &input.session_id).await
    };
    let session_root = match media_root.clone().filter(|r| !r.trim().is_empty()) {
        Some(r) => std::path::Path::new(r.trim()).join(safe_session_name(&session_name)),
        None => {
            let base = dirs::data_local_dir()
                .map(|d| d.join("com.visionmachine.desktop").join("media"))
                .unwrap_or_else(std::env::temp_dir);
            base.join(safe_session_name(&session_name))
        }
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
    // on-disk layout exactly (`<sessionRoot>/<pipe-name>/<task>/request.log`).
    if let Ok((_, task_dir, _task_images_dir)) =
        crate::generation::pipe_media_dirs(&session_root, &pipe_name, &view.task_id)
    {
        view.request_log = Some(task_dir.join("request.log").to_string_lossy().into_owned());
    }
    let engine_input = EngineInput {
        task_id: task_id.clone(),
        media_root: Some(session_root.to_string_lossy().into_owned()),
        prompt: input.prompt,
        pipe_id: input.pipe_id.clone(),
        pipe_name: Some(pipe_name.clone()),
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

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_generation(task_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.generation.registry.cancel(&task_id)
}

#[tauri::command]
/// Cancel every non-terminal task in one call (the close-guard's "cancel all
/// active tasks" path). Returns how many tasks were actually cancelled.
pub async fn cancel_all_generation(state: State<'_, AppState>) -> Result<usize, String> {
    Ok(state.generation.registry.cancel_all())
}

#[tauri::command]
/// Number of generation tasks that are not yet terminal (queued + running).
/// The frontend's close-app guard queries this: closing the app while a task
/// is live cancels the provider job, so the user is warned first.
pub async fn generation_active_task_count(state: State<'_, AppState>) -> Result<usize, String> {
    Ok(state.generation.registry.active_task_count())
}

// ── Session video composition (A5: pipes' last-gen videos → one file) ──────

#[derive(Deserialize)]
pub struct ComposeSessionVideoInput {
    pub session_id: String,
    /// Optional explicit pipe ids in timeline order. None = all pipes with a
    /// last-gen video, in `order_index` order.
    #[serde(default)]
    pub pipe_ids: Option<Vec<String>>,
}

/// Stable error envelope returned as a JSON string because the existing
/// frontend expects command failures to be strings. New callers can parse
/// `code`/`details`; old callers can still display `message`.
fn composition_error(code: &str, message: impl Into<String>, details: serde_json::Value) -> String {
    serde_json::json!({
        "code": code,
        "message": message.into(),
        "details": details,
    })
    .to_string()
}

fn map_composition_error(error: ComposeError) -> String {
    match error {
        ComposeError::NoFfmpeg => composition_error(
            "COMPOSITION_FFMPEG_UNAVAILABLE",
            "No ffmpeg available for composition",
            serde_json::json!({ "hint": "Install a bundled Full build, configure a user path, or add ffmpeg to PATH" }),
        ),
        ComposeError::SourceMissing(label) => composition_error(
            "COMPOSITION_SOURCE_MISSING",
            "A requested source video is missing",
            serde_json::json!({ "pipe": label }),
        ),
        ComposeError::BothStrategiesFailed {
            copy_detail,
            filter_detail,
        } => composition_error(
            "COMPOSITION_FFMPEG_FAILED",
            "FFmpeg could not compose the selected videos",
            serde_json::json!({ "copy": copy_detail, "filter": filter_detail }),
        ),
        ComposeError::Cancelled => composition_error(
            "COMPOSITION_CANCELLED",
            "Session video composition cancelled",
            serde_json::json!({}),
        ),
        ComposeError::OutputMissing => composition_error(
            "COMPOSITION_OUTPUT_MISSING",
            "FFmpeg completed without producing the output video",
            serde_json::json!({}),
        ),
        ComposeError::OutputInvalid(detail) => composition_error(
            "COMPOSITION_OUTPUT_INVALID",
            "The composed video failed output validation",
            serde_json::json!({ "detail": detail }),
        ),
    }
}

/// Compose the session video: concatenate the selected pipes' last-gen
/// `video.mp4` (timeline order) into one file under the session's
/// `session_generation_dirs` tree, via the ffmpeg locator (bundled → user →
/// system; the tiny variant still works when a user path or system ffmpeg
/// resolves). Lossless `-c copy` first, re-encode fallback on mismatch.
/// Returns `{ outputPath, ffmpegSource }` or a concrete per-clip / ffmpeg
/// error string (the frontend surfaces it as a toast).
#[tauri::command]
pub async fn compose_session_video(
    app: AppHandle,
    input: ComposeSessionVideoInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    let composer = db
        .get_composer(&input.session_id)
        .await
        .map_err(|e| e.to_string())?;

    // Collect source clips: explicit ids (as given) or all pipes with a
    // last-gen video, ordered by `order_index` (timeline order).
    let mut pipes: Vec<&crate::models::composer::Pipe> = composer.pipes.iter().collect();
    if let Some(ids) = &input.pipe_ids {
        if ids.is_empty() {
            return Err(composition_error(
                "COMPOSITION_NO_PIPES",
                "No pipes selected for composition",
                serde_json::json!({}),
            ));
        }
        let set: std::collections::HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();
        pipes.retain(|p| set.contains(p.id.as_str()));
        // Keep the requested order, stable by order_index otherwise.
        let ord: Vec<&crate::models::composer::Pipe> = ids
            .iter()
            .filter_map(|id| composer.pipes.iter().find(|p| p.id == *id))
            .collect();
        pipes = if ord.len() == ids.len() { ord } else { pipes };
    } else {
        pipes.sort_by_key(|p| p.order_index);
    }

    let ffmpeg: FfmpegAvailability = crate::generation::resolve_ffmpeg();
    if ffmpeg.source == "none" {
        // Concrete guidance instead of a bare failure (tiny variant).
        return Err(composition_error(
            "COMPOSITION_FFMPEG_UNAVAILABLE",
            "No ffmpeg available — compose needs a bundled binary (Full build), a user path in Settings → Tools, or a system ffmpeg on PATH",
            serde_json::json!({ "hint": "Configure a bundled, user, or system ffmpeg binary" }),
        ));
    }

    let sources: Vec<SourceVideo> = pipes
        .iter()
        .filter_map(|p| {
            p.last_generation.as_ref().and_then(|lg| {
                let path = lg.video_path.trim();
                if path.is_empty() {
                    None
                } else {
                    Some(SourceVideo {
                        label: p.name.clone(),
                        path: path.to_string(),
                    })
                }
            })
        })
        .collect();
    let missing: Vec<String> = pipes
        .iter()
        .filter(|p| {
            p.last_generation
                .as_ref()
                .map(|lg| lg.video_path.trim().is_empty())
                .unwrap_or(true)
        })
        .map(|p| p.name.clone())
        .collect();
    if sources.is_empty() {
        return Err(composition_error(
            "COMPOSITION_NO_SOURCES",
            "No pipes with a generated video to compose",
            serde_json::json!({ "missingPipes": missing.clone(), "pipeCount": pipes.len() }),
        ));
    }
    // Explicit selection is strict: never silently drop a requested pipe.
    if input.pipe_ids.is_some() && !missing.is_empty() {
        return Err(composition_error(
            "COMPOSITION_MISSING_PIPES",
            "Cannot compose: selected pipes without a last-gen video",
            serde_json::json!({ "missingPipes": missing.clone(), "selected": true }),
        ));
    }
    // All-pipe mode is also strict. A partial session artifact is misleading.
    if input.pipe_ids.is_none() && !missing.is_empty() {
        return Err(composition_error(
            "COMPOSITION_MISSING_PIPES",
            "Cannot compose: some pipes lack a last-gen video",
            serde_json::json!({ "missingPipes": missing, "selected": false, "pipeCount": pipes.len() }),
        ));
    }

    // Output dir: the session-level generation tree under the session root
    // (same precedence as the provider engine: session dir → project dir →
    // default app-data tree, then the session-name folder).
    let session_name = composer.name.clone();
    let media_root = resolve_media_root(db, &input.session_id).await;
    let session_root = match media_root.clone().filter(|r| !r.trim().is_empty()) {
        Some(r) => std::path::Path::new(r.trim()).join(safe_session_name(&session_name)),
        None => {
            let base = dirs::data_local_dir()
                .map(|d| d.join("com.visionmachine.desktop").join("media"))
                .unwrap_or_else(std::env::temp_dir);
            base.join(safe_session_name(&session_name))
        }
    };
    let out_path = session_root.join("session-video").join("session.mp4");
    let out_dir = session_root.join("session-video");
    let out_dir_str = out_dir.to_string_lossy().into_owned();

    let manifest_entries: Vec<serde_json::Value> = sources
        .iter()
        .map(|s| serde_json::json!({ "label": s.label, "videoPath": s.path }))
        .collect();

    let session_id = input.session_id.clone();
    let emit_progress = |phase: &str, progress: Option<f64>, detail: &str| {
        let _ = app.emit_to(
            "main",
            "composition-progress",
            serde_json::json!({
                "sessionId": session_id,
                "phase": phase,
                "progress": progress,
                "detail": detail,
            }),
        );
    };

    emit_progress("preparing", Some(0.0), "Preparing sources");
    let (_operation_id, cancel) = state
        .compose_registry
        .start(&input.session_id)
        .map_err(|_| {
            composition_error(
                "COMPOSITION_ALREADY_RUNNING",
                "Session video composition is already running",
                serde_json::json!({ "sessionId": input.session_id }),
            )
        })?;
    let worker_cancel = std::sync::Arc::clone(&cancel);
    let result = tokio::task::spawn_blocking(move || {
        let manifest_dir = std::path::Path::new(&out_dir_str);
        crate::generation::compose_session_video(
            &ffmpeg,
            &sources,
            &out_path,
            manifest_dir,
            &worker_cancel,
        )
    })
    .await;
    state.compose_registry.finish(&input.session_id);
    let result = result
        .map_err(|e| {
            composition_error(
                "COMPOSITION_TASK_JOIN_FAILED",
                "Composition worker could not complete",
                serde_json::json!({ "error": e.to_string() }),
            )
        })?
        .map_err(map_composition_error)?;

    emit_progress("finalizing", Some(1.0), "Finalizing output");
    // output.json mirrors the provider convention so the backfill / log
    // paths can treat a session video like any generated artifact.
    let _ = crate::generation::write_json(
        &out_dir.join("output.json"),
        &serde_json::json!({
            "kind": "session",
            "videoPath": result.output_path,
            "ffmpegSource": result.ffmpeg_source,
            "sourcePipes": manifest_entries,
        }),
    );

    Ok(serde_json::json!({
        "outputPath": result.output_path,
        "ffmpegSource": result.ffmpeg_source,
        "sourcePipes": manifest_entries.iter().map(|v| v["label"].clone()).collect::<Vec<_>>(),
    }))
}

#[derive(Deserialize)]
pub struct CancelCompositionInput {
    pub session_id: String,
}

/// Request cancellation of the active composition for one session. The
/// blocking worker observes the flag and terminates the current ffmpeg/ffprobe
/// child; the original compose command resolves with COMPOSITION_CANCELLED.
#[tauri::command]
pub async fn cancel_session_video_composition(
    input: CancelCompositionInput,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    Ok(state.compose_registry.cancel(&input.session_id))
}

/// Open the media folder for a session (or its owning project) in the OS file
/// explorer (Windows Explorer / Finder / xdg-open). The backend owns the
/// media-root resolution (session directory_path → project directory_path →
/// default app-data tree) so the UI just names the scope. Missing folders are
/// created first so the explorer always lands somewhere real.
#[tauri::command]
pub async fn reveal_media_folder(
    scope: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let dir = match scope.as_str() {
        "project" => {
            let row = sqlx::query("SELECT directory_path FROM projects WHERE id = ?")
                .bind(&id)
                .fetch_optional(&state.db.lock().await.pool)
                .await
                .map_err(|e| e.to_string())?;
            match row
                .and_then(|r| r.try_get::<Option<String>, _>(0).ok())
                .flatten()
            {
                Some(dir) => {
                    let trimmed = dir.trim();
                    if trimmed.is_empty() {
                        return Err("project has no media folder set yet".to_string());
                    }
                    trimmed.to_string()
                }
                None => return Err("project not found".to_string()),
            }
        }
        "session" => {
            // Mirror start_generation exactly: resolve the base root
            // (session dir → project dir → app-data tree), then append the
            // session name — that is where the engine writes media.
            let db = state.db.lock().await;
            let session_name = db
                .get_composer(&id)
                .await
                .map(|c| c.name)
                .unwrap_or_default();
            let base = resolve_media_root(&db, &id).await;
            let root = match base.filter(|r| !r.trim().is_empty()) {
                Some(r) => std::path::Path::new(r.trim()).to_path_buf(),
                None => dirs::data_local_dir()
                    .map(|d| d.join("com.visionmachine.desktop").join("media"))
                    .unwrap_or_else(std::env::temp_dir),
            };
            root.join(safe_session_name(&session_name))
                .to_string_lossy()
                .into_owned()
        }
        _ => return Err(format!("unknown media scope: {scope}")),
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {dir}: {e}"))?;
    reveal_dir_in_explorer(&dir)
}

/// Open `dir` in the OS file explorer, revealing the folder itself.
/// Windows: `explorer /select` (falls back to plain explorer); macOS:
/// `open -R`; Linux: `xdg-open`. *nix builds need no code changes.
fn reveal_dir_in_explorer(dir: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("explorer");
        cmd.arg(dir)
            .spawn()
            .map_err(|e| format!("failed to open explorer: {e}"))?;
        Ok(dir.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        cmd.args(["-R", dir])
            .spawn()
            .map_err(|e| format!("failed to open Finder: {e}"))?;
        Ok(dir.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(dir)
            .spawn()
            .map_err(|e| format!("failed to open file manager: {e}"))?;
        Ok(dir.to_string())
    }
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
    fn composition_errors_are_stable_json_envelopes() {
        let error = map_composition_error(ComposeError::BothStrategiesFailed {
            copy_detail: "copy failed".into(),
            filter_detail: "filter failed".into(),
        });
        let payload: serde_json::Value = serde_json::from_str(&error).unwrap();
        assert_eq!(payload["code"], "COMPOSITION_FFMPEG_FAILED");
        assert_eq!(payload["details"]["copy"], "copy failed");
        assert_eq!(payload["details"]["filter"], "filter failed");
        assert!(payload["message"].as_str().unwrap().contains("compose"));
    }

    #[test]
    fn composition_error_preserves_frontend_string_compatibility() {
        let error = composition_error(
            "COMPOSITION_NO_PIPES",
            "No pipes selected",
            serde_json::json!({}),
        );
        let payload: serde_json::Value = serde_json::from_str(&error).unwrap();
        assert_eq!(payload["code"], "COMPOSITION_NO_PIPES");
        assert_eq!(payload["message"], "No pipes selected");
    }

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
