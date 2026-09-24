//! Session generation coordinator. It owns only the queue/index; pipe work
//! remains in TaskRegistry so the existing task lifecycle and terminal sink
//! ordering stay authoritative.
use crate::generation::{
    EngineInput, GenerationService, GenerationTaskView, ModelSpecWire, TaskRegistry, TaskStatus,
};
use crate::storage::{db::Database, generation_groups_db::GenerationGroupRow};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
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
struct GroupRun {
    session_id: String,
    pipes: Vec<(String, Option<String>, String, f32, Option<String>)>,
    queue: VecDeque<String>,
    current: Option<String>,
    policy: String,
    started_at: i64,
}
pub struct GroupCoordinator {
    pub generation: GenerationService,
    pub db: Database,
    state: Arc<Mutex<HashMap<String, GroupRun>>>,
    index: Arc<Mutex<HashMap<String, String>>>,
    event_sink: Arc<Mutex<Option<Arc<dyn Fn(GroupEvent) + Send + Sync>>>>,
}
impl Clone for GroupCoordinator {
    fn clone(&self) -> Self {
        Self {
            generation: self.generation.clone(),
            db: self.db.clone(),
            state: self.state.clone(),
            index: self.index.clone(),
            event_sink: self.event_sink.clone(),
        }
    }
}
impl GroupCoordinator {
    pub fn new(generation: GenerationService, db: Database) -> Self {
        Self {
            generation,
            db,
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
            compose_state: None,
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
        let mut view = GenerationTaskView {
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
        let inpute = EngineInput {
            task_id: tid.clone(),
            media_root: None,
            prompt: String::new(),
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
        let (pipe, next, policy, _started_at) = {
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
            }
            let pipe = p.as_ref().map(|x| x.0.clone());
            let next = r.queue.pop_front();
            (pipe, next, r.policy.clone(), r.started_at)
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
            let session_id = self
                .state
                .lock()
                .unwrap()
                .get(&gid)
                .map(|r| r.session_id.clone())
                .unwrap_or_default();
            tokio::spawn(async move {
                let input = StartSessionGenerationInput {
                    session_id,
                    image_model: None,
                    video_model: None,
                    seed: None,
                    profile_id: None,
                    image_spec: None,
                    video_spec: None,
                    pipe_ids: None,
                    failure_policy: policy.clone(),
                    auto_compose: true,
                };
                if let Ok((tid, _)) = this.start_pipe(&input, &next).await {
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
            self.finish_group(
                &gid,
                if self
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
                },
                None,
            )
        }
    }
    fn finish_group(&self, gid: &str, status: GroupStatus, error: Option<String>) {
        let run = {
            let mut m = self.state.lock().unwrap();
            m.remove(gid)
        };
        if let Some(r) = run {
            let db = self.db.clone();
            let gid = gid.to_string();
            let pipes = serde_json::to_string(&r.pipes).unwrap_or_else(|_| "[]".into());
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
            r.current.clone()
        };
        if let Some(t) = current {
            let _ = self.generation.registry.cancel(&t);
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
            session_video_path: None,
            compose_state: None,
            compose_error: None,
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
}
