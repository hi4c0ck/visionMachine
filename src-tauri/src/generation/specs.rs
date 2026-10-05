//! Model spec wire mirror (docs/provider-engine-tasks.md, Phase A).
//!
//! The frontend owns the model catalog (specs are DATA in
//! `src/lib/settings/catalog.ts`); this is the serde mirror of the subset
//! the engine consumes, handed over with `start_generation`. No secrets,
//! ever — the API key is read from the per-profile settings blob at
//! request time only (E1/E2). Unknown fields are skipped so old callers
//! keep working.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpecLimits {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fps: Option<Vec<u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolutions: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_frames: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seconds: Option<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ratios: Option<Vec<String>>,
    /// E8: session resolution → size tier (absent → param omitted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_map: Option<std::collections::HashMap<String, String>>,
    /// E8: session orientation → aspect ratio (absent → param omitted).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ratio_map: Option<std::collections::HashMap<String, String>>,
}

impl Default for ModelSpecLimits {
    fn default() -> Self {
        Self {
            fps: None,
            resolutions: None,
            max_frames: None,
            seconds: None,
            ratios: None,
            size_map: None,
            ratio_map: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpecMedia {
    #[serde(default)]
    pub modes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dual: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_array: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_keyframes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_refs: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_audios: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_videos: Option<u32>,
    /// Wire values of the `mode` param per logical media mode (keys are the
    /// frontend mode names: "keyframes" / "reference" / "text"). Models
    /// served through provider routes with different mode-name families
    /// (V2.0 legacy route: ti2vid/keyframes/multi_reference) declare the
    /// translation here; absent → the shaper falls back to the logical
    /// name (2.5-route behavior).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wire_modes: Option<std::collections::HashMap<String, String>>,
    /// Reference-image floor for the reference (multi_reference) wire mode
    /// (V2.0 legacy route: 2 — live 400 2026-10-04 "mode=multi_reference
    /// requires at least 2 images when background_image is omitted"). Below
    /// the floor the shaper falls back to the text-mode wire value; a single
    /// image (if any) rides the top-level `image` field instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_refs: Option<u32>,
    /// Keyframe-image floor for the keyframes wire mode (V2.0 legacy
    /// route: 2 — live 400 2026-10-04 "mode=keyframes requires image as
    /// a list of at least 2 items"). Below the floor the shaper falls
    /// back to the text-mode wire value; a single keyframe (if any) rides
    /// the top-level `image` field instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_keyframes: Option<u32>,
    /// Wire field name for the reference image list: "images" (2.5 route,
    /// always an array) or "image" (v2.0 legacy route: a single URL string
    /// for one reference, an array for multiple — live probes 2026-10-04:
    /// the legacy validator ignores `images[]` and 400s with "param: image").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_field: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpecWire {
    pub id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub sync: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub poll_endpoint: Option<String>,
    #[serde(default)]
    pub request_format: String,
    #[serde(default)]
    pub limits: ModelSpecLimits,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_seed: Option<bool>,
    /// E7: wire param name the engine sends cValue under (e.g.
    /// "guidance_scale"); absent → the value is logged only, never sent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guidance: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<ModelSpecMedia>,
}

impl ModelSpecWire {
    pub fn supports_seed(&self) -> bool {
        self.supports_seed.unwrap_or(false)
    }

    pub fn is_read_only(&self) -> bool {
        self.read_only.unwrap_or(false)
    }

    pub fn is_pending(&self) -> bool {
        self.pending.unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_shape_without_new_fields_deserializes() {
        // Pre-Phase-A payload (no limits maps, no guidance/media).
        let json = serde_json::json!({
            "id": "custom-video",
            "kind": "video",
            "endpoint": "/videos",
            "sync": false,
            "pollEndpoint": "/videos/{jobId}",
            "requestFormat": "video-job"
        });
        let spec: ModelSpecWire = serde_json::from_value(json).unwrap();
        assert_eq!(spec.id, "custom-video");
        assert!(spec.guidance.is_none());
        assert!(spec.media.is_none());
        assert!(!spec.supports_seed());
        assert!(!spec.is_read_only());
    }

    #[test]
    fn full_agnes_shape_round_trips() {
        let json = serde_json::json!({
            "id": "agnes-video-2.5-flash",
            "kind": "video",
            "endpoint": "/v1/videos",
            "sync": false,
            "pollEndpoint": "/agnesapi?video_id={videoId}&model_name={model}",
            "requestFormat": "video-job-seconds",
            "limits": {
                "seconds": [4.0, 12.0],
                "resolutions": ["720P"],
                "sizeMap": { "720p": "720P" },
                "ratioMap": { "horizontal": "16:9" }
            },
            "supportsSeed": true,
            "media": { "modes": ["keyframes", "reference"], "maxKeyframes": 2, "maxRefs": 5 }
        });
        let spec: ModelSpecWire = serde_json::from_value(json).unwrap();
        assert!(spec.supports_seed());
        assert_eq!(spec.limits.seconds, Some([4.0, 12.0]));
        assert_eq!(
            spec.limits.size_map.as_ref().unwrap().get("720p").unwrap(),
            "720P"
        );
        assert_eq!(spec.media.as_ref().unwrap().max_refs, Some(5));

        let out = serde_json::to_value(&spec).unwrap();
        assert_eq!(out["supportsSeed"], true);
        assert!(out["limits"]["sizeMap"].is_object());
        // Unknown fields on the wire are tolerated (old callers, new specs).
        let extra = serde_json::json!({ "id": "x", "somethingNew": 1 });
        let _: ModelSpecWire = serde_json::from_value(extra).unwrap();

        // wireModes (V2.0 legacy-route mode names) round-trips camelCase.
        let v2 = serde_json::json!({
            "id": "agnes-video-v2.0",
            "kind": "video",
            "endpoint": "/v1/videos",
            "sync": false,
            "requestFormat": "video-job-seconds",
            "media": {
                "modes": ["keyframes", "reference"],
                "wireModes": { "keyframes": "keyframes", "reference": "multi_reference", "text": "ti2vid" },
                "minRefs": 2,
                "imageField": "image"
            }
        });
        let v2spec: ModelSpecWire = serde_json::from_value(v2).unwrap();
        let w = v2spec.media.as_ref().unwrap().wire_modes.as_ref().unwrap();
        assert_eq!(w.get("text").unwrap(), "ti2vid");
        assert_eq!(w.get("reference").unwrap(), "multi_reference");
        assert_eq!(v2spec.media.as_ref().unwrap().min_refs, Some(2));
        assert_eq!(
            v2spec.media.as_ref().unwrap().image_field.as_deref(),
            Some("image")
        );
    }
}
