//! Beat-driven sub-slice profiles (harness/config/beat_profiles.json).
//!
//! The ACTIVATION KEY is the closed-vocab **shot-size prefix** parsed from a
//! Node A beat (`"<size>: <subject> <motion> — <detail>"`). The table maps
//! that size to a concern state (lens / DoF / framing / lighting / motion) +
//! a pacing weight. Content drives activation: a shot whose beats carry
//! parseable size prefixes gets beat-driven sub-slices; a shot whose beats
//! do NOT parse falls back to the cycling template (`shot_sub_slices`).
//!
//! The JSON is embedded via `include_str!` — the deterministic engine never
//! does runtime IO, and a malformed table fails at compile time, not in
//! production. Every value must stay inside the closed tag vocabulary
//! (`tag_vocabulary.rs`); `validate_profile` + the test pin that.

use crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary;
use crate::generation::video_flow::engine::types::{
    CameraConcern, LensConcern, LightingConcern, MotionConcern, PartialConcerns,
};
use serde::Deserialize;

const BEAT_PROFILES_JSON: &str =
    include_str!("../../../../../harness/config/beat_profiles.json");

/// One shot-size's concern profile.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BeatProfile {
    /// Pacing weight for the slice carrying this beat (wide establishes long,
    /// close-ups resolve short). Absent → 1.0 (flat pacing).
    #[serde(default)]
    pub pacing_weight: Option<f32>,
    /// Optics (closed-vocab focal: 14|24|35|50|85|135).
    pub focal_mm: Option<u32>,
    /// Depth of field (shallow|medium|deep).
    pub dof: Option<String>,
    /// Framing (rule_of_thirds|centered|... closed set).
    pub framing: Option<String>,
    /// Key light + contrast + color temp + pattern (closed enums).
    #[serde(default)]
    pub lighting: Option<BeatLighting>,
    /// Camera motion (zoom + move + speed, closed enums).
    #[serde(default)]
    pub motion: Option<BeatMotion>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BeatLighting {
    pub key: String,
    #[serde(default)]
    pub contrast: String,
    /// Wire spelling kept (`color_temp_K`); 2500..=10000.
    #[serde(rename = "color_temp_K")]
    pub color_temp_k: u32,
    #[serde(default)]
    pub pattern: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct BeatMotion {
    #[serde(default)]
    pub zoom: String,
    /// Wire key is "move" (a reserved word in Rust → `move_`).
    #[serde(default, rename = "move")]
    pub move_: String,
    #[serde(default)]
    pub speed: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct BeatProfilesFile {
    #[serde(default)]
    profiles: std::collections::BTreeMap<String, BeatProfile>,
}

/// The parsed table (compile-time), keyed by closed-vocab shot-size
/// (`"close-up"` / `"medium"` / `"wide"` / `"over-the-shoulder"`). Empty map
/// = "no profiles" (every shot falls back to the cycling template) — the
/// fail-soft contract.
pub fn beat_profiles() -> &'static std::collections::BTreeMap<String, BeatProfile> {
    use std::sync::OnceLock;
    static TABLE: OnceLock<std::collections::BTreeMap<String, BeatProfile>> = OnceLock::new();
    TABLE.get_or_init(|| {
        serde_json::from_str::<BeatProfilesFile>(BEAT_PROFILES_JSON)
            .map(|f| f.profiles)
            .unwrap_or_default()
    })
}

/// Parse a Node A beat's shot-size prefix: `"<size>: rest"` → the size when
/// it is a closed-vocab camera size, else `None`. THE activation check for
/// a bare closed-vocab size — the content signal, not a guess.
///
/// P1 (2026-11-10): this bare form is kept byte-stable for the golden
/// fixtures (Order 66 council). The TOTAL grammar (closed-vocab size →
/// alias table → motion words → P2 synth fallback) is
/// `resolve_beat_size` + `motion_prefix_delta` + `synth_unknown_beat_state`
/// below; the LLM's angle/motion language (low angle, tracking shot, …)
/// used to fall out of this parser and produce empty sub-slice states —
/// the V7 no-op-slice issues.
pub fn parse_beat_size(beat: &str, vocab: &TagVocabulary) -> Option<&'static str> {
    let prefix = beat.split(':').next()?.trim().to_lowercase();
    vocab
        .size()
        .iter()
        .find(|s| **s == prefix)
        .copied()
}

/// P1 (2026-11-10): the LLM's angle-language beat prefixes, mapped onto a
/// closed-vocab shot SIZE + a camera ANGLE concern. The closed `size()` set
/// covers shot SCALE only; Node A gravitates to angle words ("low angle",
/// "worms-eye view") that have no size entry, so the old parser returned
/// `None` and the beat became an EMPTY sub-slice state (a V7 no-op). An
/// alias makes the prefix total: it resolves to a real concern delta, and
/// the angle intent survives into the prompt instead of being dropped.
///
/// Key = the lower-cased beat prefix; value = `(size_key, angle)`.
/// `size_key` is always a closed-vocab size (feeds the profile table +
/// pacing weight); `angle` is a closed-vocab camera angle
/// (`tag_vocabulary::angle()` set).
const BEAT_PREFIX_ALIASES: [(&str, &str, &str); 4] = [
    // "low angle: subject" → wide optics + low angle.
    ("low angle", "wide", "low"),
    ("high angle", "wide", "high"),
    ("worms-eye view", "close-up", "low"),
    ("birds-eye view", "wide", "bird"),
];

/// P1: motion-language beat prefixes that are NOT shot sizes — the beat
/// describes CAMERA MOTION, not optics. These resolve to a motion delta
/// (zoom + move + speed, all closed-vocab) instead of an empty state.
/// Key = lower-cased prefix; value = `(zoom, move, speed)`.
const BEAT_MOTION_PREFIXES: [(&str, &str, &str, &str); 6] = [
    ("tracking shot", "static", "track", "normal"),
    ("pull-back", "pull", "dolly", "slow"),
    ("zoom in", "in", "static", "normal"),
    ("zoom out", "out", "static", "normal"),
    ("crash zoom", "crash", "static", "fast"),
    ("handheld", "static", "handheld", "normal"),
];

/// P1 (parser-side, total grammar): resolve a beat prefix to the shot SIZE
/// it drives. Order: closed-vocab size → alias table → `None` (the caller
/// then tries `motion_prefix_delta`, else the P2 synth fallback).
pub fn resolve_beat_size(prefix: &str, vocab: &TagVocabulary) -> Option<&'static str> {
    let p = prefix.trim().to_lowercase();
    if let Some(s) = vocab.size().iter().find(|s| **s == p).copied() {
        return Some(s);
    }
    BEAT_PREFIX_ALIASES
        .iter()
        .find(|(k, _, _)| *k == p)
        .map(|(_, s, _)| *s)
}

/// P1: the alias's closed-vocab camera ANGLE for a resolved size
/// (`None` when the prefix is a plain closed-vocab size — the profile's
/// default `"eye"` angle applies).
pub fn alias_angle(prefix: &str) -> Option<&'static str> {
    let p = prefix.trim().to_lowercase();
    BEAT_PREFIX_ALIASES
        .iter()
        .find(|(k, _, _)| *k == p)
        .map(|(_, _, a)| *a)
}

/// P1: motion-language prefixes → a closed-vocab motion delta
/// (`None` when the prefix is not a known motion word).
pub fn motion_prefix_delta(prefix: &str) -> Option<(String, String, String)> {
    let p = prefix.trim().to_lowercase();
    BEAT_MOTION_PREFIXES
        .iter()
        .find(|(k, _, _, _)| *k == p)
        .map(|(_, z, m, s)| (z.to_string(), m.to_string(), s.to_string()))
}

/// P2 (guarantee layer): the shot prefix of a beat
/// (`"<prefix>: rest"` → `"<prefix>"`; a beat with no `:` is its own
/// single-line prefix, lower-cased + trimmed).
pub fn beat_prefix_of(beat: &str) -> String {
    beat.split(':')
        .next()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_default()
}

/// P2 fallback: synthesize a distinct, closed-vocab concern delta for a
/// beat whose prefix resolved to neither a size nor a known motion word.
/// `idx` keys the rotation so two unknown beats in one shot are never
/// identical (V7-clean); every value is bounded to a closed set, so the
/// slice can never be a no-op because of what the LLM chose to say.
pub fn synth_unknown_beat_state(
    prefix: &str,
    idx: usize,
    vocab: &TagVocabulary,
) -> PartialConcerns {
    // Deterministic small hash over the prefix (FNV-1a) → stable rotation.
    let h = {
        let mut acc: u32 = 0x811c_9dc5;
        for b in prefix.as_bytes() {
            acc ^= u32::from(*b);
            acc = acc.wrapping_mul(0x0100_0193);
        }
        acc
    };
    let sizes = vocab.size();
    let size: &'static str = sizes
        .iter()
        .copied()
        .nth((h + idx as u32) as usize % 4)
        .unwrap_or("medium");
    // A closed focal DEFINITELY distinct from the size's table focal so
    // the slice always carries a lens delta (table focals: wide→24,
    // medium→50, close-up→85, over-the-shoulder→50).
    let focal = match size {
        "wide" => 135,
        "medium" | "over-the-shoulder" => 35,
        _ => 50,
    };
    PartialConcerns {
        camera: Some(CameraConcern {
            size: size.to_string(),
            angle: "eye".into(),
            framing: "centered".into(),
            dof: match size {
                "wide" => "deep".into(),
                "close-up" => "shallow".into(),
                _ => "medium".into(),
            },
        }),
        lens: Some(LensConcern {
            focal_mm: focal,
            distortion: None,
        }),
        motion: None,
        lighting: None,
        grade: None,
        effects: None,
        audio: None,
    }
}

/// Closed-vocab validation of one profile (the "this skill is legal" check,
/// mirroring V2). Returns the violating field list (empty = legal).
pub fn validate_profile(name: &str, p: &BeatProfile, vocab: &TagVocabulary) -> Vec<String> {
    let mut bad = Vec::new();
    let chk = |bad: &mut Vec<String>, field: &str, v: &str, set: &std::collections::BTreeSet<&'static str>| {
        if !v.is_empty() && !set.contains(v) {
            bad.push(format!("{field}: '{v}' not in vocab"));
        }
    };
    if let Some(d) = &p.dof {
        chk(&mut bad, "dof", d, &vocab.dof());
    }
    if let Some(fr) = &p.framing {
        chk(&mut bad, "framing", fr, &vocab.framing());
    }
    if let Some(f) = p.focal_mm {
        if !vocab.lens_focal().contains(&f) {
            bad.push(format!("focal_mm: {f} not in lens_focal"));
        }
    }
    if let Some(l) = &p.lighting {
        chk(&mut bad, "lighting.key", &l.key, &vocab.light_key());
        if !l.contrast.is_empty() {
            chk(&mut bad, "lighting.contrast", &l.contrast, &vocab.light_contrast());
        }
        if !(TagVocabulary::COLOR_TEMP_K.0..=TagVocabulary::COLOR_TEMP_K.1).contains(&l.color_temp_k)
        {
            bad.push(format!("lighting.color_temp_K: {} out of bounds", l.color_temp_k));
        }
    }
    if let Some(m) = &p.motion {
        if !m.zoom.is_empty() {
            chk(&mut bad, "motion.zoom", &m.zoom, &vocab.zoom());
        }
        if !m.move_.is_empty() {
            chk(&mut bad, "motion.move", &m.move_, &vocab.move_set());
        }
        if !m.speed.is_empty() {
            chk(&mut bad, "motion.speed", &m.speed, &vocab.speed());
        }
    }
    if !bad.is_empty() {
        log::warn!("[video_flow] beat profile '{name}' has vocab violations: {bad:?}");
    }
    bad
}

/// One shot-size's profile → the concern state it drives. The `size`
/// argument is the parsed beat prefix (authoritative); the table supplies
/// the rest. Unknown size → `PartialConcerns::default()` (no delta; the
/// caller falls back to the cycling template).
pub fn profile_state(size: &str, p: &BeatProfile) -> PartialConcerns {
    use crate::generation::video_flow::engine::types::LensConcern;
    PartialConcerns {
        camera: Some(CameraConcern {
            size: size.to_string(),
            angle: "eye".into(),
            framing: p.framing.clone().unwrap_or_else(|| "rule_of_thirds".into()),
            dof: p.dof.clone().unwrap_or_else(|| "medium".into()),
        }),
        lens: p.focal_mm.map(|f| LensConcern {
            focal_mm: f,
            distortion: None,
        }),
        motion: p.motion.as_ref().map(|m| MotionConcern {
            zoom: m.zoom.clone(),
            r#move: m.move_.clone(),
            speed: m.speed.clone(),
        }),
        lighting: p.lighting.as_ref().map(|l| LightingConcern {
            key: l.key.clone(),
            contrast: if l.contrast.is_empty() {
                "medium".into()
            } else {
                l.contrast.clone()
            },
            color_temp_k: l.color_temp_k,
            pattern: l.pattern.clone(),
        }),
        grade: None,
        effects: None,
        audio: None,
    }
}

/// The slice's pacing weight: the table's value, else 1.0 (flat).
pub fn pacing_of(p: &BeatProfile) -> f32 {
    p.pacing_weight.unwrap_or(1.0).max(0.5).min(2.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_loads_with_all_closed_vocab_sizes() {
        let t = beat_profiles();
        assert_eq!(
            t.keys().collect::<Vec<_>>(),
            &["close-up", "medium", "over-the-shoulder", "wide"],
            "table must carry the four closed-vocab shot sizes, got {:?}",
            t.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn every_table_profile_is_tag_closed() {
        let vocab = TagVocabulary::new();
        for (size, p) in beat_profiles() {
            assert!(
                validate_profile(size, p, &vocab).is_empty(),
                "profile '{size}' must stay tag-closed"
            );
        }
    }

    #[test]
    fn parse_beat_size_reads_only_closed_vocab_prefixes() {
        let vocab = TagVocabulary::new();
        assert_eq!(
            parse_beat_size("close-up: Qui-Gon's hand goes to the saber", &vocab).unwrap(),
            "close-up"
        );
        assert_eq!(
            parse_beat_size("wide: the deck opens", &vocab).unwrap(),
            "wide"
        );
        // Not a closed-vocab prefix → no activation (falls back to template).
        assert_eq!(parse_beat_size("the door opens slowly", &vocab), None);
        assert_eq!(parse_beat_size("", &vocab), None);
    }

    #[test]
    fn close_up_profile_state_matches_golden_values() {
        let p = &beat_profiles()["close-up"];
        let s = profile_state("close-up", p);
        assert_eq!(s.camera.as_ref().unwrap().size, "close-up");
        assert_eq!(s.lens.as_ref().unwrap().focal_mm, 85);
        assert_eq!(s.lighting.as_ref().unwrap().color_temp_k, 4500);
        assert_eq!(s.motion.as_ref().unwrap().r#move, "dolly");
        assert_eq!(pacing_of(p), 0.8, "close-ups resolve short");
        let wide = &beat_profiles()["wide"];
        assert_eq!(pacing_of(wide), 1.5, "wide shots establish long");
    }
}
