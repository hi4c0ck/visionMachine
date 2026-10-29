//! Engine — the *real* mutation-flow data model absorbed from `harness/`.
//!
//! This is the concrete, closed-vocabulary, concern-grouped, gate-gated,
//! deterministically-verified text pipeline that `harness/` implements in JS
//! (S0→S5). Absorbed here as a typed, versioned, tested model so the Rust
//! harness can carry the *same* structures, invariants, and learning
//! substrate — without re-inventing them or touching `composer::Pipe`.
//!
//! Scope (faithful, additive, no LLM, no media):
//!   - `types`            : FilmSeed / VisualNovel / SceneSpec / SceneTimeline /
//!                          ShotSpec / ShotMolecule — the S0..S4 wire models
//!   - `tag_vocabulary`   : the CLOSED enum sets + numeric bounds + style presets
//!                          (one source of truth, mirrors tag_vocabulary.yaml)
//!   - `axes`             : the concern-axes vector substrate (encode / decode /
//!                          diff / fold / normalize) — the fidelity learning space
//!   - `derive`           : deterministic base+delta prompt composition (S4)
//!   - `gates`            : the G0–G4 confirmation + backtrack gate model
//!
//! These types are `snake_case`-keyed to match the harness wire schema exactly
//! (so golden fixtures + JSON round-trip verbatim). They are independent of
//! the composer model (I9) and of the Phase-0 `StructuredVideoPlan` seam — the
//! engine is a parallel, richer text model that the flow can lower onto later.

pub mod axes;
pub mod derive;
pub mod gates;
pub mod tag_vocabulary;
pub mod types;

#[cfg(test)]
mod golden;
