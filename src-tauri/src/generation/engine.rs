//! The generation engine contract.
//!
//! The provider/LLM-selection system (models, settings, API plumbing) is a
//! future system — no implementation ships in this task. The registry's
//! engine slot stays `None`, and engine-dependent stages fail fast with a
//! real error instead of simulated progress (decision D1).

use std::sync::atomic::AtomicBool;

use crate::generation::specs::ModelSpecWire;

/// Everything an engine needs for one stage run. The model spec wire mirrors
/// ride along when the frontend resolves them (docs/provider-engine-tasks.md,
/// Phase A); the registry still drives stages sequentially from the pipe
/// snapshot. Extended later when the provider/LLM system lands.
#[derive(Debug, Clone, serde::Serialize)]
pub struct EngineInput {
    /// The final prompt string (built by the frontend prompt engine).
    pub prompt: String,
    pub pipe_id: String,
    pub fps: u32,
    pub resolution: String,
    pub orientation: String,
    pub q_value: u32,
    pub c_value: f32,
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
}

pub trait GenerationEngine: Send + Sync {
    /// Run one stage to completion or failure.
    /// `cancel` is polled for user cancellation; `on_progress` reports 0.0..=1.0.
    /// Returns the path of the generated file.
    fn run<'a>(
        &'a self,
        input: &'a EngineInput,
        cancel: &'a AtomicBool,
        on_progress: &'a (dyn Fn(f32) + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send + 'a>>;
}
