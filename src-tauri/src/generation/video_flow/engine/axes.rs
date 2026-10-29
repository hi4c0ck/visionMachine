//! The concern-axes vector substrate (absorbed from `harness/lib/concern-axes.js`).
//!
//! One axis table, three uses:
//!   1. ENCODING — concern state → vector (per-axis position) [learning substrate]
//!   2. DECODING — vector → nearest clean enum per axis [render boundary]
//!   3. DIFFING  — two concern states → "concern.field: a -> b" [computed sub-timeline deltas]
//!
//! The LLM writes clean enum states per sub-timeline slice; deltas are
//! *computed* by `diff`, never written as free text — this kills the
//! out-of-vocab / typo defect class at the root. `fold` carries forward +
//! normalizes a sequence of sparse slices into fully-populated clean-enum
//! effective states; that sequence is the persisted `effective_states`
//! vectors the learner (centroids / interpolation / anomaly) is fed.
//!
//! Axis types (faithful to the JS): categorical / ordinal / numeric / multi /
//! text. Text axes are NOT vectorized — they are carried alongside (`text_fields`).

use crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary;
use crate::generation::video_flow::engine::types::{
    AudioConcern, CameraConcern, Concerns, GradeConcern, LensConcern, MotionConcern,
    PartialConcerns,
};
use std::collections::BTreeMap;

/// A flat concern.state → vector map. Keys are `concern.field`; effects is a
/// multi-axis with one `effects.<name>` entry per value (0/1).
pub type ConcernVector = BTreeMap<String, f64>;

// ── closed value lists (single source of truth, mirrors tag_vocabulary.yaml) ──

const SIZE: &[&str] = &["wide", "medium", "close-up", "over-the-shoulder"];
const ANGLE: &[&str] = &["eye", "low", "high", "dutch", "overhead", "worm", "bird"];
const FRAMING: &[&str] =
    &["rule_of_thirds", "centered", "symmetrical", "fill_frame", "negative_space"];
const DOF: &[&str] = &["shallow", "medium", "deep"];
const ZOOM: &[&str] = &["static", "in", "out", "crash", "rack_focus", "push", "pull"];
const MOVE: &[&str] = &[
    "static", "pan", "tilt", "track", "dolly", "crane", "handheld", "steadicam", "orbit", "drone", "zoom",
];
const SPEED: &[&str] = &["slow", "normal", "fast", "speed_ramp"];
const LIGHT_KEY: &[&str] = &["soft", "hard", "low-key", "high-key", "backlit"];
const CONTRAST: &[&str] = &["low", "medium", "high"];
const SATURATION: &[&str] = &["saturated", "desaturated", "neutral"];
const FILM_STOCK: &[&str] = &[
    "kodak_250d", "kodak_5219", "kodak_5207", "fuji_super_35", "fuji_velvia", "cine_organic", "neutral", "custom",
];
const EFFECTS: &[&str] = &[
    "fog", "rain", "smoke", "lens_flare", "bokeh", "sparks", "dust", "snow", "fire", "magic_glow", "glitch", "none",
];
const FOCALS: [u32; 6] = [14, 24, 35, 50, 85, 135];
const SILENCE: &[&str] = &["false", "true"];

// ── ENCODE ──────────────────────────────────────────────────────────────────

/// ENCODE a full concern state → vector. categorical/ordinal = index into the
/// value list; numeric = normalized (v-min)/(max-min); multi = 0/1 per effect.
pub fn encode(concerns: &Concerns) -> ConcernVector {
    let mut v: ConcernVector = BTreeMap::new();
    insert_enum(&mut v, "camera.size", &concerns.camera.size, SIZE);
    insert_enum(&mut v, "camera.angle", &concerns.camera.angle, ANGLE);
    insert_enum(&mut v, "camera.framing", &concerns.camera.framing, FRAMING);
    insert_enum(&mut v, "camera.dof", &concerns.camera.dof, DOF);
    insert_focal(&mut v, concerns.lens.focal_mm);
    insert_enum(&mut v, "motion.zoom", &concerns.motion.zoom, ZOOM);
    insert_enum(&mut v, "motion.move", &concerns.motion.r#move, MOVE);
    insert_enum(&mut v, "motion.speed", &concerns.motion.speed, SPEED);
    insert_enum(&mut v, "lighting.key", &concerns.lighting.key, LIGHT_KEY);
    insert_enum(&mut v, "lighting.contrast", &concerns.lighting.contrast, CONTRAST);
    insert_numeric(&mut v, "lighting.color_temp_k", concerns.lighting.color_temp_k);
    insert_enum(&mut v, "grade.saturation", &concerns.grade.saturation, SATURATION);
    insert_enum(&mut v, "grade.contrast", &concerns.grade.contrast, CONTRAST);
    insert_enum(&mut v, "grade.film_stock", &concerns.grade.film_stock, FILM_STOCK);
    insert_multi(&mut v, &concerns.effects);
    insert_enum(&mut v, "audio.silence", if concerns.audio.silence { "true" } else { "false" }, SILENCE);
    v
}

fn insert_enum(v: &mut ConcernVector, key: &str, val: &str, values: &[&str]) {
    let i = values.iter().position(|x| *x == val).unwrap_or(0);
    v.insert(key.to_string(), i as f64);
}

fn insert_focal(v: &mut ConcernVector, mm: u32) {
    let i = FOCALS.iter().position(|f| *f == mm).unwrap_or(0);
    v.insert("lens.focal_mm".into(), i as f64);
}

fn insert_numeric(v: &mut ConcernVector, key: &str, val: u32) {
    let (lo, hi) = TagVocabulary::COLOR_TEMP_K;
    let p = (val as f64 - lo as f64) / (hi as f64 - lo as f64);
    v.insert(key.to_string(), p);
}

fn insert_multi(v: &mut ConcernVector, present: &[String]) {
    for item in EFFECTS {
        let has = present.iter().any(|p| p == item);
        v.insert(format!("effects.{item}"), if has { 1.0 } else { 0.0 });
    }
}

// ── DECODE ──────────────────────────────────────────────────────────────────

/// DECODE a vector → a fully-populated clean `Concerns`. Every axis snaps to
/// its nearest clean enum value (categorical/ordinal by rounded index; numeric
/// clamped to bounds; multi by 0/1 membership). This is the render boundary.
pub fn decode(v: &ConcernVector) -> Concerns {
    let cat = |key: &str, values: &[&str]| -> String {
        let pos = v.get(key).copied().unwrap_or(0.0);
        let i = pos.round().clamp(0.0, (values.len() - 1) as f64) as usize;
        values[i].to_string()
    };
    let focal_idx = v
        .get("lens.focal_mm")
        .copied()
        .unwrap_or(0.0)
        .round()
        .clamp(0.0, (FOCALS.len() - 1) as f64) as usize;

    let (lo, hi) = TagVocabulary::COLOR_TEMP_K;
    let temp_pos = v.get("lighting.color_temp_k").copied().unwrap_or(0.5).clamp(0.0, 1.0);
    let temp = ((temp_pos * (hi as f64 - lo as f64)) as u32 + lo) as u32;

    let effects: Vec<String> = EFFECTS
        .iter()
        .filter(|e| v.get(&format!("effects.{e}")).copied().unwrap_or(0.0) > 0.5)
        .map(|e| e.to_string())
        .collect();

    Concerns {
        camera: CameraConcern {
            size: cat("camera.size", SIZE),
            angle: cat("camera.angle", ANGLE),
            framing: cat("camera.framing", FRAMING),
            dof: cat("camera.dof", DOF),
        },
        lens: LensConcern {
            focal_mm: FOCALS[focal_idx],
            distortion: None,
        },
        motion: MotionConcern {
            zoom: cat("motion.zoom", ZOOM),
            r#move: cat("motion.move", MOVE),
            speed: cat("motion.speed", SPEED),
        },
        lighting: crate::generation::video_flow::engine::types::LightingConcern {
            key: cat("lighting.key", LIGHT_KEY),
            contrast: cat("lighting.contrast", CONTRAST),
            color_temp_k: temp,
            pattern: None,
        },
        grade: GradeConcern {
            palette: String::new(),
            saturation: cat("grade.saturation", SATURATION),
            contrast: cat("grade.contrast", CONTRAST),
            film_stock: cat("grade.film_stock", FILM_STOCK),
        },
        effects,
        audio: AudioConcern {
            foley: String::new(),
            sfx: String::new(),
            music_cue: String::new(),
            silence: v.get("audio.silence").copied().unwrap_or(0.0) > 0.5,
        },
    }
}

// ── DIFF ────────────────────────────────────────────────────────────────────

/// Push one "field: a -> b" line when the two values differ.
fn field_diff(out: &mut Vec<String>, field: &str, va: &str, vb: &str) {
    if va != vb {
        out.push(format!("{field}: {va} -> {vb}"));
    }
}

/// DIFF two full concern states → clean-enum "concern.field: a -> b" lines.
/// Absent values print as `∅`. This is the computed sub-timeline delta — never
/// LLM free text.
pub fn diff(a: &Concerns, b: &Concerns) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    field_diff(&mut out, "camera.size", &a.camera.size, &b.camera.size);
    field_diff(&mut out, "camera.angle", &a.camera.angle, &b.camera.angle);
    field_diff(&mut out, "camera.framing", &a.camera.framing, &b.camera.framing);
    field_diff(&mut out, "camera.dof", &a.camera.dof, &b.camera.dof);
    if a.lens.focal_mm != b.lens.focal_mm {
        out.push(format!("lens.focal_mm: {} -> {}", a.lens.focal_mm, b.lens.focal_mm));
    }
    field_diff(&mut out, "motion.zoom", &a.motion.zoom, &b.motion.zoom);
    field_diff(&mut out, "motion.move", &a.motion.r#move, &b.motion.r#move);
    field_diff(&mut out, "motion.speed", &a.motion.speed, &b.motion.speed);
    field_diff(&mut out, "lighting.key", &a.lighting.key, &b.lighting.key);
    field_diff(&mut out, "lighting.contrast", &a.lighting.contrast, &b.lighting.contrast);
    if a.lighting.color_temp_k != b.lighting.color_temp_k {
        out.push(format!(
            "lighting.color_temp_K: {} -> {}",
            a.lighting.color_temp_k, b.lighting.color_temp_k
        ));
    }
    match (&a.lighting.pattern, &b.lighting.pattern) {
        (Some(pa), Some(pb)) if pa != pb => out.push(format!("lighting.pattern: {pa} -> {pb}")),
        (Some(pa), None) => out.push(format!("lighting.pattern: {pa} -> ∅")),
        (None, Some(pb)) => out.push(format!("lighting.pattern: ∅ -> {pb}")),
        _ => {}
    }
    field_diff(&mut out, "grade.saturation", &a.grade.saturation, &b.grade.saturation);
    field_diff(&mut out, "grade.contrast", &a.grade.contrast, &b.grade.contrast);
    field_diff(&mut out, "grade.film_stock", &a.grade.film_stock, &b.grade.film_stock);
    if a.effects != b.effects {
        out.push(format!(
            "effects: [{}] -> [{}]",
            a.effects.join(", "),
            b.effects.join(", ")
        ));
    }
    if a.audio.silence != b.audio.silence {
        out.push(format!(
            "audio.silence: {} -> {}",
            a.audio.silence, b.audio.silence
        ));
    }
    out
}

// ── MERGE / NORMALIZE / FOLD ────────────────────────────────────────────────

/// Carry forward a base state with a (possibly sparse) override, producing a
/// full `Concerns`. Omitted groups keep the base value.
pub fn merge(base: &Concerns, over: Option<&PartialConcerns>) -> Concerns {
    fn pick_str(over: Option<&String>, base: &String) -> String {
        over.map(String::clone).unwrap_or_else(|| base.clone())
    }
    let o = match over {
        Some(o) => o,
        None => return base.clone(),
    };
    Concerns {
        camera: CameraConcern {
            size: pick_str(o.camera.as_ref().map(|c| &c.size), &base.camera.size),
            angle: pick_str(o.camera.as_ref().map(|c| &c.angle), &base.camera.angle),
            framing: pick_str(o.camera.as_ref().map(|c| &c.framing), &base.camera.framing),
            dof: pick_str(o.camera.as_ref().map(|c| &c.dof), &base.camera.dof),
        },
        lens: LensConcern {
            focal_mm: o.lens.as_ref().map(|l| l.focal_mm).unwrap_or(base.lens.focal_mm),
            distortion: o.lens.as_ref().and_then(|l| l.distortion.clone()),
        },
        motion: MotionConcern {
            zoom: pick_str(o.motion.as_ref().map(|m| &m.zoom), &base.motion.zoom),
            r#move: pick_str(o.motion.as_ref().map(|m| &m.r#move), &base.motion.r#move),
            speed: pick_str(o.motion.as_ref().map(|m| &m.speed), &base.motion.speed),
        },
        lighting: crate::generation::video_flow::engine::types::LightingConcern {
            key: pick_str(o.lighting.as_ref().map(|l| &l.key), &base.lighting.key),
            contrast: pick_str(o.lighting.as_ref().map(|l| &l.contrast), &base.lighting.contrast),
            color_temp_k: o.lighting.as_ref().map(|l| l.color_temp_k).unwrap_or(base.lighting.color_temp_k),
            pattern: o.lighting.as_ref().and_then(|l| l.pattern.clone()).or(base.lighting.pattern.clone()),
        },
        grade: GradeConcern {
            palette: pick_str(o.grade.as_ref().map(|g| &g.palette), &base.grade.palette),
            saturation: pick_str(o.grade.as_ref().map(|g| &g.saturation), &base.grade.saturation),
            contrast: pick_str(o.grade.as_ref().map(|g| &g.contrast), &base.grade.contrast),
            film_stock: pick_str(o.grade.as_ref().map(|g| &g.film_stock), &base.grade.film_stock),
        },
        effects: o.effects.clone().unwrap_or_else(|| base.effects.clone()),
        audio: o.audio.as_ref().map(|a| a.clone()).unwrap_or_else(|| base.audio.clone()),
    }
}

/// SNAPSHOT → clean: encode→decode snap of (base + override). Returns a fully
/// populated clean-enum state; out-of-vocab values clamp to the nearest.
pub fn normalize(base: &Concerns, over: Option<&PartialConcerns>) -> Concerns {
    let merged = merge(base, over);
    let v = encode(&merged);
    decode(&v)
}

/// CARRY-FORWARD + normalize a base state and a sequence of sparse slices into
/// fully-populated clean-enum effective states. `eff[0]` = normalized base;
/// `eff[i]` = the state after slice `i-1`. This is what makes sub-timeline
/// deltas clean: no "∅", no out-of-vocab values.
pub fn fold(base: &Concerns, slices: &[Option<PartialConcerns>]) -> Vec<Concerns> {
    let mut eff = vec![normalize(base, None)];
    for s in slices {
        let last = eff.last().unwrap();
        eff.push(normalize(last, s.as_ref()));
    }
    eff
}

/// Insert a non-empty text field alongside the vector (the semantic content).
fn push_text(out: &mut BTreeMap<String, String>, key: &str, value: &str) {
    if !value.is_empty() {
        out.insert(key.to_string(), value.to_string());
    }
}

/// The text (non-vectorized) fields carried alongside the vector — the
/// semantic content: lens distortion, light pattern, grade palette, audio.
pub fn text_fields(c: &Concerns) -> BTreeMap<String, String> {
    let mut out: BTreeMap<String, String> = BTreeMap::new();
    push_text(&mut out, "lens.distortion", c.lens.distortion.as_deref().unwrap_or(""));
    push_text(&mut out, "lighting.pattern", c.lighting.pattern.as_deref().unwrap_or(""));
    push_text(&mut out, "grade.palette", &c.grade.palette);
    push_text(&mut out, "audio.foley", &c.audio.foley);
    push_text(&mut out, "audio.sfx", &c.audio.sfx);
    push_text(&mut out, "audio.music_cue", &c.audio.music_cue);
    out
}
