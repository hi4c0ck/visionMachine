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
    /// Pipe's human name (e.g. "Pipe 1") — drives the name-consistent media
    /// layout `<sessionRoot>/<pipe-name>/<gen-hash>`. None for legacy callers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pipe_name: Option<String>,
    pub fps: u32,
    pub resolution: String,
    pub orientation: String,
    /// 0012: the session target size (round-even'd W x H) pinned for the run.
    /// 0 = not set -> the shaper falls back to the orientation's ratio map.
    /// Used to pick the nearest supported `aspect_ratio` request hint when a
    /// custom target overrides the preset aspect; never sent to the provider
    /// as pixels (R-1/R-2).
    #[serde(default)]
    pub target_w: u32,
    #[serde(default)]
    pub target_h: u32,
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
    /// Run-scoped media-mode override for the video stage (group flow).
    /// When set (e.g. "keyframes"), the registry overrides the video
    /// stage's `media_mode` in the stage plan, so a forced last-frame
    /// catch insists on keyframe generation even when the pipe's stored
    /// media_mode is "reference". None = use the pipe's stored mode.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub force_media_mode: Option<String>,
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

/// A standalone single-piece image generation — the keyframe / subject modal
/// "Generate" button. Unlike the sequential task runner this is a fire-and-return
/// image POST: shape one request, materialize the artifact into a caller-chosen
/// path, and let the caller append it to the piece's own on-disk history. It is
/// deliberately NOT part of `run`'s stage loop.
#[derive(Debug, Clone)]
pub struct PieceGeneration {
    /// Resolved image-model spec (the frontend catalog's wire mirror).
    pub spec: ModelSpecWire,
    /// Per-piece context the image shaper consumes (prompt / reference /
    /// resolution / orientation / seed). The shaper ignores the video-only
    /// fields.
    pub ctx: crate::generation::shaper::StageContext,
    /// Provider profile that owns the image API slots (`None` = default).
    pub profile_id: Option<String>,
    /// Where the artifact is written (the caller already computed the
    /// append-only, never-overwritten destination path).
    pub dest: std::path::PathBuf,
    /// Best-effort redacted request/response log target. `None` = skip logging.
    pub request_log: Option<std::path::PathBuf>,
}

pub trait GenerationEngine: Send + Sync {
    /// Run one stage to completion or failure.
    /// `cancel` is polled for user cancellation; `on_progress` reports 0.0..=1.0;
    /// `on_event` reports a short human-readable state line (e.g. "503 queue
    /// full — retry in 15 s", "polling: in_progress 42%") that the registry
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
    /// Standalone single-piece image generation (the modal's "Generate").
    /// Provider engines implement this; engines without image support return
    /// an Err from the default body so the caller surfaces a concrete failure.
    fn generate_piece<'a>(
        &'a self,
        req: &PieceGeneration,
        on_progress: &'a (dyn Fn(f32) + Sync),
        on_event: &'a (dyn Fn(&str) + Sync),
    ) -> BoxFuture<'a, Result<StageOutput, String>> {
        let _ = (req, on_progress, on_event);
        Box::pin(async move {
            Err("this engine does not support standalone piece generation".to_string())
        })
    }
}

/// A boxed future returned by an engine stage / piece run.
pub type BoxFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;
