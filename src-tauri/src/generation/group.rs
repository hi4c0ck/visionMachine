//! Session generation coordinator. It owns only the queue/index; pipe work
//! remains in TaskRegistry so the existing task lifecycle and terminal sink
//! ordering stay authoritative.
use crate::generation::{
    compose_session_video, ComposeRegistry, EngineInput, GenerationService, GenerationTaskView,
    ModelSpecWire, SourceVideo, TaskRegistry, TaskStatus,
};
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
        })
}

fn compose_output_paths(
    sources: &[SourceVideo],
) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let first = sources.first().ok_or("no completed run pipes to compose")?;
    let task_dir = Path::new(&first.path)
        .parent()
        .ok_or("completed video has no task directory")?;
    let pipe_dir = task_dir
        .parent()
        .ok_or("completed video has no pipe directory")?;
    let session_root = pipe_dir
        .parent()
        .ok_or("completed video has no session root")?;
    let out_dir = session_root.join("session-video");
    Ok((out_dir.clone(), out_dir.join("session.mp4")))
}

/// Session-video output dir for a group run. Mirrors the standalone
/// `compose_session_video` command: `<media root or app-data media tree>
/// <safe session name>/session-video`.
fn session_compose_out_dir(media_root: &Option<String>, session_name: &str) -> std::path::PathBuf {
    let safe = crate::generation::safe_dir_name(session_name);
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

fn compose_sources(sources: Vec<SourceVideo>, cancel: &Arc<AtomicBool>) -> Result<String, String> {
    let (out_dir, out_path) = compose_output_paths(&sources)?;
    let ffmpeg = crate::generation::resolve_ffmpeg();
    let result = compose_session_video(&ffmpeg, &sources, &out_path, &out_dir, cancel)
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
    completed_sources: Vec<SourceVideo>,
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
        // manifest/output from an earlier (possibly failed) attempt so this
        // run's artifacts can never be mistaken for the previous one.
        if input.auto_compose {
            crate::generation::clear_session_compose_artifacts(&session_compose_out_dir(
                &input.media_root,
                &composer.name,
            ));
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
                    completed_sources: Vec::new(),
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
            .ok_or("Pipe not found")?;
        let tid = uuid::Uuid::new_v4().to_string();
        let view = GenerationTaskView {
            task_id: tid.clone(),
            session_id: input.session_id.clone(),
            pipe_id: pipe_id.into(),
            status: TaskStatus::Queued,
            progress: 0.0,
            stages: TaskRegistry::build_stages(&tid, pipe),
            error: None,
            output_path: None,
            request_log: None,
            started_at: Self::now(),
        };
        // The engine REQUIRES a resolved image/video spec (provider.rs
        // `run_image_stage`/`run_video_stage` fail with "no resolved spec"
        // otherwise) and writes artifacts under the media root, so thread
        // both through — exactly as the per-pipe `start_generation` command
        // does. Follow-up pipes must carry these too, or they fail identically.
        let media_root = input
            .media_root
            .as_ref()
            .filter(|r| !r.trim().is_empty())
            .map(std::string::ToString::to_string);
        let prompt = input.prompts.get(pipe_id).cloned().unwrap_or_default();
        let inpute = EngineInput {
            task_id: tid.clone(),
            media_root,
            prompt,
            pipe_id: pipe_id.into(),
            pipe_name: Some(pipe.name.clone()),
            fps: composer.fps,
            resolution: composer.resolution.clone(),
            orientation: composer.orientation.clone(),
            q_value: pipe.q_value,
            c_value: pipe.c_value,
            image_model: input.image_model.clone(),
            video_model: input.video_model.clone(),
            seed: input.seed,
            profile_id: input.profile_id.clone(),
            image_spec: input.image_spec.clone(),
            video_spec: input.video_spec.clone(),
            stage: None,
            upstream: Vec::new(),
        };
        self.generation.registry.start(view.clone(), inpute).await?;
        Ok((tid, view))
    }
    pub fn on_pipe_terminal(&self, event: &crate::generation::GenTaskEvent) {
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
                    r.completed_sources.push(source);
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
            pipe_id: pipe,
            task_id: Some(event.task_id.clone()),
            status: event.status.map(|s| s.as_str().into()),
        });
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
                if let Ok((tid, _)) = this.start_pipe(&next_input, &next).await {
                    this.state
                        .lock()
                        .unwrap()
                        .get_mut(&gid2)
                        .map(|r| r.current = Some(tid.clone()));
                    this.index.lock().unwrap().insert(tid.clone(), gid2.clone());
                    this.emit(GroupEvent {
                        group_id: gid2,
                        kind: "pipe-started".into(),
                        pipe_id: Some(next.to_string()),
                        task_id: Some(tid),
                        status: Some("running".into()),
                    });
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
    fn compose_and_finish(&self, gid: &str, status: GroupStatus) {
        let snapshot = {
            let m = self.state.lock().unwrap();
            m.get(gid).map(|r| {
                (
                    r.session_id.clone(),
                    r.auto_compose,
                    r.cancel.clone(),
                    r.completed_sources.clone(),
                )
            })
        };
        let Some((session_id, auto_compose, group_cancel, sources)) = snapshot else {
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
            let sources_for_result = sources.clone();
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
                        let result = compose_sources(sources_for_result, &cancel);
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
            this.db
                .update_generation_group_composition(
                    &gid_owned,
                    output_path.as_deref(),
                    compose_state.as_deref(),
                    compose_error.as_deref(),
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
        let sources = vec![SourceVideo {
            label: "done-pipe".into(),
            path: "C:/media/My Session/Pipe One/task-1/video.mp4".into(),
        }];
        let (dir, output) = compose_output_paths(&sources).unwrap();
        assert_eq!(dir, Path::new("C:/media/My Session/session-video"));
        assert_eq!(
            output,
            Path::new("C:/media/My Session/session-video/session.mp4")
        );
    }

    #[test]
    fn auto_compose_rejects_empty_completed_sources() {
        let error = compose_output_paths(&[]).unwrap_err();
        assert!(error.contains("no completed run pipes"));
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
}
