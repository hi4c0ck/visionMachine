//! Provider engine (docs/provider-engine-tasks.md, Phase D).
//!
//! `ProviderEngine` implements `GenerationEngine` for one stage run:
//! image sync POST, video create-and-poll (503 backoff + cancel), artifact
//! download into the E3 media tree, redacted `request.log` + `output.json`
//! writes, and real progress callbacks (never simulated - D1).
//!
//! Secrets: the API key is read from the per-profile settings blob only
//! while building the outbound request (E1). It is masked to `[API_KEY]`
//! everywhere it is persisted or shown (P6/E1).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tokio::time::sleep;

use crate::commands::settings::{normalize_settings, ProviderSlot};
use crate::generation::engine::{EngineInput, EngineStage, GenerationEngine, StageOutput};
use crate::generation::media::{append_jsonl, append_request_log, pipe_media_dirs, write_json};
use crate::generation::shaper::StageContext;
use crate::generation::shaper::{shape_request, substitute_poll_template};
use crate::generation::specs::ModelSpecWire;
use crate::generation::types::SourceKind;
use crate::storage::db::Database;

/// Poll cadence for async video jobs. 8 s balances responsiveness against the
/// provider's shared-endpoint rate limits: a video render takes minutes, so a
/// tighter-than-5 s cadence only burns quota and triggers 429s faster.
const POLL_INTERVAL: Duration = Duration::from_secs(8);
/// 503 `video_queue_full` backoff sequence (catalog hermes note):
/// 30 s, 60 s, 120 s, then hold at 120 s.
const BACKOFF_SECS: [u64; 3] = [30, 60, 120];
/// Image generation timeout (catalog: 60-360 s; typical ~15-18 s).
const IMAGE_TIMEOUT: Duration = Duration::from_secs(360);
/// Poll transport timeout (transient network, not the job itself).
const POLL_TIMEOUT: Duration = Duration::from_secs(30);

/// A concrete engine error carrying the concrete-cause rule (E4).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    /// User cancelled - the registry maps this to `TaskStatus::Cancelled`.
    Cancelled,
    /// A concrete, user-actionable message (transport / 4xx / 5xx / config).
    Failure(String),
}

impl EngineError {
    fn is_cancelled(&self) -> bool {
        matches!(self, Self::Cancelled)
    }
    fn message(&self) -> String {
        match self {
            Self::Cancelled => "cancelled".to_string(),
            Self::Failure(m) => m.clone(),
        }
    }
}

/// The provider engine: executes one stage of a generation task against the
/// configured provider slots. Constructed with the DB (for the settings
/// blob) and a media-root resolver; HTTP is pluggable via `HttpClient`
/// (production = reqwest, tests = a stubbed client).
pub struct ProviderEngine {
    db: Database,
    /// Resolves the session media root for a task (E3/O6 resolution order).
    media_root: Arc<dyn Fn() -> Option<std::path::PathBuf> + Send + Sync>,
    http: Arc<dyn HttpClient + Send + Sync>,
    /// Poll cadence for async video jobs (tests use a tiny interval).
    poll_interval: Duration,
    /// 503 backoff sequence; holds at the last value after exhaustion.
    backoff_secs: [u64; 3],
}

/// HTTP abstraction so the engine is unit-testable with a stub (Phase D
/// tests use a mock transport; production uses `ReqwestClient`).
#[async_trait::async_trait]
pub trait HttpClient: Send + Sync {
    /// POST a JSON body to `url` with a Bearer token; returns
    /// `(status, body-json-or-error-string)`.
    async fn post(
        &self,
        url: &str,
        body: &serde_json::Value,
        api_key: &str,
        timeout: Duration,
    ) -> Result<(u16, serde_json::Value), String>;
    /// GET `url` with a Bearer token; returns `(status, body)`.
    async fn get(
        &self,
        url: &str,
        api_key: &str,
        timeout: Duration,
    ) -> Result<(u16, serde_json::Value), String>;
    /// Download `url` (a public provider artifact, no auth) into `dest`.
    async fn download(&self, url: &str, dest: &std::path::Path) -> Result<(), String>;
}

impl ProviderEngine {
    /// The full engine: DB for the settings blob, a media-root resolver,
    /// the reqwest transport, and the default poll/backoff cadence.
    pub fn new(
        db: Database,
        media_root: Arc<dyn Fn() -> Option<std::path::PathBuf> + Send + Sync>,
        poll_interval: Duration,
        backoff_secs: [u64; 3],
    ) -> Self {
        Self {
            db,
            media_root,
            http: Arc::new(ReqwestClient::new()),
            poll_interval,
            backoff_secs,
        }
    }

    /// Production wiring: 1.5 s poll cadence + 30/60/120 s 503 backoff.
    pub fn default_wiring(
        db: Database,
        media_root: Arc<dyn Fn() -> Option<std::path::PathBuf> + Send + Sync>,
    ) -> Self {
        Self::new(db, media_root, POLL_INTERVAL, BACKOFF_SECS)
    }

    /// Test-only: swap in a stubbed HTTP transport.
    #[cfg(test)]
    pub fn with_http(
        db: Database,
        media_root: Arc<dyn Fn() -> Option<std::path::PathBuf> + Send + Sync>,
        http: Arc<dyn HttpClient + Send + Sync>,
        poll_interval: Duration,
        backoff_secs: [u64; 3],
    ) -> Self {
        Self {
            db,
            media_root,
            http,
            poll_interval,
            backoff_secs,
        }
    }

    /// Load the provider slot for a stage kind from the profile settings
    /// blob, normalizing a possibly-missing row to the seeded defaults
    /// (the frontend seeds these; `normalize_settings` reseeds empties).
    async fn provider_slot(
        &self,
        input: &EngineInput,
        kind: String,
    ) -> Result<ProviderSlot, EngineError> {
        let profile_id = match &input.profile_id {
            Some(p) if !p.is_empty() => p.clone(),
            _ => "default".to_string(),
        };
        let raw = self
            .db
            .get_profile_settings(&profile_id)
            .await
            .map_err(|e| {
                let msg = format!("load settings: {e}");
                log::error!(
                    "[Generation] task {} provider slot failed: {}",
                    input.task_id,
                    msg
                );
                EngineError::Failure(msg)
            })?;
        let raw = raw.unwrap_or_else(|| json!({}).to_string());
        let value: serde_json::Value =
            serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
        let settings = normalize_settings(&value);
        let slot = match kind.as_str() {
            "image" => settings.providers.image.clone(),
            _ => settings.providers.video.clone(),
        };
        if slot.base_url.trim().is_empty() {
            let msg = format!("provider base URL is empty for profile {profile_id}");
            log::error!(
                "[Generation] task {} provider slot failed: {}",
                input.task_id,
                msg
            );
            return Err(EngineError::Failure(msg));
        }
        if slot.api_key.trim().is_empty() {
            let msg = format!("API key is not set for profile {profile_id} ({kind} slot)");
            log::error!(
                "[Generation] task {} provider slot failed: {}",
                input.task_id,
                msg
            );
            return Err(EngineError::Failure(msg));
        }
        Ok(slot)
    }
}

impl GenerationEngine for ProviderEngine {
    fn run<'a>(
        &'a self,
        input: &'a EngineInput,
        cancel: &'a AtomicBool,
        on_progress: &'a (dyn Fn(f32) + Sync),
        on_event: &'a (dyn Fn(&str) + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<StageOutput, String>> + Send + 'a>>
    {
        let this = self;
        let input = input.clone();
        Box::pin(async move {
            match this
                .execute_stage(&input, cancel, on_progress, on_event)
                .await
            {
                Ok(out) => Ok(out),
                Err(e) => {
                    if e.is_cancelled() {
                        cancel.store(true, Ordering::Release);
                    }
                    Err(e.message())
                }
            }
        })
    }
}

impl ProviderEngine {
    /// Resolve the session media root, falling back to the resolver when the
    /// caller didn't pre-resolve one (E3/O6).
    fn media_root_for(&self, input: &EngineInput) -> Option<std::path::PathBuf> {
        if let Some(root) = &input.media_root {
            let trimmed = root.trim();
            if !trimmed.is_empty() {
                return Some(std::path::PathBuf::from(trimmed));
            }
        }
        (self.media_root)()
    }

    /// Run one stage (docs/provider-engine-tasks.md, Phase D).
    async fn execute_stage(
        &self,
        input: &EngineInput,
        cancel: &AtomicBool,
        on_progress: &(dyn Fn(f32) + Sync),
        on_event: &(dyn Fn(&str) + Sync),
    ) -> Result<StageOutput, EngineError> {
        if cancel.load(Ordering::Acquire) {
            log::warn!(
                "[Generation] stage for task {} skipped: cancel already set",
                input.task_id
            );
            return Err(EngineError::Cancelled);
        }
        let stage = input.stage.clone().unwrap_or_else(|| EngineStage {
            kind: SourceKind::Video,
            ..Default::default()
        });
        log::info!(
            "[Generation] execute task {} stage kind={:?} spec_kind={:?}",
            input.task_id,
            stage.kind,
            match stage.kind {
                SourceKind::Keyframe | SourceKind::Subject => input
                    .image_spec
                    .as_ref()
                    .map(|s| s.id.as_str())
                    .unwrap_or("")
                    .to_string(),
                SourceKind::Video => input
                    .video_spec
                    .as_ref()
                    .map(|s| s.id.as_str())
                    .unwrap_or("")
                    .to_string(),
            }
        );
        match stage.kind {
            SourceKind::Keyframe | SourceKind::Subject => {
                let (local, remote_url) = self
                    .run_image_stage(input, cancel, on_progress, on_event)
                    .await?;
                Ok(StageOutput {
                    local_path: local,
                    remote_url,
                })
            }
            SourceKind::Video => {
                let local = self
                    .run_video_stage(input, cancel, on_progress, on_event)
                    .await?;
                Ok(StageOutput {
                    local_path: local,
                    remote_url: None,
                })
            }
        }
    }
}

impl ProviderEngine {
    /// Sync image stage: POST, parse `data[0].url` / `b64_json`, download
    /// into `<mediaRoot>/<pipe>/images/<refId>.png`, append `log.jsonl`,
    /// record the redacted request line (docs/provider-engine-tasks.md,
    /// Phase D step 4). Returns `(local path, provider remote URL)`.
    async fn run_image_stage(
        &self,
        input: &EngineInput,
        cancel: &AtomicBool,
        on_progress: &(dyn Fn(f32) + Sync),
        on_event: &(dyn Fn(&str) + Sync),
    ) -> Result<(String, Option<String>), EngineError> {
        let stage = input.stage.clone().unwrap_or_default();
        let spec = input.image_spec.clone().ok_or_else(|| {
            let msg = format!("image stage {:?} has no resolved image spec", stage.kind);
            log::error!("[Generation] image task {} failed: {}", input.task_id, msg);
            EngineError::Failure(msg)
        })?;
        let slot = self
            .provider_slot(input, spec.kind.clone())
            .await
            .map_err(|e| {
                log::error!(
                    "[Generation] image task {} provider slot failed: {}",
                    input.task_id,
                    e.message()
                );
                e
            })?;

        // Build the payload with the stage shaper (pure, Phase C).
        let ctx = self.stage_context(input, &stage, &spec)?;
        let payload = shape_request(&spec, &ctx).map_err(|e| {
            log::error!(
                "[Generation] image task {} payload shape failed: {}",
                input.task_id,
                e
            );
            EngineError::Failure(e)
        })?;

        // The key/secret are used ONLY while issuing the request (E1);
        // everything persisted is masked below.
        let base = slot.base_url.trim().trim_end_matches('/');
        let url = format!("{base}{}", spec.endpoint);
        let secrets: Vec<String> = vec![slot.api_key.trim().to_string()];
        let secrets_refs: Vec<&str> = secrets.iter().map(|s| s.as_str()).collect();

        // Publish progress at each phase of the image stage so the UI shows
        // per-piece motion (original design): 0.0 start, 0.4 request in
        // flight, 0.6 response received, 1.0 artifact materialized.
        on_progress(0.0);
        on_event("image request in flight");

        // 429 rate-limited → bounded backoff retry (30/60/120 s ladder), not a
        // hard failure. After the ladder is exhausted a persistent 429 still
        // surfaces through the >=400 check below as a concrete error.
        let (status, resp) = {
            let mut backoff_idx = 0usize;
            loop {
                on_progress(0.4); // request in flight
                let (st, rs) = self
                    .http
                    .post(&url, &payload, slot.api_key.trim(), IMAGE_TIMEOUT)
                    .await
                    .map_err(|e| {
                        log::error!(
                            "[Generation] image task {} transport failed: {}",
                            input.task_id,
                            e
                        );
                        EngineError::Failure(format!("transport: {e}"))
                    })?;
                if st != 429 {
                    break (st, rs);
                }
                let delay = self
                    .backoff_secs
                    .get(backoff_idx.min(self.backoff_secs.len() - 1))
                    .copied()
                    .unwrap_or(120);
                backoff_idx += 1;
                log::warn!(
                    "[Generation] image task {} rate-limited (429), backing off {} s (consecutive 429 #{})",
                    input.task_id, delay, backoff_idx
                );
                // Live state line so the modal shows "rate-limited — retry in
                // N s" instead of a frozen bar (the request/response detail
                // stays in the redacted log, not here).
                on_event(&format!("rate-limited — retry in {} s", delay));
                if cancel.load(Ordering::Acquire) {
                    return Err(EngineError::Cancelled);
                }
                sleep(Duration::from_secs(delay)).await;
            }
        };

        on_progress(0.5); // response received, parsing + download next
        on_event("downloading image artifact");

        // Append the full redacted request + response to the task log so a
        // later replay / diagnosis sees exactly what was sent and returned
        // (URL, method, redacted headers, payload, status, full body).
        let media = self.media_root_for(input);
        if let Some(root) = &media {
            if let Ok((_, task_dir)) = pipe_media_dirs(root, &input.pipe_id, &input.task_id) {
                let entry = json!({
                    "stage": "image",
                    "model": spec.id,
                    "request": {
                        "method": "POST",
                        "url": url,
                        "headers": { "Authorization": "Bearer [API_KEY]", "Content-Type": "application/json" },
                        "body": payload,
                    },
                    "status": status,
                    "response": resp,
                });
                let _ = append_request_log(&task_dir.join("request.log"), &entry, &secrets_refs);
            }
        }

        if status >= 400 {
            let body = resp.get("error").cloned().unwrap_or(resp);
            let msg = format!(
                "image generation HTTP {status} ({}): {}",
                spec.id,
                body.to_string()
            );
            log::error!("[Generation] image task {} failed: {}", input.task_id, msg);
            return Err(EngineError::Failure(msg));
        }

        // Parse the artifact location: prefer a URL, else b64_json.
        let data0 = resp.get("data").and_then(|d| d.get(0)).cloned();
        let Some(data0) = data0 else {
            log::error!(
                "[Generation] image task {} response missing data[0] (body: {})",
                input.task_id,
                resp.to_string()
            );
            return Err(EngineError::Failure(
                "image response missing data[0]".into(),
            ));
        };
        let remote_url = data0.get("url").and_then(|u| u.as_str()).map(String::from);
        let remote_url_for_log = remote_url.clone();
        let b64 = data0
            .get("b64_json")
            .and_then(|b| b.as_str())
            .map(String::from);

        // Resolve + download the artifact into the media tree. Keep the
        // provider's remote URL alongside the local path: the registry links
        // both back to the keyframe/subject (previewRemoteUrl / previewLocalPath)
        // so the next video run can prefer the fetchable remote source.
        let local = self
            .materialize_image(
                remote_url.clone(),
                b64,
                &input.pipe_id,
                &input.task_id,
                &stage,
                input,
            )
            .await
            .map_err(|e| {
                log::error!(
                    "[Generation] image task {} materialize failed: {}",
                    input.task_id,
                    e.message()
                );
                e
            })?;

        // Append the artifact history line (O2: latest per ref; history here).
        if let Some(root) = &media {
            if let Ok((images_dir, _)) = pipe_media_dirs(root, &input.pipe_id, &input.task_id) {
                let ref_id = stage.ordinal.map(|o| o.to_string()).unwrap_or_default();
                let line = json!({
                    "ts": std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                    "refId": if ref_id.is_empty() { "latest" } else { &ref_id },
                    "model": spec.id,
                    "seed": input.seed,
                    "remoteUrl": remote_url_for_log,
                    "localPath": local,
                });
                let _ = append_jsonl(&images_dir.join("log.jsonl"), &line);
            }
        }

        if cancel.load(Ordering::Acquire) {
            log::warn!(
                "[Generation] image task {} cancelled after artifact produced",
                input.task_id
            );
            return Err(EngineError::Cancelled);
        }
        on_progress(1.0);
        on_event("image complete");
        log::info!("[Generation] image task {} ok ({})", input.task_id, local);
        Ok((local, remote_url))
    }
}
impl ProviderEngine {
    /// Build the pure shaper context for a stage from the task-level input +
    /// the per-stage context (docs/provider-engine-tasks.md, Phase D step 2).
    fn stage_context(
        &self,
        input: &EngineInput,
        stage: &EngineStage,
        _spec: &ModelSpecWire,
    ) -> Result<StageContext, EngineError> {
        let source_kind = match stage.kind {
            SourceKind::Keyframe => "keyframe",
            SourceKind::Subject => "subject",
            SourceKind::Video => "video",
        };
        let prompt = if stage.kind == SourceKind::Video {
            input.prompt.clone()
        } else {
            stage.prompt.clone().unwrap_or_default()
        };
        let source_id = match stage.kind {
            SourceKind::Video => input.pipe_id.clone(),
            SourceKind::Keyframe | SourceKind::Subject => stage
                .ordinal
                .map(|o| o.to_string())
                .unwrap_or_else(|| source_kind.to_string()),
        };
        Ok(StageContext {
            prompt,
            length_frames: stage.length_frames,
            fps: input.fps,
            resolution: input.resolution.clone(),
            orientation: input.orientation.clone(),
            c_value: input.c_value,
            q_value: input.q_value,
            seed: input.seed,
            source_kind: source_kind.to_string(),
            source_id,
            image_type: stage.image_type.clone(),
            reference_url: stage.reference_url.clone(),
            media_mode: stage.media_mode.clone(),
            upstream: input.upstream.clone(),
        })
    }

    /// Materialize a generated image into the media tree: remote URL or
    /// in-band base64 -> `<images>/<refId>.png` (O2: latest overwritten).
    async fn materialize_image(
        &self,
        remote_url: Option<String>,
        b64: Option<String>,
        pipe_id: &str,
        task_id: &str,
        stage: &EngineStage,
        input: &EngineInput,
    ) -> Result<String, EngineError> {
        let root = match &input.media_root {
            Some(r) if !r.trim().is_empty() => std::path::PathBuf::from(r.trim()),
            _ => match (self.media_root)() {
                Some(r) => r,
                None => {
                    return Err(EngineError::Failure(
                        "no media root configured; image artifact cannot be stored".into(),
                    ))
                }
            },
        };
        let (images_dir, _task_dir) =
            pipe_media_dirs(&root, pipe_id, task_id).map_err(EngineError::Failure)?;
        let ref_id = stage
            .ordinal
            .map(|o| o.to_string())
            .filter(|o| !o.is_empty())
            .unwrap_or_else(|| "latest".into());
        let dest = images_dir.join(format!("{ref_id}.png"));
        match remote_url {
            Some(url) => {
                self.http
                    .download(&url, &dest)
                    .await
                    .map_err(|e| EngineError::Failure(format!("image download {url}: {e}")))?;
            }
            None => {
                let Some(b64) = b64 else {
                    return Err(EngineError::Failure(
                        "image response carried neither url nor b64_json".into(),
                    ));
                };
                use base64::Engine as _;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(b64)
                    .map_err(|e| EngineError::Failure(format!("b64 decode: {e}")))?;
                std::fs::write(&dest, bytes)
                    .map_err(|e| EngineError::Failure(format!("write {}: {e}", dest.display())))?;
            }
        }
        Ok(dest.to_string_lossy().into_owned())
    }

    /// Async video stage: POST create -> poll -> download -> `output.json`
    /// (docs/provider-engine-tasks.md, Phase D steps 3-5). Progress:
    /// 0 -> 0.5 on job accepted -> 1 on success.
    async fn run_video_stage(
        &self,
        input: &EngineInput,
        cancel: &AtomicBool,
        on_progress: &(dyn Fn(f32) + Sync),
        on_event: &(dyn Fn(&str) + Sync),
    ) -> Result<String, EngineError> {
        let stage = input.stage.clone().unwrap_or_default();
        let spec = input.video_spec.clone().ok_or_else(|| {
            let msg = format!(
                "video stage has no resolved video spec (pipe {})",
                input.pipe_id
            );
            log::error!("[Generation] video task {} failed: {}", input.task_id, msg);
            EngineError::Failure(msg)
        })?;
        let slot = self
            .provider_slot(input, spec.kind.clone())
            .await
            .map_err(|e| {
                log::error!(
                    "[Generation] video task {} provider slot failed: {}",
                    input.task_id,
                    e.message()
                );
                e
            })?;

        let ctx = self.stage_context(input, &stage, &spec)?;
        let payload = shape_request(&spec, &ctx).map_err(|e| {
            log::error!(
                "[Generation] video task {} payload shape failed: {}",
                input.task_id,
                e
            );
            EngineError::Failure(e)
        })?;

        let base = slot.base_url.trim().trim_end_matches('/');
        let create_url = format!("{base}{}", spec.endpoint);
        let secrets = vec![slot.api_key.trim()];
        on_event("creating video job");

        // 1) Create the job (503 queue-full backs off and retries).
        let mut backoff_idx = 0usize;
        let create_resp = loop {
            if cancel.load(Ordering::Acquire) {
                return Err(EngineError::Cancelled);
            }
            // First attempt: mark the stage as "creating" so the modal shows
            // motion instead of a frozen 0.0 bar.
            if backoff_idx == 0 {
                on_progress(0.51);
            }
            let (status, resp) = self
                .http
                .post(&create_url, &payload, slot.api_key.trim(), IMAGE_TIMEOUT)
                .await
                .map_err(|e| EngineError::Failure(format!("video create transport: {e}")))?;
            if status != 503 {
                break Ok((status, resp));
            }
            let code = resp
                .get("code")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            // Non-queue-full 503s are a real failure.
            if !code.contains("video_queue_full") {
                break Err(EngineError::Failure(format!(
                    "video create HTTP 503 ({code} or unknown): {}",
                    resp.to_string()
                )));
            }
            let delay = self
                .backoff_secs
                .get(backoff_idx.min(self.backoff_secs.len() - 1))
                .copied()
                .unwrap_or(120);
            backoff_idx += 1;
            // Live state line: the modal shows "queue full — retry in N s"
            // instead of a frozen bar while the provider queue is saturated
            // (the full 503 body stays in the redacted log, not here).
            on_event(&format!("queue full — retry in {} s", delay));
            // Publish the in-backoff state so the stage row shows the amber
            // rate-limited hint (0.51 = first rung of the ladder band, the
            // registry maps 0.51–0.53 to `RateLimited`).
            on_progress(0.51 + 0.01 * (backoff_idx as f32).min(3.0));
            self.log_entry(
                input,
                &secrets,
                &json!({
                    "stage": "video-create-503",
                    "backoff": delay,
                    "request": {
                        "method": "POST",
                        "url": create_url,
                        "headers": { "Authorization": "Bearer [API_KEY]", "Content-Type": "application/json" },
                        "body": payload.clone(),
                    },
                    "resp": resp,
                }),
            )
            .await;
            sleep(Duration::from_secs(delay)).await;
        };
        let (create_status, create_body) = match create_resp {
            Ok(v) => v,
            Err(e) => {
                log::error!(
                    "[Generation] video task {} create failed: {}",
                    input.task_id,
                    e.message()
                );
                return Err(e);
            }
        };
        self.log_entry(
                input,
                &secrets,
                &json!({
                    "stage": "video-create",
                    "request": {
                        "method": "POST",
                        "url": create_url,
                        "headers": { "Authorization": "Bearer [API_KEY]", "Content-Type": "application/json" },
                        "body": payload.clone(),
                    },
                    "status": create_status,
                    "resp": create_body.clone(),
                }),
            )
            .await;
        if create_status >= 400 {
            let msg = format!(
                "video create HTTP {create_status} ({}): {}",
                spec.id,
                create_body.get("error").cloned().unwrap_or(create_body)
            );
            log::error!("[Generation] video task {} failed: {}", input.task_id, msg);
            return Err(EngineError::Failure(msg));
        }

        // 2) Job id from the create response (defensive: catalog shape is
        // live-verified in Phase F; accept the common field spellings).
        let video_id = create_body
            .get("video_id")
            .or_else(|| create_body.get("videoId"))
            .or_else(|| create_body.get("id"))
            .or_else(|| create_body.get("task_id"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| {
                let msg = format!(
                    "video create response missing job id (body: {})",
                    create_body.to_string()
                );
                log::error!("[Generation] video task {} failed: {}", input.task_id, msg);
                EngineError::Failure(msg)
            })?;

        let poll_tpl = spec.poll_endpoint.clone().ok_or_else(|| {
            let msg = format!("model {} has no poll endpoint", spec.id);
            log::error!("[Generation] video task {} failed: {}", input.task_id, msg);
            EngineError::Failure(msg)
        })?;
        on_progress(0.5);
        on_event("job created — rendering");
        log::info!(
            "[Generation] video task {} job created ({})",
            input.task_id,
            video_id
        );

        // 3) Poll until terminal. 503 queue-full and 429 rate-limited both
        // back off; cancel aborts.
        //
        // 429 handling is critical: the provider's poll endpoint is shared
        // with the create endpoint and rate-limits aggressively. The poller
        // must not hammer it at full cadence — each 429 walks the 30/60/120 s
        // backoff ladder (same schedule as 503s). The ladder only resets on
        // a clean 200 `in_progress` poll AND only after a full backoff-delay
        // has elapsed, so an alternating 429/200 pattern can no longer lock
        // the poller into a perpetual 30 s stall.
        //
        // Live progress: the provider's poll responses carry a `progress`
        // field (0–100) for in-flight video jobs. We publish it (clamped,
        // blended with the job-created milestone) so the UI's top bar and
        // the video stage row move during the multi-minute render instead of
        // sitting still at the 0.5 "job created" value.
        let mut backoff_idx = 0usize;
        let mut saw_429 = false;
        let mut last_published = 0.5f32;
        let final_body = loop {
            if cancel.load(Ordering::Acquire) {
                return Err(EngineError::Cancelled);
            }
            sleep(self.poll_interval).await;
            let poll_path = substitute_poll_template(&poll_tpl, &video_id, &spec.id);
            let poll_url = if poll_path.starts_with("http") {
                poll_path.clone()
            } else {
                format!("{base}{poll_path}")
            };
            match self
                .http
                .get(&poll_url, slot.api_key.trim(), POLL_TIMEOUT)
                .await
            {
                Ok((503, body)) => {
                    let delay = self
                        .backoff_secs
                        .get(backoff_idx.min(self.backoff_secs.len() - 1))
                        .copied()
                        .unwrap_or(120);
                    backoff_idx += 1;
                    saw_429 = false;
                    self.log_entry(input, &secrets, &json!({
                        "stage": "video-poll-503",
                        "backoff": delay,
                        "request": { "method": "GET", "url": poll_url, "headers": { "Authorization": "Bearer [API_KEY]" } },
                        "resp": body.clone(),
                    })).await;
                    log::warn!(
                        "[Generation] video task {} poll queue-full (503), backing off {} s",
                        input.task_id,
                        delay
                    );
                    // Live state line: "poll queue full — retry in N s" so the
                    // modal shows the task is alive, not stuck.
                    on_event(&format!("poll queue full — retry in {} s", delay));
                    sleep(Duration::from_secs(delay)).await;
                    continue;
                }
                Ok((429, body)) => {
                    // Rate-limited: walk the 30/60/120 s ladder. `saw_429`
                    // tracks whether the previous poll also hit 429 — the
                    // ladder index only resets on a clean `in_progress` 200
                    // that arrives at least one full backoff-delay after the
                    // last 429, so a 429/200/429 pattern escalates instead
                    // of stalling at the first rung.
                    let delay = self
                        .backoff_secs
                        .get(backoff_idx.min(self.backoff_secs.len() - 1))
                        .copied()
                        .unwrap_or(120);
                    backoff_idx += 1;
                    saw_429 = true;
                    self.log_entry(input, &secrets, &json!({
                        "stage": "video-poll-429",
                        "backoff": delay,
                        "request": { "method": "GET", "url": poll_url, "headers": { "Authorization": "Bearer [API_KEY]" } },
                        "resp": body.clone(),
                    })).await;
                    log::warn!(
                        "[Generation] video task {} poll rate-limited (429), backing off {} s",
                        input.task_id,
                        delay
                    );
                    // Publish the in-backoff state live so the modal shows
                    // "waiting for provider window" instead of a frozen bar.
                    on_progress(0.5 + (0.01 * (backoff_idx as f32).min(3.0)));
                    on_event(&format!("rate-limited — retry in {} s", delay));
                    sleep(Duration::from_secs(delay)).await;
                    continue;
                }
                Ok((status, body)) => {
                    let s = body
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    match s.to_lowercase().as_str() {
                        "failed" | "error" => {
                            let msg = format!(
                                "video job {video_id} failed ({}): {}",
                                spec.id,
                                body.get("error").cloned().unwrap_or(body)
                            );
                            log::error!(
                                "[Generation] video task {} job {} failed: {}",
                                input.task_id,
                                video_id,
                                msg
                            );
                            return Err(EngineError::Failure(msg));
                        }
                        "completed" | "succeeded" | "success" => {
                            log::info!(
                                "[Generation] video task {} job {} completed",
                                input.task_id,
                                video_id
                            );
                            break body;
                        }
                        _ => {
                            // Clean in_progress 200: only reset the ladder if
                            // the last poll was NOT a 429 (i.e. we had a real
                            // gap of successful polls). This prevents the
                            // alternating 429/200 pattern from perpetually
                            // resetting to the 30 s rung.
                            if !saw_429 {
                                backoff_idx = 0;
                            }
                            // The provider's own job progress (0–100) when it
                            // reports one — publish it live so the UI's top bar
                            // and the video stage row move during the render.
                            // The value is clamped into the 0.5–0.9 band so it
                            // blends with the 0.5 "job created" milestone and
                            // never collides with the 1.0 completion marker.
                            let provider_pct = body
                                .get("progress")
                                .and_then(|v| v.as_f64())
                                .map(|p| (p.clamp(0.0, 100.0) / 100.0) as f32);
                            if let Some(pct) = provider_pct {
                                let published = (0.5 + 0.4 * pct).min(0.9);
                                if published > last_published {
                                    on_progress(published);
                                    last_published = published;
                                }
                            }
                            // Live state line: "rendering N%" (or "in progress"
                            // when the provider doesn't report a percentage).
                            let pct_display = body
                                .get("progress")
                                .and_then(|v| v.as_f64())
                                .map(|p| format!("rendering {}%", (p / 100.0 * 100.0) as u32))
                                .unwrap_or_else(|| "rendering — in progress".to_string());
                            on_event(&pct_display);
                            self.log_entry(
                                input,
                                &secrets,
                                &json!({
                                    "stage": "video-poll",
                                    "http": status,
                                    "status": s,
                                    "request": { "method": "GET", "url": poll_url, "headers": { "Authorization": "Bearer [API_KEY]" } },
                                    "resp": body.clone(),
                                }),
                            )
                            .await;
                        }
                    }
                }
                Err(e) => {
                    log::error!(
                        "[Generation] video task {} poll transport failed: {}",
                        input.task_id,
                        e
                    );
                    return Err(EngineError::Failure(format!("video poll transport: {e}")));
                }
            }
        };

        // 4) Final video URL (defensive key check; live-verified in Phase F).
        on_progress(0.9); // job completed, downloading artifact next
        on_event("downloading video");
        let video_url = final_body
            .get("video_url")
            .or_else(|| final_body.get("videoUrl"))
            .or_else(|| final_body.get("url"))
            .or_else(|| final_body.get("download_url"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                let msg = format!(
                    "video job {video_id} completed but no video url in response: {}",
                    final_body.to_string()
                );
                log::error!("[Generation] video task {} failed: {}", input.task_id, msg);
                EngineError::Failure(msg)
            })?
            .to_string();

        // 5) Download into the media tree + write output.json (redacted).
        let media = self.media_root_for(input);
        let local = match &media {
            Some(root) => {
                let (_images_dir, task_dir) = pipe_media_dirs(root, &input.pipe_id, &input.task_id)
                    .map_err(EngineError::Failure)?;
                let dest = task_dir.join("video.mp4");
                self.http.download(&video_url, &dest).await.map_err(|e| {
                    log::error!(
                        "[Generation] video task {} download failed: {}",
                        input.task_id,
                        e
                    );
                    EngineError::Failure(format!("video download {video_url}: {e}"))
                })?;
                let out = json!({
                    "videoPath": dest.to_string_lossy(),
                    "videoUrl": video_url,
                    "model": spec.id,
                    "seed": input.seed,
                    "params": payload,
                    "status": "done",
                });
                write_json(&task_dir.join("output.json"), &out).map_err(EngineError::Failure)?;
                dest.to_string_lossy().into_owned()
            }
            None => {
                // No media tree available: the provider artifact stays remote.
                video_url
            }
        };

        on_progress(1.0);
        on_event("complete");
        log::info!("[Generation] video task {} ok ({})", input.task_id, local);
        Ok(local)
    }

    /// Append a redacted stage entry to the task request.log (best-effort).
    async fn log_entry(&self, input: &EngineInput, secrets: &[&str], entry: &serde_json::Value) {
        let Some(root) = self.media_root_for(input) else {
            return;
        };
        if let Ok((_images_dir, task_dir)) = pipe_media_dirs(&root, &input.pipe_id, &input.task_id)
        {
            let _ = append_request_log(&task_dir.join("request.log"), entry, secrets);
        }
    }
}

// ── Production HTTP transport (reqwest) ─────────────────────────────────────

struct ReqwestClient {
    client: reqwest::Client,
}

impl ReqwestClient {
    fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait::async_trait]
impl HttpClient for ReqwestClient {
    async fn post(
        &self,
        url: &str,
        body: &serde_json::Value,
        api_key: &str,
        timeout: Duration,
    ) -> Result<(u16, serde_json::Value), String> {
        let key = api_key.trim();
        let mut req = self.client.post(url).json(body).timeout(timeout);
        if !key.is_empty() {
            req = req.bearer_auth(key);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
        Ok((status, body))
    }

    async fn get(
        &self,
        url: &str,
        api_key: &str,
        timeout: Duration,
    ) -> Result<(u16, serde_json::Value), String> {
        let key = api_key.trim();
        let mut req = self.client.get(url).timeout(timeout);
        if !key.is_empty() {
            req = req.bearer_auth(key);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::Value::Null);
        Ok((status, body))
    }

    async fn download(&self, url: &str, dest: &std::path::Path) -> Result<(), String> {
        let bytes = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create {}: {e}", parent.display()))?;
        }
        std::fs::write(dest, bytes).map_err(|e| format!("write {}: {e}", dest.display()))
    }
}

// ── Phase D tests (docs/provider-engine-tasks.md) ─────────────────────────────
//
// A scripted, in-process `HttpClient` stub drives the real `ProviderEngine`
// (no wiremock / no network): success path (artifacts + output.json + redacted
// request.log land in the media tree), 4xx/5xx → concrete stage error, cancel
// mid-poll → Cancelled, 503 queue-full backoff sequencing.

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::sync::Mutex as StdMutex;
    use std::time::Duration;

    use serde_json::json;

    use super::*;
    use crate::generation::shaper::UpstreamOutput;
    use crate::generation::specs::ModelSpecLimits;

    /// Scripted HTTP stub. Each call pops the next queued response per method;
    /// when exhausted it falls back to a sensible default.
    struct StubHttp {
        posts: StdMutex<VecDeque<Result<(u16, serde_json::Value), String>>>,
        gets: StdMutex<VecDeque<Result<(u16, serde_json::Value), String>>>,
        download_ok: StdMutex<bool>,
        /// Records every download destination so tests can assert artifacts.
        downloads: StdMutex<Vec<String>>,
    }

    impl StubHttp {
        fn new() -> Self {
            Self {
                posts: StdMutex::new(VecDeque::new()),
                gets: StdMutex::new(VecDeque::new()),
                download_ok: StdMutex::new(true),
                downloads: StdMutex::new(Vec::new()),
            }
        }
        fn queue_post(self, r: Result<(u16, serde_json::Value), String>) -> Self {
            self.posts.lock().unwrap().push_back(r);
            self
        }
        fn queue_get(self, r: Result<(u16, serde_json::Value), String>) -> Self {
            self.gets.lock().unwrap().push_back(r);
            self
        }
    }

    #[async_trait::async_trait]
    impl HttpClient for StubHttp {
        async fn post(
            &self,
            _url: &str,
            _body: &serde_json::Value,
            _api_key: &str,
            _timeout: Duration,
        ) -> Result<(u16, serde_json::Value), String> {
            let mut q = self.posts.lock().unwrap();
            match q.pop_front() {
                Some(r) => r,
                None => Ok((
                    200,
                    json!({ "data": [{ "url": "https://cdn.test/img.png" }] }),
                )),
            }
        }
        async fn get(
            &self,
            _url: &str,
            _api_key: &str,
            _timeout: Duration,
        ) -> Result<(u16, serde_json::Value), String> {
            let mut q = self.gets.lock().unwrap();
            match q.pop_front() {
                Some(r) => r,
                None => Ok((200, json!({ "status": "running" }))),
            }
        }
        async fn download(&self, url: &str, dest: &std::path::Path) -> Result<(), String> {
            self.downloads
                .lock()
                .unwrap()
                .push(dest.to_string_lossy().into_owned());
            if !*self.download_ok.lock().unwrap() {
                return Err(format!("simulated download failure {url}"));
            }
            // Provide an artifact file so download-style assertions see real bytes.
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(dest, "fake-artifact-bytes");
            Ok(())
        }
    }

    // ── Fixtures ────────────────────────────────────────────────────────────────

    fn temp_media_root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "vm_provider_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ))
    }

    async fn db_with_slots(image_key: &str, video_key: &str) -> (Database, std::path::PathBuf) {
        let opts = sqlx::sqlite::SqliteConnectOptions::new()
            .in_memory(true)
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        let db = Database::from_pool(pool);
        db.migrate().await.unwrap();
        db.get_or_create_profile("default", "default")
            .await
            .unwrap();
        let settings = json!({
            "providers": {
                "image": {
                    "preset": "agnes",
                    "baseUrl": "https://api.test",
                    "apiKey": image_key,
                    "model": "agnes-image-2.5-flash"
                },
                "video": {
                    "preset": "agnes",
                    "baseUrl": "https://api.test",
                    "apiKey": video_key,
                    "model": "agnes-video-2.5-flash"
                }
            }
        });
        db.save_profile_settings("default", &settings.to_string())
            .await
            .unwrap();
        (db, temp_media_root())
    }

    fn image_spec() -> ModelSpecWire {
        ModelSpecWire {
            id: "agnes-image-2.5-flash".into(),
            kind: "image".into(),
            endpoint: "/v1/images/generations".into(),
            sync: true,
            poll_endpoint: None,
            request_format: "image-gen".into(),
            limits: ModelSpecLimits::default(),
            pending: None,
            label: None,
            read_only: None,
            supports_seed: Some(true),
            guidance: None,
            media: None,
        }
    }

    fn video_spec() -> ModelSpecWire {
        ModelSpecWire {
            id: "agnes-video-2.5-flash".into(),
            kind: "video".into(),
            endpoint: "/v1/video/jobs".into(),
            sync: false,
            poll_endpoint: Some("/v1/video/jobs/{videoId}".into()),
            request_format: "video-job".into(),
            limits: ModelSpecLimits::default(),
            pending: None,
            label: None,
            read_only: None,
            supports_seed: Some(true),
            guidance: None,
            media: None,
        }
    }

    fn image_input(media: &std::path::Path) -> EngineInput {
        EngineInput {
            task_id: "task1".into(),
            prompt: "prompt".into(),
            pipe_id: "pipe1".into(),
            fps: 24,
            resolution: "720p".into(),
            orientation: "horizontal".into(),
            q_value: 18,
            c_value: 7.0,
            media_root: Some(media.to_string_lossy().into_owned()),
            image_model: None,
            video_model: None,
            seed: Some(42),
            profile_id: Some("default".into()),
            image_spec: Some(image_spec()),
            video_spec: Some(video_spec()),
            stage: Some(EngineStage {
                kind: SourceKind::Keyframe,
                prompt: Some("piece prompt".into()),
                ordinal: Some(1),
                image_type: Some("txt2img".into()),
                reference_url: None,
                image_src: None,
                media_mode: None,
                length_frames: 121,
            }),
            upstream: Vec::new(),
        }
    }

    fn video_input(media: &std::path::Path) -> EngineInput {
        let mut input = image_input(media);
        input.stage = Some(EngineStage {
            kind: SourceKind::Video,
            prompt: Some("video prompt".into()),
            ordinal: None,
            image_type: None,
            reference_url: None,
            image_src: None,
            media_mode: Some("keyframes".into()),
            length_frames: 121,
        });
        input.upstream = vec![UpstreamOutput {
            source_id: "k1".into(),
            kind: "keyframe".into(),
            primary: "https://cdn.test/k1.png".into(),
            local_path: String::new(),
        }];
        input
    }

    fn engine_with(
        db: Database,
        media: std::path::PathBuf,
        http: Arc<StubHttp>,
        backoff_secs: [u64; 3],
    ) -> ProviderEngine {
        ProviderEngine::with_http(
            db,
            Arc::new(move || Some(media.clone())),
            http,
            Duration::from_millis(5),
            backoff_secs,
        )
    }

    // ── Success paths ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn image_success_writes_artifact_log_and_redacted_request_log() {
        let (db, media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http = Arc::new(StubHttp::new().queue_post(Ok((
            200,
            json!({ "data": [{ "url": "https://cdn.test/k1.png" }] }),
        ))));
        let engine = engine_with(db, media.clone(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let input = image_input(&media);

        let out = engine
            .run(&input, &cancel, &|_p| {}, &|_line| {})
            .await
            .expect("image stage should succeed");
        let images_dir = media.join("pipe1").join("images");
        assert_eq!(
            out.local_path,
            images_dir.join("1.png").to_string_lossy().into_owned()
        );
        // The provider's remote URL is carried through StageOutput.
        assert_eq!(out.remote_url.as_deref(), Some("https://cdn.test/k1.png"));
        assert!(images_dir.join("1.png").is_file(), "artifact written");
        assert!(
            images_dir.join("log.jsonl").is_file(),
            "artifact history appended"
        );

        let history = std::fs::read_to_string(images_dir.join("log.jsonl")).unwrap();
        let line: serde_json::Value =
            serde_json::from_str(history.lines().next().unwrap()).unwrap();
        assert_eq!(line["refId"], "1");
        assert_eq!(line["model"], "agnes-image-2.5-flash");

        // The raw key never appears; it's absent from these entries entirely.
        let req_log =
            std::fs::read_to_string(media.join("pipe1").join("task1").join("request.log")).unwrap();
        assert!(!req_log.contains("sk-image-key"));
        let _ = std::fs::remove_dir_all(&media);
    }

    #[tokio::test]
    async fn video_success_polls_to_completion_and_writes_output_json() {
        let (db, media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http = Arc::new(
            StubHttp::new()
                .queue_post(Ok((200, json!({ "videoId": "vid-42" }))))
                .queue_get(Ok((200, json!({ "status": "running" }))))
                .queue_get(Ok((
                    200,
                    json!({
                        "status": "completed",
                        "videoUrl": "https://cdn.test/out.mp4"
                    }),
                ))),
        );
        let engine = engine_with(db, media.clone(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let input = video_input(&media);

        let seen: StdMutex<Vec<f32>> = StdMutex::new(Vec::new());
        let out = engine
            .run(
                &input,
                &cancel,
                &|p| seen.lock().unwrap().push(p),
                &|_line| {},
            )
            .await
            .expect("video stage should succeed");

        let task_dir = media.join("pipe1").join("task1");
        assert_eq!(
            out.local_path,
            task_dir.join("video.mp4").to_string_lossy().into_owned()
        );
        assert!(
            task_dir.join("video.mp4").is_file(),
            "video artifact written"
        );
        let out_json = serde_json::from_str::<serde_json::Value>(
            &std::fs::read_to_string(task_dir.join("output.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(out_json["videoUrl"], "https://cdn.test/out.mp4");
        assert_eq!(out_json["status"], "done");
        // Progress: 0.5 on job accepted, 1.0 on success.
        let seen = seen.lock().unwrap();
        assert!(seen.contains(&0.5), "0.5 reported after create: {seen:?}");
        assert!(seen.contains(&1.0), "1.0 reported on success: {seen:?}");

        let req_log = std::fs::read_to_string(task_dir.join("request.log")).unwrap();
        assert!(!req_log.contains("sk-video-key"));
        let _ = std::fs::remove_dir_all(&media);
    }

    // ── Error paths ─────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn image_http_400_returns_concrete_stage_error() {
        let (db, _media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http = Arc::new(StubHttp::new().queue_post(Ok((
            400,
            json!({ "error": { "message": "prompt too short" } }),
        ))));
        let engine = engine_with(db, temp_media_root(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let mut input = image_input(std::path::Path::new("/unused"));
        input.media_root = None; // no media tree → log writes skipped, fine
        let err = engine
            .run(&input, &cancel, &|_p| {}, &|_line| {})
            .await
            .unwrap_err();
        assert!(err.contains("HTTP 400"), "got: {err}");
        assert!(err.contains("prompt too short"), "got: {err}");
    }

    #[tokio::test]
    async fn video_failed_status_returns_concrete_error() {
        let (db, _media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http = Arc::new(
            StubHttp::new()
                .queue_post(Ok((200, json!({ "videoId": "vid-1" }))))
                .queue_get(Ok((
                    200,
                    json!({ "status": "failed", "error": "content policy" }),
                ))),
        );
        let engine = engine_with(db, temp_media_root(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let input = video_input(std::path::Path::new("/unused"));
        let err = engine
            .run(&input, &cancel, &|_p| {}, &|_line| {})
            .await
            .unwrap_err();
        assert!(err.contains("vid-1 failed"), "got: {err}");
        assert!(err.contains("content policy"), "got: {err}");
    }

    #[tokio::test]
    async fn missing_media_root_reported_for_artifact_stages() {
        let (db, _media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let engine = ProviderEngine::with_http(
            db,
            Arc::new(|| -> Option<std::path::PathBuf> { None }),
            Arc::new(StubHttp::new()),
            Duration::from_millis(5),
            [0, 0, 0],
        );
        let cancel = Arc::new(AtomicBool::new(false));
        let mut input = image_input(std::path::Path::new("/unused"));
        input.media_root = None; // neither the input nor the resolver offers a root
        let err = engine
            .run(&input, &cancel, &|_p| {}, &|_line| {})
            .await
            .unwrap_err();
        assert!(err.contains("no media root"), "got: {err}");
    }

    #[tokio::test]
    async fn cancel_before_start_returns_cancelled() {
        let (db, _media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let engine = engine_with(db, temp_media_root(), Arc::new(StubHttp::new()), [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(true));
        let input = image_input(std::path::Path::new("/unused"));
        let err = engine.run(
                &input,
                &cancel,
                &|_p| {},
                &|_line| {},
            ).await.unwrap_err();
        assert_eq!(err, "cancelled");
    }

    #[tokio::test]
    async fn cancel_mid_poll_aborts_video_stage() {
        let (db, media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http = Arc::new(
            StubHttp::new()
                .queue_post(Ok((200, json!({ "videoId": "vid-7" }))))
                .queue_get(Ok((200, json!({ "status": "running" }))))
                .queue_get(Ok((200, json!({ "status": "running" })))),
        );
        let engine = engine_with(db, media.clone(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        // Flip the flag after the first poll.
        let flipper = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            flipper.store(true, Ordering::Release);
        });
        let input = video_input(&media);
        let err = engine.run(
                &input,
                &cancel,
                &|_p| {},
                &|_line| {},
            ).await.unwrap_err();
        assert_eq!(err, "cancelled");
        let _ = std::fs::remove_dir_all(&media);
    }

    // ── 503 backoff sequencing ───────────────────────────────────────────────────

    #[tokio::test]
    async fn queue_full_503s_back_off_then_succeed() {
        let (db, media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http = Arc::new(
            StubHttp::new()
                .queue_post(Ok((503, json!({ "code": "video_queue_full" }))))
                .queue_post(Ok((503, json!({ "code": "video_queue_full" }))))
                .queue_post(Ok((200, json!({ "videoId": "vid-9" }))))
                .queue_get(Ok((
                    200,
                    json!({
                        "status": "completed",
                        "videoUrl": "https://cdn.test/out.mp4"
                    }),
                ))),
        );
        // Zero backoff so the test runs fast; the 503 index walk is still
        // exercised (0 → 1 → hold).
        let engine = engine_with(db, media.clone(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let input = video_input(&media);

        let out = engine.run(
                &input,
                &cancel,
                &|_p| {},
                &|_line| {},
            ).await.unwrap();
        let task_dir = media.join("pipe1").join("task1");
        assert_eq!(
            out.local_path,
            task_dir.join("video.mp4").to_string_lossy().into_owned()
        );
        // The 503 entries were logged (redacted) before the successful create.
        let req_log = std::fs::read_to_string(task_dir.join("request.log")).unwrap();
        assert!(
            req_log.contains("video-create-503"),
            "503 backoff logged: {req_log}"
        );
        let _ = std::fs::remove_dir_all(&media);
    }

    #[tokio::test]
    async fn non_queue_full_503_is_a_real_failure() {
        let (db, _media) = db_with_slots("sk-image-key", "sk-video-key").await;
        let http =
            Arc::new(StubHttp::new().queue_post(Ok((503, json!({ "code": "maintenance" })))));
        let engine = engine_with(db, temp_media_root(), http, [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let input = video_input(std::path::Path::new("/unused"));
        let err = engine.run(
                &input,
                &cancel,
                &|_p| {},
                &|_line| {},
            ).await.unwrap_err();
        assert!(err.contains("maintenance"), "got: {err}");
    }

    #[tokio::test]
    async fn missing_api_key_is_a_concrete_config_error() {
        let (db, _media) = db_with_slots("", "sk-video-key").await;
        let engine = engine_with(db, temp_media_root(), Arc::new(StubHttp::new()), [0, 0, 0]);
        let cancel = Arc::new(AtomicBool::new(false));
        let input = image_input(std::path::Path::new("/unused"));
        let err = engine.run(
                &input,
                &cancel,
                &|_p| {},
                &|_line| {},
            ).await.unwrap_err();
        assert!(err.contains("API key is not set"), "got: {err}");
    }
}
