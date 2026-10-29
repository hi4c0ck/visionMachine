//! `StructuredVideoPlan` — the versioned intermediate structure between the
//! expanded narrative and the composer pipes.
//!
//! This is the "structured text with video-engine language configuration"
//! from the distant-vision flow: a sectioned document whose sections are
//! *tags* in the video engine's own language (scene / camera / lighting / …).
//! The materialize step lowers this into composer `Pipe`/`Segment`/`TagElement`
//! structures, so the plan is the single boundary between free text and the
//! concrete compose-section data.

use crate::generation::video_flow::intent::SpanId;
use crate::models::composer::TagType;
use serde::{Deserialize, Serialize};

/// The flow's video-engine tag vocabulary. Independent of the composer model
/// so the flow's text contract can evolve without touching the compose schema;
/// `to_tag_type()` is the one mapping point (used only at materialize).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VideoTag {
    Scene,
    Camera,
    Lighting,
    Effect,
    Transition,
    Motion,
}

impl VideoTag {
    /// Parse a `@keyword` marker body. `None` on an undefined keyword so the
    /// caller reports the concrete unknown tag (the careful text-output path).
    pub fn from_keyword(keyword: &str) -> Option<Self> {
        match keyword.trim().to_ascii_lowercase().as_str() {
            "scene" => Some(Self::Scene),
            "camera" => Some(Self::Camera),
            "lighting" => Some(Self::Lighting),
            "effect" => Some(Self::Effect),
            "transition" => Some(Self::Transition),
            "motion" => Some(Self::Motion),
            _ => None,
        }
    }

    /// Map the flow tag onto the composer `TagType` used in the final pipes.
    pub fn to_tag_type(self) -> TagType {
        match self {
            Self::Scene => TagType::Scene,
            Self::Camera => TagType::Camera,
            Self::Lighting => TagType::Lighting,
            Self::Effect => TagType::Effect,
            Self::Transition => TagType::Transition,
            // The composer has no dedicated "motion" tag; nearest is Zoom.
            Self::Motion => TagType::Zoom,
        }
    }

    pub fn keyword(&self) -> &'static str {
        match self {
            Self::Scene => "scene",
            Self::Camera => "camera",
            Self::Lighting => "lighting",
            Self::Effect => "effect",
            Self::Transition => "transition",
            Self::Motion => "motion",
        }
    }
}

/// One tagged section of a plan. Frames are in pipe-frame units; an absent /
/// zero range lets the structurer fill `default_section_frames` (config).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSection {
    pub tag: VideoTag,
    pub frame_start: u32,
    pub frame_end: u32,
    pub prompt: String,
    /// Provenance: the novel spans (or intent clauses) this section was
    /// lowered from. Empty = no provenance recorded yet (Phase-0 marker
    /// structurer). This is what makes the structured text *viable for
    /// generation into elements*: a lowered element traces back through here.
    #[serde(default)]
    pub from: Vec<SpanId>,
}

/// A single pipe in the plan. The current flow emits one pipe per narrative;
/// splitting into multiple pipes is a later mutation step and the shape already
/// carries the index so it can grow without a contract change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanPipe {
    pub index: usize,
    pub title: String,
    pub global_style: String,
    pub media_mode: String,
    pub sections: Vec<PlanSection>,
}

/// The structured, versioned plan the flow passes to materialize.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredVideoPlan {
    pub flow_version: u32,
    pub pipes: Vec<PlanPipe>,
}

impl StructuredVideoPlan {
    /// The pipe the flow currently produces (index 0). Present for every
    /// valid plan (the structurer guarantees at least one).
    pub fn primary(&self) -> &PlanPipe {
        &self.pipes[0]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_keywords_round_trip() {
        for kw in ["scene", "camera", "lighting", "effect", "transition", "motion"] {
            let tag = VideoTag::from_keyword(kw).unwrap();
            assert_eq!(tag.keyword(), kw);
        }
        assert!(VideoTag::from_keyword("nope").is_none());
        // Case-insensitive + surrounding spaces.
        assert_eq!(VideoTag::from_keyword("  Camera "), Some(VideoTag::Camera));
    }

    #[test]
    fn tag_maps_to_composer() {
        assert_eq!(VideoTag::Scene.to_tag_type(), TagType::Scene);
        assert_eq!(VideoTag::Motion.to_tag_type(), TagType::Zoom);
    }

    #[test]
    fn plan_is_wire_serializable() {
        let plan = StructuredVideoPlan {
            flow_version: 1,
            pipes: vec![PlanPipe {
                index: 0,
                title: "t".into(),
                global_style: "g".into(),
                media_mode: "text".into(),
                sections: vec![PlanSection {
                    tag: VideoTag::Scene,
                    frame_start: 0,
                    frame_end: 24,
                    prompt: "p".into(),
                    from: Vec::new(),
                }],
            }],
        };
        let json = serde_json::to_value(&plan).unwrap();
        assert_eq!(json["flowVersion"], 1);
        let back: StructuredVideoPlan = serde_json::from_value(json).unwrap();
        assert_eq!(back.primary().sections.len(), 1);
    }
}
