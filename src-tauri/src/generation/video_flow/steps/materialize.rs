//! Step 3 (materialize): `StructuredVideoPlan` → composer `Vec<Pipe>`.
//!
//! This is the "solid pipes structure in the compose section" the flow targets:
//! each `PlanPipe` becomes a composer `Pipe` carrying a global-style element and
//! one concrete timeline zone [0, pipe_length] with every section tag nested
//! inside it at its own sub-range. The conversion is pure
//! and deterministic; it emits real `composer` model values (not serde blobs)
//! so the output drops straight into the existing compose/save path.

use crate::generation::video_flow::config::MaterializeParams;
use crate::generation::video_flow::error::{FlowError, FlowResult};
use crate::generation::video_flow::plan::{PlanPipe, StructuredVideoPlan};
use crate::models::composer::{GlobalElement, Pipe, Segment, TagElement, TagType, TimelineElement};

/// A video-engine tag's numeric value on a composer `TagElement`. Text-only
/// sections carry no magnitude (the prompt is the content), so value is 0.0;
/// the tag `prompt` field carries the section text.
const TAG_VALUE: f64 = 0.0;

fn pipe_length(pipe: &PlanPipe, cfg: &MaterializeParams) -> u32 {
    let max_end = pipe
        .sections
        .iter()
        .map(|s| s.frame_end)
        .max()
        .unwrap_or(0);
    // A concrete engine pipe carries its own cumulative content length
    // (one pipe per shot, lengthed to that shot's clip): honor it so the
    // generated pipe matches its content with no dead tail. A max over the
    // section ends keeps content from ever overflowing the pipe.
    // Legacy / sparse marker-bridge pipes (length_frames == 0) keep the
    // configured default floor.
    if pipe.length_frames > 0 {
        pipe.length_frames.max(max_end)
    } else {
        cfg.default_pipe_frames.max(max_end)
    }
}

/// The frontend's `TAG_SPECIFICATIONS` entry for a composer `TagType` — the
/// color + name + construct rule the timeline pill needs to render in its lane
/// color. Mirrored here (Rust is the source of the concrete engine pipes; the
/// `get_composer` round-trip loses `spec` otherwise and the frontend fills the
/// gray `#888` fallback, so every generated pill would be grey).
fn tag_spec_json(t: &TagType) -> serde_json::Value {
    use serde_json::json;
    match t {
        TagType::Scene => json!({"color": "#FF6B6B", "name": "Scene", "constructRule": "plain", "usePrompt": true}),
        TagType::Camera => json!({"color": "#FFE66D", "name": "Camera", "constructRule": "json", "min": 0, "max": 360}),
        TagType::Rotation => json!({"color": "#4ECDC4", "name": "Rotation", "constructRule": "json", "min": -180, "max": 180}),
        TagType::Lighting => json!({"color": "#45B7D1", "name": "Lighting", "constructRule": "plain", "usePrompt": true}),
        TagType::Effect => json!({"color": "#96CEB4", "name": "Effect", "constructRule": "markdown", "usePrompt": true}),
        TagType::Zoom => json!({"color": "#DDA0DD", "name": "Zoom", "constructRule": "json", "min": 0.5, "max": 5}),
        TagType::Transition => json!({"color": "#FF6B35", "name": "Transition", "constructRule": "plain", "usePrompt": true}),
    }
}

/// Lower one plan pipe into a composer `Pipe` with a global style element and a
/// timeline element whose segments are the plan's sections.
fn plan_pipe_to_composer(pp: &PlanPipe, index: usize, cfg: &MaterializeParams) -> Pipe {
    let mut pipe = Pipe::new(&pp.title, pipe_length(pp, cfg));
    pipe.id = uuid::Uuid::new_v4().to_string();
    pipe.name = if pp.title.is_empty() {
        format!("Text video {}", index + 1)
    } else {
        pp.title.clone()
    };
    pipe.media_mode = pp.media_mode.clone();
    pipe.order_index = index;

    // Global style element (absent style -> an empty-prompt global zone).
    let mut global = GlobalElement::new();
    global.frame_end = pipe_length(pp, cfg);
    global.prompt = Some(pp.global_style.clone());
    pipe.elements.push(crate::models::composer::PipeElement::Global(global));

    // ONE concrete zone per pipe = the whole shot [0, pipe_length]. Every
    // section tag NESTS inside it at its own sub-range: the story/camera
    // arcs keep their S3 sub-slice windows, the sustained meta (motion /
    // lighting / effect) fill the zone, and the transition cut-in is a short
    // leading window. A sub-tag can never exceed the zone's concrete
    // boundary (the composer invariant). No more one-hidden-segment-per-tag.
    let len = pipe_length(pp, cfg);
    let mut timeline = TimelineElement::new();
    let mut zone = Segment::new(0, len);
    for s in &pp.sections {
        let tag_type = s.tag.to_tag_type();
        let mut tag = TagElement::new(tag_type.clone(), s.frame_start, s.frame_end, TAG_VALUE);
        tag.prompt = Some(s.prompt.clone());
        // Carries the frontend's TAG_SPECIFICATIONS color/name so the pill
        // renders in its lane color (not the gray #888 fallback).
        tag.spec = Some(tag_spec_json(&tag_type));
        zone.tags.push(tag);
    }
    timeline.segments.push(zone);
    pipe.elements.push(crate::models::composer::PipeElement::Timeline(timeline));

    pipe
}

/// Materialize the whole plan into composer pipes. The text-only flow emits a
/// single pipe today; the shape is per-pipe so multi-pipe splitting can land
/// without changing the contract.
pub fn materialize_pipes(plan: &StructuredVideoPlan, cfg: &MaterializeParams) -> FlowResult<Vec<Pipe>> {
    if plan.pipes.is_empty() {
        return Err(FlowError::Materialize("plan carries no pipes".into()));
    }
    let mut pipes = Vec::with_capacity(plan.pipes.len());
    for (i, pp) in plan.pipes.iter().enumerate() {
        if pp.sections.is_empty() {
            return Err(FlowError::Materialize(format!(
                "pipe {} has no sections to materialize",
                pp.index
            )));
        }
        pipes.push(plan_pipe_to_composer(pp, i, cfg));
    }
    Ok(pipes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::config::FlowConfig;
    use crate::generation::video_flow::plan::VideoTag;
    use crate::models::composer::{PipeElement, TagType};

    fn plan() -> StructuredVideoPlan {
        use crate::generation::video_flow::plan::{PlanSection, PlanPipe};
        StructuredVideoPlan {
            flow_version: 1,
            pipes: vec![PlanPipe {
                index: 0,
                title: "A fox at dusk".into(),
                global_style: "cinematic, warm golden hour".into(),
                media_mode: "text".into(),
                sections: vec![
                    PlanSection {
                        tag: VideoTag::Camera,
                        frame_start: 0,
                        frame_end: 24,
                        prompt: "wide tracking shot".into(),
                        from: Vec::new(),
                    },
                    PlanSection {
                        tag: VideoTag::Lighting,
                        frame_start: 24,
                        frame_end: 48,
                        prompt: "long shadows".into(),
                        from: Vec::new(),
                    },
                ],
                length_frames: 0,
            }],
        }
    }

    fn cfg() -> MaterializeParams {
        MaterializeParams::default()
    }

    fn global_and_timeline(pipe: &Pipe) -> (&GlobalElement, &TimelineElement) {
        let g = match &pipe.elements[0] {
            PipeElement::Global(g) => g,
            _ => panic!("first element is not the global style"),
        };
        let t = match &pipe.elements[1] {
            PipeElement::Timeline(t) => t,
            _ => panic!("second element is not the timeline"),
        };
        (g, t)
    }

    #[test]
    fn materializes_a_solid_composer_pipe() {
        let pipes = materialize_pipes(&plan(), &cfg()).unwrap();
        assert_eq!(pipes.len(), 1);
        let p = &pipes[0];

        assert_eq!(p.name, "A fox at dusk");
        assert_eq!(p.media_mode, "text", "text-only flow emits the text media mode");
        // Pipe length = max section end (48) but at least the default (240).
        assert_eq!(p.length_frames, 240);
        assert_eq!(p.order_index, 0);
        // No image pieces in the text flow.
        assert!(p.keyframes.is_empty());
        assert!(p.subject_references.is_empty());

        let (g, t) = global_and_timeline(p);
        assert_eq!(g.prompt.as_deref(), Some("cinematic, warm golden hour"));
        // ONE concrete zone per pipe [0, pipe_length]; every section tag nests
        // inside it at its own sub-range (no hidden one-segment-per-tag hack).
        assert_eq!(t.segments.len(), 1, "one concrete zone per pipe");
        let zone = &t.segments[0];
        assert_eq!((zone.frame_start, zone.frame_end), (0, 240), "zone = the whole pipe");
        assert_eq!(zone.tags.len(), 2, "both section tags nest inside the zone");
        // Sub-tags keep their own video-engine type + prompt + sub-range, and
        // never exceed the zone's concrete boundary.
        assert_eq!(zone.tags[0].tag, TagType::Camera);
        assert_eq!(zone.tags[0].prompt.as_deref(), Some("wide tracking shot"));
        assert_eq!((zone.tags[0].frame_start, zone.tags[0].frame_end), (0, 24), "camera nests at its sub-range");
        assert_eq!(zone.tags[1].tag, TagType::Lighting);
        assert_eq!((zone.tags[1].frame_start, zone.tags[1].frame_end), (24, 48), "lighting nests at its sub-range");
        assert!(
            zone.tags.iter().all(|tg| tg.frame_start >= zone.frame_start && tg.frame_end <= zone.frame_end),
            "no sub-tag exceeds the zone boundary"
        );
    }

    /// Every materialized tag carries its frontend `TAG_SPECIFICATIONS` entry
    /// (color + name) so the timeline pill renders in its lane color instead of
    /// the gray `#888` fallback the session loader uses for a missing spec.
    #[test]
    fn materialized_tags_carry_their_lane_color_spec() {
        let pipes = materialize_pipes(&plan(), &cfg()).unwrap();
        let (_, t) = global_and_timeline(&pipes[0]);
        // All section tags nest inside the single zone (segments[0]); each must
        // carry its lane color.
        let zone = &t.segments[0];
        let cam_color = zone
            .tags
            .iter()
            .find(|tg| tg.tag == TagType::Camera)
            .and_then(|tg| tg.spec.as_ref())
            .and_then(|s| s.get("color"))
            .and_then(|v| v.as_str());
        let lit_color = zone
            .tags
            .iter()
            .find(|tg| tg.tag == TagType::Lighting)
            .and_then(|tg| tg.spec.as_ref())
            .and_then(|s| s.get("color"))
            .and_then(|v| v.as_str());
        assert_eq!(
            cam_color,
            Some("#FFE66D"),
            "camera tag carries its lane color (frontend TAG_SPECIFICATIONS)"
        );
        assert_eq!(
            lit_color,
            Some("#45B7D1"),
            "lighting tag carries its lane color"
        );
    }

    #[test]
    fn empty_plan_fails_materialize() {
        let empty = StructuredVideoPlan {
            flow_version: 1,
            pipes: Vec::new(),
        };
        assert!(matches!(materialize_pipes(&empty, &cfg()).unwrap_err(), FlowError::Materialize(_)));
    }

    #[test]
    fn empty_sections_fails_materialize() {
        use crate::generation::video_flow::plan::PlanPipe;
        let p = StructuredVideoPlan {
            flow_version: 1,
            pipes: vec![PlanPipe {
                index: 0,
                title: "x".into(),
                global_style: String::new(),
                media_mode: "text".into(),
                sections: Vec::new(),
                length_frames: 0,
            }],
        };
        assert!(matches!(materialize_pipes(&p, &cfg()).unwrap_err(), FlowError::Materialize(_)));
    }

    #[test]
    fn pipe_grows_when_sections_run_longer_than_default() {
        let mut p = plan();
        p.pipes[0].sections[1].frame_end = 500;
        let pipes = materialize_pipes(&p, &cfg()).unwrap();
        assert_eq!(pipes[0].length_frames, 500, "max section end wins over the default");
    }

    /// A concrete engine pipe carries its own cumulative content length
    /// (length_frames > 0): the materialized composer pipe is lengthed to
    /// THAT content, not the 240-frame default floor — so a shot whose
    /// scenes sum to 8s×24=192f produces a 192f pipe, not a 240f one with
    /// a 48-frame dead tail.
    #[test]
    fn explicit_length_frames_honored_instead_of_default_floor() {
        let mut p = plan();
        // The plan's sections tile 0-48 (48f of content); a concrete engine
        // pipe would set its own cumulative length, e.g. 48f.
        p.pipes[0].length_frames = 48;
        let pipes = materialize_pipes(&p, &cfg()).unwrap();
        assert_eq!(
            pipes[0].length_frames,
            48,
            "explicit pipe length = the cumulative content length, not the 240f default"
        );
        // ...and it still can't be shorter than the content's max end.
        let mut q = p.clone();
        q.pipes[0].sections[1].frame_end = 60; // content now out-runs 48
        let pq = materialize_pipes(&q, &cfg()).unwrap();
        assert_eq!(
            pq[0].length_frames, 60,
            "max section end still wins over an explicit length"
        );
    }

    /// Legacy / sparse pipes (length_frames == 0) keep the default floor —
    /// the old behaviour — so the two plan kinds never collide.
    #[test]
    fn zero_length_frames_keeps_default_floor() {
        let p = plan(); // length_frames: 0, content tiles to 48f
        let pipes = materialize_pipes(&p, &cfg()).unwrap();
        assert_eq!(
            pipes[0].length_frames,
            240,
            "legacy pipe (length_frames=0) falls back to the default floor"
        );
    }

    #[test]
    fn deterministic_between_runs() {
        let a = materialize_pipes(&plan(), &cfg()).unwrap();
        let b = materialize_pipes(&plan(), &cfg()).unwrap();
        // Pipe ids are fresh UUIDs, so compare the *structural* content that
        // the flow actually guarantees (name / mode / frames / tags / prompts).
        let ra = (&a[0].name, &a[0].media_mode, a[0].length_frames, a[0].elements.len());
        let rb = (&b[0].name, &b[0].media_mode, b[0].length_frames, b[0].elements.len());
        assert_eq!(ra, rb);
        let _ = FlowConfig::default_flow();
    }
}
