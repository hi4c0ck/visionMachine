//! The generation engine contract.
//!
//! `GenerationEngine::run` is driven per stage by the registry's sequential
//! loop. Each call receives a task-level `EngineInput` enriched with the
//! current stage's `EngineStage` context (docs/provider-engine-tasks.md,
//! Phase D); the provider engine shapes the outbound payload from the spec +
//! stage and executes HTTP against the provider.

use std::sync::atomic::AtomicBool;

use crate::generation::shaper::UpstreamOutput;
use crate::generation::specs::ModelSpecWire;
use crate::generation::types::SourceKind;

/// Everything an engine needs for one stage run. The model spec wire mirrors
/// ride along when the frontend resolves them (docs/provider-engine-tasks.md,
/// Phase A); the registry still drives stages sequentially from the pipe
/// snapshot. Extended later when the provider/LLM system lands.
#[derive(Debug, Clone, serde::Serialize)]
pub struct EngineInput {
    /// The task this stage belongs to (drives the per-task media tree, E3).
    #[serde(default)]
    pub task_id: String,
    /// The final prompt string (built by the frontend prompt engine).
    pub prompt: String,
    pub pipe_id: String,
    pub fps: u32,
    pub resolution: String,
    pub orientation: String,
    pub q_value: u32,
    pub c_value: f32,
    /// Session media root the provider engine writes its artifacts into
    /// (E3/O6 resolution order, resolved by the caller at `start()`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_root: Option<String>,
    /// Per-piece model override from the generate modal (Phase 4). None =
    /// the engine falls back to its default model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_model: Option<String>,
    /// Reproducibility seed (docs/agnes-model-catalog.md). None = the
    /// provider picks; sent only to models whose spec has `supportsSeed`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
    /// Provider profile that owns the API slots (keys read at request time only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    /// Resolved image-model spec for this run (Phase A; wire-safe, no secrets).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_spec: Option<ModelSpecWire>,
    /// Resolved video-model spec for this run (Phase A; wire-safe, no secrets).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub video_spec: Option<ModelSpecWire>,
    /// Which stage of the pipe this run executes (registry-built, Phase D).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<EngineStage>,
    /// Finished image-stage outputs feeding a video stage, in stable order
    /// (keyframes slot order then subjects pipe order; O5).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub upstream: Vec<UpstreamOutput>,
}

/// Per-stage context the provider engine executes against — today the
/// registry hands the engine only task-level input; this carries the
/// stage-specific data the shaper needs (docs/provider-engine-tasks.md,
/// "Rust — input + engine-context extensions").
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct EngineStage {
    /// Stage kind (Keyframe / Subject / Video).
    pub kind: SourceKind,
    /// Piece prompt (image stages — O1: the piece's own prompt only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Keyframe slot index / subject ordinal.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<u32>,
    /// Stable reference id for this piece: keyframe id / subject reference
    /// id. The media tree stores image artifacts as
    /// `<pipe>/<task>/images/<ref_id>.png` — unique per stage kind so no two
    /// artifacts ever stack onto one file (the old "latest" overwrite).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ref_id: Option<String>,
    /// Piece's image type: "url" | "txt2img" | "img2img" (image stages).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_type: Option<String>,
    /// img2img reference URL (image stages).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_url: Option<String>,
    /// Already-available remote image ("url" pieces); consumed directly by
    /// the video stage as an upstream output.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_src: Option<String>,
    /// Pipe media mode (video stage): "keyframes" | "reference".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_mode: Option<String>,
    /// Pipe frame count (8n+1, pre-checked) — feeds the video shaper.
    pub length_frames: u32,
}

/// Output of a single engine stage run. Image stages report both the
/// materialized local file path and the provider's remote output URL (when
/// the provider returned one); the registry links both back to the keyframe
/// / subject so the next video run can prefer the fetchable remote source.
#[derive(Debug, Clone, Default)]
pub struct StageOutput {
    /// Local media-tree file path (image stages only).
    pub local_path: String,
    /// Provider remote URL for the produced image (image stages only).
    pub remote_url: Option<String>,
}

pub trait GenerationEngine: Send + Sync {
    /// Run one stage to completion or failure.
    /// `cancel` is polled for user cancellation; `on_progress` reports 0.0..=1.0;
    /// `on_event` reports a short human-readable state line (e.g. "503 queue
    /// full — retry in 30 s", "polling: in_progress 42%") that the registry
    /// mirrors onto the stage view so the UI's progress modal can show a live
    /// "last event" line instead of a frozen bar during long provider waits.
    /// The line is deliberately terse — NOT the full request/response; the
    /// redacted request-log expander (E1) carries the full detail.
    /// Returns the produced artifact (local path + optional remote URL).
    fn run<'a>(
        &'a self,
        input: &'a EngineInput,
        cancel: &'a AtomicBool,
        on_progress: &'a (dyn Fn(f32) + Sync),
        on_event: &'a (dyn Fn(&str) + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<StageOutput, String>> + Send + 'a>>;
}
