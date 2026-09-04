// Clean conversion: frontend PipeRow -> backend ComposerConfig
// No legacy prompt_nodes - pipes stored directly as JSON

use crate::models::{ComposerConfig, GlobalElement, Keyframe, Pipe, PipeElement, Segment, SubjectReference, TagElement, TagType, TimelineElement};

#[derive(serde::Deserialize, Clone)]
pub struct FrontendTag {
    pub id: String,
    pub tag: String,
    pub frameStart: u32,
    pub frameEnd: u32,
    pub value: f64,
    #[serde(default)]
    pub prompt: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendSegment {
    pub id: String,
    pub frameStart: u32,
    pub frameEnd: u32,
    pub tags: Vec<FrontendTag>,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendTimelineElement {
    pub id: String,
    pub segments: Vec<FrontendSegment>,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendGlobalElement {
    pub id: String,
    #[serde(rename = "frameStart")]
    pub frame_start: u32,
    #[serde(rename = "frameEnd")]
    pub frame_end: u32,
    pub enabled: bool,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendSubjectReference {
    pub id: String,
    #[serde(rename = "imageUrl")]
    pub image_url: String,
    #[serde(rename = "useFrames")]
    pub use_frames: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "frameStart")]
    pub frame_start: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "frameEnd")]
    pub frame_end: Option<u32>,
    pub visible: bool,
}

#[derive(serde::Deserialize, Clone)]
#[serde(tag = "tag")]
pub enum FrontendPipeElement {
    #[serde(rename = "timeline")]
    Timeline(FrontendTimelineElement),
    #[serde(rename = "global_style")]
    Global(FrontendGlobalElement),
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendKeyframe {
    pub id: String,
    pub frame: u32,
    pub slot_index: u8,
    pub type_: String,
    pub image_src: Option<String>,
    pub prompt: Option<String>,
    pub reference_url: Option<String>,
    pub status: String,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendPipe {
    pub id: String,
    pub name: String,
    pub length_frames: u32,
    pub q_value: u32,
    pub c_value: f32,
    pub keyframes: Vec<FrontendKeyframe>,
    #[serde(default)]
    pub subject_references: Vec<FrontendSubjectReference>,
    pub elements: Vec<FrontendPipeElement>,
    pub order_index: usize,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendComposerInput {
    pub session_id: String,
    pub name: String,
    pub pipes: Vec<FrontendPipe>,
}

impl FrontendComposerInput {
    pub fn to_config(&self) -> ComposerConfig {
        let now = chrono::Utc::now();
        
        let pipes: Vec<Pipe> = self.pipes.iter().map(|p| {
            let elements: Vec<crate::models::PipeElement> = p.elements.iter().map(|el| match el {
                FrontendPipeElement::Timeline(t) => {
                    let segments: Vec<Segment> = t.segments.iter().map(|s| {
                        let tags: Vec<TagElement> = s.tags.iter().map(|t| {
                            TagElement {
                                id: t.id.clone(),
                                tag: match t.tag.as_str() {
                                    "scene" => crate::models::TagType::Scene,
                                    "camera" => crate::models::TagType::Camera,
                                    "rotation" => crate::models::TagType::Rotation,
                                    "lighting" => crate::models::TagType::Lighting,
                                    "zoom" => crate::models::TagType::Zoom,
                                    "transition" => crate::models::TagType::Transition,
                                    _ => crate::models::TagType::Scene,
                                },
                                frame_start: t.frameStart,
                                frame_end: t.frameEnd,
                                value: t.value,
                                prompt: t.prompt.clone(),
                            }
                        }).collect();
                        Segment {
                            id: s.id.clone(),
                            frame_start: s.frameStart,
                            frame_end: s.frameEnd,
                            tags,
                        }
                    }).collect();
                    crate::models::PipeElement::Timeline(crate::models::TimelineElement {
                        id: t.id.clone(),
                        segments,
                    })
                }
                FrontendPipeElement::Global(g) => {
                    crate::models::PipeElement::Global(crate::models::GlobalElement {
                        id: g.id.clone(),
                        frame_start: g.frame_start,
                        frame_end: g.frame_end,
                        enabled: g.enabled,
                    })
                }
            }).collect();
            
            let keyframes: Vec<Keyframe> = p.keyframes.iter().map(|kf| {
                Keyframe {
                    id: kf.id.clone(),
                    frame: kf.frame,
                    slot_index: kf.slot_index,
                    kind: kf.type_.clone(),
                    image_src: kf.image_src.clone(),
                    prompt: kf.prompt.clone(),
                    reference_url: kf.reference_url.clone(),
                    status: kf.status.clone(),
                }
            }).collect();
            
            Pipe {
                id: p.id.clone(),
                name: p.name.clone(),
                length_frames: p.length_frames,
                q_value: p.q_value,
                c_value: p.c_value,
                keyframes,
                subject_references: p.subject_references.iter().map(|sr| {
                    SubjectReference {
                        id: sr.id.clone(),
                        image_url: sr.image_url.clone(),
                        use_frames: sr.use_frames,
                        frame_start: sr.frame_start,
                        frame_end: sr.frame_end,
                        visible: sr.visible,
                    }
                }).collect(),
                elements,
                order_index: p.order_index,
            }
        }).collect();
        
        ComposerConfig {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: self.session_id.clone(),
            name: self.name.clone(),
            pipes,
            created_at: Some(now),
            updated_at: Some(now),
        }
    }
}
