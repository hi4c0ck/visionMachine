//! Closed tag vocabulary — the "video-engine language" in closed form.
//!
//! Absorbed from `harness/config/tag_vocabulary.yaml` (the single source of
//! truth from which the shot_spec schema enums are generated). Every tag
//! value a Node B spec may emit lives in these sets; numeric bounds are
//! clamped, not enum'd. `TagVocabulary::validate_concerns()` enforces
//! closure on a `Concerns` object (the V2 "tag-closure" invariant).

use crate::generation::video_flow::engine::types::Concerns;
use std::collections::BTreeSet;

/// One vocabulary version (flows may pin a specific one per run).
pub const VOCAB_VERSION: u32 = 1;

/// The closed enum sets. `fn()` returns a `BTreeSet` (stable ordering, easy
/// to search + serialize); the values mirror the YAML one-for-one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TagVocabulary;

impl TagVocabulary {
    pub const fn new() -> Self {
        Self
    }

    // ── ENUM TAG SETS (each becomes a response_format `enum`) ───────────────
    pub fn size(&self) -> BTreeSet<&'static str> {
        set(["wide", "medium", "close-up", "over-the-shoulder"])
    }
    pub fn angle(&self) -> BTreeSet<&'static str> {
        set(["eye", "low", "high", "dutch", "overhead", "worm", "bird"])
    }
    pub fn framing(&self) -> BTreeSet<&'static str> {
        set(["rule_of_thirds", "centered", "symmetrical", "fill_frame", "negative_space"])
    }
    pub fn dof(&self) -> BTreeSet<&'static str> {
        set(["shallow", "medium", "deep"])
    }
    pub fn lens_focal(&self) -> BTreeSet<u32> {
        BTreeSet::from([14u32, 24, 35, 50, 85, 135])
    }
    pub fn zoom(&self) -> BTreeSet<&'static str> {
        set(["static", "in", "out", "crash", "rack_focus", "push", "pull"])
    }
    pub fn move_set(&self) -> BTreeSet<&'static str> {
        set([
            "static",
            "pan",
            "tilt",
            "track",
            "dolly",
            "crane",
            "handheld",
            "steadicam",
            "orbit",
            "drone",
            "zoom",
        ])
    }
    pub fn speed(&self) -> BTreeSet<&'static str> {
        set(["slow", "normal", "fast", "speed_ramp"])
    }
    pub fn light_key(&self) -> BTreeSet<&'static str> {
        set(["soft", "hard", "low-key", "high-key", "backlit"])
    }
    pub fn light_contrast(&self) -> BTreeSet<&'static str> {
        set(["low", "medium", "high"])
    }
    pub fn grade_saturation(&self) -> BTreeSet<&'static str> {
        set(["saturated", "desaturated", "neutral"])
    }
    pub fn grade_contrast(&self) -> BTreeSet<&'static str> {
        set(["low", "medium", "high"])
    }
    pub fn film_stock(&self) -> BTreeSet<&'static str> {
        set([
            "kodak_250d",
            "kodak_5219",
            "kodak_5207",
            "fuji_super_35",
            "fuji_velvia",
            "cine_organic",
            "neutral",
            "custom",
        ])
    }
    pub fn effects(&self) -> BTreeSet<&'static str> {
        set([
            "fog",
            "rain",
            "smoke",
            "lens_flare",
            "bokeh",
            "sparks",
            "dust",
            "snow",
            "fire",
            "magic_glow",
            "glitch",
            "none",
        ])
    }
    pub fn tempo(&self) -> BTreeSet<&'static str> {
        set(["slow", "medium", "fast", "staccato", "sustained"])
    }
    pub fn transition(&self) -> BTreeSet<&'static str> {
        set([
            "hard_cut",
            "crossfade",
            "dissolve",
            "wipe",
            "match_cut",
            "jump_cut",
            "whip_pan",
            "l_cut",
            "j_cut",
            "cut_on_action",
        ])
    }

    /// The `time_of_day` enum shared by VisualNovel.film + SceneSpec +
    /// SceneTimeline (schema enum: dawn|morning|midday|afternoon|evening|night).
    pub fn time_of_day(&self) -> BTreeSet<&'static str> {
        set(["dawn", "morning", "midday", "afternoon", "evening", "night"])
    }

    // ── NUMERIC BOUNDS (clamped in Node B, not enum) ────────────────────────
    /// clip_s: the 720p engine cap is ~241 frames @24fps → 10s max.
    pub const CLIP_S: (u32, u32) = (4, 10);
    pub const COLOR_TEMP_K: (u32, u32) = (2500, 10000);
    /// Consistency drawer: <=4 refs total (film -> scene -> characters).
    pub const MAX_REFS: usize = 4;
    pub const REFS_PER_TYPE: usize = 3;
    pub const SHOTS_PER_SCENE_MAX: u32 = 5;
    pub const SCENES_MAX: u32 = 24;

    /// Does every tag value in `c` belong to a closed set? Returns the list of
    /// `concern.field` violations (empty = closed). This is the V2 "tag-closure"
    /// invariant from `pipeline.js`.
    pub fn validate_concerns(&self, c: &Concerns) -> Vec<String> {
        let mut bad: Vec<String> = Vec::new();
        let chk =
            |bad: &mut Vec<String>, field: &str, v: &str, set: &BTreeSet<&'static str>| {
                if !set.contains(v) {
                    bad.push(format!("{field}=\"{v}\" not in vocab"));
                }
            };
        chk(&mut bad, "camera.size", &c.camera.size, &self.size());
        chk(&mut bad, "camera.angle", &c.camera.angle, &self.angle());
        chk(&mut bad, "camera.framing", &c.camera.framing, &self.framing());
        chk(&mut bad, "camera.dof", &c.camera.dof, &self.dof());
        if !self.lens_focal().contains(&c.lens.focal_mm) {
            bad.push(format!("lens.focal_mm={} not in lens_focal", c.lens.focal_mm));
        }
        chk(&mut bad, "motion.zoom", &c.motion.zoom, &self.zoom());
        chk(&mut bad, "motion.move", &c.motion.r#move, &self.move_set());
        chk(&mut bad, "motion.speed", &c.motion.speed, &self.speed());
        chk(&mut bad, "lighting.key", &c.lighting.key, &self.light_key());
        chk(&mut bad, "lighting.contrast", &c.lighting.contrast, &self.light_contrast());
        if !(TagVocabulary::COLOR_TEMP_K.0..=TagVocabulary::COLOR_TEMP_K.1)
            .contains(&c.lighting.color_temp_k)
        {
            bad.push(format!(
                "lighting.color_temp_K={} out of bounds",
                c.lighting.color_temp_k
            ));
        }
        chk(
            &mut bad,
            "grade.saturation",
            &c.grade.saturation,
            &self.grade_saturation(),
        );
        chk(&mut bad, "grade.contrast", &c.grade.contrast, &self.grade_contrast());
        chk(&mut bad, "grade.film_stock", &c.grade.film_stock, &self.film_stock());
        for e in &c.effects {
            if !self.effects().contains(e.as_str()) {
                bad.push(format!("effects \"{}\" not in vocab", e));
            }
        }
        bad
    }
}

impl Default for TagVocabulary {
    fn default() -> Self {
        Self::new()
    }
}

/// Build a stable-ordered string set (string literals, 'static).
fn set<const N: usize>(items: [&'static str; N]) -> BTreeSet<&'static str> {
    items.iter().copied().collect()
}
