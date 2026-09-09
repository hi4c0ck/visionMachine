// NOTE: viewmodel + tool are RESERVED state-machine infrastructure (MVI layer).
// Kept as dead code with #![allow(dead_code)] so the architecture can be revived
// later without re-architecting. All other model modules were pruned in the
// 2026-09-09 bulk cleanup: profile/frontend_conversion/async_writer were
// unreferenced, and the frontend currently mutates the composer locally and
// persists via bulk get_composer/save_composer RPCs.
pub mod composer;
pub mod tool;
pub mod viewmodel;

// Re-export composer models (canonical data layer)
pub use composer::{ComposerConfig, Pipe};

// NOTE: `tool` and `viewmodel` modules are intentionally NOT re-exported:
// they are reserved infrastructure, referenced by path (models::viewmodel::…)
// when the state-machine architecture is revived.
