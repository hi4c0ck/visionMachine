//! S0..S4 wire models, faithful to `harness/schemas/*.json`.
//!
//! Keys are `snake_case` (the harness wire schema), so golden fixtures and the
//! `node_a/node_b.request.json` fixtures round-trip verbatim. `#[serde(default)]`
//! on optional fields keeps deserialization tolerant of partial states.

use serde::{Deserialize, Serialize};

/// S0 — the minimal entry config (input to Node A). Mirrors film_seed.schema.json.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FilmSeed {
    pub title: String,
    /// The creative idea the LLM reads (min 10 chars).
    pub idea: String,
    /// Optional verbatim user text (display-only; the LLM reads `idea`).
    #[serde(default)]
    pub input_text: Option<String>,
    pub genre: Genre,
    /// "16:9" | "9:16" | "1:1".
    pub ratio: String,
    pub scale: SeedScale,
}

/// A coarse genre + its visual style string (seeds a style preset).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Genre {
    pub name: String,
    pub style: String,
}

/// Expansion scale: how many scenes, shots/scene, and the clip-length bounds.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SeedScale {
    pub scenes: u32,
    pub shots_per_scene: u32,
    /// [min, max] clip seconds (schema: exactly 2, each 4..=12).
    pub clip_s: [u32; 2],
}

/// S1 — Node A output / Node B input: a saturated visual-language document.
/// Mirrors visual_novel.schema.json.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VisualNovel {
    pub film: FilmLook,
    pub scenes: Vec<NovelScene>,
}

/// The film's stable look (world, palette, time, weather) — global context.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FilmLook {
    pub title: String,
    pub logline: String,
    pub style: String,
    pub world: String,
    pub palette: String,
    /// dawn | morning | midday | afternoon | evening | night
    pub time_of_day: String,
    pub weather: String,
}

/// One novel scene: prose + its shots (each shot = prose + beats).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NovelScene {
    pub title: String,
    pub prose: String,
    pub shots: Vec<NovelShot>,
    /// Stage 2: the LLM-authored HAND-OFF line for this scene — "what state
    /// this scene leaves the story in so the next clip opens on it." Optional
    /// (`serde default`): an absent field = the deterministic fallback
    /// (`tree.rs::deterministic_handoff`) is used at assembly time, so an
    /// older LLM response (or the template novel, which never sets it) still
    /// gets a connectivity line. Strict schema keeps `additionalProperties`
    /// false but lists this as an optional property.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hand_off: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NovelShot {
    pub prose: String,
    /// The meaningful micro-beats the sub-timeline later tracks.
    pub beats: Vec<String>,
}

/// S2 (per-scene base look) — the stable look a scene carries; shots inherit.
/// Mirrors scene_spec.schema.json.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SceneSpec {
    pub scene_id: String,
    /// dawn | morning | midday | afternoon | evening | night
    pub time_of_day: String,
    pub weather: String,
    /// Same shape as the shot's lighting/grade concerns (scene_spec schema).
    pub light: LightingConcern,
    pub grade: GradeConcern,
    pub ambience: String,
    /// slow | medium | fast | staccato | sustained
    pub tempo: String,
    /// scene-level effects; shot-level effects_delta adds on top.
    pub effects_base: Vec<String>,
}

/// S2 (division) — the timeline of scene parts at transition points.
/// Each shot is 1-to-1 with a novel shot via `novel_ref`. Mirrors
/// scene_timeline.schema.json. NOTE: no camera/lens/zoom here — structure
/// + duration + transition only.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SceneTimeline {
    pub timeline_id: String,
    pub total_s: u32,
    pub scenes: Vec<TimelineScene>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TimelineScene {
    pub scene_id: String,
    pub title: String,
    /// How we ENTER this scene part (first = hard_cut).
    pub transition_in: String,
    /// One sentence: why this is a new scene part.
    pub transition_note: String,
    pub time_of_day: String,
    pub weather: String,
    pub shots: Vec<TimelineShot>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TimelineShot {
    pub shot_id: String,
    /// Which novel shot this is (e.g. "scene_1.shot_2"); 1-to-1, no invented shots.
    pub novel_ref: String,
    /// 4..=10 (720p engine cap ~241f @24fps).
    pub clip_s: u32,
    pub transition_out: String,
    /// One sentence: what triggers this cut.
    pub transition_note: String,
}

/// S3 — Node B output: one spec per confirmed timeline shot. Tags are grouped
/// BY CONCERN (camera/lens/motion/lighting/grade/effects/audio). The LLM writes
/// clean-enum states; sub-timeline deltas are COMPUTED downstream. Mirrors
/// shot_spec.schema.json.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ShotSpec {
    pub shot_id: String,
    /// Which novel shot this spec belongs to (e.g. "scene_1.shot_2").
    pub novel_ref: String,
    /// The NOVEL content (WHAT, not HOW) carried so the spec is self-contained.
    pub content: ShotContent,
    pub clip_s: u32,
    pub transition_in: String,
    pub transition_out: String,
    /// Concern groups: each holds only its own tags.
    pub concerns: Concerns,
    /// Slices WITHIN the shot tracking dynamic changes (1..=4).
    pub sub_timeline: Vec<SubSlice>,
}

/// WHAT: the novel prose + beats this shot expresses.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ShotContent {
    pub prose: String,
    pub beats: Vec<String>,
}

/// The concern groups — a shot's visual/audio tags, grouped so each concern
/// holds only its own tags (shot_spec.schema.json `concerns`).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Concerns {
    pub camera: CameraConcern,
    pub lens: LensConcern,
    pub motion: MotionConcern,
    pub lighting: LightingConcern,
    pub grade: GradeConcern,
    /// Atmospheric / post effects present in the shot (may include "none").
    pub effects: Vec<String>,
    pub audio: AudioConcern,
}

/// Framing + viewpoint (NOT lens, NOT movement).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CameraConcern {
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub angle: String,
    #[serde(default)]
    pub framing: String,
    #[serde(default)]
    pub dof: String,
}

/// Optics only.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LensConcern {
    /// Focal length in mm (enum: 14|24|35|50|85|135).
    #[serde(default)]
    pub focal_mm: u32,
    #[serde(default)]
    pub distortion: Option<String>,
}

/// Zoom + physical camera movement + speed.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MotionConcern {
    #[serde(default)]
    pub zoom: String,
    /// Wire key is "move" (a reserved word in Rust → raw identifier).
    #[serde(rename = "move")]
    pub r#move: String,
    #[serde(default)]
    pub speed: String,
}

/// Key light + color temperature + pattern.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct LightingConcern {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub contrast: String,
    /// 2500..=10000 K. Wire key is `color_temp_K` (capital K, per the schema).
    #[serde(rename = "color_temp_K")]
    pub color_temp_k: u32,
    #[serde(default)]
    pub pattern: Option<String>,
}

/// Color grade / look.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GradeConcern {
    #[serde(default)]
    pub palette: String,
    #[serde(default)]
    pub saturation: String,
    #[serde(default)]
    pub contrast: String,
    #[serde(default)]
    pub film_stock: String,
}

/// Audio layers + silence flag.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct AudioConcern {
    #[serde(default)]
    pub foley: String,
    #[serde(default)]
    pub sfx: String,
    #[serde(default)]
    pub music_cue: String,
    pub silence: bool,
}

/// One sub-timeline slice: a time window + what changes + the full concern
/// state at that moment (clean enums). Deltas between slices are computed,
/// never written. Mirrors shot_spec.schema.json `sub_timeline[]`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct SubSlice {
    pub from_s: u32,
    pub to_s: u32,
    /// What dynamically changes in this slice (one short sentence, from the beat).
    pub note: String,
    /// Full concern-grouped state at this slice; omit a concern to carry prev.
    #[serde(default)]
    pub state: Option<PartialConcerns>,
    /// Content-driven path (beat profiles): the beat texts this slice
    /// CARRIES — one beat normally; when a no-op beat was collapsed into
    /// this slice (V7 merge), its text lands here too so no narrative
    /// content is lost. Empty on the cycling template path (the plan falls
    /// back to the positional `content.beats[i]`). Additive: old goldens
    /// round-trip unchanged (serde default, skipped when empty).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub absorbed_beats: Vec<String>,
}

/// A possibly-sparse concern state for a sub-slice (only the changed groups).
/// Mirrors the sub_timeline `state` object (`additionalProperties: true`).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PartialConcerns {
    #[serde(default)]
    pub camera: Option<CameraConcern>,
    #[serde(default)]
    pub lens: Option<LensConcern>,
    #[serde(default)]
    pub motion: Option<MotionConcern>,
    #[serde(default)]
    pub lighting: Option<LightingConcern>,
    #[serde(default)]
    pub grade: Option<GradeConcern>,
    #[serde(default)]
    pub effects: Option<Vec<String>>,
    #[serde(default)]
    pub audio: Option<AudioConcern>,
}

/// S3 (deterministic molecule) — a shot as a DELTA from its SceneSpec: only the
/// meaningful change is explicit; the rest is inherited; prompts are computed
/// (not LLM-guessed). Mirrors shot_molecule.schema.json.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ShotMolecule {
    /// The SceneSpec id this shot derives from.
    pub inherit: String,
    /// The meaningful content/action of THIS shot.
    pub subject: String,
    pub composition: CameraConcern,
    pub lens: LensConcern,
    pub motion: MotionConcern,
    /// Shot-level effects ADDED on top of the scene's effects_base.
    pub effects_delta: Vec<String>,
    pub audio: AudioConcern,
    pub transition_in: String,
    pub transition_out: String,
    pub clip_s: u32,
    /// Filled deterministically by `derive` (do not hand-write).
    pub prompts: Prompts,
}

/// The deterministic prompt pair produced by `derive` (image + video).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Prompts {
    pub image: String,
    pub video: String,
}
