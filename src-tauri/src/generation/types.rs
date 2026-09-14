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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
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
}
