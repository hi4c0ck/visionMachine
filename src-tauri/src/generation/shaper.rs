//! Request shapers (docs/provider-engine-tasks.md, Phase C).
//!
//! One pure payload builder per `requestFormat`. (spec, stage data) ->
//! `serde_json::Value`. No HTTP, no IO — fully unit-testable.
//!
//! The "stage data" is a per-stage context built by the registry from the
//! pipe media snapshot (keyframes + subjects + media mode), plus the
//! finished image outputs feeding the video stage.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::generation::specs::ModelSpecWire;

/// One upstream image output feeding the video stage, in stable order:
/// keyframes (slot order) then subjects (pipe order). The `<Picture N>`
/// numbering (O5) is defined by this order.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpstreamOutput {
    /// keyframe id / subject ref id.
    pub source_id: String,
    /// "keyframe" | "subject".
    pub kind: String,
    /// Primary source for the video API: a fetchable remote URL when the
    /// provider returned one; the local media-tree path otherwise. The
    /// shaper sends this value to the provider.
    #[serde(default, alias = "local_path")]
    pub primary: String,
    /// Fallback source (local media-tree file). The provider engine can
    /// base64-encode this if the remote primary is unreachable. Always
    /// present for generated pieces; mirrors `primary` for `url` pieces.
    #[serde(default)]
    pub local_path: String,
}

/// Per-stage context the shapers consume. One instance is built by the
/// registry for each engine stage before the shaper runs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageContext {
    /// The final prompt string (video stage) or the piece's own prompt
    /// (image stages — O1: no pipe-prompt fallback).
    pub prompt: String,
    /// Pipe-level frame count (8n+1, guaranteed by the pre-check; E6).
    #[serde(default)]
    pub length_frames: u32,
    /// Pipe-level fps.
    pub fps: u32,
    pub resolution: String,
    pub orientation: String,
    /// Pipe cValue; the shaper sends it under the spec's `guidance` param
    /// name only when set (E7).
    pub c_value: f32,
    /// Pipe qValue (inference steps). Logged only for Agnes video (Q4).
    #[serde(default)]
    pub q_value: u32,
    /// Reproducibility seed; sent only when the spec `supports_seed`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
    /// Stage kind: "keyframe" | "subject" | "video".
    pub source_kind: String,
    /// keyframe slot index / subject ordinal / pipe id.
    pub source_id: String,
    /// Piece's image type: "url" | "txt2img" | "img2img" (image stages only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_type: Option<String>,
    /// img2img reference URL (image stages only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference_url: Option<String>,
    /// Pipe media mode: "keyframes" | "reference" (video stage).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_mode: Option<String>,
    /// Finished image-stage outputs feeding the video stage, in stable order
    /// (keyframes slot order then subjects pipe order). `<Picture N>` = the
    /// Nth subject's position in this list (O5).
    #[serde(default)]
    pub upstream: Vec<UpstreamOutput>,
}

/// Dispatch on the spec's `requestFormat` and build the wire payload.
/// `None` (unknown format / pending) → `Err` with a concrete message.
pub fn shape_request(spec: &ModelSpecWire, ctx: &StageContext) -> Result<Value, String> {
    match spec.request_format.as_str() {
        "image-gen" => Ok(shape_image_gen(spec, ctx)),
        "video-job-frames" => Ok(shape_video_job_frames(spec, ctx)),
        "video-job-seconds" => Ok(shape_video_job_seconds(spec, ctx)),
        "video-job" => Ok(shape_video_job_generic(spec, ctx)),
        "chat" => Ok(shape_chat(spec, ctx)),
        other => Err(format!(
            "unsupported request format '{}' (model {})",
            other, spec.id
        )),
    }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/// E5/E6: round to 1 decimal, clamp to `[lo, hi]`, return as a fixed-1-decimal
/// string (seconds-based video models take a STRING like `"5.0"`).
pub fn format_seconds(frames: u32, fps: u32, range: Option<[f64; 2]>) -> String {
    let raw = frames as f64 / fps.max(1) as f64;
    let clamped = match range {
        Some([lo, hi]) => raw.clamp(lo, hi),
        None => raw,
    };
    // 1 decimal, always shown (e.g. 5 -> "5.0").
    format!("{:.1}", clamped)
}

/// E2/catalog URL option (a): substitute `{videoId}` / `{model}` in the
/// poll template.
pub fn substitute_poll_template(template: &str, video_id: &str, model: &str) -> String {
    template
        .replace("{videoId}", video_id)
        .replace("{model}", model)
}

/// Clamp a value into a `[lo, hi]` range.
pub fn clamp_to_range<T: PartialOrd + Copy>(v: T, lo: T, hi: T) -> T {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

/// E8: read `limits.size_map[resolution]`; `None` → omit the param.
pub fn pick_image_size(spec: &ModelSpecWire, resolution: &str) -> Option<String> {
    spec.limits
        .size_map
        .as_ref()
        .and_then(|m| m.get(resolution))
        .cloned()
}

/// E8: read `limits.ratio_map[orientation]`; `None` → omit the param.
pub fn pick_ratio(spec: &ModelSpecWire, orientation: &str) -> Option<String> {
    spec.limits
        .ratio_map
        .as_ref()
        .and_then(|m| m.get(orientation))
        .cloned()
}

/// Seed only when the spec supports it AND a value was provided (E-seed).
fn seed_value(spec: &ModelSpecWire, ctx: &StageContext) -> Option<i64> {
    spec.supports_seed().then(|| ctx.seed).flatten()
}

/// cValue under the spec's `guidance` param name, only when the flag is set
/// (E7). Absent → the value is logged only, never sent.
fn guidance_value(spec: &ModelSpecWire, ctx: &StageContext) -> Option<(String, f32)> {
    spec.guidance.clone().map(|name| (name, ctx.c_value))
}

// ── `image-gen` (agnes image 2.5-flash / 2.1-flash) ────────────────────────

fn shape_image_gen(spec: &ModelSpecWire, ctx: &StageContext) -> Value {
    let mut extra_body = json!({ "response_format": "url" });
    // PITFALL (catalog-locked): response_format lives INSIDE extra_body,
    // never top-level (top-level → HTTP 400).
    // img2img: extra_body.image = [referenceUrl] (public URL; Data-URI
    // deferred per Q8).
    if let Some(ref_url) = &ctx.reference_url {
        extra_body["image"] = json!([ref_url]);
    }
    let mut payload = json!({
        "model": spec.id,
        "prompt": ctx.prompt,
        "extra_body": extra_body,
    });
    if let Some(size) = pick_image_size(spec, &ctx.resolution) {
        payload["size"] = json!(size);
    }
    if let Some(ratio) = pick_ratio(spec, &ctx.orientation) {
        payload["ratio"] = json!(ratio);
    }
    if let Some((name, val)) = guidance_value(spec, ctx) {
        payload[name] = json!(val);
    }
    payload
}

// ── `video-job-frames` (agnes-video-v2.0 — fps-native) ────────────────────

/// Collect the merged media URLs for a frames-based video stage: keyframe
/// URLs (slot order) + subject URLs, respecting the spec's shared-array cap.
/// Returns `(first_image_option, image_array_option)` for the 0/1/2-3
/// branches (O3).
fn frames_media(spec: &ModelSpecWire, ctx: &StageContext) -> (Option<String>, Option<Vec<String>>) {
    // Upstream is a stable Vec: keyframes (slot order) then subjects (pipe
    // order). The <Picture N> numbering (O5) follows this list.
    let cap = spec
        .media
        .as_ref()
        .and_then(|m| m.max_keyframes.or(m.max_refs))
        .unwrap_or(3) as usize;
    let urls: Vec<String> = ctx
        .upstream
        .iter()
        .filter(|u| !u.primary.is_empty())
        .take(cap)
        .map(|u| u.primary.clone())
        .collect();
    match urls.len() {
        0 => (None, None),
        1 => (Some(urls[0].clone()), None),
        _ => (None, Some(urls)),
    }
}

fn shape_video_job_frames(spec: &ModelSpecWire, ctx: &StageContext) -> Value {
    let num_frames = ctx.length_frames; // E6: 8n+1 guaranteed by pre-check
    let (first_image, image_array) = frames_media(spec, ctx);

    let refs_total = ctx
        .upstream
        .iter()
        .filter(|u| !u.primary.is_empty())
        .count();
    // Mode selection (O3): 0 refs -> ti2vid (text-only); 1 ref -> ti2vid +
    // top-level image; 2-3 refs -> keyframes + extra_body.image + mode.
    let mut payload = json!({
        "model": spec.id,
        "prompt": ctx.prompt,
        "num_frames": num_frames,
        "frame_rate": ctx.fps,
    });

    match refs_total {
        0 => {
            payload["mode"] = json!("ti2vid");
        }
        1 => {
            payload["mode"] = json!("ti2vid");
            if let Some(url) = &first_image {
                payload["image"] = json!(url);
            }
        }
        _ => {
            payload["mode"] = json!("keyframes");
            if let Some(arr) = &image_array {
                let mut extra = json!({ "mode": "keyframes" });
                extra["image"] = json!(arr);
                payload["extra_body"] = extra;
            }
        }
    }

    // width/height + num_inference_steps are OMITTED (O4: server defaults).
    if let Some((name, val)) = guidance_value(spec, ctx) {
        payload[name] = json!(val);
    }
    if let Some(seed) = seed_value(spec, ctx) {
        payload["seed"] = json!(seed);
    }
    payload
}

// ── `video-job-seconds` (agnes-video-2.5-flash, and 2.5 paid later) ───────

fn shape_video_job_seconds(spec: &ModelSpecWire, ctx: &StageContext) -> Value {
    let mode = ctx.media_mode.as_deref().unwrap_or("keyframes");
    let mode_wire = match mode {
        "keyframes" => "keyframe",
        "reference" => "reference",
        _ => "text",
    };

    let mut payload = json!({
        "model": spec.id,
        "prompt": ctx.prompt,
        "mode": mode_wire,
        "seconds": format_seconds(ctx.length_frames, ctx.fps, spec.limits.seconds),
        "n": 1,
    });

    // size: 2.5-flash only accepts "720P" (catalog sizeMap maps every
    // session resolution to it); other seconds models use their own tiers.
    if let Some(size) = pick_image_size(spec, &ctx.resolution) {
        payload["size"] = json!(size);
    }
    if let Some(ratio) = pick_ratio(spec, &ctx.orientation) {
        payload["aspect_ratio"] = json!(ratio);
    }

    // Mode-specific media fields. The `keyframe` mode forbids images/audios/
    // videos (400 if present); `reference` uses images[]/audios[]; `text`
    // uses none (catalog mode rules).
    match mode_wire {
        "keyframe" => {
            let kfs: Vec<&String> = ctx
                .upstream
                .iter()
                .filter(|u| !u.primary.is_empty())
                .map(|u| &u.primary)
                .take(2) // first_frame / last_frame (maxKeyframes=2)
                .collect();
            if !kfs.is_empty() {
                payload["first_frame"] = json!(kfs[0]);
            }
            if kfs.len() > 1 {
                payload["last_frame"] = json!(kfs[1]);
            }
        }
        "reference" => {
            let cap = spec.media.as_ref().and_then(|m| m.max_refs).unwrap_or(5) as usize;
            let imgs: Vec<String> = ctx
                .upstream
                .iter()
                .filter(|u| !u.primary.is_empty())
                .take(cap)
                .map(|u| u.primary.clone())
                .collect();
            if !imgs.is_empty() {
                payload["images"] = json!(imgs);
            }
        }
        _ => {}
    }

    if let Some((name, val)) = guidance_value(spec, ctx) {
        payload[name] = json!(val);
    }
    if let Some(seed) = seed_value(spec, ctx) {
        payload["seed"] = json!(seed);
    }
    payload
}

// ── `video-job` (custom OpenAI-shape) & `chat` ─────────────────────────────

fn shape_video_job_generic(spec: &ModelSpecWire, ctx: &StageContext) -> Value {
    // Best-effort generic; stays `pending` in the catalog until a concrete
    // model lands.
    json!({
        "model": spec.id,
        "prompt": ctx.prompt,
        "num_frames": ctx.length_frames,
        "frame_rate": ctx.fps,
    })
}

/// Inert container for the future prompt-summarizer engine (Q9). Not wired
/// into generation.
fn shape_chat(spec: &ModelSpecWire, ctx: &StageContext) -> Value {
    json!({
        "model": spec.id,
        "messages": [{ "role": "user", "content": ctx.prompt }]
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::specs::{ModelSpecLimits, ModelSpecMedia, ModelSpecWire};

    fn spec(fmt: &str, extra: fn(&mut ModelSpecWire)) -> ModelSpecWire {
        let mut s = ModelSpecWire {
            id: "m".into(),
            kind: "video".into(),
            endpoint: "/e".into(),
            sync: false,
            poll_endpoint: None,
            request_format: fmt.into(),
            limits: ModelSpecLimits::default(),
            pending: None,
            label: None,
            read_only: None,
            supports_seed: None,
            guidance: None,
            media: None,
        };
        extra(&mut s);
        s
    }

    fn ctx(mut f: impl FnMut(&mut StageContext)) -> StageContext {
        let mut c = StageContext {
            prompt: "p".into(),
            length_frames: 121,
            fps: 24,
            resolution: "720p".into(),
            orientation: "horizontal".into(),
            c_value: 7.0,
            q_value: 18,
            seed: None,
            source_kind: "video".into(),
            source_id: "p1".into(),
            image_type: None,
            reference_url: None,
            media_mode: None,
            upstream: Vec::new(),
        };
        f(&mut c);
        c
    }

    fn up(kind: &str, source_id: &str, path: &str) -> UpstreamOutput {
        UpstreamOutput {
            source_id: source_id.into(),
            kind: kind.into(),
            primary: path.into(),
            local_path: String::new(),
        }
    }

    // ── image-gen ─────────────────────────────────────────────────────────

    #[test]
    fn image_gen_response_format_inside_extra_body_with_maps() {
        let s = spec("image-gen", |m| {
            m.id = "agnes-image-2.5-flash".into();
            m.limits.size_map = Some(std::collections::HashMap::from([(
                "720p".to_string(),
                "1K".to_string(),
            )]));
            m.limits.ratio_map = Some(std::collections::HashMap::from([(
                "horizontal".to_string(),
                "16:9".to_string(),
            )]));
        });
        let p = shape_request(&s, &ctx(|_| {})).unwrap();
        assert_eq!(p["model"], "agnes-image-2.5-flash");
        assert_eq!(p["extra_body"]["response_format"], "url");
        // PITFALL: response_format is NEVER top-level.
        assert!(p.get("response_format").is_none());
        assert_eq!(p["size"], "1K");
        assert_eq!(p["ratio"], "16:9");
    }

    #[test]
    fn image_gen_omits_size_ratio_when_maps_absent() {
        let s = spec("image-gen", |m| {
            m.id = "img".into();
        });
        let p = shape_request(&s, &ctx(|_| {})).unwrap();
        assert!(p.get("size").is_none());
        assert!(p.get("ratio").is_none());
    }

    #[test]
    fn image_gen_img2img_reference_url_in_extra_body() {
        let s = spec("image-gen", |m| m.id = "img".into());
        let c = ctx(|c| c.reference_url = Some("https://a.com/ref.png".into()));
        let p = shape_request(&s, &c).unwrap();
        assert_eq!(p["extra_body"]["image"][0], "https://a.com/ref.png");
        assert_eq!(p["extra_body"]["response_format"], "url");
    }

    #[test]
    fn image_gen_guidance_gated_by_spec_flag() {
        let without = spec("image-gen", |m| m.id = "img".into());
        assert!(shape_request(&without, &ctx(|_| {}))
            .unwrap()
            .get("guidance_scale")
            .is_none());

        let with = spec("image-gen", |m| {
            m.id = "img".into();
            m.guidance = Some("guidance_scale".into());
        });
        let p = shape_request(&with, &ctx(|_| {})).unwrap();
        assert_eq!(p["guidance_scale"], 7.0);
    }

    // ── video-job-frames (0/1/2–3 media branches) ────────────────────────

    fn frames_spec() -> ModelSpecWire {
        spec("video-job-frames", |m| {
            m.id = "agnes-video-v2.0".into();
            m.limits.max_frames = Some(441);
            m.supports_seed = Some(true);
            m.media = Some(ModelSpecMedia {
                modes: vec!["keyframes".into()],
                dual: None,
                shared_array: Some(true),
                max_keyframes: Some(3),
                max_refs: Some(3),
                max_audios: None,
                max_videos: None,
            });
        })
    }

    #[test]
    fn frames_zero_refs_text_only_ti2vid() {
        let p = shape_request(&frames_spec(), &ctx(|c| c.upstream = vec![])).unwrap();
        assert_eq!(p["mode"], "ti2vid");
        assert_eq!(p["num_frames"], 121);
        assert_eq!(p["frame_rate"], 24);
        assert!(p.get("image").is_none());
        assert!(p.get("extra_body").is_none());
    }

    #[test]
    fn frames_one_ref_ti2vid_plus_top_level_image() {
        let c = ctx(|c| c.upstream = vec![up("keyframe", "k1", "https://a.com/k1.png")]);
        let p = shape_request(&frames_spec(), &c).unwrap();
        assert_eq!(p["mode"], "ti2vid");
        assert_eq!(p["image"], "https://a.com/k1.png");
        assert!(p.get("extra_body").is_none());
    }

    #[test]
    fn frames_two_three_refs_keyframes_extra_body() {
        let c = ctx(|c| {
            c.upstream = vec![
                up("keyframe", "k1", "https://a.com/k1.png"),
                up("keyframe", "k2", "https://a.com/k2.png"),
                up("subject", "s1", "https://a.com/s1.png"),
            ];
        });
        let p = shape_request(&frames_spec(), &c).unwrap();
        assert_eq!(p["mode"], "keyframes");
        assert_eq!(p["extra_body"]["mode"], "keyframes");
        assert_eq!(p["extra_body"]["image"].as_array().unwrap().len(), 3);
        assert!(p.get("image").is_none());
    }

    #[test]
    fn frames_seed_and_guidance_gating() {
        let s = frames_spec();
        let c = ctx(|c| c.seed = Some(42));
        let p = shape_request(&s, &c).unwrap();
        assert_eq!(p["seed"], 42);
        assert!(p.get("guidance_scale").is_none());

        let s2 = spec("video-job-frames", |m| {
            m.id = "agnes-video-v2.0".into();
            m.guidance = Some("guidance_scale".into());
        });
        assert_eq!(shape_request(&s2, &c).unwrap()["guidance_scale"], 7.0);
    }

    #[test]
    fn frames_8n1_passthrough_no_snap() {
        let c = ctx(|c| c.length_frames = 441);
        let p = shape_request(&frames_spec(), &c).unwrap();
        assert_eq!(p["num_frames"], 441);
    }

    // ── video-job-seconds (mode field-exclusion + 1-dec + 720P) ──────────

    fn seconds_spec() -> ModelSpecWire {
        spec("video-job-seconds", |m| {
            m.id = "agnes-video-2.5-flash".into();
            m.limits.seconds = Some([4.0, 12.0]);
            m.limits.size_map = Some(std::collections::HashMap::from([
                ("480p".to_string(), "720P".to_string()),
                ("720p".to_string(), "720P".to_string()),
                ("1080p".to_string(), "720P".to_string()),
            ]));
            m.limits.ratio_map = Some(std::collections::HashMap::from([(
                "horizontal".to_string(),
                "16:9".to_string(),
            )]));
            m.supports_seed = Some(true);
            m.media = Some(ModelSpecMedia {
                modes: vec!["keyframes".into(), "reference".into()],
                dual: None,
                shared_array: None,
                max_keyframes: Some(2),
                max_refs: Some(5),
                max_audios: Some(3),
                max_videos: None,
            });
        })
    }

    #[test]
    fn seconds_keyframe_mode_first_last_no_images() {
        let c = ctx(|c| {
            c.media_mode = Some("keyframes".into());
            c.upstream = vec![
                up("keyframe", "k1", "https://a.com/k1.png"),
                up("keyframe", "k2", "https://a.com/k2.png"),
            ];
        });
        let p = shape_request(&seconds_spec(), &c).unwrap();
        assert_eq!(p["mode"], "keyframe");
        assert_eq!(p["first_frame"], "https://a.com/k1.png");
        assert_eq!(p["last_frame"], "https://a.com/k2.png");
        // keyframe mode forbids images/audios/videos fields.
        assert!(p.get("images").is_none());
        assert_eq!(p["size"], "720P");
        assert_eq!(p["aspect_ratio"], "16:9");
        assert_eq!(p["n"], 1);
    }

    #[test]
    fn seconds_reference_mode_images_only() {
        let c = ctx(|c| {
            c.media_mode = Some("reference".into());
            c.upstream = vec![
                up("subject", "s1", "https://a.com/s1.png"),
                up("subject", "s2", "https://a.com/s2.png"),
            ];
        });
        let p = shape_request(&seconds_spec(), &c).unwrap();
        assert_eq!(p["mode"], "reference");
        assert_eq!(p["images"].as_array().unwrap().len(), 2);
        assert!(p.get("first_frame").is_none());
        assert!(p.get("last_frame").is_none());
    }

    #[test]
    fn seconds_text_mode_no_media_fields() {
        let c = ctx(|c| {
            c.media_mode = Some("keyframes".into());
            c.upstream = vec![]; // no media -> text
        });
        let p = shape_request(&seconds_spec(), &c).unwrap();
        assert_eq!(p["mode"], "keyframe");
        assert!(p.get("first_frame").is_none());
        assert!(p.get("last_frame").is_none());
    }

    #[test]
    fn seconds_one_decimal_clamped() {
        let c = ctx(|c| {
            c.length_frames = 61;
            c.fps = 24;
            c.media_mode = Some("keyframes".into());
        });
        let p = shape_request(&seconds_spec(), &c).unwrap();
        // 61/24 = 2.54 -> clamped to 4.0
        assert_eq!(p["seconds"], "4.0");

        let c2 = ctx(|c| {
            c.length_frames = 300;
            c.fps = 24;
            c.media_mode = Some("keyframes".into());
        });
        assert_eq!(
            shape_request(&seconds_spec(), &c2).unwrap()["seconds"],
            "12.0"
        );
    }

    #[test]
    fn seconds_seed_gated() {
        let noseed = seconds_spec();
        let c = ctx(|c| c.media_mode = Some("keyframes".into()));
        assert!(shape_request(&noseed, &c).unwrap().get("seed").is_none());

        let c2 = ctx(|c| {
            c.media_mode = Some("keyframes".into());
            c.seed = Some(7);
        });
        assert_eq!(shape_request(&noseed, &c2).unwrap()["seed"], 7);
    }

    // ── generic + chat ─────────────────────────────────────────────────────

    #[test]
    fn generic_video_job_minimal() {
        let s = spec("video-job", |m| m.id = "custom-video".into());
        let p = shape_request(&s, &ctx(|_| {})).unwrap();
        assert_eq!(p["model"], "custom-video");
        assert_eq!(p["num_frames"], 121);
    }

    #[test]
    fn chat_inert_container() {
        let s = spec("chat", |m| m.id = "agnes-2.5-flash".into());
        let p = shape_request(&s, &ctx(|_| {})).unwrap();
        assert_eq!(p["messages"][0]["role"], "user");
        assert_eq!(p["messages"][0]["content"], "p");
    }

    // ── shared helper unit tests ──────────────────────────────────────────

    #[test]
    fn helper_format_seconds_one_decimal() {
        assert_eq!(format_seconds(121, 24, None), "5.0");
        assert_eq!(format_seconds(61, 24, Some([4.0, 12.0])), "4.0");
        assert_eq!(format_seconds(300, 24, Some([4.0, 12.0])), "12.0");
    }

    #[test]
    fn helper_substitute_poll_template() {
        assert_eq!(
            substitute_poll_template(
                "/agnesapi?video_id={videoId}&model_name={model}",
                "vid-1",
                "agnes-video-2.5-flash"
            ),
            "/agnesapi?video_id=vid-1&model_name=agnes-video-2.5-flash"
        );
    }

    #[test]
    fn helper_clamp_to_range() {
        assert_eq!(clamp_to_range(2f64, 4.0, 12.0), 4.0);
        assert_eq!(clamp_to_range(15f64, 4.0, 12.0), 12.0);
        assert_eq!(clamp_to_range(8f64, 4.0, 12.0), 8.0);
    }
}
