//! Model spec wire mirror (docs/provider-engine-tasks.md, Phase A).
//!
//! The frontend owns the model catalog (specs are DATA in
//! `src/lib/settings/catalog.ts`); this is the serde mirror of the subset
//! the engine consumes, handed over with `start_generation`. No secrets,
//! ever — the API key is read from the per-profile settings blob at
//! request time only (E1/E2). Unknown fields are skipped so old callers
//! keep working.

use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    /// Discrete allowed durations (MiniMax 6|10, Kling 5|10, Luma 5|9): the
    /// adapter {{seconds:enum}} tokens snap to the nearest entry.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seconds_enum: Option<Vec<f64>>,
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
            seconds_enum: None,
            ratios: None,
            size_map: None,
            ratio_map: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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

// ── Tier-A video adapter wire mirror (expanded provider system) ────────────
// Declarative create→poll→artifact mapping, merged on the frontend
// (resolveSpecs.mergeAdapter: preset ⊕ model overrides ⊕ payload). The
// engine interprets via generation/video_adapter.rs (pure). Tolerant
// deserialization: a malformed config surfaces as a concrete engine error,
// never a serde panic on the whole spec.

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterArtifactWire {
    /// "url" | "content" | "retrieve".
    #[serde(default)]
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_id_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterEnvelopeWire {
    pub code_path: String,
    pub ok_value: Value,
    pub message_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterReportedCostWire {
    pub path: String,
    pub unit: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterResponseWire {
    #[serde(default)]
    pub job_id_path: String,
    #[serde(default)]
    pub status_path: String,
    #[serde(default)]
    pub status_map: std::collections::HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_path: Option<String>,
    /// 1 (Runway 0-1 float) or 100 (default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_scale: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queue_position_path: Option<String>,
    #[serde(default)]
    pub artifact: AdapterArtifactWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub envelope: Option<AdapterEnvelopeWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reported_cost: Option<AdapterReportedCostWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predict_time_path: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterCreateWire {
    #[serde(default)]
    pub endpoint: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterPollWire {
    #[serde(default)]
    pub endpoint: String,
    /// fal two-stage: COMPLETED includes failed jobs — GET the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterCancelWire {
    pub endpoint: String,
    /// DELETE | POST | PUT (best-effort remote cancel).
    #[serde(default)]
    pub method: String,
}

/// Engine upload route for the 'upload' media input mode (ComfyUI-class
/// local engines): multipart-POST each local media file, then reference the
/// engine-side name in the payload. Contract unverified-live until a local
/// engine is probed (Tier-B slice 2026-11-22).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterUploadWire {
    /// Multipart POST target (ComfyUI: /upload/image).
    pub endpoint: String,
    /// Multipart form field name (ComfyUI default "image").
    #[serde(default = "default_upload_field")]
    pub field: String,
    /// Dot-path to the engine-side reference in the upload response JSON
    /// (ComfyUI: "name" — graph nodes take the uploaded filename).
    #[serde(default = "default_upload_name_path")]
    pub name_path: String,
}

fn default_upload_field() -> String {
    "image".into()
}

fn default_upload_name_path() -> String {
    "name".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterMediaWire {
    /// "url-or-data" | "url-only" | "upload" (ComfyUI-class local engines).
    #[serde(default)]
    pub input: String,
    /// 'upload' only: the engine upload route (endpoint + form field +
    /// response name path).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upload: Option<AdapterUploadWire>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoAdapterSpecWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub create: AdapterCreateWire,
    #[serde(default)]
    pub poll: AdapterPollWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancel: Option<AdapterCancelWire>,
    /// Per-model JSON payload template with {{tokens}} (video_adapter.rs).
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub response: AdapterResponseWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<AdapterMediaWire>,
}

// ── MCP JSON-RPC transport wire mirror (Tier-B code shaper, mcp.rs) ──────────
// Declarative config resolved from the preset (resolveSpecs.mergeMcp) onto
// the wire spec. No SDK crate, no session header — the engine drives a
// minimal stateless JSON-RPC client over the existing HttpClient trait.

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolsWire {
    #[serde(default)]
    pub generate: String,
    #[serde(default)]
    pub session: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpActionWire {
    /// wangp_session action name (e.g. "create_file_upload").
    #[serde(default)]
    pub action: String,
    /// Argument key that carries the (authorized) path to the server.
    /// Legacy path-based actions (download + old upload) still use it; the
    /// v2.1 chunked upload uses `filename_arg`/`size_arg` instead.
    #[serde(default)]
    pub path_arg: String,
    /// Dot-path keys accepted when reading the returned media reference.
    #[serde(default)]
    pub ref_paths: Vec<String>,
    // ── WanGP v2.1 chunked-upload handshake (mcp::upload_media) ────────────
    // All fields are optional on the wire with serde defaults so older specs
    // (path-based upload / download-only configs) still deserialize; the
    // upload executor reports a concrete error when a required field is
    // missing instead of silently sending an arbitrary path.
    /// Argument key for the BARE sanitized filename on `create_file_upload`.
    #[serde(default)]
    pub filename_arg: String,
    /// Argument key for the decoded byte size on `create_file_upload`.
    #[serde(default)]
    pub size_arg: String,
    /// Dot-path keys for the one-time upload token from `create_file_upload`.
    #[serde(default)]
    pub token_paths: Vec<String>,
    /// wangp_session action that uploads one base64 chunk (token, offset,
    /// data_base64).
    #[serde(default)]
    pub chunk_action: String,
    /// wangp_session action that finalizes the upload (token).
    #[serde(default)]
    pub finish_action: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpActionsWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upload: Option<McpActionWire>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download: Option<McpActionWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpGenerateWire {
    /// wait=true: the server blocks until the job finishes.
    #[serde(default = "default_mcp_wait")]
    pub wait: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_s: Option<f64>,
}

impl Default for McpGenerateWire {
    fn default() -> Self {
        Self {
            wait: true,
            timeout_s: None,
        }
    }
}

fn default_mcp_wait() -> bool {
    true
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSpecWire {
    /// JSON-RPC endpoint under the provider base URL ("/mcp").
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub protocol_version: String,
    #[serde(default)]
    pub tools: McpToolsWire,
    #[serde(default)]
    pub generate: McpGenerateWire,
    /// Generic generation defaults (portable wire values only — no paths).
    #[serde(default)]
    pub settings_defaults: serde_json::Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<McpActionsWire>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    /// Owner's live-verification unlock, set by the frontend's
    /// Settings > Providers > Live-verified models gate. A pending spec is
    /// generation-blocked unless this is `true` (free-form typed ids carry it
    /// too). Wire name `ownerVerified` (struct is camelCase).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_verified: Option<bool>,
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
    /// Item 8: wire param name for qValue (inference steps); same gating.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steps: Option<String>,
    /// Item 8: product-unit range for the guidance inversion at the wire
    /// chokepoint: wire = (min + max) − cValue. Absent → verbatim.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guidance_range: Option<[f32; 2]>,
    /// Item 8: guidance/steps ride ONLY img2img requests (reference present);
    /// the Agnes txt2img queue rejects both (live 400 probes 2026-11-19).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub img2img_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<ModelSpecMedia>,
    // ── Expanded provider system (2026-11-21) ──
    /// Resolved auth scheme from the preset ("bearer" default; "none" =
    /// keyless local — the engine's key gate relaxes for it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<String>,
    /// Merged Tier-A adapter (requestFormat "video-adapter").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub adapter: Option<VideoAdapterSpecWire>,
    /// Merged MCP transport config (requestFormat "mcp") — resolved from the
    /// preset by resolveSpecs.mergeMcp; no owner-machine values on the wire.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp: Option<McpSpecWire>,
    /// "url-or-data" | "url-only" media input contract.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_input: Option<String>,
    /// Text structured-output capability (Director Node A).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_output: Option<String>,
    /// Send chat_template_kwargs.enable_thinking (Agnes/vLLM only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_toggle: Option<bool>,
    /// Static pricing data (PriceSpec mirror; kept as JSON — the estimate
    /// command reads it generically, no struct churn).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pricing: Option<Value>,
}

impl ModelSpecWire {
    pub fn supports_seed(&self) -> bool {
        self.supports_seed.unwrap_or(false)
    }

    /// Item 8: the img2img-only gate for the Q/C knobs.
    pub fn img2img_only(&self) -> bool {
        self.img2img_only.unwrap_or(false)
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

    #[test]
    fn mcp_config_round_trips_from_catalog_wire_shape() {
        // The exact shape resolveSpecs.mergeMcp attaches to an 'mcp' spec.
        let json = serde_json::json!({
            "id": "ti2v_2_2",
            "kind": "video",
            "endpoint": "/mcp",
            "sync": false,
            "requestFormat": "mcp",
            "pending": true,
            "auth": "none",
            "mcp": {
                "endpoint": "/mcp",
                "protocolVersion": "2025-06-18",
                "tools": { "generate": "wangp_generate", "session": "wangp_session" },
                "generate": { "wait": true, "timeout_s": null },
                "settingsDefaults": {
                    "model_type": "ti2v_2_2", "seed": -1, "resolution": "1280x720",
                    "video_length": 121, "num_inference_steps": 50,
                    "guidance_scale": 5, "flow_shift": 5, "image_mode": 0,
                    "image_prompt_type": "T"
                },
                "actions": {
                    "upload": { "action": "create_file_upload", "pathArg": "path",
                                "refPaths": ["media_id", "path"] },
                    "download": { "action": "create_file_download", "pathArg": "path",
                                  "refPaths": ["path"] }
                }
            }
        });
        let spec: ModelSpecWire = serde_json::from_value(json).unwrap();
        assert_eq!(spec.request_format, "mcp");
        let mcp = spec.mcp.as_ref().expect("mcp config must survive the wire");
        assert_eq!(mcp.endpoint, "/mcp");
        assert_eq!(mcp.protocol_version, "2025-06-18");
        assert_eq!(mcp.tools.generate, "wangp_generate");
        assert_eq!(mcp.tools.session, "wangp_session");
        assert!(mcp.generate.wait);
        assert!(mcp.generate.timeout_s.is_none());
        assert_eq!(mcp.settings_defaults.get("model_type").unwrap(), "ti2v_2_2");
        assert_eq!(mcp.settings_defaults.get("video_length").unwrap(), 121);
        let up = mcp.actions.as_ref().unwrap().upload.as_ref().unwrap();
        assert_eq!(up.action, "create_file_upload");
        assert_eq!(up.path_arg, "path");
        // Camel-case round trip: Rust struct fields are wire-safe.
        let out = serde_json::to_value(&spec).unwrap();
        assert_eq!(out["mcp"]["protocolVersion"], "2025-06-18");
        assert_eq!(out["mcp"]["settingsDefaults"]["image_mode"], 0);
    }

    #[test]
    fn mcp_upload_v21_wire_shape_round_trips_and_legacy_defaults() {
        // The LOCKED cross-lane contract. Every field rides a serde default,
        // so an older spec (the path-based shape in the test above) still
        // deserializes with empty v2.1 config.
        let json = serde_json::json!({
            "id": "ti2v_2_2", "kind": "video", "requestFormat": "mcp",
            "mcp": {
                "tools": { "generate": "wangp_generate", "session": "wangp_session" },
                "actions": {
                    "upload": {
                        "action": "create_file_upload",
                        "filenameArg": "filename",
                        "sizeArg": "size_bytes",
                        "tokenPaths": ["token"],
                        "chunkAction": "upload_chunk",
                        "finishAction": "finish_upload",
                        "refPaths": ["path", "media_id"]
                    }
                }
            }
        });
        let spec: ModelSpecWire = serde_json::from_value(json).unwrap();
        let up = spec.mcp.as_ref().unwrap().actions.as_ref().unwrap().upload.as_ref().unwrap();
        assert_eq!(up.action, "create_file_upload");
        assert_eq!(up.filename_arg, "filename");
        assert_eq!(up.size_arg, "size_bytes");
        assert_eq!(up.token_paths, vec!["token"]);
        assert_eq!(up.chunk_action, "upload_chunk");
        assert_eq!(up.finish_action, "finish_upload");
        assert_eq!(up.ref_paths, vec!["path", "media_id"]);
        // Camel-case wire names are stable for the other lane.
        let out = serde_json::to_value(&spec).unwrap();
        let wire = &out["mcp"]["actions"]["upload"];
        assert_eq!(wire["filenameArg"], "filename");
        assert_eq!(wire["sizeArg"], "size_bytes");
        assert_eq!(wire["tokenPaths"][0], "token");
        assert_eq!(wire["chunkAction"], "upload_chunk");
        assert_eq!(wire["finishAction"], "finish_upload");

        // Older specs deserialize with empty v2.1 fields (no hard failure).
        let legacy: McpActionWire = serde_json::from_value(serde_json::json!({
            "action": "create_file_upload", "pathArg": "path", "refPaths": ["media_id"]
        })).unwrap();
        assert_eq!(legacy.path_arg, "path");
        assert_eq!(legacy.filename_arg, "");
        assert!(legacy.token_paths.is_empty());
        assert_eq!(legacy.chunk_action, "");
        assert_eq!(legacy.finish_action, "");
    }
}
