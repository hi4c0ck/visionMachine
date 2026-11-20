//! The gate model (absorbed from `harness/config/gates.yaml`).
//!
//! Every pipeline step is GATED: the runner stops, shows the user the
//! intermediate output, lets them adjust parameters, gets explicit
//! confirmation, then proceeds. Any gate can backtrack (re-run an upstream
//! step with modified params). In batch/CI mode auto-confirmable gates skip.
//!
//! This is the data model behind the Director UI's lock / "re-run from step N"
//! / destructive-apply lifecycle: a gate's `backtrack` targets are exactly the
//! upstream steps a user may re-run, and `acquirable` are the fields they may
//! edit at that point.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// The five gate positions. Order = pipeline order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GateId {
    /// Before Node A: entry params (this IS the input; never auto).
    G0Entry,
    /// After Node A: novel review.
    G1NovelReview,
    /// After Node B: spec review (seal the specs before media).
    G2SpecReview,
    /// After media generation: clip review (declared; media out of text scope).
    G3ClipReview,
    /// After assembly: final review (declared; assembly out of text scope).
    G4FinalReview,
}

impl GateId {
    /// Pipeline order (G0 first).
    pub const ALL: [GateId; 5] =
        [GateId::G0Entry, GateId::G1NovelReview, GateId::G2SpecReview, GateId::G3ClipReview, GateId::G4FinalReview];

    pub fn as_str(self) -> &'static str {
        match self {
            GateId::G0Entry => "G0_entry",
            GateId::G1NovelReview => "G1_novel_review",
            GateId::G2SpecReview => "G2_spec_review",
            GateId::G3ClipReview => "G3_clip_review",
            GateId::G4FinalReview => "G4_final_review",
        }
    }
}

/// A step that a gate can backtrack to (re-run upstream).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Step {
    NodeA,
    SceneDivide,
    Spec,
    MediaGeneration,
    Assembly,
}

/// What the user may set/adjust at a gate (field paths, e.g. "film.world").
pub type Acquirable = Vec<String>;

/// One gate's declaration. Mirrors gates.yaml per-gate fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Gate {
    pub id: GateId,
    /// Where the gate sits ("before: node_a", "after: node_b", …).
    pub position: String,
    /// What the human sees at this gate.
    pub show: String,
    /// Fields the user can set/adjust here.
    pub acquirable: Acquirable,
    /// The affirmation required to proceed.
    pub confirm: String,
    /// Upstream steps re-runnable from here (empty = none).
    pub backtrack: Vec<Step>,
    /// Auto-confirmable in batch/CI mode (G0 is never auto).
    pub auto: bool,
}

/// The full gate table (G0–G4). One source of truth.
pub struct Gates;

impl Gates {
    /// The closed gate table, faithful to gates.yaml.
    pub fn all() -> Vec<Gate> {
        vec![
            Gate {
                id: GateId::G0Entry,
                position: "before: node_a".into(),
                show: "Entry summary: text, genre, ratio, scale".into(),
                acquirable: vec![
                    "input_text".into(),
                    "genre.name".into(),
                    "genre.style".into(),
                    "ratio".into(),
                    "scale.scenes".into(),
                    "scale.shotsPerScene".into(),
                    "scale.clipS".into(),
                    "creative_profile".into(),
                    "spec_profile".into(),
                ],
                confirm: "Proceed with these settings?".into(),
                backtrack: Vec::new(), // nothing upstream
                auto: false,           // this IS the input
            },
            Gate {
                id: GateId::G1NovelReview,
                position: "after: node_a".into(),
                show: "Visual Novel (readable prose: world, scenes, shots, beats)".into(),
                acquirable: vec![
                    "film.world".into(), "film.palette".into(),
                    "film.time_of_day".into(), "film.weather".into(),
                    "scenes[].title".into(), "scenes[].prose".into(),
                    "scenes[].shots[].prose".into(), "scenes[].shots[].beats".into(),
                    "scale.scenes".into(), "scale.shotsPerScene".into(),
                ],
                confirm: "Does this novel match your vision?".into(),
                backtrack: vec![Step::NodeA],
                auto: false,
            },
            Gate {
                id: GateId::G2SpecReview,
                position: "after: node_b".into(),
                show: "Structured shot sheets (spec table + image/video prompt per shot)".into(),
                acquirable: vec![
                    "shots[].concerns.camera.size".into(),
                    "shots[].concerns.camera.angle".into(),
                    "shots[].concerns.camera.framing".into(),
                    "shots[].concerns.camera.dof".into(),
                    "shots[].concerns.lens.focal_mm".into(),
                    "shots[].concerns.motion.zoom".into(),
                    "shots[].concerns.motion.move".into(),
                    "shots[].concerns.motion.speed".into(),
                    "shots[].concerns.lighting.key".into(),
                    "shots[].concerns.lighting.color_temp_K".into(),
                    "shots[].concerns.grade.palette".into(),
                    "shots[].concerns.grade.film_stock".into(),
                    "shots[].concerns.effects".into(),
                    "shots[].concerns.audio.music_cue".into(),
                    "shots[].transition_in".into(),
                    "shots[].transition_out".into(),
                    "shots[].clip_s".into(),
                    "shots[].sub_timeline".into(),
                ],
                confirm: "Proceed with these specs to media generation?".into(),
                backtrack: vec![Step::Spec, Step::NodeA],
                auto: false,
            },
            Gate {
                id: GateId::G3ClipReview,
                position: "after: media_generation".into(),
                show: "Generated stills + video clips per shot (thumbnails + playback)".into(),
                acquirable: vec![
                    "shots[].re_roll".into(),
                    "shots[].prompts.image".into(),
                    "shots[].prompts.video".into(),
                    "shots[].refs".into(),
                    "shots[].clip_s".into(),
                ],
                confirm: "All clips acceptable for assembly?".into(),
                backtrack: vec![Step::Spec, Step::MediaGeneration],
                auto: true,
            },
            Gate {
                id: GateId::G4FinalReview,
                position: "after: assembly".into(),
                show: "Assembled film (playback) + assembly metadata".into(),
                acquirable: vec![
                    "assembly.transitions[]".into(),
                    "assembly.audio_mix".into(),
                    "assembly.subtitles".into(),
                    "assembly.output".into(),
                ],
                confirm: "Final review — export?".into(),
                backtrack: vec![Step::Assembly, Step::MediaGeneration],
                auto: true,
            },
        ]
    }

    /// Look up a gate by id (owned copy — the table holds heap strings).
    pub fn get(&self, id: GateId) -> Gate {
        Self::all().into_iter().find(|g| g.id == id).expect("gate id must be in the table")
    }

    /// The steps a gate can backtrack to (its `re_run` targets).
    pub fn backtrack_steps(&self, id: GateId) -> Vec<Step> {
        self.get(id).backtrack.clone()
    }

    /// Batch/CI auto-confirm: true for every auto-gate, plus the given
    /// explicit skip list (gate ids skipped entirely).
    pub fn auto_confirm(&self, id: GateId, batch_mode: bool, skip: &BTreeMap<GateId, bool>) -> bool {
        if skip.get(&id).copied().unwrap_or(false) {
            return true;
        }
        batch_mode && self.get(id).auto
    }
}

impl Default for Gates {
    fn default() -> Self {
        Self
    }
}

/// The decision recorded when a gate is confirmed (for the I7 signal log /
/// batch decision log): which gate, what params were in force.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GateDecision {
    pub gate: GateId,
    /// "confirm" | "auto" (batch auto-confirm) | "backtrack:<step>".
    pub outcome: String,
    /// The param snapshot the decision was taken against (for replay).
    #[serde(default)]
    pub params: Option<String>,
}
