// Per-profile settings + provider plumbing + generation log (Phase 1).
//
// Types mirror src/types/settings.ts (camelCase); the frontend owns the
// shape, this module persists/normalizes and exposes the provider ping.
// API keys never leave this process; ping messages never carry them (P6/P7).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::AppState;

// ── Settings types (mirrors src/types/settings.ts) ────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSlot {
    #[serde(default)]
    pub preset: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GenerationDefaults {
    #[serde(default)]
    pub fps: f64,
    #[serde(default)]
    pub resolution: String,
    #[serde(default)]
    pub orientation: String,
    #[serde(default)]
    pub q_value: f64,
    #[serde(default)]
    pub c_value: f64,
    #[serde(default)]
    pub concurrency: String,
}

impl Default for GenerationDefaults {
    fn default() -> Self {
        Self {
            fps: 24.0,
            resolution: "720p".into(),
            orientation: "horizontal".into(),
            q_value: 18.0,
            c_value: 7.0,
            concurrency: "sequential".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileBlock {
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub layout: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSlots {
    #[serde(default)]
    pub text: ProviderSlot,
    #[serde(default)]
    pub image: ProviderSlot,
    #[serde(default)]
    pub video: ProviderSlot,
}

impl Default for ProviderSlots {
    fn default() -> Self {
        // Per-kind seed — must stay in sync with the frontend DEFAULT_SETTINGS
        // (src/lib/settings/guards.ts).
        fn slot(model: &str) -> ProviderSlot {
            ProviderSlot {
                preset: "agnes".into(),
                base_url: String::new(),
                api_key: String::new(),
                model: model.into(),
            }
        }
        Self {
            text: slot("agnes-text"),
            image: slot("agnes-image"),
            video: slot("agnes-video"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub profile: ProfileBlock,
    #[serde(default)]
    pub generation_defaults: GenerationDefaults,
    #[serde(default)]
    pub providers: ProviderSlots,
}

/// Field-level sanitize: serde defaults make a blob structurally valid, but
/// scalars may be out of range — clamp back so a corrupted row can never
/// poison the UI. Mirrors the frontend normalizeSettings (guards.ts).
pub fn normalize_settings(raw: &Value) -> Settings {
    let mut out: Settings = serde_json::from_value(raw.clone()).unwrap_or_default();
    if !out.generation_defaults.fps.is_finite() || out.generation_defaults.fps <= 0.0 {
        out.generation_defaults.fps = 24.0;
    }
    if !out.generation_defaults.q_value.is_finite() {
        out.generation_defaults.q_value = 18.0;
    }
    if !out.generation_defaults.c_value.is_finite() {
        out.generation_defaults.c_value = 7.0;
    }
    if out.generation_defaults.concurrency != "sequential"
        && out.generation_defaults.concurrency != "parallel"
    {
        out.generation_defaults.concurrency = "sequential".into();
    }
    // A partially corrupted blob may carry empty slots (serde per-field
    // defaults are all-empty) — reseed them per kind, mirroring the
    // frontend normalizeSlot fallbacks.
    reseed_slot(&mut out.providers.text, "agnes-text");
    reseed_slot(&mut out.providers.image, "agnes-image");
    reseed_slot(&mut out.providers.video, "agnes-video");
    out
}

fn reseed_slot(slot: &mut ProviderSlot, default_model: &str) {
    if slot.preset.is_empty() {
        slot.preset = "agnes".into();
    }
    if slot.model.is_empty() {
        slot.model = default_model.into();
    }
}

// ── Settings commands ───────────────────────────────────────────────────────

/// Load a profile's settings; None when never saved (frontend seeds defaults).
#[tauri::command]
pub async fn get_settings(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Settings>, String> {
    let db = state.db.lock().await;
    match db.get_profile_settings(&profile_id).await? {
        Some(raw) => {
            let value: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
            Ok(Some(normalize_settings(&value)))
        }
        None => Ok(None),
    }
}

/// Upsert a profile's settings blob (normalized before persisting).
#[tauri::command]
pub async fn save_settings(
    profile_id: String,
    settings: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let json = serde_json::to_string(&normalize_settings(&settings)).map_err(|e| e.to_string())?;
    let db = state.db.lock().await;
    db.save_profile_settings(&profile_id, &json).await
}

// ── Provider ping (P7: real reachability) ───────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestProviderResult {
    pub reachable: bool,
    pub status: Option<u16>,
    /// Human-readable result. Never contains the API key (P6).
    pub message: String,
}

/// Pure — classifies a probe outcome without touching the network.
pub fn describe_provider_status(status: Option<u16>, host: &str) -> TestProviderResult {
    match status {
        Some(code) if code < 400 => TestProviderResult {
            reachable: true,
            status: Some(code),
            message: format!("HTTP {code} - endpoint reachable"),
        },
        Some(code) if code == 401 || code == 403 => TestProviderResult {
            reachable: true,
            status: Some(code),
            message: format!("HTTP {code} - reachable; API key may be invalid"),
        },
        Some(code) if code < 500 => TestProviderResult {
            reachable: true,
            status: Some(code),
            message: format!("HTTP {code} - reachable; check the URL"),
        },
        Some(code) => TestProviderResult {
            reachable: true,
            status: Some(code),
            message: format!("HTTP {code} - reachable; server error"),
        },
        None => TestProviderResult {
            reachable: false,
            status: None,
            message: format!("Cannot reach {host} (network or TLS error)"),
        },
    }
}

/// Scheme+host of a URL, for error messages. Never includes a key (P6/P7).
pub fn url_host(url: &str) -> String {
    url.trim().split('/').take(3).collect::<Vec<_>>().join("/")
}

/// Real reachability probe: GET the base URL with the bearer key.
/// Any HTTP response counts as reachable; a transport failure does not.
#[tauri::command]
pub async fn test_provider(
    base_url: String,
    api_key: String,
) -> Result<TestProviderResult, String> {
    let host = url_host(&base_url);
    let trimmed = base_url.trim();
    if !trimmed.starts_with("https://") && !trimmed.starts_with("http://") {
        return Err("URL must start with http:// or https://".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(trimmed);
    if !api_key.trim().is_empty() {
        req = req.header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", api_key.trim()),
        );
    }
    match req.send().await {
        Ok(resp) => Ok(describe_provider_status(
            Some(resp.status().as_u16()),
            &host,
        )),
        Err(_) => Ok(describe_provider_status(None, &host)),
    }
}

// ── Generation log commands (P5: entries arrive already redacted) ──────────

/// Upsert a redacted log entry (no keys, no raw local paths — this process
/// never sees the key, so it only persists what the frontend redacted).
#[tauri::command]
pub async fn log_generation(entry: Value, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    db.add_generation_log(&entry).await
}

#[tauri::command]
pub async fn get_generation_log(
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Value>, String> {
    let db = state.db.lock().await;
    db.get_generation_log(&task_id).await
}

#[tauri::command]
pub async fn list_generation_logs(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    let db = state.db.lock().await;
    db.list_generation_logs(&session_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_match_frontend_seed() {
        let json = serde_json::to_value(&Settings::default()).unwrap();
        assert_eq!(json["generationDefaults"]["fps"], 24.0);
        assert_eq!(json["generationDefaults"]["resolution"], "720p");
        assert_eq!(json["generationDefaults"]["orientation"], "horizontal");
        assert_eq!(json["generationDefaults"]["qValue"], 18.0);
        assert_eq!(json["generationDefaults"]["cValue"], 7.0);
        assert_eq!(json["generationDefaults"]["concurrency"], "sequential");
        assert_eq!(json["providers"]["text"]["preset"], "agnes");
        assert_eq!(json["providers"]["text"]["model"], "agnes-text");
        assert_eq!(json["providers"]["image"]["model"], "agnes-image");
        assert_eq!(json["providers"]["video"]["model"], "agnes-video");
        assert_eq!(json["providers"]["video"]["apiKey"], "");
    }

    #[test]
    fn normalize_sanitize_out_of_range_scalars() {
        let raw = serde_json::json!({
            "generationDefaults": { "fps": 0.0, "qValue": 99.0, "concurrency": "sometimes" },
            "providers": { "video": { "preset": "custom", "model": "custom-video" } },
        });
        let out = normalize_settings(&raw);
        assert_eq!(out.generation_defaults.fps, 24.0);
        assert_eq!(out.generation_defaults.concurrency, "sequential");
        // Valid data survives
        assert_eq!(out.generation_defaults.q_value, 99.0);
        assert_eq!(out.providers.video.model, "custom-video");
        // Missing slots reseed
        assert_eq!(out.providers.text.model, "agnes-text");
    }

    #[test]
    fn normalize_rejects_garbage_to_defaults() {
        let out = normalize_settings(&Value::String("garbage".into()));
        assert_eq!(out, Settings::default());
    }

    #[test]
    fn provider_status_classification() {
        let ok = describe_provider_status(Some(200), "https://x.example");
        assert!(ok.reachable && ok.status == Some(200));
        assert!(ok.message.contains("HTTP 200"));

        let auth = describe_provider_status(Some(401), "https://x.example");
        assert!(auth.reachable && auth.status == Some(401));
        assert!(auth.message.contains("API key"));

        let bad_url = describe_provider_status(Some(404), "https://x.example");
        assert!(bad_url.reachable && bad_url.message.contains("check the URL"));

        let server = describe_provider_status(Some(500), "https://x.example");
        assert!(server.reachable && server.message.contains("server error"));

        let down = describe_provider_status(None, "https://x.example");
        assert!(!down.reachable && down.status.is_none());
        assert!(down.message.contains("x.example"));

        // Keys never leak into messages (P6)
        for r in [ok, auth, bad_url, server, down] {
            assert!(!r.message.contains("sk-"));
        }
    }

    #[test]
    fn url_host_strips_path_keeps_scheme() {
        assert_eq!(
            url_host("https://api.agnes.example/v1"),
            "https://api.agnes.example"
        );
        assert_eq!(url_host("http://localhost:8000"), "http://localhost:8000");
        assert_eq!(url_host("  https://x.example/a/b  "), "https://x.example");
    }
}
