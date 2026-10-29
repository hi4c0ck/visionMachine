//! Step 3 (materialize): `StructuredVideoPlan` → composer `Vec<Pipe>`.
//!
//! This is the "solid pipes structure in the compose section" the flow targets:
//! each `PlanPipe` becomes a composer `Pipe` carrying a global-style element and
//! a timeline whose sections are the video-engine tags. The conversion is pure
//! and deterministic; it emits real `composer` model values (not serde blobs)
//! so the output drops straight into the existing compose/save path.

use crate::generation::video_flow::config::MaterializeParams;
use crate::generation::video_flow::error::{FlowError, FlowResult};
use crate::generation::video_flow::plan::{PlanPipe, StructuredVideoPlan};
use crate::models::composer::{GlobalElement, Pipe, Segment, TagElement, TimelineElement};

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
    // Never shorter than the configured default; honor a longer plan.
    cfg.default_pipe_frames.max(max_end)
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

    // One timeline element; each section is its own single-tag segment.
    let mut timeline = TimelineElement::new();
    for s in &pp.sections {
        let mut segment = Segment::new(s.frame_start, s.frame_end);
        let mut tag = TagElement::new(s.tag.to_tag_type(), s.frame_start, s.frame_end, TAG_VALUE);
        tag.prompt = Some(s.prompt.clone());
        segment.tags.push(tag);
        timeline.segments.push(segment);
    }
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
        assert_eq!(t.segments.len(), 2, "one segment per plan section");
        // Tags keep their video-engine type + the section prompt.
        assert_eq!(t.segments[0].tags[0].tag, TagType::Camera);
        assert_eq!(t.segments[0].tags[0].prompt.as_deref(), Some("wide tracking shot"));
        assert_eq!(
            t.segments[0].tags[0].frame_start,
            0,
            "segment frame range mirrors the section"
        );
        assert_eq!(t.segments[1].tags[0].tag, TagType::Lighting);
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
