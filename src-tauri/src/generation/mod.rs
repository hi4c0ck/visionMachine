//! Pipe-level generation task engine.
//!
//! The provider/LLM engine system is a future task: this module ships with
//! the engine slot UNCONFIGURED, so generation stages fail fast with real
//! error states — no simulated progress, no fake outputs (decision D1).

mod engine;
mod registry;
mod types;

pub use engine::{EngineInput, GenerationEngine};
pub use registry::TaskRegistry;
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
