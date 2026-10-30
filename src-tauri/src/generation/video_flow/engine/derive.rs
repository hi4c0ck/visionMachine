//! S4 — deterministic prompt composition (absorbed from `harness/lib/derive.js`).
//!
//! A ShotMolecule is only the MEANINGFUL CHANGE from its SceneSpec. `derive`
//! merges them into the final prompts the media models consume:
//!
//!   base  = scene.time_of_day · weather · light · grade · ambience
//!           · (scene effects_base + shot effects_delta) · tempo
//!   delta = subject · composition · lens · motion · shot audio · transitions · clip_s
//!   image_prompt = base + delta (static framing)
//!   video_prompt = base + delta + motion + "first-frame identity lock"
//!
//! No LLM: same (scene, shot) → same prompts. The prompts are filled in place
//! on the molecule (the schema marks them "do not hand-write").

use crate::generation::video_flow::engine::types::{SceneSpec, ShotMolecule};

/// Pipeline frame rate (the 720P engine preset).
pub const FRAME_RATE: u32 = 24;
/// Soft goal (user: "very tight minimum", not strict).
pub const MIN_FRAMES: u32 = 24;
/// Target floor.
pub const TARGET_FRAMES: u32 = 40;

fn d(s: &str) -> &str {
    if s.is_empty() || s == "none" {
        ""
    } else {
        s
    }
}

fn list<'a>(a: &'a [String]) -> Vec<&'a str> {
    a.iter().filter(|x| !x.is_empty() && x.as_str() != "none").map(|s| s.as_str()).collect()
}

fn light_text(l: &crate::generation::video_flow::engine::types::LightingConcern) -> String {
    let mut bits: Vec<String> = Vec::new();
    if !l.key.is_empty() {
        bits.push(format!("{} key light", l.key));
    }
    if !l.contrast.is_empty() {
        bits.push(format!("{} contrast", l.contrast));
    }
    if l.color_temp_k > 0 {
        bits.push(format!("{}K", l.color_temp_k));
    }
    if let Some(p) = &l.pattern {
        if !p.is_empty() {
            bits.push(p.clone());
        }
    }
    bits.join(", ")
}

fn grade_text(g: &crate::generation::video_flow::engine::types::GradeConcern) -> String {
    let mut bits: Vec<String> = Vec::new();
    if !g.palette.is_empty() {
        bits.push(format!("{} palette", g.palette));
    }
    if !g.saturation.is_empty() && g.saturation != "neutral" {
        bits.push(g.saturation.clone());
    }
    if !g.film_stock.is_empty() {
        bits.push(format!("{} film stock", g.film_stock));
    }
    bits.join(", ")
}

fn composition_text(c: &crate::generation::video_flow::engine::types::CameraConcern) -> String {
    let mut bits: Vec<String> = Vec::new();
    if !c.size.is_empty() {
        bits.push(format!("{} shot", c.size));
    }
    if !c.angle.is_empty() && c.angle != "eye" {
        bits.push(format!("{} angle", c.angle));
    }
    if !c.framing.is_empty() && c.framing != "centered" {
        bits.push(format!("{} framing", c.framing));
    }
    if !c.dof.is_empty() {
        bits.push(format!("{} depth of field", c.dof));
    }
    bits.join(", ")
}

fn motion_text(m: &crate::generation::video_flow::engine::types::MotionConcern) -> String {
    let mut bits: Vec<String> = Vec::new();
    if !m.r#move.is_empty() && m.r#move != "static" {
        bits.push(m.r#move.clone());
    }
    if !m.zoom.is_empty() && m.zoom != "static" {
        bits.push(format!("zoom {}", m.zoom));
    }
    if !m.speed.is_empty() && m.speed != "normal" {
        bits.push(format!("{} speed", m.speed));
    }
    bits.join(", ")
}

/// Frames for a clip at the pipeline frame rate.
pub fn frames_of(clip_s: u32) -> u32 {
    clip_s.saturating_mul(FRAME_RATE)
}

/// Merge a scene base + shot molecule into the final prompt pair. The
/// molecule's own `prompts` are overwritten (they are computed, not authored).
pub fn derive(scene: &SceneSpec, shot: &ShotMolecule) -> ShotMolecule {
    let inherit = if shot.inherit.is_empty() {
        scene.scene_id.clone()
    } else {
        shot.inherit.clone()
    };
    let effects: Vec<String> = {
        let mut merged: Vec<String> = list(&scene.effects_base).into_iter().map(String::from).collect();
        merged.extend(list(&shot.effects_delta).into_iter().map(String::from));
        merged.dedup();
        merged
    };

    let base = [
        if !scene.time_of_day.is_empty() {
            Some(format!("{} setting", scene.time_of_day))
        } else {
            None
        },
        if !scene.weather.is_empty() {
            Some(format!("weather: {}", scene.weather))
        } else {
            None
        },
        Some(light_text(&scene.light)).filter(|s| !s.is_empty()),
        Some(grade_text(&scene.grade)).filter(|s| !s.is_empty()),
        if !scene.ambience.is_empty() {
            Some(format!("ambience: {}", d(&scene.ambience)))
        } else {
            None
        },
        if !effects.is_empty() {
            Some(format!("effects: {}", effects.join(", ")))
        } else {
            None
        },
    ]
    .into_iter()
    .filter_map(|x| x)
    .collect::<Vec<_>>()
    .join("; ");

    let delta = [
        (if d(&shot.subject).is_empty() { None } else { Some(d(&shot.subject).to_string()) }),
        Some(composition_text(&shot.composition)),
        if shot.lens.focal_mm > 0 {
            Some(format!("{}mm lens", shot.lens.focal_mm))
        } else {
            None
        },
        Some(motion_text(&shot.motion)),
        if !shot.audio.foley.is_empty() {
            Some(format!("foley: {}", shot.audio.foley))
        } else {
            None
        },
        if !shot.audio.sfx.is_empty() {
            Some(format!("sfx: {}", shot.audio.sfx))
        } else {
            None
        },
        if !shot.audio.music_cue.is_empty() {
            Some(format!("music: {}", shot.audio.music_cue))
        } else {
            None
        },
        if shot.audio.silence {
            Some("no music, near-silence".to_string())
        } else {
            None
        },
    ]
    .into_iter()
    .filter_map(|s| s)
    .filter(|s: &String| !s.is_empty())
    .collect::<Vec<_>>()
    .join("; ");

    let scene_tag = if inherit.is_empty() {
        String::new()
    } else {
        format!("Scene: {inherit}. ")
    };

    let image_prompt = format!(
        "{base}. {delta}. {scene_tag}No on-screen text, no subtitles. Keep the identity and visual style of the first frame identical."
    );
    // Motion is already in the delta (`motion_text`), so the video prompt
    // does NOT repeat it — only the identity-lock + ambient-sound tail that
    // the image prompt lacks.
    let video_prompt = format!(
        "{base}. {delta}. Realistic ambient sound only. No on-screen text. {scene_tag}Keep the identity and visual style of the first frame identical."
    );

    ShotMolecule {
        inherit,
        subject: shot.subject.clone(),
        composition: shot.composition.clone(),
        lens: shot.lens.clone(),
        motion: shot.motion.clone(),
        effects_delta: shot.effects_delta.clone(),
        audio: shot.audio.clone(),
        transition_in: shot.transition_in.clone(),
        transition_out: shot.transition_out.clone(),
        clip_s: shot.clip_s,
        prompts: crate::generation::video_flow::engine::types::Prompts {
            image: image_prompt,
            video: video_prompt,
        },
    }
}

/// A derived molecule + its computed effects + frames, in one returned struct.
/// (The molecule already carries the merged effects via `effects_delta`; the
/// caller computes the scene-merged set with the same rule if needed.)
pub struct Derived {
    pub molecule: ShotMolecule,
    pub effects: Vec<String>,
    pub frames: u32,
}

/// One-shot derive returning the molecule, its scene-merged effects, frames.
pub fn derive_full(scene: &SceneSpec, shot: &ShotMolecule) -> Derived {
    let m = derive(scene, shot);
    let mut effects: Vec<String> =
        list(&scene.effects_base).into_iter().map(String::from).collect();
    effects.extend(list(&shot.effects_delta).into_iter().map(String::from));
    effects.dedup();
    Derived {
        molecule: m,
        effects,
        frames: frames_of(shot.clip_s),
    }
}
