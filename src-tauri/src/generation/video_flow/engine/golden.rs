//! Golden tests for the absorbed engine model.
//!
//! These pin the real `harness/` fixtures against the Rust model: the golden
//! ShotSpec round-trips through serde, its concerns are tag-closed, its
//! sub-timeline folds + diffs cleanly, and the deterministic derive produces
//! identity-locked, on-screen-text-free prompts.

use crate::generation::video_flow::engine::axes;
use crate::generation::video_flow::engine::derive::{derive_full, frames_of};
use crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary;
use crate::generation::video_flow::engine::types::*;

/// The real golden shot spec (harness/golden/shot_spec.json), embedded so the
/// cargo test is self-contained (harness/ is JS, outside the cargo build).
const GOLDEN_SHOT_SPEC: &str = r#"
{
  "shot_id": "tl_01_shot_1",
  "novel_ref": "scene_1.shot_1",
  "content": {
    "prose": "Golden light pierces the forest floor. Birds chirp melodiously. The girl moves with innocent curiosity, surrounded by wildlife.",
    "beats": [
      "extreme close-up: dew on a spiderweb shimmers, morning light rays penetrate",
      "medium: a red fox pauses, ears twitch, watching her pass",
      "wide: the girl steps over a mossy log, birds take flight from above"
    ]
  },
  "clip_s": 10,
  "transition_in": "hard_cut",
  "transition_out": "crossfade",
  "concerns": {
    "camera": { "size": "wide", "angle": "eye", "framing": "rule_of_thirds", "dof": "shallow" },
    "lens": { "focal_mm": 35, "distortion": "none" },
    "motion": { "zoom": "in", "move": "dolly", "speed": "normal" },
    "lighting": { "key": "soft", "contrast": "medium", "color_temp_K": 4800, "pattern": "dappled sunlight through pines" },
    "grade": { "palette": "warm_amber_golden_hour", "saturation": "saturated", "contrast": "medium", "film_stock": "kodak_250d" },
    "effects": ["lens_flare"],
    "audio": { "foley": "footsteps, branch rustle", "sfx": "bird call", "music_cue": "gentle ambient strings, sparse", "silence": false }
  },
  "sub_timeline": [
    { "from_s": 0, "to_s": 4, "note": "ECU on dew at the spiderweb, then the girl enters",
      "state": { "camera": { "size": "close-up", "framing": "fill_frame", "dof": "shallow" }, "lens": { "focal_mm": 85 }, "lighting": { "color_temp_K": 4500 } } },
    { "from_s": 4, "to_s": 7, "note": "medium on the red fox watching",
      "state": { "camera": { "size": "medium", "framing": "rule_of_thirds" }, "lens": { "focal_mm": 50 } } },
    { "from_s": 7, "to_s": 10, "note": "wide: girl steps the log, birds take flight",
      "state": { "camera": { "size": "wide", "dof": "deep" }, "lens": { "focal_mm": 35 }, "lighting": { "color_temp_K": 5200 } } }
  ]
}
"#;

fn golden() -> ShotSpec {
    serde_json::from_str(GOLDEN_SHOT_SPEC).unwrap_or_else(|e| panic!("golden parse: {e}"))
}

/// The Order 66 council-chamber opening (the beat_profiles grammar source),
/// kept as the authoritative on-disk harness/golden/order_66_council.json so
/// the fixture — not a hand-pasted copy — drives the test.
const ORDER_66_SHOT_SPEC: &str =
    include_str!("../../../../../harness/golden/order_66_council.json");

fn order_66() -> ShotSpec {
    serde_json::from_str(ORDER_66_SHOT_SPEC)
        .unwrap_or_else(|e| panic!("order_66 golden parse: {e}"))
}

/// The Order 66 shot spec round-trips and its concerns are tag-closed — the
/// same two invariants the grizzly-forest golden pins, now for the
/// reveal/ambush/cascade grammar the beat_profiles table was modeled on.
#[test]
fn order_66_shot_spec_round_trips_and_is_tag_closed() {
    let spec = order_66();
    assert_eq!(spec.shot_id, "tl_01_shot_1");
    assert_eq!(spec.clip_s, 10);
    assert_eq!(spec.content.beats.len(), 3, "three Order-66 beats");
    // Round-trip is byte-stable through serde.
    let v = serde_json::to_value(&spec).unwrap();
    let back: ShotSpec = serde_json::from_value(v).unwrap();
    assert_eq!(back, spec);
    // Every concern value is inside the closed tag vocabulary.
    let vocab = TagVocabulary::new();
    assert!(
        vocab.validate_concerns(&spec.concerns).is_empty(),
        "order_66 concerns must be tag-closed: {:?}",
        vocab.validate_concerns(&spec.concerns)
    );
}

/// The Order 66 sub-timeline folds + diffs cleanly: each slice adds a real
/// concern delta (the beat progression wide→close-up→medium), so the diff
/// between consecutive effective states is non-empty for all three — the
/// V7 no-op invariant holds on the content-driven grammar.
#[test]
fn order_66_sub_timeline_adds_a_delta_each_slice() {
    let spec = order_66();
    let slices: Vec<Option<PartialConcerns>> =
        spec.sub_timeline.iter().map(|s| s.state.clone()).collect();
    let eff = axes::fold(&spec.concerns, &slices);
    for i in 0..spec.sub_timeline.len() {
        let delta = axes::diff(&eff[i], &eff[i + 1]);
        assert!(
            !delta.is_empty(),
            "order_66 slice {i} adds a concern delta: {delta:?}"
        );
    }
    // The reveal slice (close-up) is the tight, shallow, cool 4500K state.
    let v = serde_json::to_value(&eff[2]).unwrap();
    assert_eq!(
        v.get("camera").unwrap()["size"], "close-up",
        "the second Order-66 beat is the hand-to-saber close-up"
    );
}

#[test]
fn golden_shot_spec_round_trips() {
    let spec = golden();
    assert_eq!(spec.shot_id, "tl_01_shot_1");
    assert_eq!(spec.novel_ref, "scene_1.shot_1");
    assert_eq!(spec.clip_s, 10);
    assert_eq!(spec.transition_in, "hard_cut");
    assert_eq!(spec.transition_out, "crossfade");
    assert_eq!(spec.concerns.lens.focal_mm, 35);
    assert_eq!(spec.concerns.lighting.color_temp_k, 4800);
    assert_eq!(spec.concerns.effects, vec!["lens_flare".to_string()]);
    assert_eq!(spec.content.beats.len(), 3);
    assert_eq!(spec.sub_timeline.len(), 3);
    // snake_case wire: color_temp_K is the JSON key; Rust field is color_temp_k.
    let json = serde_json::to_value(&spec).unwrap();
    assert!(json["concerns"]["lighting"]["color_temp_K"] == 4800, "wire key stays snake_case");
    let back: ShotSpec = serde_json::from_value(json).unwrap();
    assert_eq!(back, spec);
}

#[test]
fn golden_concerns_are_tag_closed() {
    let spec = golden();
    let vocab = TagVocabulary::new();
    let violations = vocab.validate_concerns(&spec.concerns);
    assert!(
        violations.is_empty(),
        "golden spec must be tag-closed, got: {violations:?}"
    );
    // A deliberately out-of-vocab value is caught.
    let mut bad = spec.concerns.clone();
    bad.camera.size = "extreme_wide".into(); // not in the size set
    let bad_violations = vocab.validate_concerns(&bad);
    assert!(
        bad_violations.iter().any(|v| v.starts_with("camera.size")),
        "out-of-vocab size must be flagged: {bad_violations:?}"
    );
}

#[test]
fn golden_sub_timeline_folds_and_diffs() {
    let spec = golden();
    // Base = the shot's own concerns; slices = the 3 sub_timeline states.
    let base = spec.concerns.clone();
    let slices: Vec<Option<PartialConcerns>> = spec
        .sub_timeline
        .iter()
        .map(|s| s.state.clone())
        .collect();

    let eff = axes::fold(&base, &slices);
    assert_eq!(eff.len(), 4, "eff[0]=base, eff[1..]=after each slice");

    // Carry-forward: slice 0 sets size=close-up but not angle → angle stays "eye".
    assert_eq!(eff[1].camera.size, "close-up");
    assert_eq!(eff[1].camera.angle, "eye", "unset group carries forward");
    // slice 0 sets focal_mm=85; slice 1 sets 50; slice 2 sets 35.
    assert_eq!(eff[1].lens.focal_mm, 85);
    assert_eq!(eff[2].lens.focal_mm, 50);
    assert_eq!(eff[3].lens.focal_mm, 35);
    // slice 0 sets color_temp_K=4500 (base was 4800); slice 1 does not → carries 4500.
    assert_eq!(eff[1].lighting.color_temp_k, 4500);
    assert_eq!(eff[2].lighting.color_temp_k, 4500, "carry-forward of a previously-set value");

    // Every effective state must be clean-enum (the whole point of normalize).
    let vocab = TagVocabulary::new();
    for (i, e) in eff.iter().enumerate() {
        assert!(
            vocab.validate_concerns(e).is_empty(),
            "effective state {i} must be tag-closed"
        );
    }

    // Deltas are computed, not written: base→slice0 changes size + focal.
    let d01 = axes::diff(&eff[0], &eff[1]);
    assert!(d01.iter().any(|d| d.starts_with("camera.size")), "delta: {d01:?}");
    assert!(d01.iter().any(|d| d.starts_with("lens.focal_mm")), "delta: {d01:?}");
    // slice0→slice1 changes size (close-up→medium) and focal (85→50).
    let d12 = axes::diff(&eff[1], &eff[2]);
    assert!(d12.iter().any(|d| d.starts_with("camera.size")));
    assert!(d12.iter().any(|d| d.starts_with("lens.focal_mm")));
}

#[test]
fn encode_decode_round_trip_snaps_clean() {
    let spec = golden();
    let v = axes::encode(&spec.concerns);
    let back = axes::decode(&v);
    // Every vectorized field survives the round trip exactly.
    assert_eq!(back.camera.size, "wide");
    assert_eq!(back.camera.angle, "eye");
    assert_eq!(back.motion.zoom, "in");
    assert_eq!(back.motion.r#move, "dolly");
    assert_eq!(back.lens.focal_mm, 35);
    assert_eq!(back.lighting.color_temp_k, 4800);
    assert_eq!(back.grade.film_stock, "kodak_250d");
    assert_eq!(back.effects, vec!["lens_flare".to_string()]);
    assert_eq!(back.audio.silence, false);
}

#[test]
fn decode_clamps_out_of_range_vector() {
    // A vector with an out-of-range position must clamp to a clean enum
    // (the render boundary guarantee), not panic or emit garbage.
    let mut v = axes::encode(&golden().concerns);
    v.insert("camera.size".into(), 999.0); // far beyond the 4-value size set
    v.insert("lens.focal_mm".into(), -5.0); // below range
    let c = axes::decode(&v);
    assert_eq!(c.camera.size, "over-the-shoulder", "clamps to last value");
    assert_eq!(c.lens.focal_mm, 14, "clamps to first value");
}

fn contains_word(haystack: &str, word: &str) -> bool {
    let h = haystack.to_lowercase();
    let w = word.to_lowercase();
    h.match_indices(&w)
        .any(|(i, _)| {
            let before_ok = i == 0 || !h[..i].chars().next_back().map_or(true, |c| c.is_alphanumeric());
            let after = &h[i + w.len()..];
            let after_ok = after.is_empty() || !after.chars().next().map_or(true, |c| c.is_alphanumeric());
            before_ok && after_ok
        })
}

#[test]
fn derive_produces_identity_locked_prompts() {
    let scene = SceneSpec {
        scene_id: "scene_1".into(),
        time_of_day: "dawn".into(),
        weather: "light drizzle".into(),
        light: crate::generation::video_flow::engine::types::LightingConcern {
            key: "soft".into(),
            contrast: "medium".into(),
            color_temp_k: 4800,
            pattern: Some("dappled sun".into()),
        },
        grade: GradeConcern {
            palette: "warm_amber".into(),
            saturation: "saturated".into(),
            contrast: "medium".into(),
            film_stock: "kodak_250d".into(),
        },
        ambience: "forest, birds".into(),
        tempo: "medium".into(),
        effects_base: vec!["fog".into()],
    };
    let shot = ShotMolecule {
        inherit: "scene_1".into(),
        subject: "a red fox pauses, ears twitch".into(),
        composition: CameraConcern {
            size: "medium".into(),
            angle: "eye".into(),
            framing: "rule_of_thirds".into(),
            dof: "shallow".into(),
        },
        lens: LensConcern { focal_mm: 85, distortion: None },
        motion: MotionConcern {
            zoom: "in".into(),
            r#move: "dolly".into(),
            speed: "normal".into(),
        },
        effects_delta: vec!["lens_flare".into()],
        audio: AudioConcern {
            foley: "footsteps".into(),
            sfx: "bird call".into(),
            music_cue: "gentle strings".into(),
            silence: false,
        },
        transition_in: "hard_cut".into(),
        transition_out: "crossfade".into(),
        clip_s: 10,
        prompts: Prompts { image: String::new(), video: String::new() },
    };

    let d = derive_full(&scene, &shot);
    // Identity-lock line present in the video prompt (the V5 invariant).
    assert!(d.molecule.prompts.video.contains("first frame identical"));
    // No on-screen-text phrases anywhere (the V5 invariant — whole-word,
    // matching the JS `/\b(subtitle|caption|title card)\b/i`. Note the
    // derived prompt says "no subtitles" (plural) + "No on-screen text",
    // which is the guard instruction itself, not on-screen text: "subtitles"
    // is not a whole-word match for "subtitle", so this is correctly clean.)
    for p in [&d.molecule.prompts.image, &d.molecule.prompts.video] {
        assert!(!contains_word(p, "subtitle"), "on-screen text: {p}");
        assert!(!contains_word(p, "caption"), "on-screen text: {p}");
        assert!(!contains_word(p, "title card"), "on-screen text: {p}");
    }
    // Scene-merged effects = base (fog) + delta (lens_flare).
    assert!(d.effects.iter().any(|e| e == "fog"));
    assert!(d.effects.iter().any(|e| e == "lens_flare"));
    // 10s @24fps = 240 frames, under the 720p ~241f engine cap.
    assert_eq!(d.frames, frames_of(10));
    assert_eq!(d.frames, 240);
    assert!(d.frames <= 241);
}
