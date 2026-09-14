//! The generation engine contract.
//!
//! The provider/LLM-selection system (models, settings, API plumbing) is a
//! future system — no implementation ships in this task. The registry's
//! engine slot stays `None`, and engine-dependent stages fail fast with a
//! real error instead of simulated progress (decision D1).

use std::sync::atomic::AtomicBool;

/// Everything an engine needs for one stage run. Extended later when the
/// provider/LLM system lands (model settings, provider selection, etc.).
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
