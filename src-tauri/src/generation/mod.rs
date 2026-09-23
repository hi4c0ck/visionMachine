//! Pipe-level generation task engine.
//!
//! The provider engine (docs/provider-engine-tasks.md, Phase D) executes
//! image sync POSTs and video create→poll flows against the per-profile
//! provider slots. The engine slot is wired in `lib.rs` at startup.

mod engine;
mod media;
mod provider;
mod registry;
mod shaper;
mod specs;
mod types;

pub use engine::{EngineInput, EngineStage, GenerationEngine};
pub use media::{
    append_jsonl, append_request_log, pipe_media_dirs, redact, redact_authorization, safe_dir_name,
    session_generation_dirs, session_media_root, write_json,
};
pub use provider::ProviderEngine;
pub use registry::{MediaRootResolver, TaskRegistry};
pub use shaper::{
    clamp_to_range, format_seconds, pick_image_size, pick_ratio, shape_request,
    substitute_poll_template, UpstreamOutput,
};
pub use specs::{ModelSpecLimits, ModelSpecMedia, ModelSpecWire};
pub use types::*;

use crate::storage::db::Database;

/// Small service: task registry + DB access for the generation flow. Owns
/// the provider engine (Phase D) — the registry's no-engine fail-fast path is
/// unreachable in production because the engine slot is wired at startup.
#[derive(Clone)]
pub struct GenerationService {
    pub registry: TaskRegistry,
}

impl GenerationService {
    pub fn new(db: Database) -> Self {
        // The registry + engine share the media-root resolver (E3/O6):
        // project `directory_path` when set, else the default app-data media
        // tree. The engine falls back to it when an input carries no
        // pre-resolved root.
        let registry = TaskRegistry::new(db.clone());
        let engine = provider::ProviderEngine::default_wiring(db, registry.media_root_resolver());
        registry.set_engine(std::sync::Arc::new(engine));
        Self { registry }
    }

    /// Wire the UI event sink that pushes `GenTaskEvent`s (the `emit_to`
    /// closure from `lib.rs`). The registry stays tauri-free; this only
    /// routes the sink to the shared slot.
    pub fn set_event_sink(
        &self,
        f: impl Fn(crate::generation::types::GenTaskEvent) + Send + Sync + 'static,
    ) {
        self.registry.set_event_sink(f);
    }
}
