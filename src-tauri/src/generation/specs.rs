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
    }
}
