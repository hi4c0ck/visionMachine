//! Generation task type views (serde camelCase — mirror of
//! `GenerationTaskView`/`GenerationStageView` in `src/types/app.ts`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageKind {
    Image,
    Video,
}

/// Where a stage's input comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    #[default]
    Keyframe,
    Subject,
    Video,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageStatus {
    /// Input already available (e.g. `url` type) — nothing to generate.
    Ready,
    /// Waiting for the engine.
    Pending,
    /// Engine is working on it.
    Generating,
    /// Engine is waiting out a provider rate-limit (429) window. Distinct
    /// from `Generating` so the UI can show "waiting for rate-limit" instead
    /// of a frozen bar. Maps to the `rate-limited` string on the wire.
    #[serde(rename = "rate-limited")]
    RateLimited,
    Done,
    Error,
    /// Aborted because the task was cancelled or a prior stage failed.
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Queued,
    Running,
    Done,
    Error,
    Cancelled,
}

impl TaskStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Done | Self::Error | Self::Cancelled)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Done => "done",
            Self::Error => "error",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationStageView {
    pub id: String,
    pub label: String,
    pub kind: StageKind,
    pub source_kind: SourceKind,
    /// keyframe id / subject ref id / pipe id (video stage)
    pub source_id: String,
    pub status: StageStatus,
    /// 0..=1 — reflects real stage state only, never simulated.
    #[serde(default)]
    pub progress: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Path of the generated image (image stages only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_output: Option<String>,
    /// Remote URL the provider returned for this image (when it produced one;
    /// image stages only). The frontend links it onto the keyframe/subject as
    /// previewRemoteUrl — the primary fetchable source for the next video run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_remote_url: Option<String>,
    /// True while the poll loop is between rate-limited (429) responses and
    /// the provider's poll endpoint is still hot. The frontend uses this to
    /// show a "waiting for rate-limit window" indicator instead of a frozen
    /// bar — the stage is still `Generating`, but the user needs to know the
    /// task is alive and not hung. Default so persisted stage blobs written
    /// before this field existed still deserialize (terminal fallback path).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rate_limited: Option<bool>,
    /// Unix ms timestamp of the last meaningful state change on this stage
    /// (e.g. "503 queue-full, retry in 30 s", "polling: in_progress 42%").
    /// The progress modal shows this as a live "last event" line so the user
    /// sees the task is moving even when the provider queue is saturated.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_event_at: Option<i64>,
    /// Unix ms the stage first entered the 503/429 backoff band (video
    /// stages only); `None` = not currently saturated. The progress modal
    /// uses it to flag "provider load could be broken" after a long
    /// saturation and offer a reset. Default so persisted stage blobs
    /// written before this field existed still deserialize.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub saturated_since: Option<i64>,
    /// A short human-readable line describing the most recent poll/retry
    /// state (e.g. "queue full — retrying in 30 s", "rendering 42%").
    /// Kept intentionally terse — NOT the full request/response; the
    /// request-log expander (E1) carries the full redacted detail.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub last_event: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationTaskView {
    pub task_id: String,
    pub session_id: String,
    pub pipe_id: String,
    pub status: TaskStatus,
    /// 0..=1 — average of stage progress.
    #[serde(default)]
    pub progress: f32,
    pub stages: Vec<GenerationStageView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Path of the generated video (terminal success only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    /// Redacted per-stage request/response log file (E1: keys already
    /// masked on write; the progress modal expands it on demand).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_log: Option<String>,
    /// Unix ms timestamp the task moved to `Running` (0 = unset / terminal DB
    /// fallback rows written before this field existed). The progress modal
    /// uses this to render a live elapsed timer so the user knows the task is
    /// still alive during long provider queue-full waits.
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub started_at: i64,
}

fn is_zero_i64(v: &i64) -> bool {
    *v == 0
}

/// Event the task state machine pushes to the UI (frontend listens on the
/// `gen-task` window event). This is the "backend owns state, frontend
/// renders" push side: `view` is the authoritative current snapshot from the
/// in-memory registry, so the frontend re-renders from it instead of relying
/// on the 1 s poll to deliver state. The poll becomes a fallback / on-demand
/// refresh only.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenTaskEvent {
    pub task_id: String,
    /// `"update"` — a live stage tick / progress change, or `"terminal"` —
    /// the machine reached a final state.
    pub kind: String,
    /// Terminal status (`done` / `error` / `cancelled`); absent on updates.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<TaskStatus>,
    /// The current authoritative task view the UI renders from.
    pub view: GenerationTaskView,
}
