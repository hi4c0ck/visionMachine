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
    /// Experimental "compose pipes" boundary-trim: when this pipe's switch is
    /// ON and the master gate (settings.experimental.composePipes) is on, the
    /// session-video compose drops BOUNDARY_TRIM_FRAMES (one 8n+1 interval)
    /// off this pipe's clip head so the splice lands in stable content. Pipe
    /// 0 (the session's first) is never offered the toggle — there's nothing
    /// to trim before it. Persisted per pipe (the Keyframe/Subject modal
    /// toggles it); absent/legacy rows default to false (classic lossless
    /// splice).
    #[serde(default)]
    pub trim_boundary: bool,
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

/// A keyframe is "settled" when it already carries a usable image: a
/// non-empty direct source (a remote url or a caught `data:` uri) OR a
/// settled generated-preview pair. This mirrors the frontend
/// `refDotState === 'ready'` so the session auto-catch's overwrite decision is
/// tied to each pipe's OWN settled setup rather than a blanket flag.
fn keyframe_settled(kf: &Keyframe) -> bool {
    let has_src = kf
        .image_src
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if has_src {
        return true;
    }
    kf.preview_remote_url
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        || kf.preview_local_path
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false)
}

impl Pipe {
    /// Does this pipe already own a SETTLED slot-1 keyframe (one with a usable
    /// image)? The session auto-catch inspects this PER PIPE to decide:
    /// - not settled (or missing) → create the first keyframe from the previous
    ///   pipe's last frame;
    /// - settled → overwrite only when the run's force flag is set.
    pub fn has_settled_slot1(&self) -> bool {
        self.keyframes
            .iter()
            .find(|k| k.slot_index == 1)
            .map(|k| keyframe_settled(k))
            .unwrap_or(false)
    }

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
            trim_boundary: false,
        }
    }

    /// Upsert the slot-1 keyframe with a caught last-frame image source
    /// (a base64 `data:` URI — provider-ready). The decision is tied to THIS
    /// pipe's own setup, via `has_settled_slot1`:
    /// - slot-1 NOT settled (missing, or a preset with no usable image yet) →
    ///   the caught frame is written: a missing slot is created, or an existing
    ///   non-settled one is repointed. This is the auto-catch "create the
    ///   first keyframe" default — no force needed.
    /// - slot-1 IS settled → it is left untouched UNLESS `force` is set for
    ///   this pipe; when forced, the caught frame overwrites it.
    /// Returns `true` when a keyframe was written (the caller persists).
    pub fn upsert_slot1_image(&mut self, image_src: &str, force: bool) -> bool {
        let settled = self.has_settled_slot1();
        if settled && !force {
            // A settled first keyframe is only replaced when the run forces it
            // for THIS pipe.
            return false;
        }
        if let Some(kf) = self.keyframes.iter_mut().find(|k| k.slot_index == 1) {
            kf.kind = "url".to_string();
            kf.image_src = Some(image_src.to_string());
            kf.reference_url = None;
            kf.preview_remote_url = None;
            kf.preview_local_path = None;
            kf.status = "pending".to_string();
            kf.force_regen = false;
            return true;
        }
        // No slot-1 yet: create it at frame 0 (the first frame).
        self.keyframes.push(Keyframe {
            id: uuid::Uuid::new_v4().to_string(),
            frame: 0,
            slot_index: 1,
            kind: "url".to_string(),
            image_src: Some(image_src.to_string()),
            prompt: None,
            reference_url: None,
            preview_remote_url: None,
            preview_local_path: None,
            status: "pending".to_string(),
            force_regen: false,
        });
        true
    }

    /// Clone this pipe with brand-new ids for every level (pipe, keyframes,
    /// subject refs, elements, segments, tags) while carrying the DESIGN
    /// content forward (name, layout params, prompts, user-provided URLs,
    /// media mode). Generation artifacts are NOT carried: previews, piece
    /// statuses and last-generation state reset to blank, so the copy is a
    /// clean fork with a completely fresh id set — the source's media tree
    /// stays untouched, and the copy's own runs mint artifacts that belong
    /// to it alone. The id remint is what prevents Svelte 5
    /// each_key_duplicate when the two sessions later diverge.
    pub fn rekeyed(&self) -> Self {
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
                    // Generation artifacts stay with the source session: the
                    // copy's pieces start ungenerated and mint their own
                    // previews on their own media tree.
                    preview_remote_url: None,
                    preview_local_path: None,
                    status: "pending".into(),
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
                    preview_remote_url: None,
                    preview_local_path: None,
                    status: "pending".into(),
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
            // The copy has no generation history of its own yet — its first
            // run will mint a fresh last-generation state.
            last_generation: None,
            media_mode: self.media_mode.clone(),
            // The boundary-trim switch is per-pipe setup: the copy keeps the
            // source's trim choice so its compose splices the same way.
            trim_boundary: self.trim_boundary,
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
    /// 0012: how already-generated clips are normalized to the session
    /// target at compose time. "center" | "fit" | "top" | "bottom" |
    /// "exact" | "none". Defaults "center" (the historical lossless-ish
    /// behavior when sizes already match).
    #[serde(default = "default_crop_mode")]
    pub crop_mode: String,
    /// 0012: optional custom session target size (W x H). Present only when
    /// BOTH are set and valid; a partial pair is treated as unset by
    /// `target_dims`. Absent on legacy blobs (defaults None).
    #[serde(default)]
    pub custom_width: Option<u32>,
    #[serde(default)]
    pub custom_height: Option<u32>,
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
pub fn default_crop_mode() -> String {
    "center".to_string()
}

impl ComposerConfig {
    /// A new composer for a session. Invariant: `id` equals `session_id` —
    /// the frontend session-io treats the composer's `id` as the session
    /// identifier, so a random UUID here would orphan the session's
    /// composer from its load path (a `get_composer` for the stray uuid
    /// finds neither a composer row nor a session row → "Untitled
    /// Composer" with empty pipes).
    pub fn new(session_id: &str, name: &str) -> Self {
        let now = Utc::now();
        Self {
            id: session_id.to_string(),
            session_id: session_id.to_string(),
            name: name.to_string(),
            pipes: vec![Pipe::new("Pipe 1", 121)],
            fps: 24,
            resolution: default_resolution(),
            orientation: default_orientation(),
            crop_mode: default_crop_mode(),
            custom_width: None,
            custom_height: None,
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
            trim_boundary: false,
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
    /// never shares keys with the source (Svelte 5 each_key_duplicate),
    /// carrying the design forward but NOT the generation artifacts: a copy
    /// starts blank (no previews, no last-generation state, pending pieces)
    /// so nothing is re-rooted from the source's media tree.
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
            trim_boundary: false,
        };
        // Ids minted at every level; the copy starts artifact-free.
        let copy = pipe.rekeyed();
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
        // User-provided content survives (the copy re-references it).
        assert_eq!(
            copy.subject_references[0].image_url.as_str(),
            "https://example.com/ref.jpg"
        );
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
        // Generation artifacts do NOT carry: the copy starts blank — no last
        // generation, no previews, all pieces pending (its own runs will
        // mint artifacts on its own media tree).
        assert!(
            copy.last_generation.is_none(),
            "the copy has no generation history of its own yet"
        );
        assert!(copy.keyframes[0].preview_remote_url.is_none());
        assert!(copy.keyframes[0].preview_local_path.is_none());
        assert_eq!(copy.keyframes[0].status, "pending");
        assert!(!copy.keyframes[0].force_regen);
        assert!(copy.subject_references[0].preview_remote_url.is_none());
        assert_eq!(copy.subject_references[0].status, "pending");
    }

    // `has_settled_slot1` — the per-pipe readiness check the auto-catch keys
    // off: a slot-1 with a usable image (direct source or settled preview).
    #[test]
    fn has_settled_slot1_tracks_readiness() {
        // No slot-1 at all -> not settled.
        let mut p = Pipe::new("P", 121);
        assert!(!p.has_settled_slot1());

        // An empty slot-1 (pending, no source/preview) -> not settled.
        let mut empty_kf = Keyframe::new(1, 0);
        p.keyframes.push(empty_kf);
        assert!(!p.has_settled_slot1(), "an empty slot-1 is not settled");

        // A slot-1 with a direct source -> settled.
        let mut settled = Pipe::new("P", 121);
        let mut skf = Keyframe::new(1, 0);
        skf.image_src = Some("https://prepared.example/a.png".into());
        settled.keyframes.push(skf);
        assert!(settled.has_settled_slot1());

        // A slot-1 with only a settled generated preview -> settled.
        let mut prev = Pipe::new("P", 121);
        let mut pkf = Keyframe::new(1, 0);
        pkf.kind = "txt2img".into();
        pkf.preview_remote_url = Some("https://host/dragon.png".into());
        prev.keyframes.push(pkf);
        assert!(prev.has_settled_slot1(), "a settled generated preview counts");
    }

    // The session auto-catch upsert, driven PER PIPE by that pipe's own
    // settled slot-1: non-settled slots are filled by default; a settled slot
    // is only overwritten when this pipe's force flag is set.
    #[test]
    fn upsert_slot1_image_semantics() {
        let uri = "data:image/png;base64,AAA";

        // Empty pipe: creates slot-1 at frame 0 (not settled -> filled).
        let mut empty = Pipe::new("P", 121);
        assert!(empty.upsert_slot1_image(uri, false), "a missing slot-1 must be filled");
        assert_eq!(empty.keyframes.len(), 1);
        assert_eq!(empty.keyframes[0].slot_index, 1);
        assert_eq!(empty.keyframes[0].image_src.as_deref(), Some(uri));
        assert_eq!(empty.keyframes[0].kind, "url");
        assert_eq!(empty.keyframes[0].status, "pending");

        // An existing but UNSETTLED slot-1 (a pending txt2img preset with no
        // source/preview yet) is repointed even without force — that's the
        // "create the first keyframe" default.
        let mut unsettled = Pipe::new("P", 121);
        let mut u_kf = Keyframe::new(1, 0);
        u_kf.kind = "txt2img".into();
        u_kf.prompt = Some("a dragon".into());
        unsettled.keyframes.push(u_kf);
        assert!(!unsettled.has_settled_slot1());
        assert!(
            unsettled.upsert_slot1_image(uri, false),
            "an unsettled slot-1 is created from the caught frame without force"
        );
        assert_eq!(unsettled.keyframes[0].image_src.as_deref(), Some(uri));
        assert_eq!(unsettled.keyframes[0].kind, "url");

        // A SETTLED slot-1 with force=false is left untouched.
        let mut prepared = Pipe::new("P", 121);
        let mut prepared_kf = Keyframe::new(1, 0);
        prepared_kf.image_src = Some("https://prepared.example/a.png".into());
        prepared.keyframes.push(prepared_kf);
        assert!(prepared.has_settled_slot1());
        assert!(!prepared.upsert_slot1_image(uri, false), "a settled slot-1 must not be clobbered without force");
        assert_eq!(prepared.keyframes[0].image_src.as_deref(), Some("https://prepared.example/a.png"));

        // The same settled slot-1 with force=true IS repointed to the caught frame.
        assert!(prepared.upsert_slot1_image(uri, true), "a forced upsert overwrites the settled slot-1");
        assert_eq!(prepared.keyframes[0].image_src.as_deref(), Some(uri));
        assert_eq!(prepared.keyframes[0].kind, "url");
        assert!(prepared.keyframes[0].preview_remote_url.is_none());
        assert!(prepared.keyframes[0].preview_local_path.is_none());
        assert_eq!(prepared.keyframes[0].status, "pending");
    }
}
