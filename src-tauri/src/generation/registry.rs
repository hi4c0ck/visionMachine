//! In-memory generation task registry: spawns/tracks/cancels tasks, builds
//! stage lists from pipe snapshots, and persists terminal state to SQLite.
//!
//! The engine slot is unconfigured in this task (the provider/LLM system is
//! future work): with no engine, generation stages fail fast with a real
//! error — never simulated progress (decision D1).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::generation::engine::{EngineInput, GenerationEngine};
use crate::generation::types::{
    GenerationStageView, GenerationTaskView, SourceKind, StageKind, StageStatus, TaskStatus,
};
use crate::models::composer::Pipe;
use crate::storage::db::Database;

/// Sequential by default (decision D7); raise this to allow parallel tasks.
pub const MAX_CONCURRENT_TASKS: usize = 1;

#[derive(Clone)]
pub struct TaskRegistry {
    tasks: Arc<Mutex<HashMap<String, ManagedTask>>>,
    engine: Arc<Mutex<Option<Arc<dyn GenerationEngine>>>>,
    db: Database,
}

struct ManagedTask {
    view: GenerationTaskView,
    cancel: Arc<AtomicBool>,
    input: EngineInput,
}

impl TaskRegistry {
    pub fn new(db: Database) -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            engine: Arc::new(Mutex::new(None)),
            db,
        }
    }

    /// Register a concrete engine (the provider/LLM system plugs in later).
    pub fn set_engine(&self, engine: Arc<dyn GenerationEngine>) {
        *self.engine.lock().unwrap() = Some(engine);
    }

    /// Build the stage list from a pipe snapshot: keyframes, then subjects
    /// (`url` type = instant `ready`), then the final video stage.
    pub fn build_stages(task_id: &str, pipe: &Pipe) -> Vec<GenerationStageView> {
        let mut stages: Vec<GenerationStageView> = Vec::new();
        for kf in &pipe.keyframes {
            let ty = if kf.kind.is_empty() { "url" } else { &kf.kind };
            let ready = ty == "url";
            stages.push(stage_image(
                task_id,
                &format!("Keyframe {} ({})", kf.slot_index, ty),
                SourceKind::Keyframe,
                &kf.id,
                ready,
            ));
        }
        for (i, sr) in pipe.subject_references.iter().enumerate() {
            let ready = sr.kind == "url";
            stages.push(stage_image(
                task_id,
                &format!("Subject {} ({})", i + 1, sr.kind),
                SourceKind::Subject,
                &sr.id,
                ready,
            ));
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
        });
        stages
    }

    /// Create + spawn a task. Rejects while a slot is busy (sequential).
    pub async fn start(
        &self,
        mut view: GenerationTaskView,
        input: EngineInput,
    ) -> Result<(), String> {
        view.status = TaskStatus::Running;
        {
            let mut tasks = self.tasks.lock().unwrap();
            let active = tasks
                .values()
                .filter(|t| matches!(t.view.status, TaskStatus::Queued | TaskStatus::Running))
                .count();
            if active >= MAX_CONCURRENT_TASKS {
                return Err("Generation already in progress".to_string());
            }
            tasks.insert(
                view.task_id.clone(),
                ManagedTask {
                    view: view.clone(),
                    cancel: Arc::new(AtomicBool::new(false)),
                    input,
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
    pub fn cancel(&self, task_id: &str) -> Result<(), String> {
        let mut tasks = self.tasks.lock().unwrap();
        let entry = tasks
            .get_mut(task_id)
            .ok_or_else(|| "Task not found".to_string())?;
        if entry.view.status.is_terminal() {
            return Ok(());
        }
        entry.cancel.store(true, Ordering::Release);
        Ok(())
    }

    // ── Runner ───────────────────────────────────────────────────────────────

    async fn run_task(&self, task_id: String) {
        // No engine registered → fail fast with a real error (D1).
        if self.engine.lock().unwrap().is_none() {
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
                    None => return,
                };
                match entry
                    .view
                    .stages
                    .iter()
                    .position(|s| s.status == StageStatus::Pending)
                {
                    Some(i) => Some((i, entry.view.stages[i].clone(), entry.input.clone())),
                    None => None,
                }
            };

            let Some((i, stage, input)) = next else {
                self.finish_done(&task_id).await;
                return;
            };

            self.patch_stage(&task_id, i, StageStatus::Generating, None, None);

            let engine = self.engine.lock().unwrap().clone().unwrap();
            let progress = Arc::new(Mutex::new(0.0f32));
            let result = engine
                .run(&input, &cancel, &|p| {
                    if let Ok(mut g) = progress.lock() {
                        *g = p.min(1.0).max(0.0);
                    }
                })
                .await;

            match result {
                Ok(path) => {
                    let image_output = (stage.kind == StageKind::Image).then(|| path.clone());
                    self.patch_stage(&task_id, i, StageStatus::Done, image_output, None);
                    self.patch_progress(&task_id, *progress.lock().unwrap());
                    if stage.kind == StageKind::Video {
                        self.patch_output(&task_id, &path);
                    }
                }
                Err(e) => {
                    if cancel.load(Ordering::Acquire) {
                        self.finish_cancelled(&task_id).await;
                    } else {
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
            }
        }
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
    }

    async fn finish_cancelled(&self, task_id: &str) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                if !entry.view.status.is_terminal() {
                    for stage in &mut entry.view.stages {
                        if matches!(stage.status, StageStatus::Pending | StageStatus::Generating) {
                            stage.status = StageStatus::Cancelled;
                        }
                    }
                    entry.view.status = TaskStatus::Cancelled;
                }
            }
        }
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
    }

    /// No engine: every pending generation stage fails with a real error;
    /// ready stages stay ready. Overall progress reflects true state only.
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
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
    }

    async fn abort_with_error(&self, task_id: &str, failed_idx: usize, message: String) {
        {
            let mut tasks = self.tasks.lock().unwrap();
            if let Some(entry) = tasks.get_mut(task_id) {
                for (i, stage) in entry.view.stages.iter_mut().enumerate() {
                    if i == failed_idx {
                        stage.status = StageStatus::Error;
                        stage.error = Some(message.clone());
                    } else if matches!(stage.status, StageStatus::Pending | StageStatus::Generating)
                    {
                        stage.status = StageStatus::Cancelled;
                    }
                }
                entry.view.status = TaskStatus::Error;
                entry.view.error = Some(message);
            }
        }
        self.refresh_progress(task_id);
        self.persist_terminal(task_id).await;
    }

    // ── Small state patches (single lock each) ───────────────────────────────

    fn patch_stage(
        &self,
        task_id: &str,
        idx: usize,
        status: StageStatus,
        image_output: Option<String>,
        error: Option<String>,
    ) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            if let Some(stage) = entry.view.stages.get_mut(idx) {
                stage.status = status;
                if let Some(p) = image_output {
                    stage.image_output = Some(p);
                    stage.progress = 1.0;
                }
                if let Some(e) = error {
                    stage.error = Some(e);
                }
            }
        }
    }

    fn patch_progress(&self, task_id: &str, value: f32) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            entry.view.stages.iter_mut().for_each(|s| {
                s.progress = s.progress.max(value);
            });
        }
    }

    fn patch_output(&self, task_id: &str, path: &str) {
        let mut tasks = self.tasks.lock().unwrap();
        if let Some(entry) = tasks.get_mut(task_id) {
            entry.view.output_path = Some(path.to_string());
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

fn stage_image(
    task_id: &str,
    label: &str,
    source_kind: SourceKind,
    source_id: &str,
    ready: bool,
) -> GenerationStageView {
    GenerationStageView {
        id: format!("{task_id}:{source_kind:?}"),
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
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
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
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>>
        {
            Box::pin(async move {
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
                Ok("/tmp/out.mp4".to_string())
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
            status: "pending".into(),
        }
    }

    fn subject_ref(id: &str, ty: &str, img: &str, prompt: &str) -> SubjectReference {
        SubjectReference {
            id: id.into(),
            image_url: img.into(),
            kind: ty.into(),
            prompt: Some(prompt.into()),
            status: "pending".into(),
            use_frames: false,
            frame_start: None,
            frame_end: None,
            visible: true,
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
            prompt: "<heuristics>...</heuristics>".into(),
            pipe_id: "p1".into(),
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
