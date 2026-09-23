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
    /// Prompt for the global style zone (primary text source).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

impl GlobalElement {
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            frame_start: 0,
            frame_end: 240,
            enabled: true,
            prompt: None,
        }
    }
}

/// Sound element — global-alike: a temporal range bar with its own prompt,
/// feeding the generated prompt as a `sound:` section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundElement {
    pub id: String,
    pub frame_start: u32,
    pub frame_end: u32,
    pub enabled: bool,
    /// Prompt for the sound zone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

impl SoundElement {
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            frame_start: 0,
            frame_end: 240,
            enabled: true,
            prompt: None,
        }
    }
}

/// Subject reference for visual consistency across the pipe
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectReference {
    pub id: String,
    pub image_url: String,
    /// Generation preset type — subjects follow keyframe rules: url / txt2img / img2img.
    /// Legacy refs (field absent) default to "url".
    #[serde(rename = "type", default = "default_ref_type")]
    pub kind: String,
    /// Prompt for txt2img / img2img subjects.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Generated-image preview pair (same semantics as Keyframe).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_local_path: Option<String>,
    /// Generation status of this reference's image (pending/generating/done/error).
    #[serde(default = "default_ref_status")]
    pub status: String,
    #[serde(default)]
    pub use_frames: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_start: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_end: Option<u32>,
    #[serde(default)]
    pub visible: bool,
    /// Queued for regeneration (UI status-dot click): the next run regenerates
    /// this piece even when a settled preview_remote_url is present (the
    /// registry's Ready-skip is overridden). Legacy rows default to false.
    #[serde(default)]
    pub force_regen: bool,
}

fn default_ref_type() -> String {
    "url".to_string()
}
fn default_ref_status() -> String {
    "pending".to_string()
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

impl SubjectReference {
    pub fn new(image_url: String, use_frames: bool) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            image_url,
            kind: "url".to_string(),
            prompt: None,
            preview_remote_url: None,
            preview_local_path: None,
            status: "pending".to_string(),
            use_frames,
            frame_start: None,
            frame_end: None,
            visible: true,
            force_regen: false,
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
    #[serde(rename = "sound")]
    Sound(SoundElement),
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
    /// Generated-image preview pair (post-generation artifact). Tolerant:
    /// legacy rows without these fields deserialize to None.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_local_path: Option<String>,
    #[serde(default)]
    pub status: String, // pending, generating, done, error
    /// Queued for regeneration (UI status-dot click): the next run regenerates
    /// this piece even when a settled preview_remote_url is present. Legacy
    /// rows default to false.
    #[serde(default)]
    pub force_regen: bool,
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
            preview_remote_url: None,
            preview_local_path: None,
            status: "pending".to_string(),
            force_regen: false,
        }
    }
}

/// The generated-video artifact attached to a pipe after a generation task
/// completes. Absent while no engine has produced a real file (empty state).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LastGeneration {
    pub task_id: String,
    pub video_path: String,
    pub generated_at: u64,
    pub status: String,
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
    /// Last generation artifact (null/absent = proper empty state).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_generation: Option<LastGeneration>,
    /// Media mode ("keyframes" | "reference"); default "keyframes"
    /// (docs/agnes-model-catalog.md, Q7).
    #[serde(default = "default_media_mode")]
    pub media_mode: String,
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
fn default_media_mode() -> String {
    "keyframes".into()
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
            last_generation: None,
            media_mode: default_media_mode(),
        }
    }

    /// Clone this pipe with brand-new ids for every level (pipe, keyframes,
    /// subject refs, elements, segments, tags) while carrying forward the
    /// source's LAST generation state (pipe.last_generation + keyframe /
    /// subject previews), re-rooted to the destination session media dir
    /// via `remap`. The id remint is what prevents Svelte 5
    /// each_key_duplicate when the two sessions later diverge; the carried
    /// artifacts are what make the copy feel like a true fork of the source
    /// instead of a blank skeleton.
    pub fn rekeyed(&self, remap: &dyn Fn(&str) -> String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: self.name.clone(),
            length_frames: self.length_frames,
            q_value: self.q_value,
            c_value: self.c_value,
            keyframes: self
                .keyframes
                .iter()
                .map(|kf| Keyframe {
                    id: uuid::Uuid::new_v4().to_string(),
                    frame: kf.frame,
                    slot_index: kf.slot_index,
                    kind: kf.kind.clone(),
                    image_src: kf.image_src.clone(),
                    prompt: kf.prompt.clone(),
                    reference_url: kf.reference_url.clone(),
                    // Carry the source's settled preview into the copy, but
                    // point the local path at the NEW session media dir so
                    // the copy's chips render after a media-tree copy. The
                    // remote URL is provider-cached — it stays valid as-is.
                    preview_remote_url: kf.preview_remote_url.clone(),
                    preview_local_path: kf.preview_local_path.as_ref().map(|p| remap(p)),
                    status: kf.status.clone(),
                    force_regen: false,
                })
                .collect(),
            subject_references: self
                .subject_references
                .iter()
                .map(|ref_| SubjectReference {
                    id: uuid::Uuid::new_v4().to_string(),
                    image_url: ref_.image_url.clone(),
                    kind: ref_.kind.clone(),
                    prompt: ref_.prompt.clone(),
                    preview_remote_url: ref_.preview_remote_url.clone(),
                    preview_local_path: ref_.preview_local_path.as_ref().map(|p| remap(p)),
                    status: ref_.status.clone(),
                    use_frames: ref_.use_frames,
                    frame_start: ref_.frame_start,
                    frame_end: ref_.frame_end,
                    visible: ref_.visible,
                    force_regen: false,
                })
                .collect(),
            elements: self
                .elements
                .iter()
                .map(|el| match el {
                    PipeElement::Global(g) => PipeElement::Global(GlobalElement {
                        id: uuid::Uuid::new_v4().to_string(),
                        frame_start: g.frame_start,
                        frame_end: g.frame_end,
                        enabled: g.enabled,
                        prompt: g.prompt.clone(),
                    }),
                    PipeElement::Sound(s) => PipeElement::Sound(SoundElement {
                        id: uuid::Uuid::new_v4().to_string(),
                        frame_start: s.frame_start,
                        frame_end: s.frame_end,
                        enabled: s.enabled,
                        prompt: s.prompt.clone(),
                    }),
                    PipeElement::Timeline(t) => PipeElement::Timeline(TimelineElement {
                        id: uuid::Uuid::new_v4().to_string(),
                        segments: t
                            .segments
                            .iter()
                            .map(|seg| Segment {
                                id: uuid::Uuid::new_v4().to_string(),
                                frame_start: seg.frame_start,
                                frame_end: seg.frame_end,
                                tags: seg
                                    .tags
                                    .iter()
                                    .map(|tag| TagElement {
                                        id: uuid::Uuid::new_v4().to_string(),
                                        tag: tag.tag.clone(),
                                        frame_start: tag.frame_start,
                                        frame_end: tag.frame_end,
                                        value: tag.value,
                                        prompt: tag.prompt.clone(),
                                        spec: tag.spec.clone(),
                                    })
                                    .collect(),
                            })
                            .collect(),
                    }),
                })
                .collect(),
            order_index: self.order_index,
            // Carry the source's last video artifact (remapped to the new
            // media dir) so the copy's preview strip + tools panel show the
            // same last generation instead of a blank state.
            last_generation: self.last_generation.as_ref().map(|lg| LastGeneration {
                task_id: lg.task_id.clone(),
                video_path: remap(&lg.video_path),
                generated_at: lg.generated_at,
                status: lg.status.clone(),
            }),
            media_mode: self.media_mode.clone(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Legacy on-disk refs have no type/prompt/status — they must deserialize
    /// with the url/pending defaults instead of failing the whole load.
    #[test]
    fn legacy_subject_reference_defaults() {
        let raw = json!({
            "id": "r1",
            "imageUrl": "https://example.com/ref.jpg",
            "useFrames": false,
            "visible": true
        });
        let ref_: SubjectReference = serde_json::from_value(raw).expect("legacy ref deserializes");
        assert_eq!(ref_.kind, "url");
        assert_eq!(ref_.status, "pending");
        assert!(ref_.prompt.is_none());
    }

    /// The new camelCase shape (with type/prompt/status) round-trips.
    #[test]
    fn subject_reference_camel_case_round_trip() {
        let ref_ = SubjectReference {
            id: "r1".into(),
            image_url: "https://example.com/ref.jpg".into(),
            kind: "txt2img".into(),
            prompt: Some("a mountain".into()),
            preview_remote_url: None,
            preview_local_path: None,
            status: "done".into(),
            use_frames: true,
            frame_start: Some(0),
            frame_end: Some(120),
            visible: true,
            force_regen: false,
        };
        let value = serde_json::to_value(&ref_).expect("serialize");
        // The wire field is named `type`, not the Rust field `kind`.
        assert_eq!(value["type"], "txt2img");
        assert_eq!(value["imageUrl"], "https://example.com/ref.jpg");
        assert_eq!(value["frameStart"], 0);
        assert!(value.get("prompt").is_some());

        let back: SubjectReference = serde_json::from_value(value).expect("round trip");
        assert_eq!(back.id, ref_.id);
        assert_eq!(back.kind, "txt2img");
        assert_eq!(back.prompt.as_deref(), Some("a mountain"));
        assert_eq!(back.status, "done");
    }

    /// A legacy pipe without last_generation loads as None, and re-serialization
    /// must not emit a spurious lastGeneration key.
    #[test]
    fn legacy_pipe_defaults_last_generation_to_none() {
        let raw = json!({
            "id": "p1",
            "name": "Pipe 1",
            "lengthFrames": 121
        });
        let pipe: Pipe = serde_json::from_value(raw).expect("legacy pipe deserializes");
        assert!(pipe.last_generation.is_none());
        assert!(pipe.keyframes.is_empty());
        assert!(pipe.subject_references.is_empty());
        // Legacy rows predate mediaMode (docs/agnes-model-catalog.md, Q7) —
        // they must deserialize to the 'keyframes' default, not fail.
        assert_eq!(pipe.media_mode, "keyframes");

        let value = serde_json::to_value(&pipe).expect("serialize");
        assert!(value.get("lastGeneration").is_none());
    }

    /// A legacy on-disk global element (no prompt field) must still deserialize;
    /// the new `prompt` + sound shapes round-trip.
    #[test]
    fn global_element_legacy_default_and_sound_round_trip() {
        let legacy = json!({
            "id": "g1",
            "tag": "global_style",
            "frameStart": 0,
            "frameEnd": 120,
            "enabled": true
        });
        let el: PipeElement = serde_json::from_value(legacy).expect("legacy global deserializes");
        match &el {
            PipeElement::Global(g) => {
                assert!(g.prompt.is_none());
                assert_eq!(g.frame_start, 0);
            }
            _ => panic!("expected global element"),
        }

        let sound = json!({
            "id": "s1",
            "tag": "sound",
            "frameStart": 16,
            "frameEnd": 88,
            "enabled": true,
            "prompt": "rain on windows"
        });
        let el: PipeElement = serde_json::from_value(sound).expect("sound deserializes");
        match el {
            PipeElement::Sound(s) => {
                assert_eq!(s.prompt.as_deref(), Some("rain on windows"));
                assert_eq!(s.frame_start, 16);
                assert_eq!(s.frame_end, 88);
            }
            _ => panic!("expected sound element"),
        }
    }

    #[test]
    fn pipe_last_generation_round_trip() {
        let pipe = Pipe {
            id: "p1".into(),
            name: "Pipe 1".into(),
            length_frames: 121,
            q_value: 18,
            c_value: 7.0,
            keyframes: vec![],
            subject_references: vec![],
            elements: vec![],
            order_index: 0,
            last_generation: Some(LastGeneration {
                task_id: "t1".into(),
                video_path: "C:/out/video.mp4".into(),
                generated_at: 1_234_567_890,
                status: "done".into(),
            }),
            media_mode: "keyframes".into(),
        };
        let value = serde_json::to_value(&pipe).expect("serialize");
        assert_eq!(value["lastGeneration"]["taskId"], "t1");
        assert_eq!(value["lastGeneration"]["videoPath"], "C:/out/video.mp4");

        let back: Pipe = serde_json::from_value(value).expect("round trip");
        assert_eq!(
            back.last_generation,
            Some(LastGeneration {
                task_id: "t1".into(),
                video_path: "C:/out/video.mp4".into(),
                generated_at: 1_234_567_890,
                status: "done".into(),
            })
        );
    }

    /// Session duplication must re-mint every piece id so the copy's composer
    /// never shares keys with the source (Svelte 5 each_key_duplicate), while
    /// carrying the layout/params forward AND the last-generation state
    /// (re-rooted via the remap so the copy's previews point at its own media
    /// tree after the media copy).
    #[test]
    fn pipe_rekeyed_mints_new_ids_and_drops_artifacts() {
        let pipe = Pipe {
            id: "p1".into(),
            name: "Pipe 1".into(),
            length_frames: 241,
            q_value: 19,
            c_value: 8.0,
            keyframes: vec![Keyframe {
                id: "k1".into(),
                frame: 16,
                slot_index: 1,
                kind: "txt2img".into(),
                image_src: None,
                prompt: Some("a dragon".into()),
                reference_url: None,
                preview_remote_url: Some("https://example.com/dragon.png".into()),
                preview_local_path: Some("C:/media/dragon.png".into()),
                status: "done".into(),
                force_regen: true,
            }],
            subject_references: vec![SubjectReference::new(
                "https://example.com/ref.jpg".into(),
                true,
            )],
            elements: vec![PipeElement::Timeline(TimelineElement {
                id: "t1".into(),
                segments: vec![Segment {
                    id: "s1".into(),
                    frame_start: 0,
                    frame_end: 8,
                    tags: vec![TagElement {
                        id: "g1".into(),
                        tag: TagType::Camera,
                        frame_start: 0,
                        frame_end: 8,
                        value: 0.5,
                        prompt: Some("slow zoom".into()),
                        spec: None,
                    }],
                }],
            })],
            order_index: 3,
            last_generation: Some(LastGeneration {
                task_id: "t9".into(),
                video_path: "C:/out/video.mp4".into(),
                generated_at: 1_234,
                status: "done".into(),
            }),
            media_mode: "reference".into(),
        };
        // no remapping (identical path) — ids still minted, artifacts carried.
        let copy = pipe.rekeyed(&|p: &str| p.to_string());
        // New ids at every level.
        assert_ne!(copy.id, "p1");
        assert_ne!(copy.keyframes[0].id, "k1");
        // Layout + params carried forward.
        assert_eq!(copy.name, "Pipe 1");
        assert_eq!(copy.length_frames, 241);
        assert_eq!(copy.q_value, 19);
        assert_eq!(copy.order_index, 3);
        assert_eq!(copy.media_mode, "reference");
        assert_eq!(copy.keyframes[0].prompt.as_deref(), Some("a dragon"));
        assert_eq!(copy.keyframes[0].frame, 16);
        let tl = copy
            .elements
            .iter()
            .find_map(|el| match el {
                PipeElement::Timeline(t) => Some(t),
                _ => None,
            })
            .expect("timeline element preserved");
        assert_ne!(tl.id, "t1");
        assert_eq!(tl.segments[0].tags[0].prompt.as_deref(), Some("slow zoom"));
        assert_ne!(tl.segments[0].id, "s1");
        assert_ne!(tl.segments[0].tags[0].id, "g1");
        // Last-generation state IS carried, re-rooted via the remap (identity
        // here), with a fresh piece but the same task reference.
        let lg = copy.last_generation.as_ref().expect("last gen carried");
        assert_eq!(lg.task_id, "t9");
        assert_eq!(lg.status, "done");
        // Keyframe preview carried + status kept; force_regen always resets.
        assert_eq!(
            copy.keyframes[0].preview_remote_url.as_deref(),
            Some("https://example.com/dragon.png")
        );
        assert_eq!(
            copy.keyframes[0].preview_local_path.as_deref(),
            Some("C:/media/dragon.png")
        );
        assert_eq!(copy.keyframes[0].status, "done");
        assert!(!copy.keyframes[0].force_regen);

        // A real remap re-roots local paths into the destination session dir.
        let re = pipe.rekeyed(&|p: &str| p.replace("C:/", "D:/copy/"));
        let re_lg = re.last_generation.as_ref().unwrap();
        assert_eq!(re_lg.video_path, "D:/copy/out/video.mp4");
        assert_eq!(
            re.keyframes[0].preview_local_path.as_deref(),
            Some("D:/copy/media/dragon.png")
        );
        assert_eq!(
            re.keyframes[0].preview_local_path.as_deref(),
            Some("D:/copy/media/dragon.png")
        );
    }
}
