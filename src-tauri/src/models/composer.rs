use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════════════════
// CLEAN SCHEMA - No legacy compatibility
// ═══════════════════════════════════════════════════════════════════════════════

/// Tag type for pipeline elements
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TagType {
    Scene,
    Camera,
    Rotation,
    Lighting,
    Effect,
    Zoom,
    Transition,
}

impl std::fmt::Display for TagType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self).map(|_| ())
    }
}

/// A tag element within a segment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagElement {
    pub id: String,
    pub tag: TagType,
    pub frame_start: u32,
    pub frame_end: u32,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spec: Option<serde_json::Value>,
}

impl TagElement {
    pub fn new(tag: TagType, frame_start: u32, frame_end: u32, value: f64) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            tag,
            frame_start,
            frame_end,
            value,
            prompt: None,
            spec: None,
        }
    }
}

/// A timeline segment containing multiple tags
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub frame_start: u32,
    pub frame_end: u32,
    pub tags: Vec<TagElement>,
}

impl Segment {
    pub fn new(frame_start: u32, frame_end: u32) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            frame_start,
            frame_end,
            tags: Vec::new(),
        }
    }
}

/// Global style element (applies to entire pipe)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalElement {
    pub id: String,
    pub frame_start: u32,
    pub frame_end: u32,
    pub enabled: bool,
}

impl GlobalElement {
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            frame_start: 0,
            frame_end: 240,
            enabled: true,
        }
    }
}

/// Subject reference for visual consistency across the pipe
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectReference {
    pub id: String,
    pub image_url: String,
    #[serde(default)]
    pub use_frames: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_start: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_end: Option<u32>,
    #[serde(default = "default_true")]
    pub visible: bool,
}

fn default_true() -> bool {
    true
}

impl SubjectReference {
    pub fn new(image_url: String, use_frames: bool) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            image_url,
            use_frames,
            frame_start: None,
            frame_end: None,
            visible: true,
        }
    }
}

/// Timeline element containing segments
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineElement {
    pub id: String,
    pub segments: Vec<Segment>,
}

impl TimelineElement {
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            segments: Vec::new(),
        }
    }
}

/// Pipe element - either Global or Timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tag")]
pub enum PipeElement {
    #[serde(rename = "global_style")]
    Global(GlobalElement),
    #[serde(rename = "timeline")]
    Timeline(TimelineElement),
}

/// Keyframe in a pipe
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyframe {
    pub id: String,
    pub frame: u32,
    #[serde(default)]
    pub slot_index: u8,
    #[serde(rename = "type", default)]
    pub kind: String, // url, txt2img, img2img
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_url: Option<String>,
    #[serde(default)]
    pub status: String, // pending, generating, done, error
}

impl Keyframe {
    pub fn new(slot_index: u8, frame: u32) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            frame,
            slot_index,
            kind: "url".to_string(),
            image_src: None,
            prompt: None,
            reference_url: None,
            status: "pending".to_string(),
        }
    }
}

/// A single pipe row - the main unit of composition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pipe {
    pub id: String,
    pub name: String,
    #[serde(default = "default_length_frames")]
    pub length_frames: u32,
    #[serde(default = "default_q_value")]
    pub q_value: u32,
    #[serde(default = "default_c_value")]
    pub c_value: f32,
    #[serde(default)]
    pub keyframes: Vec<Keyframe>,
    #[serde(default)]
    pub subject_references: Vec<SubjectReference>,
    #[serde(default)]
    pub elements: Vec<PipeElement>,
    #[serde(default)]
    pub order_index: usize,
}

fn default_length_frames() -> u32 {
    121
}
fn default_q_value() -> u32 {
    18
}
fn default_c_value() -> f32 {
    7.0
}

impl Pipe {
    pub fn new(name: &str, length_frames: u32) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            length_frames,
            q_value: 18,
            c_value: 7.0,
            keyframes: Vec::new(),
            subject_references: Vec::new(),
            // Start empty - user chooses Global OR Timeline via [+]
            elements: Vec::new(),
            order_index: 0,
        }
    }
}

/// Session composer config - JSON blob stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposerConfig {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub pipes: Vec<Pipe>,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default = "default_resolution")]
    pub resolution: String,
    #[serde(default = "default_orientation")]
    pub orientation: String,
    #[serde(default)]
    pub total_generated_frames: u32,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

fn default_fps() -> u32 {
    24
}
fn default_resolution() -> String {
    "720p".to_string()
}
fn default_orientation() -> String {
    "horizontal".to_string()
}

impl ComposerConfig {
    pub fn new(session_id: &str, name: &str) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            name: name.to_string(),
            pipes: vec![Pipe::new("Pipe 1", 121)],
            fps: 24,
            resolution: default_resolution(),
            orientation: default_orientation(),
            total_generated_frames: 0,
            created_at: Some(now),
            updated_at: Some(now),
        }
    }
}
