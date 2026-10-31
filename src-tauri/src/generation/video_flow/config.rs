//! Versioned text-output contract + configuration for the video-flow harness.
//!
//! The flow mutates **user entry text** into a **solid composer pipe structure**
//! through a small chain of versioned mutation steps (docs/text-video-flow-tasks.md):
//!
//!   raw text → (expand) → narrative text
//!            → (structure) → `StructuredVideoPlan` (sections + video-engine tags)
//!            → (materialize) → composer `Vec<Pipe>` (the solid compose-section data)
//!
//! Every step is versioned and carries a per-run config so behavior is both
//! tunable and coverable by tests. No step mutates shared state; they are pure
//! text → text / text → plan / plan → pipes transformations.

use serde::{Deserialize, Serialize};

/// The flow's own contract version. Bump only when the *shaped output* of a
/// step changes in a way that breaks an earlier reader; a new step is added by
/// the pipeline, not by bumping this.
pub const FLOW_VERSION: u32 = 1;

/// Per-step transition parameters. Each has a conservative `Default` so an
/// empty config is always a valid, deterministic run (the test guarantee).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FlowConfig {
    pub flow_version: u32,
    pub expand: ExpandParams,
    pub structure: StructureParams,
    pub materialize: MaterializeParams,
    pub critic: CriticParams,
    pub learn: LearnParams,
}

impl FlowConfig {
    /// A fully-populated default with pinned step versions. This is the single
    /// source of truth for "no user overrides" runs and the baseline the
    /// versioning tests compare against.
    pub fn default_flow() -> Self {
        Self {
            flow_version: FLOW_VERSION,
            expand: ExpandParams {
                step_version: 1,
                min_novel_words: 40,
                max_novel_chars: 20_000,
                seed: None,
            },
            structure: StructureParams {
                step_version: 1,
                // The concrete engine plan emits 2*N story sections (Scene +
                // Camera ride the N sub-slice windows) + up to 4 whole-shot
                // meta (Motion/Lighting/Transition/Effect). With the schema
                // cap N<=4 that's <= 12, so the guardrail is 12.
                max_sections_per_pipe: 12,
                max_tags_per_section: 24,
                default_section_frames: 24,
            },
            materialize: MaterializeParams {
                step_version: 1,
                default_fps: 24,
                default_pipe_frames: 240,
                media_mode: "text".to_string(),
            },
            critic: CriticParams::default(),
            learn: LearnParams::default(),
        }
    }
}

/// Step 1 (expand): raw entry text → expanded narrative.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ExpandParams {
    pub step_version: u32,
    /// Hard floor for the produced narrative; below this the step fails with a
    /// concrete "expansion too small" text-output error (never a silent pass).
    pub min_novel_words: usize,
    /// Hard cap guarding against an unbounded LLM blow-up.
    pub max_novel_chars: usize,
    /// Reproducibility seed threaded to an LLM expander when it supports one.
    pub seed: Option<i64>,
}

impl Default for ExpandParams {
    fn default() -> Self {
        Self {
            step_version: 1,
            min_novel_words: 40,
            max_novel_chars: 20_000,
            seed: None,
        }
    }
}

/// Step 2 (structure): narrative text → `StructuredVideoPlan`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StructureParams {
    pub step_version: u32,
    pub max_sections_per_pipe: usize,
    pub max_tags_per_section: usize,
    /// Frame length assigned to a marker section that carries no explicit range.
    pub default_section_frames: u32,
}

impl Default for StructureParams {
    fn default() -> Self {
        Self {
            step_version: 1,
            max_sections_per_pipe: 8,
            max_tags_per_section: 24,
            default_section_frames: 24,
        }
    }
}

/// Step 3 (materialize): `StructuredVideoPlan` → composer pipes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MaterializeParams {
    pub step_version: u32,
    pub default_fps: u32,
    /// Pipe length when the plan carries no explicit section frames.
    pub default_pipe_frames: u32,
    /// The pipe media mode the text-only flow emits ("text" = no image media).
    pub media_mode: String,
}

impl Default for MaterializeParams {
    fn default() -> Self {
        Self {
            step_version: 1,
            default_fps: 24,
            default_pipe_frames: 240,
            media_mode: "text".to_string(),
        }
    }
}

/// How the critic turns its per-unit/element scores into the single *overall*
/// transition-quality number. This is the "descending from overall" control
/// point: `overall` is ALWAYS `combinator(leaf scores)`, so the overall is a
/// derived, explainable value — never a free-floating number.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScoreCombinator {
    /// Mean of the leaf scores.
    Mean,
    /// Weakest link: the overall is the *minimum* leaf score. Use this when
    /// one bad element must drag the whole transition down — it keeps the
    /// overall intuitive (no single leaf can hide in an average).
    Min,
    /// Weighted by leaf `weight`. (Weights live on the leaf; `Weighted` needs
    /// none on the combinator side.)
    Weighted,
}

impl Default for ScoreCombinator {
    fn default() -> Self {
        Self::Mean
    }
}

/// Step: critic (local) — `Structured` + intent reference → `ScoreTree`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CriticParams {
    pub step_version: u32,
    /// Which combinator the tree root uses to descend from leaves to overall.
    pub combinator: ScoreCombinator,
    /// Point the local model at a versioned build (see `LearnParams` + the
    /// tiny build spec). `None` = use the deterministic `DefaultCritic`.
    pub critic_model: Option<u32>,
}

impl Default for CriticParams {
    fn default() -> Self {
        Self {
            step_version: 1,
            combinator: ScoreCombinator::Mean,
            critic_model: None,
        }
    }
}

/// Where the local models live (their tiny build spec) + which versions the
/// critic / structurer use. This is the "point that and cover" seam: it names
/// a `ModelBuildSpec` so the harness stays a thin consumer of *someone else's
/// trained weights* (you train them; the separate trainer consumes `signal`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LearnParams {
    pub step_version: u32,
    /// Version of the local structurer build in use (0 = no local structurer
    /// yet, the deterministic `MarkerStructurer` is the structurer).
    pub structurer_model: u32,
    /// Directory hint (session-space relative) where model builds live; the
    /// resolver expands it. See `learn.rs`.
    pub model_root: Option<String>,
}

impl Default for LearnParams {
    fn default() -> Self {
        Self {
            step_version: 1,
            structurer_model: 0,
            model_root: None,
        }
    }
}
