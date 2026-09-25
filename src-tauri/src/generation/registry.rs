//! In-memory generation task registry: spawns/tracks/cancels tasks, builds
//! stage lists from pipe snapshots, and persists terminal state to SQLite.
//!
//! The engine slot is wired at startup with the provider engine (docs/
//! provider-engine-tasks.md, Phase D): with no engine, generation stages
//! fail fast with a real error — never simulated progress (decision D1).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use crate::generation::engine::{EngineInput, EngineStage, GenerationEngine};
use crate::generation::shaper::UpstreamOutput;
use crate::generation::types::{
    GenTaskEvent, GenerationStageView, GenerationTaskView, SourceKind, StageKind, StageStatus,
    TaskStatus,
};

/// A boxed event sink: the registry is tauri-free (stays unit-testable) and
/// delegates the actual `emit_to` to a sink wired in at startup (see
/// `lib.rs`). Defaults to a no-op slot so tests need no UI handle.
type EventSink = Arc<dyn Fn(GenTaskEvent) + Send + Sync>;

/// Progress ticks are coalesced: the engine reports progress many times per
/// second, so we forward at most one UI event per window to keep the
/// event→renderer channel cheap without dropping live motion.
const EMIT_THROTTLE_MS: u64 = 100;
use crate::models::composer::Pipe;
use crate::storage::db::Database;

/// Unix ms since the epoch (0 on error, which the frontend treats as
/// "no timer" — pre-started_at DB rows carry 0 / NULL).
fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Sequential by default (decision D7); raise this to allow parallel tasks.
pub const MAX_CONCURRENT_TASKS: usize = 1;

/// A media-root resolver for the provider engine (E3/O6 resolution order).
/// Production wiring (docs/provider-engine-tasks.md, Phase D): the owning
/// project's `directory_path` when set, else the default app-data media tree.
/// Kept as a boxed closure so the registry stays testable with a fixed path.
#[derive(Clone)]
pub struct MediaRootResolver {
    inner: Arc<dyn Fn() -> Option<std::path::PathBuf> + Send + Sync>,
}

impl MediaRootResolver {
    pub fn new(f: impl Fn() -> Option<std::path::PathBuf> + Send + Sync + 'static) -> Self {
        Self { inner: Arc::new(f) }
    }

    /// The default resolver: the app-data media tree under
    /// `<appData>/com.visionmachine.desktop/media` (created lazily by the
    /// engine).
    pub fn app_data_default() -> Self {
        Self::new(move || match dirs::data_local_dir() {
            Some(d) => Some(
                d.join("com.visionmachine.desktop")
                    .join("media")
                    .to_path_buf(),
            ),
            None => None,
        })
    }

    pub fn resolve(&self) -> Option<std::path::PathBuf> {
        (self.inner)()
    }
}

#[derive(Clone)]
pub struct TaskRegistry {
    tasks: Arc<Mutex<HashMap<String, ManagedTask>>>,
    engine: Arc<Mutex<Option<Arc<dyn GenerationEngine>>>>,
    db: Database,
    media_root: MediaRootResolver,
    /// UI event sink (no-op until wired in `lib.rs`; shared across clones).
    sink: Arc<RwLock<Option<EventSink>>>,
}

struct ManagedTask {
    view: GenerationTaskView,
    cancel: Arc<AtomicBool>,
    input: EngineInput,
    /// Per-stage context (registry-built from the pipe snapshot at
    /// `start()`; one `None` per `Ready` stage, which never reaches the
    /// engine).
    stage_plan: Vec<Option<EngineStage>>,
    /// Accumulated upstream image outputs, in stage order (keyframes then
    /// subjects; O5). `None` for the video stage.
    upstream_outputs: Vec<Option<UpstreamOutput>>,
    /// Last time a progress event was forwarded (live-tick throttling).
    last_emit_at: Option<Instant>,
}

impl TaskRegistry {
    pub fn new(db: Database) -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            engine: Arc::new(Mutex::new(None)),
            db,
            media_root: MediaRootResolver::app_data_default(),
            sink: Arc::new(RwLock::new(None)),
        }
    }

    /// Wire the event sink that forwards `GenTaskEvent`s to the UI (the
    /// Tauri `emit_to` closure, set up in `lib.rs`). Shared across all
    /// registry clones so the spawned task loop sees the same sink.
    ///
    /// Register a custom media-root resolver (production: project
    /// `directory_path` else app-data; tests: a fixed temp dir).
    pub fn with_media_root(self, media_root: MediaRootResolver) -> Self {
        Self { media_root, ..self }
    }

    /// Expose the media-root resolver as a boxed closure (shared with the
    /// provider engine at wiring time).
    pub fn media_root_resolver(&self) -> Arc<dyn Fn() -> Option<std::path::PathBuf> + Send + Sync> {
        // A fresh clone of the same logic, boxed for the engine.
        let inner = self.media_root.clone();
        std::sync::Arc::new(move || inner.resolve())
    }

    /// Register a concrete engine (the provider/LLM system plugs in later).
    pub fn set_engine(&self, engine: Arc<dyn GenerationEngine>) {
        *self.engine.lock().unwrap() = Some(engine);
    }

    /// Wire the UI event sink (the `emit_to` closure from `lib.rs`). Called
    /// once at startup; before that, emission is a no-op so the registry
    /// stays usable in tests.
    pub fn set_event_sink(&self, f: impl Fn(GenTaskEvent) + Send + Sync + 'static) {
        *self.sink.write().unwrap() = Some(Arc::new(f));
    }

    /// Forward an event to the UI (no-op when no sink is wired).
    fn emit(&self, event: GenTaskEvent) {
        if let Some(sink) = self.sink.read().unwrap().as_ref() {
            sink(event);
        }
    }

    /// Forward a live snapshot to the UI. `force` = a status change (always
    /// emit); otherwise coalesce rapid progress ticks to at most one per
    /// `EMIT_THROTTLE_MS`.
    fn emit_update(&self, task_id: &str, force: bool) {
        let mut tasks = self.tasks.lock().unwrap();
        let entry = match tasks.get_mut(task_id) {
            Some(e) => e,
            None => return,
        };
        let now = Instant::now();
        if !force {
            if let Some(last) = entry.last_emit_at {
                if now.duration_since(last) < Duration::from_millis(EMIT_THROTTLE_MS) {
                    return;
                }
            }
        }
        entry.last_emit_at = Some(now);
        let view = entry.view.clone();
        drop(tasks);
        self.emit(GenTaskEvent {
            task_id: task_id.to_string(),
            kind: "update".into(),
            status: None,
            view,
        });
    }

    /// Forward a terminal snapshot (carries the final status) to the UI so
    /// the progress modal reconciles + surfaces the outcome without waiting
    /// on a poll tick.
    fn emit_terminal(&self, task_id: &str) {
        if let Some(view) = self.get(task_id) {
            self.emit(GenTaskEvent {
                status: Some(view.status),
                kind: "terminal".into(),
                task_id: task_id.to_string(),
                view,
            });
        }
    }

    /// Build the stage list from a pipe snapshot: keyframes, then subjects
    /// (`url` type = instant `ready`), then the final video stage.
    pub fn build_stages(task_id: &str, pipe: &Pipe) -> Vec<GenerationStageView> {
        let mut stages: Vec<GenerationStageView> = Vec::new();
        for kf in &pipe.keyframes {
            let ty = if kf.kind.is_empty() { "url" } else { &kf.kind };
            let ready = ty == "url";
            let mut stage = stage_image(
                task_id,
                &format!("Keyframe {} ({})", kf.slot_index, ty),
                SourceKind::Keyframe,
                &kf.id,
                ready,
            );
            // A settled previewRemoteUrl survives a restart and marks the
            // piece as already-available (the next video run consumes it
            // without regenerating). A queued force-regen (status-dot click)
            // overrides that so the piece is re-made on the next run.
            if !kf.force_regen
                && kf
                    .preview_remote_url
                    .as_deref()
                    .filter(|u| !u.is_empty())
                    .is_some()
            {
                stage.status = StageStatus::Ready;
                stage.progress = 1.0;
            }
            stages.push(stage);
        }
        // Subject refs (the `visible` eye-mechanic is obsolete — every ref in
        // the array is rendered and sent; `visible` remains parse-only).
        for (i, sr) in pipe.subject_references.iter().enumerate() {
            let ready = sr.kind == "url";
            let mut stage = stage_image(
                task_id,
                &format!("Subject {} ({})", i + 1, sr.kind),
                SourceKind::Subject,
                &sr.id,
                ready,
            );
            // A settled previewRemoteUrl survives a restart and marks the piece
            // as already-available; a queued force-regen overrides it.
            if !sr.force_regen
                && sr
                    .preview_remote_url
                    .as_deref()
                    .filter(|u| !u.is_empty())
                    .is_some()
            {
                stage.status = StageStatus::Ready;
                stage.progress = 1.0;
            }
            stages.push(stage);
        }
        stages.push(GenerationStageView {
            id: format!("{task_id}:video"),
            label: "Final video".to_string(),
            kind: StageKind::Video,
            source_kind: SourceKind::Video,
            source_id: pipe.id.clone(),
            status: StageStatus::Pending,
            progress: 0.0,
            error: None,
            image_output: None,
            image_remote_url: None,
            rate_limited: None,
            saturated_since: None,
            last_event: None,
            last_event_at: None,
        });
        stages
    }

    /// Create + spawn a task. Rejects while a slot is busy (sequential).
    ///
    /// Holds the pipe-media snapshot at `start()` (docs/provider-engine-
    /// tasks.md, Phase D) and builds the per-stage plan the engine consumes.
    pub async fn start(
        &self,
        mut view: GenerationTaskView,
        mut input: EngineInput,
    ) -> Result<(), String> {
        view.status = TaskStatus::Running;
        log::info!(
            "[Generation] start task {} pipe {} session {} model img={:?} video={:?} seed={:?}",
            view.task_id,
            view.pipe_id,
            view.session_id,
            input.image_model,
            input.video_model,
            input.seed
        );

        // Pipe-media snapshot -> per-stage plan (keyframes slot order, then
        // subjects pipe order, then the video stage).
        let (stage_plan, upstream_outputs) = {
            let composer = self
                .db
                .get_composer(&view.session_id)
                .await
                .map_err(|e| e.to_string())?;
            let pipe = composer
                .pipes
                .iter()
                .find(|p| p.id == view.pipe_id)
                .cloned()
                .unwrap_or_else(|| crate::models::composer::Pipe::new("unknown", 121));
            // Thread the pipe's human name into the engine input so the media
            // tree uses the name-consistent layout <session>/<pipe-name>/<task>.
            input.pipe_name = Some(pipe.name.clone());
            input.task_id = view.task_id.clone();
            build_stage_plan(&pipe, &view.stages)
        };

        // Resolve the media root once at `start()` (E3/O6): the caller's
        // pre-resolved root wins, else the registry's resolver.
        if input.media_root.as_deref().map(str::trim).is_none() {
            input.media_root = self
                .media_root
                .resolve()
                .map(|p| p.to_string_lossy().into_owned());
        }
        // Stamp the task start time (Unix ms) so the progress modal can render
        // a live elapsed timer even during long provider queue-full waits. The
        // value is persisted to the DB (0008) so the terminal DB fallback can
        // rebuild it after a restart / registry eviction. 0 = unknown
        // (pre-migration rows / browser dev) → the frontend shows no timer.
        if view.started_at == 0 {
            view.started_at = now_unix_ms();
        }
        // Redacted request/response log for the progress-modal expander (E1):
        // the file lives in the task's media dir, written per stage by the
        // engine; keys are masked on write, so serving it is safe. Build the
        // path through `pipe_media_dirs` — the same helper the engine uses
        // to write the file — so the pre-computed path is guaranteed to
        // match the on-disk layout (`<root>/<pipe>/<task>/request.log`).
        if let Some(root) = input.media_root.as_deref().filter(|r| !r.trim().is_empty()) {
            let pipe_dir = input
                .pipe_name
                .as_deref()
                .filter(|n| !n.trim().is_empty())
                .unwrap_or(&view.pipe_id);
            if let Ok((_, task_dir, _task_images_dir)) = crate::generation::pipe_media_dirs(
                std::path::Path::new(root.trim()),
                pipe_dir,
                &view.task_id,
            ) {
                view.request_log =
                    Some(task_dir.join("request.log").to_string_lossy().into_owned());
            }
        }

        {
            let mut tasks = self.tasks.lock().unwrap();
            let active = tasks
                .values()
                .filter(|t| matches!(t.view.status, TaskStatus::Queued | TaskStatus::Running))
                .count();
            if active >= MAX_CONCURRENT_TASKS {
                log::warn!(
                    "[Generation] start task {} rejected: generation already in progress",
                    view.task_id
                );
                return Err("Generation already in progress".to_string());
            }
            tasks.insert(
                view.task_id.clone(),
                ManagedTask {
                    view: view.clone(),
                    cancel: Arc::new(AtomicBool::new(false)),
                    input,
                    stage_plan,
                    upstream_outputs,
                    last_emit_at: None,
                },
            );
        }
        if let Err(e) = self
            .db
            .insert_generation_task(
                &view.task_id,
                &view.session_id,
                &view.pipe_id,
                view.status.as_str(),
            )
            .await
        {
            // keep memory and DB consistent
            self.tasks.lock().unwrap().remove(&view.task_id);
            return Err(e);
        }
        // Best-effort: the in-memory view is the live source; the column only
        // matters for the terminal DB fallback (and post-restart re-fetch).
        // A pre-0008 DB without the column would error here — ignore it, the
        // fallback just shows no elapsed timer for that task.
        if view.started_at != 0 {
            let _ = self
                .db
                .set_generation_task_started_at(&view.task_id, view.started_at)
                .await;
        }
        if let Some(log_path) = view.request_log.as_deref() {
            let _ = self
                .db
                .set_generation_task_request_log(&view.task_id, log_path)
                .await;
        }

        let this = Arc::new(self.clone());
        let task_id = view.task_id;
        tokio::spawn(async move {
            this.run_task(task_id).await;
        });
        Ok(())
    }

    /// Live in-memory view (preferred source while the task is active or was
    /// just terminal here; the DB row is the fallback).
    pub fn get(&self, task_id: &str) -> Option<GenerationTaskView> {
        self.tasks
            .lock()
            .unwrap()
            .get(task_id)
            .map(|t| t.view.clone())
    }

    /// User cancel: stop all remaining stages. No-op on terminal tasks.
    ///
    /// Tolerant of unknown / already-terminal tasks (the frontend races this
    /// against the engine's own terminal transition, and a task evicted or
    /// finalized since the last poll must not error the caller — e.g. the
    /// close-guard's cancel-all-then-quit flow).
    pub fn cancel(&self, task_id: &str) -> Result<(), String> {
        let tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get(task_id) {
            if !entry.view.status.is_terminal() {
                entry.cancel.store(true, Ordering::Release);
            }
        }
        Ok(())
    }

    /// Cancel every non-terminal task in one call: the close-guard's
    /// "cancel all active tasks" path needs the whole registry, not just the
    /// one task the progress modal happens to watch.
    pub fn cancel_all(&self) -> usize {
        let tasks = self.tasks.lock().unwrap();
        let mut cancelled = 0;
        for entry in tasks.values() {
            if !entry.view.status.is_terminal() {
                entry.cancel.store(true, Ordering::Release);
                cancelled += 1;
            }
        }
        cancelled
    }

    /// Number of non-terminal tasks (queued + running). The close-app guard
    /// in `lib.rs` uses this: closing while > 0 would cancel the provider
    /// jobs, so the frontend warns the user before allowing it.
    pub fn active_task_count(&self) -> usize {
        let tasks = self.tasks.lock().unwrap();
        tasks
            .values()
            .filter(|t| !t.view.status.is_terminal())
            .count()
    }

    // ── Runner ───────────────────────────────────────────────────────────────

    async fn run_task(&self, task_id: String) {
        // The engine slot is wired at startup (Phase D); if a task lands here
        // without one, fail fast with a real error instead of simulating.
        if self.engine.lock().unwrap().is_none() {
            log::error!(
                "[Generation] run task {}: no engine configured, failing fast",
                task_id
            );
            self.finish_fail_fast(&task_id).await;
            return;
        }

        loop {
            let cancel = self.cancel_flag(&task_id);
            if cancel.load(Ordering::Acquire) {
                self.finish_cancelled(&task_id).await;
                return;
            }

            let next = {
                let tasks = self.tasks.lock().unwrap();
                let entry = match tasks.get(&task_id) {
                    Some(e) => e,
                    None => {
                        drop(tasks);
                        return;
                    }
                };
                // Compute everything we need under the lock, then drop it
                // before any await so the spawned future stays Send.
                let pos = entry
                    .view
                    .stages
                    .iter()
                    .position(|s| s.status == StageStatus::Pending);
                let pair = pos.map(|i| {
                    let stage = entry.view.stages[i].clone();
                    // Per-stage input: task-level fields + this stage's
                    // context + upstream image outputs feeding the video
                    // stage (Phase D).
                    let mut input = entry.input.clone();
                    input.stage = entry.stage_plan.get(i).and_then(|s| s.clone());
                    if stage.kind == StageKind::Video {
                        input.upstream = entry
                            .upstream_outputs
                            .iter()
                            .filter_map(|u| u.clone())
                            .collect();
                    }
                    (i, stage, input)
                });
                drop(tasks);
                pair
            };

            let Some((i, stage, input)) = next else {
                self.finish_done(&task_id).await;
                return;
            };

            self.patch_stage(&task_id, i, StageStatus::Generating, None, None, None);

            let engine = self.engine.lock().unwrap().clone().unwrap();
            let progress = Arc::new(Mutex::new(0.0f32));
            let task_id_for_live = task_id.clone();
            let registry_for_live = self.clone();
            log::debug!(
                "[Generation] task {} stage {} ({}) running",
                task_id,
                stage.id,
                stage.label
            );
            let result = engine
                .run(
                    &input,
                    &cancel,
                    &|p| {
                        let clamped = p.min(1.0).max(0.0);
                        if let Ok(mut g) = progress.lock() {
                            *g = clamped;
                        }
                        // Live-update the in-memory stage view so the progress
                        // modal's next `get_generation_task` poll sees motion.
                        // Video stages use two distinct value bands:
                        //  0.51–0.53 = 429/503 backoff ladder rung (0.51/0.52/0.53),
                        //  which maps to the `rate-limited` status so the UI shows
                        //  an amber "waiting for provider window" hint;
                        //  0.5–0.9 (excluding the ladder band) = the provider's own
                        //  job progress (0–100 % scaled into the band), which
                        //  keeps the stage in `Generating` so the top bar moves
                        //  but no false rate-limit hint is shown.
                        // Image stages only ever report 0.0/0.4/0.5/0.9, so >0.5
                        // on an image stage is never rate-limited.
                        let is_video = stage.kind == StageKind::Video;
                        let in_backoff_ladder = clamped > 0.5 && clamped <= 0.53;
                        let stage_status = if is_video && in_backoff_ladder {
                            StageStatus::RateLimited
                        } else {
                            StageStatus::Generating
                        };
                        // Mirror the value onto the stage + recompute the task
                        // average so the top progress bar moves live too.
                        registry_for_live.patch_stage_progress(
                            &task_id_for_live,
                            i,
                            stage_status,
                            clamped,
                        );
                        // Forward live progress to the UI (coalesced); a status
                        // change is emitted separately by `patch_stage`.
                        registry_for_live.emit_update(&task_id_for_live, false);
                    },
                    &|line| {
                        // Mirror the engine's short state line onto the stage view
                        // (lastEvent + lastEventAt) so the progress modal can show
                        // a live "last event" line instead of a frozen bar. The
                        // line is deliberately terse — the full request/response
                        // detail stays in the redacted log (E1).
                        registry_for_live.patch_stage_event(&task_id_for_live, i, line);
                    },
                )
                .await;

            match result {
                Ok(out) => {
                    let local = out.local_path.clone();
                    let image_output = (stage.kind == StageKind::Image).then(|| local.clone());
                    if stage.kind == StageKind::Image {
                        self.record_upstream(
                            &task_id,
                            i,
                            &local,
                            out.remote_url.as_deref(),
                            &input,
                        );
                    }
                    self.patch_stage(
                        &task_id,
                        i,
                        StageStatus::Done,
                        image_output,
                        out.remote_url.clone(),
                        None,
                    );
                    self.patch_progress(&task_id, *progress.lock().unwrap());
                    if stage.kind == StageKind::Video {
                        self.patch_output(&task_id, &local);
                    }
                }
                Err(e) => {
                    if cancel.load(Ordering::Acquire) {
                        self.finish_cancelled(&task_id).await;
                    } else {
                        log::error!(
                            "[Generation] task {} stage {} failed: {}",
                            task_id,
                            stage.label,
                            e
                        );
                        // Fail-fast (D5): abort the task, cancel the rest.
                        self.abort_with_error(&task_id, i, e).await;
                    }
                    return;
                }
            }
        }
    }

    async fn finish_done(&self, task_id: &str) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                entry.view.status = TaskStatus::Done;
                // A done task IS complete — the last engine progress tick can
                // land just short of 1.0 (e.g. the video stage's final
                // 0.9→download tick is followed by Done without a closing
                // 1.0 on every path), which leaves the terminal view's
                // averaged progress < 1.0 and the group's last pipe bar
                // stuck a hair under full. Force every stage to full so a
                // terminal Done view always reads 100%.
                for stage in entry.view.stages.iter_mut() {
                    stage.progress = 1.0;
                }
                entry.view.progress = 1.0;
            }
        }
        log::info!("[Generation] task {} done", task_id);
        self.persist_terminal(task_id).await;
        self.emit_terminal(task_id);
    }

    async fn finish_cancelled(&self, task_id: &str) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                if !entry.view.status.is_terminal() {
                    for stage in &mut entry.view.stages {
                        if matches!(
                            stage.status,
                            StageStatus::Pending
                                | StageStatus::Generating
                                | StageStatus::RateLimited
                        ) {
                            stage.status = StageStatus::Cancelled;
                        }
                    }
                    entry.view.status = TaskStatus::Cancelled;
                }
            }
        }
        log::info!("[Generation] task {} cancelled", task_id);
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
        self.emit_terminal(task_id);
    }

    /// Engine slot was somehow cleared: every pending generation stage fails
    /// with a real error; ready stages stay ready. (Unreachable in
    /// production — the provider engine is wired at startup, Phase D.)
    async fn finish_fail_fast(&self, task_id: &str) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                for stage in &mut entry.view.stages {
                    if stage.status == StageStatus::Pending {
                        stage.status = StageStatus::Error;
                        stage.error = Some("Engine not configured".to_string());
                    }
                }
                entry.view.status = TaskStatus::Error;
                entry.view.error = Some("No generation engine configured".to_string());
            }
        }
        log::error!(
            "[Generation] task {} failed: no generation engine configured",
            task_id
        );
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
        self.emit_terminal(task_id);
    }

    async fn abort_with_error(&self, task_id: &str, failed_idx: usize, message: String) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                for (i, stage) in entry.view.stages.iter_mut().enumerate() {
                    if i == failed_idx {
                        stage.status = StageStatus::Error;
                        stage.error = Some(message.clone());
                    } else if matches!(
                        stage.status,
                        StageStatus::Pending | StageStatus::Generating | StageStatus::RateLimited
                    ) {
                        stage.status = StageStatus::Cancelled;
                    }
                }
                entry.view.status = TaskStatus::Error;
                entry.view.error = Some(message);
            }
        }
        log::error!(
            "[Generation] task {} failed at stage {}",
            task_id,
            failed_idx
        );
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
        self.emit_terminal(task_id);
    }

    // ── Small state patches (single lock each) ───────────────────────────────

    fn patch_stage(
        &self,
        task_id: &str,
        idx: usize,
        status: StageStatus,
        image_output: Option<String>,
        image_remote_url: Option<String>,
        error: Option<String>,
    ) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                if let Some(stage) = entry.view.stages.get_mut(idx) {
                    stage.status = status;
                    if let Some(p) = image_output {
                        stage.image_output = Some(p);
                        stage.progress = 1.0;
                    }
                    if let Some(r) = image_remote_url {
                        stage.image_remote_url = Some(r);
                    }
                    if let Some(e) = error {
                        stage.error = Some(e);
                    }
                }
            }
        }
        // A status change is a meaningful transition — always forward it.
        self.emit_update(task_id, true);
    }

    fn patch_progress(&self, task_id: &str, value: f32) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            entry.view.stages.iter_mut().for_each(|s| {
                s.progress = s.progress.max(value);
            });
        }
    }

    /// Set a stage's status + mirror the live progress value onto it, then
    /// recompute the task-level average so the modal's top bar moves on
    /// every `on_progress` tick instead of only at stage completion.
    ///
    /// Saturation tracking (video stages): when a stage enters the 0.51–0.53
    /// backoff band, stamp `saturated_since` (Unix ms) so the modal can flag
    /// "provider load could be broken" after a long 503/429 run; when the
    /// stage leaves the band, clear it.
    fn patch_stage_progress(&self, task_id: &str, idx: usize, status: StageStatus, value: f32) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            if let Some(stage) = entry.view.stages.get_mut(idx) {
                let in_backoff = value > 0.5 && value <= 0.53;
                if in_backoff && stage.saturated_since.is_none() {
                    stage.saturated_since = Some(now_unix_ms());
                }
                if !in_backoff {
                    stage.saturated_since = None;
                }
                stage.status = status;
                stage.progress = value;
            }
            if !entry.view.stages.is_empty() {
                let sum: f32 = entry.view.stages.iter().map(|s| s.progress).sum();
                entry.view.progress = sum / entry.view.stages.len() as f32;
            }
        }
    }

    /// Mirror the engine's short state line onto the stage view so the
    /// progress modal's "last event" line updates live (e.g. "queue full —
    /// retry in 30 s", "rendering 42%"). Timestamp = now (Unix ms); the
    /// full request/response detail stays in the redacted log (E1).
    fn patch_stage_event(&self, task_id: &str, idx: usize, line: &str) {
        let now = now_unix_ms();
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            if let Some(stage) = entry.view.stages.get_mut(idx) {
                stage.last_event = Some(line.to_string());
                stage.last_event_at = Some(now);
            }
        }
        drop(tasks);
        // Forward the live snapshot so the modal sees the new state line
        // without waiting for the next progress tick.
        self.emit_update(task_id, false);
    }

    fn patch_output(&self, task_id: &str, path: &str) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            entry.view.output_path = Some(path.to_string());
        }
    }

    /// Record a finished image stage's output as an upstream image feeding
    /// the video stage (`url` pieces use their remote source instead of a
    /// generated file). Stable order: keyframes slot order then subjects.
    fn record_upstream(
        &self,
        task_id: &str,
        idx: usize,
        path: &str,
        remote_url: Option<&str>,
        input: &EngineInput,
    ) {
        let kind = match &input.stage {
            Some(st) => match st.kind {
                SourceKind::Keyframe => "keyframe",
                SourceKind::Subject => "subject",
                _ => "keyframe",
            },
            None => "keyframe",
        };
        let source_id = match &input.stage {
            Some(st) => st
                .ordinal
                .map(|o| o.to_string())
                .unwrap_or_else(|| kind.to_string()),
            None => kind.to_string(),
        };
        let local = if input
            .stage
            .as_ref()
            .and_then(|st| st.image_src.clone())
            .is_some()
        {
            input
                .stage
                .as_ref()
                .and_then(|st| st.image_src.clone())
                .unwrap()
        } else {
            path.to_string()
        };
        // `url` pieces: primary is the user's remote source (image_src), local
        // is the generated-preview path when one exists. Generated pieces:
        // primary is the provider's remote URL (from StageOutput) when
        // returned, else the local file the provider engine materialized.
        let remote = remote_url.filter(|r| !r.is_empty());
        let primary = remote
            .map(std::string::ToString::to_string)
            .unwrap_or_else(|| {
                if input
                    .stage
                    .as_ref()
                    .and_then(|st| st.image_src.clone())
                    .is_some()
                {
                    local.clone()
                } else {
                    path.to_string()
                }
            });
        let up = UpstreamOutput {
            source_id,
            kind: kind.to_string(),
            primary,
            local_path: local,
        };
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            if let Some(slot) = entry.upstream_outputs.get_mut(idx) {
                *slot = Some(up);
            }
        }
    }

    fn cancel_flag(&self, task_id: &str) -> Arc<AtomicBool> {
        self.tasks
            .lock()
            .unwrap()
            .get(task_id)
            .map(|t| t.cancel.clone())
            .unwrap_or_else(|| Arc::new(AtomicBool::new(true)))
    }

    fn refresh_progress(&self, task_id: &str) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            if !entry.view.stages.is_empty() {
                let sum: f32 = entry.view.stages.iter().map(|s| s.progress).sum();
                entry.view.progress = sum / entry.view.stages.len() as f32;
            }
        }
    }

    async fn persist_terminal(&self, task_id: &str) {
        let view = match self.get(task_id) {
            Some(v) => v,
            None => return,
        };
        if !view.status.is_terminal() {
            return;
        }
        let stages_json = serde_json::to_string(&view.stages).unwrap_or_else(|_| "[]".to_string());
        let _ = self
            .db
            .update_generation_task(
                task_id,
                view.status.as_str(),
                view.progress as f64,
                &stages_json,
                view.output_path.as_deref(),
                view.error.as_deref(),
            )
            .await;
    }
}

/// Build the per-stage `EngineStage` plan + the upstream-output slots from
/// a pipe snapshot (docs/provider-engine-tasks.md, Phase D). `Ready`
/// (`url`) pieces get a plan entry with `image_src` set so the video stage
/// consumes the remote URL directly; generated pieces carry their prompt /
/// image type / reference URL. The video stage's plan entry carries the pipe
/// media mode + frame count for the shaper.
fn build_stage_plan(
    pipe: &Pipe,
    stages: &[GenerationStageView],
) -> (Vec<Option<EngineStage>>, Vec<Option<UpstreamOutput>>) {
    let mut plan: Vec<Option<EngineStage>> = Vec::with_capacity(stages.len());
    let mut upstream: Vec<Option<UpstreamOutput>> = Vec::with_capacity(stages.len());

    for stage in stages {
        match stage.source_kind {
            SourceKind::Keyframe => {
                // Match by source_id so the plan aligns with `view.stages`
                // even when the re-fetched pipe differs from the one that
                // built the stages (e.g. a session with no saved composer).
                let kf = pipe
                    .keyframes
                    .iter()
                    .find(|k| k.id == stage.source_id)
                    .or_else(|| pipe.keyframes.first());
                plan.push(kf.map(|kf| {
                    let ty = if kf.kind.is_empty() {
                        "url"
                    } else {
                        kf.kind.as_str()
                    };
                    EngineStage {
                        kind: SourceKind::Keyframe,
                        prompt: kf.prompt.clone(),
                        ordinal: Some(u32::from(kf.slot_index)),
                        ref_id: Some(kf.id.clone()),
                        image_type: Some(ty.to_string()),
                        reference_url: kf.reference_url.clone(),
                        image_src: if ty == "url" {
                            kf.image_src.clone()
                        } else {
                            None
                        },
                        media_mode: None,
                        length_frames: pipe.length_frames,
                    }
                }));
                // Pre-seed already-available pieces: the user's remote URL for
                // `url` keyframes, or a settled previewRemoteUrl for generated
                // ones (skipped from regeneration by build_stages). Either way
                // the video stage consumes the fetchable source directly. A
                // queued force-regen defers the pre-seed so the freshly
                // generated output (record_upstream) is what feeds the video.
                upstream.push(
                    kf.filter(|k| {
                        if k.force_regen {
                            return false;
                        }
                        let has_url =
                            (k.kind.is_empty() || k.kind == "url") && k.image_src.is_some();
                        let has_preview = k
                            .preview_remote_url
                            .as_deref()
                            .filter(|u| !u.is_empty())
                            .is_some();
                        has_url || has_preview
                    })
                    .map(|k| {
                        let primary = k
                            .preview_remote_url
                            .as_deref()
                            .filter(|u| !u.is_empty())
                            .or(k.image_src.as_deref())
                            .unwrap_or_default()
                            .to_string();
                        UpstreamOutput {
                            source_id: k.id.clone(),
                            kind: "keyframe".to_string(),
                            primary,
                            local_path: k.preview_local_path.clone().unwrap_or_default(),
                        }
                    }),
                );
            }
            SourceKind::Subject => {
                let sr = pipe
                    .subject_references
                    .iter()
                    .find(|s| s.id == stage.source_id)
                    .or_else(|| pipe.subject_references.first());
                plan.push(sr.map(|sr| {
                    let ty = if sr.kind.is_empty() {
                        "url"
                    } else {
                        sr.kind.as_str()
                    };
                    EngineStage {
                        kind: SourceKind::Subject,
                        prompt: sr.prompt.clone(),
                        ordinal: None,
                        ref_id: Some(sr.id.clone()),
                        image_type: Some(ty.to_string()),
                        reference_url: None,
                        image_src: if ty == "url" {
                            Some(sr.image_url.clone())
                        } else {
                            None
                        },
                        media_mode: None,
                        length_frames: pipe.length_frames,
                    }
                }));
                // Pre-seed already-available subjects: the user's remote URL
                // for `url` refs, or a settled previewRemoteUrl for generated
                // ones (skipped from regeneration by build_stages). A queued
                // force-regen defers the pre-seed so the fresh output is used.
                upstream.push(
                    sr.filter(|s| {
                        if s.force_regen {
                            return false;
                        }
                        let has_url =
                            (s.kind.is_empty() || s.kind == "url") && !s.image_url.is_empty();
                        let has_preview = s
                            .preview_remote_url
                            .as_deref()
                            .filter(|u| !u.is_empty())
                            .is_some();
                        has_url || has_preview
                    })
                    .map(|s| {
                        let primary = s
                            .preview_remote_url
                            .as_deref()
                            .filter(|u| !u.is_empty())
                            .unwrap_or(&s.image_url)
                            .to_string();
                        UpstreamOutput {
                            source_id: s.id.clone(),
                            kind: "subject".to_string(),
                            primary,
                            local_path: s.preview_local_path.clone().unwrap_or_default(),
                        }
                    }),
                );
            }
            SourceKind::Video => {
                plan.push(Some(EngineStage {
                    kind: SourceKind::Video,
                    prompt: None,
                    ordinal: None,
                    ref_id: None,
                    image_type: None,
                    reference_url: None,
                    image_src: None,
                    media_mode: Some(pipe.media_mode.clone()),
                    length_frames: pipe.length_frames,
                }));
                // The video stage carries no upstream slot of its own.
                upstream.push(None);
            }
        }
    }
    (plan, upstream)
}

fn stage_image(
    task_id: &str,
    label: &str,
    source_kind: SourceKind,
    source_id: &str,
    ready: bool,
) -> GenerationStageView {
    GenerationStageView {
        id: format!("{task_id}:{source_kind:?}:{source_id}"),
        label: label.to_string(),
        kind: StageKind::Image,
        source_kind,
        source_id: source_id.to_string(),
        status: if ready {
            StageStatus::Ready
        } else {
            StageStatus::Pending
        },
        progress: if ready { 1.0 } else { 0.0 },
        error: None,
        image_output: None,
        image_remote_url: None,
        rate_limited: None,
        saturated_since: None,
        last_event: None,
        last_event_at: None,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::engine::StageOutput;
    use crate::models::composer::{Keyframe, Pipe, SubjectReference};
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    /// Test double for the runner path — NOT a shipped mock: the product
    /// ships with no engine (D1), tests only exercise the runner logic.
    struct TestEngine {
        delay_ms: u64,
        fail: bool,
    }

    impl GenerationEngine for TestEngine {
        fn run<'a>(
            &'a self,
            _input: &'a EngineInput,
            cancel: &'a AtomicBool,
            on_progress: &'a (dyn Fn(f32) + Sync),
            on_event: &'a (dyn Fn(&str) + Sync),
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<StageOutput, String>> + Send + 'a>,
        > {
            Box::pin(async move {
                // Test double: report one state line so the registry's
                // `patch_stage_event` path is exercised in tests too.
                on_event("test engine running");
                let step = std::time::Duration::from_millis(20);
                let ticks = self.delay_ms / 20;
                for _ in 0..ticks {
                    tokio::time::sleep(step).await;
                    if cancel.load(Ordering::Acquire) {
                        return Err("cancelled".to_string());
                    }
                }
                // progress callback is only used after all awaits — the
                // `&dyn Fn` borrow must not live across an await point.
                on_progress(1.0);
                if self.fail {
                    return Err("engine exploded".to_string());
                }
                Ok(StageOutput {
                    local_path: "/tmp/out.mp4".into(),
                    remote_url: None,
                })
            })
        }
    }

    fn keyframe(id: &str, slot: u8, ty: &str, img: &str) -> Keyframe {
        Keyframe {
            id: id.into(),
            frame: 0,
            slot_index: slot,
            kind: ty.into(),
            image_src: if ty == "url" { Some(img.into()) } else { None },
            prompt: if ty != "url" {
                Some("test prompt".into())
            } else {
                None
            },
            reference_url: None,
            preview_remote_url: None,
            preview_local_path: None,
            status: "pending".into(),
            force_regen: false,
        }
    }

    fn subject_ref(id: &str, ty: &str, img: &str, prompt: &str) -> SubjectReference {
        SubjectReference {
            id: id.into(),
            image_url: img.into(),
            kind: ty.into(),
            prompt: Some(prompt.into()),
            preview_remote_url: None,
            preview_local_path: None,
            status: "pending".into(),
            use_frames: false,
            frame_start: None,
            frame_end: None,
            visible: true,
            force_regen: false,
        }
    }

    fn fixture_pipe() -> Pipe {
        Pipe {
            id: "p1".into(),
            name: "P".into(),
            length_frames: 121,
            q_value: 18,
            c_value: 7.0,
            keyframes: vec![
                keyframe("k1", 1, "url", "a.png"),
                keyframe("k2", 2, "txt2img", ""),
            ],
            subject_references: vec![subject_ref("s1", "img2img", "ref.png", "hero")],
            elements: vec![],
            order_index: 0,
            last_generation: None,
            media_mode: "keyframes".into(),
        }
    }

    fn engine_input() -> EngineInput {
        EngineInput {
            task_id: "t1".into(),
            media_root: None,
            prompt: "<heuristics>...</heuristics>".into(),
            pipe_id: "p1".into(),
            pipe_name: None,
            fps: 24,
            resolution: "720p".into(),
            orientation: "horizontal".into(),
            q_value: 18,
            c_value: 7.0,
            image_model: None,
            video_model: None,
            seed: None,
            profile_id: None,
            image_spec: None,
            video_spec: None,
            stage: None,
            upstream: Vec::new(),
        }
    }

    async fn no_engine_db() -> (Database, String) {
        let opts = SqliteConnectOptions::new()
            .in_memory(true)
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        let db = Database::from_pool(pool);
        db.migrate().await.unwrap();
        // FKs are enforced: seed a valid profile → project → session chain.
        let profile = db.create_profile("default").await.unwrap();
        let pid = db
            .create_project(&profile, "a project", None)
            .await
            .unwrap();
        let sid = db
            .create_session(&pid, "a session", None, None)
            .await
            .unwrap();
        (db, sid)
    }

    fn make_view(task_id: &str, pipe: &Pipe, sid: &str) -> GenerationTaskView {
        GenerationTaskView {
            task_id: task_id.into(),
            session_id: sid.to_string(),
            pipe_id: pipe.id.clone(),
            status: TaskStatus::Queued,
            progress: 0.0,
            stages: TaskRegistry::build_stages(task_id, pipe),
            error: None,
            output_path: None,
            request_log: None,
            started_at: 0, // start() stamps the real value
        }
    }

    async fn wait_terminal(registry: &TaskRegistry, id: &str) -> GenerationTaskView {
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                if let Some(v) = registry.get(id) {
                    if v.status.is_terminal() {
                        return v;
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("task did not reach a terminal state")
    }

    #[test]
    fn build_stages_lists_ready_and_generation_stages() {
        let pipe = fixture_pipe();
        let stages = TaskRegistry::build_stages("t1", &pipe);
        assert_eq!(stages.len(), 4, "2 kfs + 1 subject + 1 video stage");
        assert_eq!(
            stages[0].status,
            StageStatus::Ready,
            "url keyframe is ready"
        );
        assert_eq!(stages[0].source_kind, SourceKind::Keyframe);
        assert_eq!(
            stages[1].status,
            StageStatus::Pending,
            "txt2img needs engine"
        );
        assert_eq!(
            stages[2].status,
            StageStatus::Pending,
            "img2img subject needs engine"
        );
        assert_eq!(stages[2].source_kind, SourceKind::Subject);
        assert_eq!(stages[3].kind, StageKind::Video);
        assert_eq!(stages[3].status, StageStatus::Pending);
    }

    #[test]
    fn build_stages_produces_unique_stage_ids() {
        // Regression: image-stage ids were `{task}:{SourceKind}` only, so two
        // keyframes (or two subjects) in one pipe shared an id. The progress
        // modal keys its stage list on `stage.id`, which threw
        // `each_key_duplicate`. The id must now be unique per piece.
        let pipe = fixture_pipe();
        let stages = TaskRegistry::build_stages("t1", &pipe);
        let ids: std::collections::HashSet<_> = stages.iter().map(|s| s.id.clone()).collect();
        assert_eq!(
            ids.len(),
            stages.len(),
            "stage ids must be unique (frontend keys the list on them)"
        );
    }

    #[tokio::test]
    async fn without_engine_task_fails_fast_with_real_error() {
        let (db, sid) = no_engine_db().await;
        let registry = TaskRegistry::new(db.clone());
        let pipe = fixture_pipe();
        let view = make_view("t1", &pipe, &sid);
        registry.start(view, engine_input()).await.unwrap();

        let out = wait_terminal(&registry, "t1").await;
        assert_eq!(out.status, TaskStatus::Error);
        assert_eq!(
            out.error.as_deref(),
            Some("No generation engine configured")
        );
        assert_eq!(
            out.stages[0].status,
            StageStatus::Ready,
            "ready stage stays ready"
        );
        assert_eq!(out.stages[1].status, StageStatus::Error);
        assert_eq!(
            out.stages[1].error.as_deref(),
            Some("Engine not configured")
        );

        // terminal row persisted
        let row = db.get_generation_task_row("t1").await.unwrap().unwrap();
        assert_eq!(row.status, "error");
        assert!(row.stages_json.is_some());
    }

    #[tokio::test]
    async fn sequential_rejects_second_task_while_active() {
        let (db, sid) = no_engine_db().await;
        let registry = TaskRegistry::new(db);
        registry.set_engine(Arc::new(TestEngine {
            delay_ms: 600,
            fail: false,
        }) as Arc<dyn GenerationEngine>);
        let pipe = fixture_pipe();

        registry
            .start(make_view("t1", &pipe, &sid), engine_input())
            .await
            .unwrap();
        let err = registry
            .start(make_view("t2", &pipe, &sid), engine_input())
            .await
            .unwrap_err();
        assert!(err.contains("already in progress"), "got: {err}");

        // after t1 finishes, a new task is allowed again
        wait_terminal(&registry, "t1").await;
        registry
            .start(make_view("t3", &pipe, &sid), engine_input())
            .await
            .unwrap();
        let out = wait_terminal(&registry, "t3").await;
        assert_eq!(out.status, TaskStatus::Done);
        assert_eq!(out.output_path.as_deref(), Some("/tmp/out.mp4"));
    }

    #[tokio::test]
    async fn cancel_aborts_running_task() {
        let (db, sid) = no_engine_db().await;
        let registry = TaskRegistry::new(db);
        registry.set_engine(Arc::new(TestEngine {
            delay_ms: 500,
            fail: false,
        }) as Arc<dyn GenerationEngine>);
        let pipe = fixture_pipe();

        registry
            .start(make_view("t1", &pipe, &sid), engine_input())
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        registry.cancel("t1").unwrap();

        let out = wait_terminal(&registry, "t1").await;
        assert_eq!(out.status, TaskStatus::Cancelled);
        assert!(out.output_path.is_none());
        let pending = out
            .stages
            .iter()
            .filter(|s| s.status == StageStatus::Cancelled)
            .count();
        assert!(pending >= 1, "remaining stages must be cancelled");
    }

    #[tokio::test]
    async fn cancel_unknown_or_terminal_task_is_noop() {
        // Tolerance (close-guard fix): a cancel racing the engine's own
        // terminal transition — or hitting an evicted id — must not error
        // the caller; it just lands as a no-op.
        let (db, _sid) = no_engine_db().await;
        let registry = TaskRegistry::new(db);
        registry.cancel("never-started").unwrap();
        assert_eq!(registry.active_task_count(), 0);
    }

    #[tokio::test]
    async fn cancel_all_cancels_every_non_terminal_task() {
        let (db, sid) = no_engine_db().await;
        let registry = TaskRegistry::new(db);
        registry.set_engine(Arc::new(TestEngine {
            delay_ms: 500,
            fail: false,
        }) as Arc<dyn GenerationEngine>);
        let pipe = fixture_pipe();

        registry
            .start(make_view("t1", &pipe, &sid), engine_input())
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        let cancelled = registry.cancel_all();
        assert_eq!(cancelled, 1, "the non-terminal task gets the flag");
        let out = wait_terminal(&registry, "t1").await;
        assert_eq!(out.status, TaskStatus::Cancelled);
        assert_eq!(registry.active_task_count(), 0, "terminal once settled");

        // A second run after the first settles: cancel_all still flags every
        // live task (sequential slot freed) and an already-terminal task is
        // counted as 0, not re-cancelled.
        registry
            .start(make_view("t2", &pipe, &sid), engine_input())
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        let cancelled2 = registry.cancel_all();
        assert_eq!(cancelled2, 1);
        let out2 = wait_terminal(&registry, "t2").await;
        assert_eq!(out2.status, TaskStatus::Cancelled);
    }

    #[tokio::test]
    async fn engine_failure_aborts_task_and_cancels_remaining() {
        let (db, sid) = no_engine_db().await;
        let registry = TaskRegistry::new(db);
        registry.set_engine(Arc::new(TestEngine {
            delay_ms: 100,
            fail: true,
        }) as Arc<dyn GenerationEngine>);
        let pipe = fixture_pipe();

        registry
            .start(make_view("t1", &pipe, &sid), engine_input())
            .await
            .unwrap();
        let out = wait_terminal(&registry, "t1").await;
        assert_eq!(out.status, TaskStatus::Error);
        assert_eq!(out.error.as_deref(), Some("engine exploded"));
        assert_eq!(
            out.stages[3].status,
            StageStatus::Cancelled,
            "video stage cancelled after image failure"
        );
    }
}
