//! Pipe-level generation task engine.
//!
//! The provider/LLM engine system is a future task: this module ships with
//! the engine slot UNCONFIGURED, so generation stages fail fast with real
//! error states — no simulated progress, no fake outputs (decision D1).

mod engine;
mod media;
mod registry;
mod shaper;
mod specs;
mod types;

pub use engine::{EngineInput, GenerationEngine};
pub use media::{
    append_jsonl, append_request_log, pipe_media_dirs, redact, redact_authorization, safe_dir_name,
    session_media_root, write_json,
};
pub use registry::TaskRegistry;
pub use shaper::{
    clamp_to_range, format_seconds, pick_image_size, pick_ratio, shape_request,
    substitute_poll_template, UpstreamOutput,
};
pub use specs::{ModelSpecLimits, ModelSpecMedia, ModelSpecWire};
pub use types::*;

use crate::storage::db::Database;

/// Small service: task registry + DB access for the generation flow.
#[derive(Clone)]
pub struct GenerationService {
    pub registry: TaskRegistry,
}

impl GenerationService {
    pub fn new(db: Database) -> Self {
        Self {
            registry: TaskRegistry::new(db),
        }
    }
}
