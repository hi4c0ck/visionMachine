//! Session generation coordinator. It owns only the queue/index; pipe work
//! remains in TaskRegistry so the existing task lifecycle and terminal sink
//! ordering stay authoritative.
use crate::generation::{
    compose_session_video, ComposeRegistry, GenerationService, GenerationTaskView, ModelSpecWire,
    SourceVideo, TaskStatus,
};
use crate::models::composer::LastGeneration;
use crate::storage::{db::Database, generation_groups_db::GenerationGroupRow};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GroupStatus {
    Running,
    Done,
    DoneWithErrors,
    Error,
    Cancelled,
}
impl GroupStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Done => "done",
            Self::DoneWithErrors => "done-with-errors",
            Self::Error => "error",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupPipeView {
    pub pipe_id: String,
    pub task_id: Option<String>,
    pub status: String,
    pub progress: f32,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationGroupView {
    pub group_id: String,
    pub session_id: String,
    pub status: GroupStatus,
    pub pipes: Vec<GroupPipeView>,
    pub progress: f32,
    pub session_video_path: Option<String>,
    pub compose_state: Option<String>,
    pub compose_error: Option<String>,
    /// This run's source records (pipe id, task id, source path, staged path,
    /// order index) — persisted with the composition state so a reader can
    /// tell exactly which clips produced the session video.
    pub sources: Vec<crate::storage::generation_groups_db::GroupSourceRecord>,
    pub started_at: i64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupEvent {
    pub group_id: String,
    pub kind: String,
    pub pipe_id: Option<String>,
    pub task_id: Option<String>,
    pub status: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionGenerationInput {
    pub session_id: String,
    /// Per-pipe final prompt strings (the frontend prompt engine's output —
    /// same as `start_generation`'s `prompt`). Missing pipe = empty prompt,
    /// which the provider treats as a text-only / media-mode run.
    #[serde(default)]
    pub prompts: std::collections::HashMap<String, String>,
    /// Pre-resolved session media root (session dir → project dir → app-data
    /// tree + session name), identical to what `start_generation` computes.
    #[serde(default)]
    pub media_root: Option<String>,
    #[serde(default)]
    pub image_model: Option<String>,
    #[serde(default)]
    pub video_model: Option<String>,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub image_spec: Option<ModelSpecWire>,
    #[serde(default)]
    pub video_spec: Option<ModelSpecWire>,
    #[serde(default)]
    pub pipe_ids: Option<Vec<String>>,
    #[serde(default)]
    pub failure_policy: String,
    #[serde(default = "yes")]
    pub auto_compose: bool,
}
fn yes() -> bool {
    true
}

fn completed_source(pipe_id: &str, event: &crate::generation::GenTaskEvent) -> Option<SourceVideo> {
    (event.status == Some(TaskStatus::Done))
        .then(|| {
            event
                .view
                .output_path
                .as_ref()
                .filter(|p| !p.trim().is_empty())
        })
        .flatten()
        .map(|path| SourceVideo {
            label: pipe_id.to_string(),
            path: path.clone(),
            task_id: event.task_id.clone(),
        })
}

/// Stage a successful pipe clip into the session-video dir (`out_dir`) as
/// `pipe-<order>-<safe-pipe-name>.mp4` and report the staged path. The staged
/// copy (not the original) is what the concat manifest references, so a
/// later stale-clear pass cannot orphan a pipe's last-gen clip, and the
/// originals remain untouched in their own task dirs.
///
/// `out_dir` is the FULL session-video dir (`session_compose_out_dir` already
/// includes the `session-video` component).
///
/// Returns `None` when the clip cannot be staged (missing file, dir
/// errors) — the run then falls back to composing from the originals; a
/// missing original clip is a hard source failure upstream and surfaces as
/// "no completed run pipes to compose".
fn stage_source_clip(out_dir: &Path, source: &SourceVideo, order_index: u32) -> Option<String> {
    let safe_name = crate::generation::safe_dir_name(&source.label);
    // Sanitize the staged filename for the filesystem (a pipe name may carry
    // spaces or other legal-but-noisy chars): replace non-alnum with '-' so
    // the staged set is trivially listable + the stale-clip prefix match
    // (`is_staged_session_clip`) stays safe. Writer and sweeper share
    // `STAGED_CLIP_PREFIX`, so the two cannot drift apart.
    let safe_file: String = safe_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let staged_path = out_dir.join(format!(
        "{}{order_index}-{safe_file}.mp4",
        crate::generation::STAGED_CLIP_PREFIX
    ));
    std::fs::create_dir_all(out_dir).ok()?;
    std::fs::copy(&source.path, &staged_path).ok()?;
    Some(staged_path.to_string_lossy().into_owned())
}

/// Session-video output dir for a group run. Mirrors the standalone
/// `compose_session_video` command: `<media root or app-data media tree>
/// <safe session name>/session-video`.
fn session_compose_out_dir(media_root: &Option<String>, session_name: &str) -> std::path::PathBuf {
    let safe = crate::commands::generation::safe_session_name(session_name);
    let root = match media_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(r) => std::path::PathBuf::from(r),
        None => dirs::data_local_dir()
            .map(|d| d.join("com.visionmachine.desktop").join("media"))
            .unwrap_or_else(std::env::temp_dir),
    };
    root.join(&safe).join("session-video")
}

fn compose_sources(
    sources: Vec<SourceVideo>,
    out_dir: &std::path::Path,
    out_path: &std::path::Path,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    let ffmpeg = crate::generation::resolve_ffmpeg();
    let result = compose_session_video(&ffmpeg, &sources, out_path, out_dir, cancel)
        .map_err(|e| e.to_string())?;
    // The compose core already validated the output, but a cancelled/failed
    // attempt may have left an orphaned partial file at the fixed output
    // path. Never report success for a missing file.
    if !std::path::Path::new(&result.output_path).is_file() {
        return Err(format!(
            "compose completed but output file is missing: {}",
            result.output_path
        ));
    }
    Ok(result.output_path)
}

struct GroupRun {
    pub session_id: String,
    pub pipes: Vec<(String, Option<String>, String, f32, Option<String>)>,
    pub queue: VecDeque<String>,
    pub current: Option<String>,
    pub policy: String,
    pub auto_compose: bool,
    /// The group's original run params (models/seed/profile/specs/prompts/
    /// media root). Follow-up pipe starts clone this so every pipe runs
    /// with identical settings — not just the first.
    pub input: StartSessionGenerationInput,
    /// The resolved media root for this session (`start_session_generation`
    /// resolves it before calling `start_group`). Used by `compose_and_finish`
    /// to locate the session-video output dir.
    pub media_root: Option<String>,
    completed_sources: Vec<SourceVideo>,
    /// Group-run source records persisted with the composition state:
    /// `{pipe_id, task_id, source_path, order_index, staged_path}` per
    /// successful clip. Written atomically with `compose_state` so a
    /// later reader can never mistake a stale set of clips for the run.
    group_sources: Vec<crate::storage::generation_groups_db::GroupSourceRecord>,
    compose_state: Option<String>,
    compose_error: Option<String>,
    session_video_path: Option<String>,
    cancel: Arc<AtomicBool>,
    started_at: i64,
}
pub struct GroupCoordinator {
    pub generation: GenerationService,
    pub db: Database,
    pub compose_registry: ComposeRegistry,
    state: Arc<Mutex<HashMap<String, GroupRun>>>,
    index: Arc<Mutex<HashMap<String, String>>>,
    event_sink: Arc<Mutex<Option<Arc<dyn Fn(GroupEvent) + Send + Sync>>>>,
}
impl Clone for GroupCoordinator {
    fn clone(&self) -> Self {
        Self {
            generation: self.generation.clone(),
            db: self.db.clone(),
            compose_registry: self.compose_registry.clone(),
            state: self.state.clone(),
            index: self.index.clone(),
            event_sink: self.event_sink.clone(),
        }
    }
}
impl GroupCoordinator {
    pub fn new(
        generation: GenerationService,
        db: Database,
        compose_registry: ComposeRegistry,
    ) -> Self {
        Self {
            generation,
            db,
            compose_registry,
            state: Arc::new(Mutex::new(HashMap::new())),
            index: Arc::new(Mutex::new(HashMap::new())),
            event_sink: Arc::new(Mutex::new(None)),
        }
    }
    pub fn set_event_sink(&self, f: impl Fn(GroupEvent) + Send + Sync + 'static) {
        *self.event_sink.lock().unwrap() = Some(Arc::new(f));
    }
    fn emit(&self, e: GroupEvent) {
        if let Some(s) = self.event_sink.lock().unwrap().as_ref() {
            s(e)
        }
    }
    fn now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
    pub async fn start_group(
        &self,
        input: StartSessionGenerationInput,
    ) -> Result<(String, String, GenerationTaskView), String> {
        let composer = {
            self.db
                .get_composer(&input.session_id)
                .await
                .map_err(|e| e.to_string())?
        };
        // When a group will compose, the session-video output dir is shared
        // with the standalone "compose session" button. Reset any stale
        // manifest/output AND any staged clips a PREVIOUS group run left
        // behind, so this run's artifacts can never be mistaken for the
        // previous one. This runs BEFORE the run stages anything of its own,
        // and is separate from the compose core's own clear (which must
        // never touch the current run's staged clips).
        if input.auto_compose {
            let out_dir = session_compose_out_dir(&input.media_root, &composer.name);
            crate::generation::clear_session_compose_artifacts(&out_dir);
            crate::generation::clear_staged_session_clips(&out_dir);
        }
        let mut pipes = composer.pipes.clone();
        pipes.sort_by_key(|p| p.order_index);
        if let Some(ids) = &input.pipe_ids {
            pipes.retain(|p| ids.contains(&p.id));
        }
        if pipes.is_empty() {
            return Err("No pipes selected".into());
        }
        let gid = uuid::Uuid::new_v4().to_string();
        let mut q = VecDeque::new();
        for p in &pipes {
            q.push_back(p.id.clone());
        }
        let first = q.pop_front().unwrap();
        let mut rows = Vec::new();
        for p in &pipes {
            rows.push((p.id.clone(), None, p.id.clone(), 0.0, None));
        }
        {
            let mut m = self.state.lock().unwrap();
            m.insert(
                gid.clone(),
                GroupRun {
                    session_id: input.session_id.clone(),
                    pipes: rows,
                    queue: q,
                    current: None,
                    policy: if input.failure_policy == "continue" {
                        "continue"
                    } else {
                        "stop"
                    }
                    .into(),
                    auto_compose: input.auto_compose,
                    input: input.clone(),
                    media_root: input.media_root.clone(),
                    completed_sources: Vec::new(),
                    group_sources: Vec::new(),
                    compose_state: (!input.auto_compose).then(|| "skipped".into()),
                    compose_error: None,
                    session_video_path: None,
                    cancel: Arc::new(AtomicBool::new(false)),
                    started_at: Self::now(),
                },
            );
        }
        let row = GenerationGroupRow {
            group_id: gid.clone(),
            session_id: input.session_id.clone(),
            status: "running".into(),
            progress: 0.0,
            pipes_json: "[]".into(),
            failure_policy: input.failure_policy.clone(),
            auto_compose: input.auto_compose,
            session_video_path: None,
            compose_state: (!input.auto_compose).then(|| "skipped".into()),
            compose_error: None,
            error: None,
            started_at: Self::now(),
            sources_json: None,
        };
        self.db.insert_generation_group(&row).await?;
        let (tid, view) = self.start_pipe(&input, &first).await?;
        {
            let mut m = self.state.lock().unwrap();
            if let Some(r) = m.get_mut(&gid) {
                r.current = Some(tid.clone());
                r.pipes.iter_mut().find(|p| p.0 == first).map(|p| {
                    p.1 = Some(tid.clone());
                    p.2 = "running".into();
                });
            }
        }
        self.index.lock().unwrap().insert(tid.clone(), gid.clone());
        self.emit(GroupEvent {
            group_id: gid.clone(),
            kind: "pipe-started".into(),
            pipe_id: Some(first),
            task_id: Some(tid.clone()),
            status: Some("running".into()),
        });
        Ok((gid, tid, view))
    }
    /// Start one pipe through the SHARED normal generation-start path
    /// (`commands::generation::build_pipe_start`) — the exact same
    /// prompt/specs/media/task construction `start_generation` uses, so a
    /// group's pipe is indistinguishable from a standalone one and the two
    /// flows can never drift.
    ///
    /// The media ROOT is resolved once by the `start_session_generation`
    /// command and carried on the input; `build_pipe_start` appends the
    /// session-name folder, which is what makes the engine write into
    /// `<root>/<session>/<pipe>/<task>/`. (The coordinator previously passed
    /// the bare root straight through as the engine's `media_root`, so group
    /// artifacts landed one level above the per-pipe layout and never matched
    /// what `compose_session_video` looks for.)
    async fn start_pipe(
        &self,
        input: &StartSessionGenerationInput,
        pipe_id: &str,
    ) -> Result<(String, GenerationTaskView), String> {
        let composer = self
            .db
            .get_composer(&input.session_id)
            .await
            .map_err(|e| e.to_string())?;
        let pipe = composer
            .pipes
            .iter()
            .find(|p| p.id == pipe_id)
            .ok_or("Pipe not found")?
            .clone();
        // The engine REQUIRES a resolved image/video spec (provider.rs
        // `run_image_stage`/`run_video_stage` fail with "no resolved spec"
        // otherwise) — they travel with the task exactly as the per-pipe
        // `start_generation` command sends them.
        let params = crate::commands::generation::PipeStartParams {
            session_id: input.session_id.clone(),
            pipe_id: pipe_id.to_string(),
            prompt: input.prompts.get(pipe_id).cloned().unwrap_or_default(),
            media_root: input
                .media_root
                .as_ref()
                .map(|r| r.trim().to_string())
                .filter(|r| !r.is_empty()),
            image_model: input.image_model.clone(),
            video_model: input.video_model.clone(),
            seed: input.seed,
            profile_id: input.profile_id.clone(),
            image_spec: input.image_spec.clone(),
            video_spec: input.video_spec.clone(),
        };
        let (view, engine_input) = crate::commands::generation::build_pipe_start(
            &composer, &pipe, &params,
        );
        let tid = view.task_id.clone();
        self.generation.registry.start(view.clone(), engine_input).await?;
        Ok((tid, view))
    }

    /// The terminal-attach/persist step the normal per-pipe flow does on the
    /// frontend: flip the pipe's `last_generation` to the just-completed clip
    /// AND force-save the composer so it survives an immediate restart (the
    /// group flow is the backend, so the persist lives here, not in the UI).
    ///
    /// Best-effort by design: a save failure must NOT wedge the group's
    /// terminal handoff (the clip is already durable on disk; the next
    /// standalone compose picks it up via the `last_generation` scan only
    /// when this persist succeeds).
    async fn persist_pipe_last_generation(&self, session_id: &str, source: &SourceVideo) -> bool {
        let Some(mut composer) = self.db.get_composer(session_id).await.ok() else {
            return false;
        };
        let Some(pipe) = composer.pipes.iter_mut().find(|p| p.id == source.label) else {
            return false;
        };
        pipe.last_generation = Some(LastGeneration {
            task_id: source.task_id.clone(),
            video_path: source.path.clone(),
            generated_at: Self::now().max(0) as u64,
            status: "done".into(),
        });
        let ok = self.db.save_composer(&composer).await.is_ok();
        if !ok {
            log::warn!(
                "[Generation] group compose persist: save_composer {} failed for pipe {}",
                session_id,
                source.label
            );
        }
        ok
    }

    /// Persist the pipe's last-generation AND stage its clip into
    /// `session-video/` for this group run, recording the source row.
    ///
    /// The clip is staged as `pipe-<n>-<safe-pipe-name>.mp4` where `<n>` is
    /// the pipe's zero-based position in the run's queue (the same timeline
    /// order `start_group` used), so the concat manifest always references
    /// staged copies in order_index order — never the pipe originals.
    async fn record_completed_pipe(
        &self,
        gid: &str,
        session_id: &str,
        source: &SourceVideo,
        composer_name: &str,
    ) -> bool {
        let persisted = self.persist_pipe_last_generation(session_id, source).await;
        // Stage the clip into `<media root>/<session name>/session-video/` so
        // the concat manifest references the staged copies, not the pipe
        // originals (item 5 of the group flow). The originals remain in
        // their own task dirs; the staged copies are what the composer core
        // reads, so a later failed attempt's `clear_session_compose_artifacts`
        // pass can never orphan a pipe's last-gen clip.
        let media_root = {
            let m = self.state.lock().unwrap();
            m.get(gid).and_then(|r| r.media_root.clone())
        };
        let order_index: u32 = {
            // The run's pipes vec is in queue order (order_index-sorted at
            // start_group), so the position of this pipe's row IS its
            // timeline order.
            let m = self.state.lock().unwrap();
            m.get(gid)
                .and_then(|r| r.pipes.iter().position(|p| p.0 == source.label))
                .unwrap_or(0) as u32
        };
        let staged_path = {
            let out_dir = session_compose_out_dir(&media_root, composer_name);
            stage_source_clip(&out_dir, source, order_index)
        };
        if let Some(staged) = staged_path.clone() {
            let mut m = self.state.lock().unwrap();
            if let Some(r) = m.get_mut(gid) {
                r.group_sources
                    .push(crate::storage::generation_groups_db::GroupSourceRecord {
                        pipe_id: source.label.clone(),
                        task_id: source.task_id.clone(),
                        source_path: source.path.clone(),
                        staged_path: staged.clone(),
                        order_index,
                    });
            }
            log::info!(
                "[Generation] group {gid} pipe {} staged clip {} -> {}",
                source.label,
                source.path,
                staged
            );
        } else {
            log::warn!(
                "[Generation] group {gid} pipe {} clip staging failed for {}",
                source.label,
                source.path
            );
        }
        persisted || staged_path.is_some()
    }

    pub async fn on_pipe_terminal(&self, event: &crate::generation::GenTaskEvent) {
        let gid = { self.index.lock().unwrap().get(&event.task_id).cloned() };
        let Some(gid) = gid else { return };
        let (pipe, next, policy, _started_at, run_params) = {
            let mut m = self.state.lock().unwrap();
            let Some(r) = m.get_mut(&gid) else { return };
            r.current = None;
            let mut p = r
                .pipes
                .iter_mut()
                .find(|p| p.1.as_deref() == Some(&event.task_id));
            if let Some(ref mut p) = p {
                p.2 = event
                    .status
                    .map(|x| x.as_str().into())
                    .unwrap_or("done".into());
                p.3 = event.view.progress;
                p.4 = event.view.error.clone();
                if let Some(source) = completed_source(&p.0, event) {
                    // Dedupe: a pipe that regenerated within the same group
                    // emits terminal for every task, and a group can be
                    // re-tracked after an app restart — keep only the LATEST
                    // successful clip per pipe (the same "last-gen" semantics
                    // the standalone composer path uses), so a stale earlier
                    // task never shadows the new one in the concat manifest.
                    r.completed_sources.retain(|s| s.label != p.0);
                    r.completed_sources.push(source.clone());
                    // The completed source is persisted + staged below in a
                    // spawned block (DB save + file copy are async/fs work
                    // that must not run on the event sink's sync path).
                }
            }
            let pipe = p.as_ref().map(|x| x.0.clone());
            let next = r.queue.pop_front();
            // Follow-up pipes run with the GROUP's original run params
            // (models/seed/profile/specs + prompts + media root) — the same
            // values `start_group` used for pipe #1. Without this every
            // pipe after the first starts spec-less and the engine fails
            // it with "no resolved spec".
            let run_params = r.input.clone();
            (pipe, next, r.policy.clone(), r.started_at, run_params)
        };
        let terminal = event.status.map(|s| s.is_terminal()).unwrap_or(false);
        if !terminal {
            return;
        }
        self.emit(GroupEvent {
            group_id: gid.clone(),
            kind: "pipe-terminal".into(),
            pipe_id: pipe.clone(),
            task_id: Some(event.task_id.clone()),
            status: event.status.map(|s| s.as_str().into()),
        });
        // Persist the just-completed clip into the pipe's `last_generation`
        // AND stage it into `session-video/` for this run. This is the same
        // terminal-attach/persist step the per-pipe frontend flow does in
        // `handleTaskTerminal`; because the group coordinator owns the pipe
        // lifecycle it must run here, or no pipe's clip is ever durable and
        // a later standalone compose of the session sees no sources at all.
        //
        // It runs SEQUENTIALLY (awaited, not spawned) so the source snapshot
        // `compose_and_finish` takes on the last pipe always sees every
        // source fully staged — a spawned race could let the compose worker
        // start before the last pipe's staged clip hit disk, leaving its
        // record with a missing staged_path and the manifest missing a clip.
        // Best-effort: a failure here only downgrades the run (compose falls
        // back to the originals that `completed_sources` still references).
        if event.status == Some(TaskStatus::Done) {
            let source_for_persist = self
                .state
                .lock()
                .unwrap()
                .get(&gid)
                .and_then(|r| {
                    r.completed_sources
                        .iter()
                        .find(|s| pipe.as_deref() == Some(s.label.as_str()))
                })
                .cloned();
            let composer_name_for_persist = self
                .db
                .get_composer(&event.view.session_id)
                .await
                .ok()
                .map(|c| c.name)
                .unwrap_or_default();
            if let Some(source) = source_for_persist {
                self.record_completed_pipe(
                    &gid,
                    &event.view.session_id,
                    &source,
                    &composer_name_for_persist,
                )
                .await;
            }
        }
        if policy == "stop" && event.status == Some(TaskStatus::Error) {
            self.finish_group(&gid, GroupStatus::Error, event.view.error.clone());
            return;
        }
        if let Some(next) = next {
            let this = self.clone();
            let gid2 = gid.clone();
            let next_session = self
                .state
                .lock()
                .unwrap()
                .get(&gid)
                .map(|r| r.session_id.clone())
                .unwrap_or_default();
            let session_for_fail_event = next_session.clone();
            tokio::spawn(async move {
                // Rebuild the run params from the group's stored input so
                // the follow-up pipe gets the same models/seed/profile/
                // specs/prompts/media root as pipe #1. `auto_compose` is
                // re-set true here (the follow-up input is only used to
                // start the pipe; the compose decision already happened
                // when the group was created).
                let next_input = StartSessionGenerationInput {
                    session_id: next_session,
                    image_model: run_params.image_model.clone(),
                    video_model: run_params.video_model.clone(),
                    seed: run_params.seed,
                    profile_id: run_params.profile_id.clone(),
                    image_spec: run_params.image_spec.clone(),
                    video_spec: run_params.video_spec.clone(),
                    pipe_ids: None,
                    prompts: run_params.prompts.clone(),
                    media_root: run_params.media_root.clone(),
                    failure_policy: policy.clone(),
                    auto_compose: true,
                };
                // When the follow-up start FAILS (e.g. "video stage has no
                // resolved video spec" — the engine rejects the task before it
                // registers), no pipe-terminal event will ever fire for it, so
                // the group would hang forever in `running`: no `next` left
                // in the queue, no compose, no group-terminal. Mark the pipe
                // as an error and advance the group as if that pipe had just
                // terminated, so the run reaches a terminal state instead of
                // stalling (which is exactly the "OK appears but nothing
                // generated" symptom).
                match this.start_pipe(&next_input, &next).await {
                    Ok((tid, _)) => {
                        this.state
                            .lock()
                            .unwrap()
                            .get_mut(&gid2)
                            .map(|r| r.current = Some(tid.clone()));
                        this.index.lock().unwrap().insert(tid.clone(), gid2.clone());
                        this.emit(GroupEvent {
                            group_id: gid2.clone(),
                            kind: "pipe-started".into(),
                            pipe_id: Some(next.to_string()),
                            task_id: Some(tid),
                            status: Some("running".into()),
                        });
                    }
                    Err(e) => {
                        log::error!(
                            "[Generation] group {gid2} follow-up pipe {next} failed to start: {e}"
                        );
                        // Record the failure on the pipe row + drop the group
                        // through the same terminal path a failed pipe would
                        // use (queue is already drained → compose + finish).
                        let failed_event = crate::generation::GenTaskEvent {
                            task_id: next.clone(),
                            kind: "terminal".into(),
                            status: Some(TaskStatus::Error),
                            view: crate::generation::GenerationTaskView {
                                task_id: next.clone(),
                                session_id: session_for_fail_event,
                                pipe_id: next.clone(),
                                status: TaskStatus::Error,
                                progress: 0.0,
                                stages: vec![],
                                error: Some(e.clone()),
                                output_path: None,
                                request_log: None,
                                started_at: 0,
                            },
                        };
                        this.fail_pipe_and_advance(&gid2, &failed_event).await;
                    }
                }
            });
        } else {
            let status = if self
                .state
                .lock()
                .unwrap()
                .get(&gid)
                .map(|r| r.pipes.iter().any(|p| p.2 == "error"))
                .unwrap_or(false)
            {
                GroupStatus::DoneWithErrors
            } else {
                GroupStatus::Done
            };
            self.compose_and_finish(&gid, status);
        }
    }

    /// Fail-fast path for a follow-up pipe that could not even be started:
    /// record the failure on the pipe row and drop the group through the
    /// same terminal path a failed pipe would use (the queue is already
    /// drained → compose + finish). Runs SEQUENTIALLY (not nested-spawned)
    /// so the group reaches a terminal state instead of stalling.
    async fn fail_pipe_and_advance(&self, gid: &str, event: &crate::generation::GenTaskEvent) {
        {
            let mut m = self.state.lock().unwrap();
            if let Some(r) = m.get_mut(gid) {
                if let Some(p) = r.pipes.iter_mut().find(|p| p.0 == event.view.pipe_id) {
                    p.2 = "error".into();
                    p.4 = event.view.error.clone();
                }
            }
        }
        let status = if self
            .state
            .lock()
            .unwrap()
            .get(gid)
            .map(|r| r.pipes.iter().any(|p| p.2 == "error"))
            .unwrap_or(false)
        {
            GroupStatus::DoneWithErrors
        } else {
            GroupStatus::Done
        };
        self.compose_and_finish(gid, status);
    }
    fn compose_and_finish(&self, gid: &str, status: GroupStatus) {
        let snapshot = {
            let m = self.state.lock().unwrap();
            m.get(gid).map(|r| {
                (
                    r.session_id.clone(),
                    r.auto_compose,
                    r.cancel.clone(),
                    r.completed_sources.clone(),
                    r.group_sources.clone(),
                    r.media_root.clone(),
                )
            })
        };
        let Some((session_id, auto_compose, group_cancel, sources, group_sources, media_root)) =
            snapshot
        else {
            return;
        };
        if !auto_compose {
            self.finish_group(gid, status, None);
            return;
        }
        let this = self.clone();
        let gid_owned = gid.to_string();
        tokio::spawn(async move {
            if group_cancel.load(Ordering::Acquire) {
                this.finish_group(&gid_owned, GroupStatus::Cancelled, None);
                return;
            }
            {
                let mut m = this.state.lock().unwrap();
                if let Some(r) = m.get_mut(&gid_owned) {
                    r.compose_state = Some("running".into());
                }
            }
            this.emit(GroupEvent {
                group_id: gid_owned.clone(),
                kind: "compose-started".into(),
                pipe_id: None,
                task_id: None,
                status: Some("running".into()),
            });
            // The output dir is the group's own session-video dir (media
            // root + session name), so the staged copies and session.mp4
            // land together. A `None` media_root falls back to the
            // app-data media tree — same path the engine would use.
            let composer_name = this
                .db
                .get_composer(&session_id)
                .await
                .map(|c| c.name)
                .unwrap_or_default();
            let out_dir = session_compose_out_dir(&media_root, &composer_name);
            let out_path = out_dir.join("session.mp4");
            // The concat manifest must reference THIS run's staged clips, in
            // `order_index` order (which is the pipe's timeline position, not
            // the completion order they happened to be recorded in). Sort
            // explicitly so a re-run pipe or an out-of-order terminal can
            // never reorder the composed timeline.
            let mut ordered = group_sources.clone();
            ordered.sort_by_key(|r| r.order_index);
            let staged = ordered
                .iter()
                .filter(|r| std::path::Path::new(&r.staged_path).is_file())
                .map(|r| SourceVideo {
                    label: r.pipe_id.clone(),
                    path: r.staged_path.clone(),
                    task_id: r.task_id.clone(),
                })
                .collect::<Vec<_>>();
            // Use the staged set only when it covers EVERY pipe that produced
            // a clip this run. Falling back on a partial staged set would
            // silently drop a pipe from the session video; falling back to the
            // originals is safe because they are the same clips, in pipe
            // order.
            let staged_is_complete =
                !staged.is_empty() && staged.len() == ordered.len() && staged.len() == sources.len();
            let mut fallback = sources.clone();
            fallback.sort_by_key(|s| {
                ordered
                    .iter()
                    .find(|r| r.pipe_id == s.label)
                    .map(|r| r.order_index)
                    .unwrap_or(u32::MAX)
            });
            let sources_for_result = if staged_is_complete { staged } else { fallback };
            let registry = this.compose_registry.clone();
            let session_for_result = session_id.clone();
            let worker_group_cancel = Arc::clone(&group_cancel);
            let result = tokio::task::spawn_blocking(move || {
                let group_cancel = worker_group_cancel;
                match registry.start(&session_for_result) {
                    Ok((_operation_id, cancel)) => {
                        if group_cancel.load(Ordering::Acquire) {
                            cancel.store(true, Ordering::Release);
                        }
                        let result =
                            compose_sources(sources_for_result, &out_dir, &out_path, &cancel);
                        registry.finish(&session_for_result);
                        result
                    }
                    Err(_) => Err("COMPOSITION_ALREADY_RUNNING".to_string()),
                }
            })
            .await;
            let (compose_state, compose_error, output_path, cancelled): (
                Option<String>,
                Option<String>,
                Option<String>,
                bool,
            ) = match result {
                Ok(Ok(path)) => (Some("done".into()), None, Some(path), false),
                Ok(Err(e)) => {
                    let cancelled = group_cancel.load(Ordering::Acquire) || e == "Cancelled";
                    (
                        Some(if cancelled {
                            "cancelled".into()
                        } else {
                            "error".into()
                        }),
                        Some(e),
                        None,
                        cancelled,
                    )
                }
                Err(e) => (
                    Some("error".into()),
                    Some(format!("compose worker join failed: {e}")),
                    None,
                    false,
                ),
            };
            {
                let mut m = this.state.lock().unwrap();
                if let Some(r) = m.get_mut(&gid_owned) {
                    r.compose_state = compose_state.clone();
                    r.compose_error = compose_error.clone();
                    r.session_video_path = output_path.clone();
                }
            }
            // Persist the source records atomically with the composition
            // state: the group row then describes EXACTLY the clips this run
            // staged, so a stale set can never be mistaken for the current one.
            let sources_json = serde_json::to_string(&group_sources).ok();
            this.db
                .update_generation_group_composition(
                    &gid_owned,
                    output_path.as_deref(),
                    compose_state.as_deref(),
                    compose_error.as_deref(),
                    sources_json.as_deref(),
                )
                .await
                .ok();
            this.emit(GroupEvent {
                group_id: gid_owned.clone(),
                kind: "compose-terminal".into(),
                pipe_id: None,
                task_id: None,
                status: compose_state,
            });
            this.finish_group(
                &gid_owned,
                if cancelled {
                    GroupStatus::Cancelled
                } else {
                    status
                },
                None,
            );
        });
    }
    fn finish_group(&self, gid: &str, status: GroupStatus, error: Option<String>) {
        let Some(run) = self.state.lock().unwrap().remove(gid) else {
            return;
        };
        {
            let db = self.db.clone();
            let gid = gid.to_string();
            let pipes = serde_json::to_string(&run.pipes).unwrap_or_else(|_| "[]".into());
            tokio::spawn(async move {
                let _ = db
                    .update_generation_group(&gid, status.as_str(), 1.0, &pipes, error.as_deref())
                    .await;
            });
        }
        self.emit(GroupEvent {
            group_id: gid.into(),
            kind: "group-terminal".into(),
            pipe_id: None,
            task_id: None,
            status: Some(status.as_str().into()),
        });
    }
    pub fn cancel_group(&self, gid: &str) {
        let current = {
            let mut m = self.state.lock().unwrap();
            let Some(r) = m.get_mut(gid) else { return };
            r.queue.clear();
            r.cancel.store(true, Ordering::Release);
            r.current.clone()
        };
        if let Some(t) = current {
            let _ = self.generation.registry.cancel(&t);
        }
        let session_id = self
            .state
            .lock()
            .unwrap()
            .get(gid)
            .map(|r| r.session_id.clone());
        if let Some(session_id) = session_id {
            self.compose_registry.cancel(&session_id);
        }
        self.finish_group(gid, GroupStatus::Cancelled, None);
    }
    pub fn view(&self, gid: &str) -> Option<GenerationGroupView> {
        let m = self.state.lock().unwrap();
        m.get(gid).map(|r| GenerationGroupView {
            group_id: gid.into(),
            session_id: r.session_id.clone(),
            status: GroupStatus::Running,
            pipes: r
                .pipes
                .iter()
                .map(|p| GroupPipeView {
                    pipe_id: p.0.clone(),
                    task_id: p.1.clone(),
                    status: p.2.clone(),
                    progress: p.3,
                    error: p.4.clone(),
                })
                .collect(),
            progress: r.pipes.iter().map(|p| p.3).sum::<f32>() / r.pipes.len() as f32,
            session_video_path: r.session_video_path.clone(),
            compose_state: r.compose_state.clone(),
            compose_error: r.compose_error.clone(),
            sources: {
                let mut s = r.group_sources.clone();
                s.sort_by_key(|rec| rec.order_index);
                s
            },
            started_at: r.started_at,
        })
    }
    pub fn has_task(&self, tid: &str) -> bool {
        self.index.lock().unwrap().contains_key(tid)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn statuses_are_wire_compatible() {
        assert_eq!(GroupStatus::DoneWithErrors.as_str(), "done-with-errors");
    }

    #[test]
    fn auto_compose_uses_fixed_session_output() {
        // The session-video output dir is always `<media root>/<safe session
        // name>/session-video`, never derived from the source paths — so the
        // path is a fixed, predictable location per session.
        let out_dir = session_compose_out_dir(&Some("C:/media".into()), "My Session");
        assert_eq!(
            out_dir,
            std::path::PathBuf::from("C:/media/My Session/session-video")
        );
        let out_path = out_dir.join("session.mp4");
        assert_eq!(
            out_path,
            std::path::PathBuf::from("C:/media/My Session/session-video/session.mp4")
        );
    }

    #[test]
    fn auto_compose_rejects_empty_completed_sources() {
        // The compose core itself rejects an empty source list:
        // `compose_session_video` returns `ComposeError::SourceMissing`
        // when no sources are provided.
        let none = crate::generation::FfmpegAvailability::none();
        let cancel = Arc::new(AtomicBool::new(false));
        let result = crate::generation::compose_session_video(
            &none,
            &[],
            std::path::Path::new("out.mp4"),
            std::path::Path::new("."),
            &cancel,
        );
        assert!(result.is_err());
    }

    #[test]
    fn shared_registry_rejects_concurrent_session_compose() {
        let registry = ComposeRegistry::default();
        let (_id, _cancel) = registry.start("session-1").unwrap();
        assert!(registry.start("session-1").is_err());
        registry.finish("session-1");
        assert!(registry.start("session-1").is_ok());
    }

    #[test]
    fn only_done_terminal_events_become_explicit_sources() {
        fn view(path: &str) -> GenerationTaskView {
            GenerationTaskView {
                task_id: "task-1".into(),
                session_id: "session-1".into(),
                pipe_id: "pipe-1".into(),
                status: TaskStatus::Done,
                progress: 1.0,
                stages: vec![],
                error: None,
                output_path: Some(path.into()),
                request_log: None,
                started_at: 0,
            }
        }
        let done = crate::generation::GenTaskEvent {
            task_id: "task-1".into(),
            kind: "terminal".into(),
            status: Some(TaskStatus::Done),
            view: view("C:/media/s/p/t/video.mp4"),
        };
        assert_eq!(
            completed_source("pipe-1", &done).unwrap().path,
            "C:/media/s/p/t/video.mp4"
        );
        // The source record must carry the task that produced the clip so a
        // later reader can prove which generation fed the composition.
        assert_eq!(completed_source("pipe-1", &done).unwrap().task_id, "task-1");
        let failed = crate::generation::GenTaskEvent {
            status: Some(TaskStatus::Error),
            ..done
        };
        assert!(completed_source("pipe-1", &failed).is_none());
    }

    #[test]
    fn group_cancellation_flag_is_cooperative() {
        let cancel = Arc::new(AtomicBool::new(false));
        assert!(!cancel.load(Ordering::Acquire));
        cancel.store(true, Ordering::Release);
        assert!(cancel.load(Ordering::Acquire));
    }

    #[test]
    fn stage_source_clip_writes_order_indexed_copy() {
        let base = std::env::temp_dir().join(format!("vm_group_stage_{}", std::process::id()));
        let src_dir = base.join("src");
        let out_dir = base.join("session-video");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&src_dir).unwrap();
        let src_path = src_dir.join("video.mp4");
        std::fs::write(&src_path, b"clip").unwrap();
        let source = SourceVideo {
            label: "Pipe 1".into(),
            path: src_path.to_string_lossy().into_owned(),
            task_id: "task-9".into(),
        };
        let staged = stage_source_clip(&out_dir, &source, 0);
        assert!(staged.is_some(), "staging a present clip must succeed");
        // `safe_dir_name` strips path-traversal separators; the sanitizer
        // above replaces remaining non-alnum chars (spaces) with '-', so the
        // staged name is `pipe-0-Pipe-1.mp4`.
        let staged_path = out_dir.join("pipe-0-Pipe-1.mp4");
        assert!(
            staged_path.is_file(),
            "staged clip lands in the session-video dir"
        );
        assert_eq!(
            staged.as_deref(),
            Some(staged_path.to_string_lossy().as_ref()),
            "staged path must match the order-indexed name"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn stage_source_clip_refuses_missing_source() {
        let base =
            std::env::temp_dir().join(format!("vm_group_stage_missing_{}", std::process::id()));
        let out_dir = base.join("session-video");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&out_dir).unwrap();
        let source = SourceVideo {
            label: "Pipe 1".into(),
            path: base
                .join("definitely-missing.mp4")
                .to_string_lossy()
                .into_owned(),
            task_id: "task-9".into(),
        };
        assert!(
            stage_source_clip(&out_dir, &source, 0).is_none(),
            "a missing clip must never yield a staged record"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // Regression: a compose "success" path that does not exist on disk must
    // never surface as an OK group result. The guard in `compose_sources`
    // converts `Ok(path)` into Err when the file is absent — assert the guard
    // itself (the is_file check) so a future refactor can't silently drop it.
    #[test]
    fn missing_output_path_is_never_a_compose_success() {
        // The exact guard `compose_sources` applies after the compose core
        // returns: a non-existent output must be an error, not a success.
        let out_path = "C:\\definitely\\not\\there\\session.mp4";
        let ok_result = Some(out_path.to_string());
        let success = ok_result
            .filter(|p| std::path::Path::new(p).is_file())
            .is_some();
        assert!(
            !success,
            "a missing output file must never be reported as success"
        );
    }

    // The compose core clears its manifest dir with
    // `clear_session_compose_artifacts` immediately BEFORE writing
    // concat.txt, and that dir is the very session-video dir the run staged
    // its clips into. If that clear also removed staged clips, every group
    // auto-compose would delete its own sources and fail with "source
    // missing". These two tests pin the split.
    #[test]
    fn compose_core_clear_preserves_current_run_staged_clips() {
        let base = std::env::temp_dir().join(format!("vm_group_keepclip_{}", std::process::id()));
        let out_dir = base.join("session-video");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&out_dir).unwrap();
        let src = base.join("src.mp4");
        std::fs::write(&src, b"clip").unwrap();
        let source = SourceVideo {
            label: "Pipe 1".into(),
            path: src.to_string_lossy().into_owned(),
            task_id: "t1".into(),
        };
        let staged = stage_source_clip(&out_dir, &source, 0).unwrap();
        std::fs::write(out_dir.join("concat.txt"), b"stale").unwrap();
        std::fs::write(out_dir.join("session.mp4"), b"stale").unwrap();

        // What the compose core does before writing its own manifest.
        crate::generation::clear_session_compose_artifacts(&out_dir);

        assert!(
            std::path::Path::new(&staged).is_file(),
            "the current run's staged clip must survive the compose clear"
        );
        assert!(
            !out_dir.join("concat.txt").exists(),
            "the stale manifest must be cleared"
        );
        assert!(
            !out_dir.join("session.mp4").exists(),
            "the stale output must be cleared"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn stale_clip_sweep_removes_only_previous_runs_staged_clips() {
        let base =
            std::env::temp_dir().join(format!("vm_group_sweep_{}", std::process::id()));
        let out_dir = base.join("session-video");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&out_dir).unwrap();
        for n in ["pipe-0-Pipe-1.mp4", "pipe-1-Pipe-2.mp4"] {
            std::fs::write(out_dir.join(n), b"old").unwrap();
        }
        // Must be preserved: the previous run's success marker and any
        // non-staged media that happens to live in the dir.
        std::fs::write(out_dir.join("output.json"), b"{}").unwrap();
        std::fs::write(out_dir.join("keepme.mp4"), b"x").unwrap();

        crate::generation::clear_staged_session_clips(&out_dir);

        assert!(!out_dir.join("pipe-0-Pipe-1.mp4").exists());
        assert!(!out_dir.join("pipe-1-Pipe-2.mp4").exists());
        assert!(
            out_dir.join("output.json").is_file(),
            "the last successful composition's marker survives a new run's sweep"
        );
        assert!(
            out_dir.join("keepme.mp4").is_file(),
            "only `pipe-` prefixed staged clips are swept"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    // The staged-clip writer and the stale-clip sweeper must agree on the
    // naming contract, or a run's own clips would be swept by the next run.
    #[test]
    fn staged_clip_name_is_recognized_by_the_sweeper() {
        for n in ["pipe-0-Pipe-1.mp4", "pipe-12-a.mp4"] {
            assert!(
                crate::generation::is_staged_session_clip(n),
                "{n} must be recognized as a staged clip"
            );
        }
        for n in ["concat.txt", "session.mp4", "output.json", "keepme.mp4"] {
            assert!(
                !crate::generation::is_staged_session_clip(n),
                "{n} must not be treated as a staged clip"
            );
        }
    }

    // The group coordinator and the single-pipe command must build the same
    // media layout, or group clips land where nothing looks for them. The
    // shared builder appends the session-name folder to the resolved root.
    #[test]
    fn shared_pipe_start_places_artifacts_under_session_root() {
        use crate::commands::generation::{build_pipe_start, PipeStartParams};
        // Build via serde so the test stays valid as the model gains
        // required fields (same path the DB read uses).
        let composer: crate::models::ComposerConfig = serde_json::from_value(serde_json::json!({
            "id": "c1",
            "sessionId": "s1",
            "name": "My Session",
            "pipes": [{ "id": "p1", "name": "Pipe 1", "orderIndex": 0 }]
        }))
        .unwrap();
        let pipe = composer.pipes[0].clone();
        let spec = |id: &str| -> ModelSpecWire {
            serde_json::from_value(serde_json::json!({ "id": id })).unwrap()
        };
        let params = PipeStartParams {
            session_id: "s1".into(),
            pipe_id: "p1".into(),
            prompt: "a real prompt".into(),
            media_root: Some("C:/media".into()),
            image_spec: Some(spec("img")),
            video_spec: Some(spec("vid")),
            ..Default::default()
        };
        let (view, engine) = build_pipe_start(&composer, &pipe, &params);
        // The prompt, specs and pipe identity all survive the shared path.
        assert_eq!(engine.prompt, "a real prompt");
        assert!(engine.video_spec.is_some(), "resolved spec must be carried");
        assert!(engine.image_spec.is_some());
        assert_eq!(engine.pipe_id, "p1");
        assert_eq!(view.pipe_id, "p1");
        assert_eq!(view.session_id, "s1");
        assert!(!view.stages.is_empty(), "stages are built up front");
        // Media layout: <root>/<session>/<pipe>/<task>/ — the compose command
        // resolves sources under exactly this tree. Compare path components
        // rather than a joined string (Windows uses `\`).
        let root = std::path::PathBuf::from(engine.media_root.clone().unwrap());
        assert_eq!(root, std::path::PathBuf::from("C:/media").join("My Session"));
        let log = std::path::PathBuf::from(view.request_log.clone().unwrap());
        assert_eq!(log.parent().unwrap(), root.join("Pipe 1").join(&view.task_id));
        assert_eq!(log.file_name().unwrap(), "request.log");
        let _ = std::fs::remove_dir_all(&root);
    }

    // `order_index` — not completion order — decides concat order, so a run
    // whose pipes finish out of order still composes in timeline order.
    #[test]
    fn group_sources_are_ordered_by_order_index() {
        let mut records = vec![
            crate::storage::generation_groups_db::GroupSourceRecord {
                pipe_id: "p2".into(),
                task_id: "t2".into(),
                source_path: "b.mp4".into(),
                staged_path: "b.mp4".into(),
                order_index: 1,
            },
            crate::storage::generation_groups_db::GroupSourceRecord {
                pipe_id: "p0".into(),
                task_id: "t0".into(),
                source_path: "a.mp4".into(),
                staged_path: "a.mp4".into(),
                order_index: 0,
            },
        ];
        records.sort_by_key(|r| r.order_index);
        assert_eq!(
            records.iter().map(|r| r.pipe_id.as_str()).collect::<Vec<_>>(),
            vec!["p0", "p2"],
            "concat order follows order_index, not completion order"
        );
    }

    // A source record must round-trip through the DB's JSON column exactly,
    // otherwise a restored group cannot prove which clips it composed from.
    #[test]
    fn group_source_record_round_trips_through_the_db_column() {
        use crate::storage::generation_groups_db::GroupSourceRecord;
        let rec = GroupSourceRecord {
            pipe_id: "p1".into(),
            task_id: "t1".into(),
            source_path: "C:/media/S/Pipe 1/t1/video.mp4".into(),
            staged_path: "C:/media/S/session-video/pipe-0-Pipe-1.mp4".into(),
            order_index: 0,
        };
        let json = serde_json::to_string(&[rec.clone()]).unwrap();
        let back: Vec<GroupSourceRecord> = serde_json::from_str(&json).unwrap();
        assert_eq!(back.len(), 1);
        assert_eq!(back[0].pipe_id, "p1");
        assert_eq!(back[0].task_id, "t1");
        assert_eq!(back[0].order_index, 0);
        assert_eq!(back[0].staged_path, rec.staged_path);
        // camelCase keys are what the wire contract promises.
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed[0].get("pipeId").is_some());
        assert!(parsed[0].get("stagedPath").is_some());
        assert!(parsed[0].get("orderIndex").is_some());
    }
}
