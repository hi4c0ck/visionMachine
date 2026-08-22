use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// ═══════════════════════════════════════════════════════════════════════════════
// Session-level Settings
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Resolution { P480, P720, P1080 }

impl Default for Resolution {
    fn default() -> Self { Self::P720 }
}

impl Resolution {
    pub fn max_frames(&self) -> u32 {
        match self { Self::P480 => 441, Self::P720 => 241, Self::P1080 => 121 }
    }
    pub fn dimensions(&self) -> (u32, u32) {
        match self { Self::P480 => (854, 480), Self::P720 => (1280, 720), Self::P1080 => (1920, 1080) }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AspectRatio { R16x9, R9x16, R1x1 }
impl Default for AspectRatio { Self::R16x9 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSettings {
    pub id: String,
    pub session_id: String,
    pub resolution: Resolution,
    pub aspect_ratio: AspectRatio,
    pub total_frames: u32,
    pub fps: f64,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl SessionSettings {
    pub fn new(session_id: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            resolution: Resolution::default(),
            aspect_ratio: AspectRatio::default(),
            total_frames: Resolution::default().max_frames(),
            fps: 8.0,
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
        }
    }
    pub fn validate_frame_count(&self, frames: u32) -> bool {
        frames <= self.resolution.max_frames() && frames % 8 == 1
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KeyframeSlot
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeSlot {
    pub id: String,
    pub pipe_id: String,
    pub slot_index: u8,
    pub source_type: String,
    pub source_value: String,
    pub description: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub ratio: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl KeyframeSlot {
    pub fn new(pipe_id: &str, slot_index: u8) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            pipe_id: pipe_id.to_string(),
            slot_index,
            source_type: "none".to_string(),
            source_value: String::new(),
            description: None,
            width: None,
            height: None,
            ratio: None,
            created_at: Some(Utc::now()),
        }
    }
    pub fn has_image(&self) -> bool {
        !self.source_value.is_empty() && self.source_type != "none"
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PromptNode - hierarchical prompt tree
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum PromptTag {
    Segment,
    Movement,
    Rotation,
    FocalPoint,
    Lighting,
    Exposure,
    LensEffect,
    GlobalStyle,
}

impl std::fmt::Display for PromptTag {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "<{}>", self.label())
    }
}

impl PromptTag {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Segment => "segment",
            Self::Movement => "movement",
            Self::Rotation => "rotation",
            Self::FocalPoint => "focal_point",
            Self::Lighting => "lighting",
            Self::Exposure => "exposure",
            Self::LensEffect => "lens_effect",
            Self::GlobalStyle => "global_style",
        }
    }

    pub fn css_class(&self) -> &'static str {
        match self {
            Self::Segment => "tag-segment",
            Self::Movement => "tag-movement",
            Self::Rotation => "tag-rotation",
            Self::FocalPoint => "tag-focal-point",
            Self::Lighting => "tag-lighting",
            Self::Exposure => "tag-exposure",
            Self::LensEffect => "tag-lens-effect",
            Self::GlobalStyle => "tag-global-style",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Segment => "Segment",
            Self::Movement => "Camera Move",
            Self::Rotation => "Rotation",
            Self::FocalPoint => "Focal Point",
            Self::Lighting => "Lighting",
            Self::Exposure => "Exposure",
            Self::LensEffect => "Lens Effect",
            Self::GlobalStyle => "Global Style",
        }
    }

    pub fn colors(&self) -> (&'static str, &'static str) {
        match self {
            Self::Segment => ("#fff3cd", "#ffc107"),
            Self::Movement => ("#d1ecf1", "#17a2b8"),
            Self::Rotation => ("#d4edda", "#28a745"),
            Self::FocalPoint => ("#f8d7da", "#dc3545"),
            Self::Lighting => ("#e2d9f3", "#8b5cf6"),
            Self::Exposure => ("#ffe5d9", "#fd7e14"),
            Self::LensEffect => ("#d1f2eb", "#20c997"),
            Self::GlobalStyle => ("#f5e6ff", "#a855f7"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptNode {
    pub id: String,
    pub pipe_id: String,
    pub parent_id: Option<String>,
    pub tag: PromptTag,
    pub value: String,
    pub frame_start: Option<u32>,
    pub frame_end: Option<u32>,
    pub enabled: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl PromptNode {
    pub fn new(pipe_id: &str, tag: PromptTag, value: &str) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            pipe_id: pipe_id.to_string(),
            parent_id: None,
            tag,
            value: value.to_string(),
            frame_start: None,
            frame_end: None,
            enabled: true,
            created_at: Some(now),
            updated_at: Some(now),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PipeStatus
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PipeStatus { Idle, Generating, Completed, Error(String) }

pub fn pipe_status_from_db(s: &str) -> PipeStatus {
    match s {
        "generating" => PipeStatus::Generating,
        "completed" => PipeStatus::Completed,
        "error" => PipeStatus::Error(String::new()),
        other => {
            if other.starts_with("error:") {
                PipeStatus::Error(other[6..].to_string())
            } else {
                PipeStatus::Idle
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PipeRow
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipeRow {
    pub id: String,
    pub session_id: String,
    pub composer_id: String,
    pub name: String,
    pub order_index: usize,
    pub num_inference_steps: u32,
    pub cfg_scale: f32,
    pub target_frames: Option<u32>,
    pub task_id: Option<String>,
    pub status: PipeStatus,
    pub last_error: Option<String>,
    pub keyframes: Vec<KeyframeSlot>,
    pub prompt_nodes: Vec<PromptNode>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl PipeRow {
    pub fn new(session_id: &str, composer_id: &str, name: &str, order_index: usize) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            composer_id: composer_id.to_string(),
            name: name.to_string(),
            order_index,
            num_inference_steps: 20,
            cfg_scale: 7.5,
            target_frames: None,
            task_id: None,
            status: PipeStatus::Idle,
            last_error: None,
            keyframes: vec![
                KeyframeSlot::new("", 1),
                KeyframeSlot::new("", 2),
                KeyframeSlot::new("", 3),
            ],
            prompt_nodes: Vec::new(),
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
        }
    }
    pub fn effective_frames(&self, session_max: u32) -> u32 {
        self.target_frames.unwrap_or(session_max)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ComposerConfig
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ComposerState { Empty, Loading, Ready, Generating, Paused, Completed }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposerConfig {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub pipes: Vec<PipeRow>,
    pub session_settings: Option<SessionSettings>,
    pub state: ComposerState,
    pub version: i32,
    pub task_id: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl ComposerConfig {
    pub fn new(session_id: &str, name: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            name: name.to_string(),
            description: None,
            pipes: Vec::new(),
            session_settings: None,
            state: ComposerState::Empty,
            version: 1,
            task_id: None,
            created_at: Some(Utc::now()),
            updated_at: Some(Utc::now()),
        }
    }

    pub fn add_pipe(&mut self, pipe: PipeRow) {
        self.pipes.push(pipe);
        self.updated_at = Some(Utc::now());
        self.version += 1;
    }

    pub fn remove_pipe(&mut self, pipe_id: &str) -> Option<PipeRow> {
        if let Some(pos) = self.pipes.iter().position(|p| p.id == pipe_id) {
            self.updated_at = Some(Utc::now());
            self.version += 1;
            Some(self.pipes.remove(pos))
        } else { None }
    }

    pub fn set_task_id(&mut self, task_id: &str) {
        self.task_id = Some(task_id.to_string());
        for pipe in &mut self.pipes {
            pipe.task_id = Some(task_id.to_string());
        }
        self.updated_at = Some(Utc::now());
    }
}

// ── DB Row types ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ComposerDbRow {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub config_json: String,
    pub version: i32,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PipeDbRow {
    pub id: String,
    pub session_id: String,
    pub composer_id: String,
    pub name: String,
    pub order_index: usize,
    pub num_inference_steps: u32,
    pub cfg_scale: f32,
    pub target_frames: Option<u32>,
    pub task_id: Option<String>,
    pub status: String,
    pub last_error: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PromptNodeDbRow {
    pub id: String,
    pub pipe_id: String,
    pub parent_id: Option<String>,
    pub tag: String,
    pub value: String,
    pub frame_start: Option<u32>,
    pub frame_end: Option<u32>,
    pub enabled: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KeyframeDbRow {
    pub id: String,
    pub pipe_id: String,
    pub slot_index: u8,
    pub source_type: String,
    pub source_value: String,
    pub description: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub ratio: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionSettingsDbRow {
    pub id: String,
    pub session_id: String,
    pub resolution: String,
    pub aspect_ratio: String,
    pub total_frames: u32,
    pub fps: f64,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}
