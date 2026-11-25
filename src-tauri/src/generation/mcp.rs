//! Minimal stateless MCP JSON-RPC 2.0 client (Tier-B local transport).
//!
//! No MCP SDK crate and no session header: every call is one POST to the
//! server's JSON-RPC endpoint with `Content-Type: application/json` (set by
//! the HttpClient's JSON body) and `Accept: application/json,
//! text/event-stream`. The conversation is `initialize` (handshake) then
//! `tools/call` — the WanGP server keeps no client session.
//!
//! Transport lives on the resolved wire spec (`McpSpecWire`), never in Rust
//! config: no checkpoint path, no owner-local config, no secrets. HTTP goes
//! through the existing `HttpClient` trait so the whole flow is stub-testable
//! without a server or GPU work.

use std::path::Path;
use std::time::Duration;

use serde_json::{json, Map, Value};

use crate::generation::specs::{McpActionWire, McpSpecWire, ModelSpecWire};

use super::provider::{HttpClient, RequestAuth};

/// MCP Streamable-HTTP servers may answer either JSON or SSE; advertise both.
pub const MCP_ACCEPT: &str = "application/json, text/event-stream";
/// Protocol version observed from the owner's local server (endpoint probe
/// 2026-11-23). It is protocol data, not owner config.
pub const DEFAULT_PROTOCOL_VERSION: &str = "2025-06-18";
/// WanGP v2.1 uploads base64 chunks of at most 8 MiB DECODED bytes (the wire
/// payload is ~10.7 MiB) — under typical JSON-RPC body limits.
pub const UPLOAD_CHUNK_BYTES: usize = 8 * 1024 * 1024;

const CLIENT_NAME: &str = "visionmachine";
const CLIENT_VERSION: &str = "1.0.0";

/// Static headers for every JSON-RPC POST. `scheme: none` sends no credential
/// header (the Wan2GP preset is keyless); the Accept header rides the static
/// header slot already supported by the adapter transport.
pub fn mcp_auth() -> RequestAuth {
    RequestAuth {
        scheme: "none".into(),
        key: String::new(),
        headers: vec![("Accept".into(), MCP_ACCEPT.into())],
    }
}

// ── Pure JSON-RPC framing ────────────────────────────────────────────────────

pub fn rpc_request(id: i64, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
}

/// `initialize` request body — shared with the Settings "Test connection"
/// probe so the UI sends exactly the same handshake the engine does.
pub fn initialize_request(protocol_version: &str) -> Value {
    rpc_request(
        1,
        "initialize",
        json!({
            "protocolVersion": protocol_version,
            "capabilities": {},
            "clientInfo": { "name": CLIENT_NAME, "version": CLIENT_VERSION },
        }),
    )
}

/// True when an `initialize` result actually identifies an MCP server
/// (protocol version and/or serverInfo), not just any HTTP 200 body.
pub fn initialize_ok(result: &Value) -> bool {
    result.get("protocolVersion").and_then(Value::as_str).is_some()
        || result.get("serverInfo").map(|v| !v.is_null()).unwrap_or(false)
}

pub fn rpc_error_message(error: &Value) -> String {
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("MCP JSON-RPC error");
    match error.get("code").and_then(Value::as_i64) {
        Some(code) => format!("MCP JSON-RPC error {code}: {message}"),
        None => format!("MCP JSON-RPC error: {message}"),
    }
}

/// Validate the JSON-RPC envelope and return the `result` object. A JSON-RPC
/// `error` member is a protocol failure even on HTTP 200.
pub fn parse_response(body: &Value) -> Result<Value, String> {
    if body.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Err(format!(
            "MCP response is not JSON-RPC 2.0: {}",
            truncate(body.to_string())
        ));
    }
    if let Some(err) = body.get("error").filter(|v| !v.is_null()) {
        return Err(rpc_error_message(err));
    }
    Ok(body.get("result").cloned().unwrap_or(Value::Null))
}

/// Pull a human-readable failure out of a tool result that reported
/// `isError: true` (or of an error envelope). Never panics on shape drift.
fn failure_message(value: &Value) -> String {
    for key in ["message", "error", "detail", "reason", "text"] {
        if let Some(s) = value.get(key).and_then(Value::as_str) {
            if !s.trim().is_empty() {
                return truncate(s.to_string());
            }
        }
    }
    if let Some(text) = value
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(Value::as_str)
    {
        return truncate(text.to_string());
    }
    truncate(value.to_string())
}

fn truncate(s: String) -> String {
    if s.chars().count() <= 500 {
        s
    } else {
        format!("{}…", s.chars().take(500).collect::<String>())
    }
}

/// Extract the tool's own payload. `structuredContent` is authoritative when
/// present; otherwise parse the pretty JSON in `content[0].text` (the same
/// object is sent in both forms by the WanGP server). `isError: true` is a
/// concrete tool failure, never a successful empty result.
pub fn result_payload(result: &Value) -> Result<Value, String> {
    if result.get("isError") == Some(&Value::Bool(true)) {
        return Err(format!("MCP tool error: {}", failure_message(result)));
    }
    if let Some(sc) = result.get("structuredContent").filter(|v| !v.is_null()) {
        return Ok(sc.clone());
    }
    if let Some(text) = result
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(Value::as_str)
    {
        return Ok(serde_json::from_str::<Value>(text).unwrap_or_else(|_| Value::String(text.to_string())));
    }
    Err("MCP tool result has neither structuredContent nor content[0].text".into())
}

/// Generated artifact references from a WanGP `wangp_generate` result. The
/// server returns virtual `@outputs/...` paths (or absolute paths); both are
/// handled by `retrieve_artifact`. Shape drift is never a panic.
pub fn generated_files(payload: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let mut containers: Vec<&Value> = Vec::new();
    for key in ["generated_files", "generatedFiles", "files", "outputs"] {
        if let Some(v) = payload.get(key) {
            containers.push(v);
        }
    }
    for value in containers {
        match value {
            Value::Array(items) => {
                for item in items {
                    push_ref(&mut out, item);
                    for key in ["path", "file_path", "filePath", "name", "url", "uri", "file"] {
                        if let Some(v) = item.get(key) {
                            push_ref(&mut out, v);
                        }
                    }
                }
            }
            other => push_ref(&mut out, other),
        }
    }
    out
}

fn push_ref(out: &mut Vec<String>, value: &Value) {
    if let Some(s) = value.as_str() {
        let t = s.trim();
        if !t.is_empty() && !out.iter().any(|o| o == t) {
            out.push(t.to_string());
        }
    }
}

/// Job id carried in a successful result, when present (used only for the
/// redacted output.json `providerTaskId` — never as an artifact source).
pub fn job_id(payload: &Value) -> Option<String> {
    for key in ["job_id", "jobId", "request_id", "requestId", "id"] {
        if let Some(s) = payload.get(key).and_then(Value::as_str) {
            if !s.trim().is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// Concrete failure reported by a WanGP `wangp_generate` payload, if any.
///
/// v2.1 reports business failures INSIDE a successful JSON-RPC tool result:
/// the top-level `status` is `error`/`interrupted` and/or `result.success` is
/// false, while the real cause is `result.errors[0].message`. This MUST be
/// checked before artifact discovery — otherwise a failed job degrades into
/// the misleading "no generated_files" error and the actual cause is lost.
///
/// The first error message is returned VERBATIM (no truncation, no rewrite),
/// with the job id appended as context when present.
pub fn generate_failure_message(payload: &Value) -> Option<String> {
    let status = payload
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let result = payload.get("result").filter(|v| v.is_object());
    let success_false = result
        .and_then(|r| r.get("success"))
        .and_then(Value::as_bool)
        == Some(false);
    let status_failed =
        matches!(status.as_str(), "error" | "interrupted" | "failed" | "failure");
    if !status_failed && !success_false {
        return None;
    }
    let cause = result
        .and_then(|r| r.get("errors"))
        .and_then(Value::as_array)
        .and_then(|errors| errors.first())
        .and_then(|e| e.get("message"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|s| !s.trim().is_empty());
    let job = job_id(payload);
    Some(match (cause, job) {
        (Some(cause), Some(job)) => format!("{cause} (job_id: {job})"),
        (Some(cause), None) => cause,
        (None, Some(job)) => {
            format!("MCP generate reported status '{status}' (job_id: {job})")
        }
        (None, None) => format!("MCP generate reported status '{status}'"),
    })
}

/// Ordered artifact candidates from a WanGP `wangp_generate` payload.
///
/// v2.1 compaction DELETES `generated_files` when gallery items cover the
/// outputs, so discovery walks every known location in priority order:
///   1. `generated_files` (legacy top level, plus nested `result.` for the
///      pre-compaction v2.1 shape),
///   2. `result.gallery_items[].media_id` / `.path` (media id is the stable
///      server handle; both are collected so a failed handle can fall back),
///   3. `result.artifacts[].path` and `.side_files[]` (string or object).
///
/// Every candidate is a server-side handle (virtual `@outputs` path, gallery
/// media id, URL) or an absolute local path — retrieval decides the route.
/// Deduped, order-stable, never panics on shape drift.
pub fn artifact_references(payload: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    // 1. Legacy / pre-compaction generated_files.
    out.extend(generated_files(payload));
    let result = payload.get("result").filter(|v| v.is_object());
    if let Some(result) = result {
        out.extend(generated_files(result));
        // 2. Gallery items: media_id first, then the (possibly virtual) path.
        if let Some(items) = result.get("gallery_items").and_then(Value::as_array) {
            for item in items {
                for key in [
                    "media_id", "mediaId", "path", "file_path", "filePath", "url", "uri",
                ] {
                    push_ref(&mut out, &item[key]);
                }
            }
        }
        // 3. Artifacts: primary path plus every side file.
        if let Some(items) = result.get("artifacts").and_then(Value::as_array) {
            for item in items {
                for key in [
                    "path", "file_path", "filePath", "media_id", "mediaId", "url", "uri",
                ] {
                    push_ref(&mut out, &item[key]);
                }
                if let Some(side_files) = item.get("side_files").and_then(Value::as_array) {
                    for entry in side_files {
                        if entry.is_object() {
                            for key in [
                                "path", "media_id", "mediaId", "file_path", "filePath", "url", "uri",
                            ] {
                                push_ref(&mut out, &entry[key]);
                            }
                        } else {
                            push_ref(&mut out, entry);
                        }
                    }
                }
            }
        }
    }
    out
}

/// Read the first non-empty reference from the configured dot-path candidates
/// (one level of nesting is enough for WanGP's action responses; deeper
/// objects are searched recursively but only scalar strings are returned).
pub fn find_ref(payload: &Value, keys: &[String]) -> Option<String> {
    fn walk(v: &Value, keys: &[String], out: &mut Option<String>) {
        if out.is_some() {
            return;
        }
        match v {
            Value::Object(map) => {
                for key in keys {
                    if let Some(s) = map.get(key).and_then(Value::as_str) {
                        let t = s.trim();
                        // base64 blobs are handled by download, never used as
                        // an `image_start` reference.
                        if !t.is_empty() && !t.contains(',') {
                            *out = Some(t.to_string());
                            return;
                        }
                    }
                }
                for val in map.values() {
                    walk(val, keys, out);
                    if out.is_some() {
                        return;
                    }
                }
            }
            Value::Array(items) => {
                for val in items {
                    walk(val, keys, out);
                    if out.is_some() {
                        return;
                    }
                }
            }
            _ => {}
        }
    }
    let mut out = None;
    walk(payload, keys, &mut out);
    out
}

// ── Async transport (over the engine's pluggable HttpClient) ────────────────

pub async fn initialize(
    http: &dyn HttpClient,
    url: &str,
    protocol_version: &str,
    timeout: Duration,
) -> Result<Value, String> {
    let body = initialize_request(protocol_version);
    let (status, resp) = http
        .request_auth("POST", url, Some(&body), &mcp_auth(), timeout)
        .await?;
    if status >= 400 {
        return Err(format!("MCP initialize HTTP {status}"));
    }
    parse_response(&resp)
}

pub async fn call_tool(
    http: &dyn HttpClient,
    url: &str,
    tool: &str,
    arguments: Value,
    timeout: Duration,
) -> Result<Value, String> {
    if tool.trim().is_empty() {
        return Err("MCP config has no tool name for this call".into());
    }
    let body = rpc_request(2, "tools/call", json!({ "name": tool, "arguments": arguments }));
    let (status, resp) = http
        .request_auth("POST", url, Some(&body), &mcp_auth(), timeout)
        .await?;
    if status >= 400 {
        return Err(format!(
            "MCP tool '{tool}' HTTP {status}: {}",
            truncate(resp.to_string())
        ));
    }
    let result = parse_response(&resp)?;
    result_payload(&result)
}

/// Validate the WanGP v2.1 chunked-upload config BEFORE any network call.
/// A legacy/path-only spec fails here with a concrete, actionable error —
/// there is no silent fallback to sending a raw filesystem path.
fn validate_upload_action(action: &McpActionWire) -> Result<(), String> {
    if action.action.trim().is_empty() {
        return Err("mcp.actions.upload.action is required for i2v".into());
    }
    for (label, value) in [
        ("filenameArg", action.filename_arg.as_str()),
        ("sizeArg", action.size_arg.as_str()),
        ("chunkAction", action.chunk_action.as_str()),
        ("finishAction", action.finish_action.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(format!(
                "mcp.actions.upload.{label} is required for the WanGP v2.1 chunked upload (local image input cannot be sent as an arbitrary path)"
            ));
        }
    }
    if action.token_paths.iter().all(|p| p.trim().is_empty()) {
        return Err("mcp.actions.upload.tokenPaths must name the created upload token".into());
    }
    if action.ref_paths.iter().all(|p| p.trim().is_empty()) {
        return Err("mcp.actions.upload.refPaths must name the finished media reference".into());
    }
    Ok(())
}

/// Bare, sanitized filename for `create_file_upload` — never a path. The
/// server owns the upload namespace; the client hands it a single component.
fn upload_filename(path: &str) -> String {
    crate::generation::safe_dir_name(path)
}

/// Decoded-byte offset + base64 payload for each `upload_chunk` call. Pure so
/// the 8 MiB boundary and round-trip are pinned without a server.
fn upload_chunks(bytes: &[u8]) -> Vec<(usize, String)> {
    use base64::Engine as _;
    bytes
        .chunks(UPLOAD_CHUNK_BYTES)
        .enumerate()
        .map(|(i, chunk)| {
            (
                i * UPLOAD_CHUNK_BYTES,
                base64::engine::general_purpose::STANDARD.encode(chunk),
            )
        })
        .collect()
}

/// One `wangp_session` action call (all v2.1 upload steps ride this tool).
async fn session_action(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    action: &str,
    arguments: Value,
    timeout: Duration,
) -> Result<Value, String> {
    call_tool(
        http,
        url,
        &spec.tools.session,
        json!({ "action": action, "arguments": arguments }),
        timeout,
    )
    .await
}

/// Upload a LOCAL media file through the WanGP v2.1 three-step handshake and
/// return the AUTHORIZED reference the server handed back — the exact value
/// the engine puts into `settings.image_start`.
///
/// 1. `create_file_upload(filename, size_bytes)` -> one-time token
/// 2. `upload_chunk(token, offset, data_base64)` for each <=8 MiB decoded chunk
/// 3. `finish_upload(token)` -> media reference (path / media id)
///
/// Missing token or reference is a hard error: image input is never silently
/// dropped or replaced with an arbitrary filesystem path.
pub async fn upload_media(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    path: &str,
    timeout: Duration,
) -> Result<String, String> {
    let action = spec
        .actions
        .as_ref()
        .and_then(|a| a.upload.as_ref())
        .ok_or_else(|| {
            "i2v needs mcp.actions.upload (WanGP v2.1 chunked upload) — local image input cannot be sent as an arbitrary path".to_string()
        })?;
    validate_upload_action(action)?;

    let file = std::path::Path::new(path);
    if !file.is_file() {
        return Err(format!(
            "local media '{path}' is not a readable file — i2v upload aborted"
        ));
    }
    let bytes = std::fs::read(file).map_err(|e| format!("read local media '{path}': {e}"))?;
    let filename = upload_filename(path);

    // 1. Create: bare filename + decoded size only (no path, no bytes).
    let mut create_args = Map::new();
    create_args.insert(action.filename_arg.clone(), Value::String(filename.clone()));
    create_args.insert(action.size_arg.clone(), json!(bytes.len()));
    let created = session_action(
        http,
        url,
        spec,
        &action.action,
        Value::Object(create_args),
        timeout,
    )
    .await?;
    let token = find_ref(&created, &action.token_paths).ok_or_else(|| {
        format!(
            "wangp_session '{}' returned no upload token for '{filename}' — checked tokenPaths: {}",
            action.action,
            action.token_paths.join(", ")
        )
    })?;

    // 2. Chunks: base64 of each <=8 MiB decoded slice, with its byte offset.
    for (offset, data_base64) in upload_chunks(&bytes) {
        session_action(
            http,
            url,
            spec,
            &action.chunk_action,
            json!({ "token": token, "offset": offset, "data_base64": data_base64 }),
            timeout,
        )
        .await?;
    }

    // 3. Finish: the returned reference is what goes into image_start.
    let finished = session_action(
        http,
        url,
        spec,
        &action.finish_action,
        json!({ "token": token }),
        timeout,
    )
    .await?;
    find_ref(&finished, &action.ref_paths).ok_or_else(|| {
        format!(
            "wangp_session '{}' returned no media reference for '{filename}' — checked refPaths: {}",
            action.finish_action,
            action.ref_paths.join(", ")
        )
    })
}

/// Ask `wangp_session` to turn a server-side artifact handle — a virtual
/// `@outputs` path OR a gallery media id — into a downloadable reference.
/// Rides the same `call_tool` JSON-RPC transport as the upload handshake;
/// the returned object is consumed by `retrieve_artifact` (path / URL /
/// in-band bytes). Never fabricates a reference from a missing action.
pub async fn create_file_download(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    reference: &str,
    timeout: Duration,
) -> Result<Value, String> {
    let action = spec
        .actions
        .as_ref()
        .and_then(|a| a.download.as_ref())
        .ok_or_else(|| {
            "MCP artifact needs mcp.actions.download (wangp_session create_file_download action)".to_string()
        })?;
    if action.action.trim().is_empty() || action.path_arg.trim().is_empty() {
        return Err("mcp.actions.download is incomplete (action + pathArg required)".into());
    }
    let mut args = Map::new();
    args.insert(action.path_arg.clone(), Value::String(reference.to_string()));
    call_tool(
        http,
        url,
        &spec.tools.session,
        json!({ "action": action.action, "arguments": Value::Object(args) }),
        timeout,
    )
    .await
}

/// Resolve a root-relative download path against the MCP endpoint's ORIGIN.
/// WanGP v2.1 `create_file_download` returns `download_url` as
/// `/wangp_api/files/download/<token>` (relative to the server, not to `/mcp`);
/// the artifact must be fetched from that same host. Pure and dependency-free:
/// accepts only `http`/`https` bases and root-relative paths, so a virtual
/// `@outputs/...` handle or a foreign absolute URL is never rewritten here.
fn absolute_url_from(base: &str, path: &str) -> Option<String> {
    if !path.starts_with('/') || path.starts_with("//") {
        return None;
    }
    let (scheme, rest) = base.split_once("://")?;
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return None;
    }
    // Everything up to the first '/' after `scheme://` is the origin; a base
    // with no trailing path (`http://host:port`) is handled by split('/').next().
    let authority = rest.split('/').next()?;
    if authority.is_empty() {
        return None;
    }
    Some(format!("{scheme}://{authority}{path}"))
}

/// Retrieve a generated artifact referenced by a `wangp_generate` result.
/// Absolute local paths are read directly; http(s) URLs are downloaded; every
/// other handle (virtual `@outputs` path, gallery media id, server-side
/// relative path) goes through `wangp_session create_file_download` to obtain
/// a downloadable reference before the existing byte/path/URL handling below.
pub async fn retrieve_artifact(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    reference: &str,
    dest: &Path,
    timeout: Duration,
) -> Result<(), String> {
    let payload = if Path::new(reference).is_absolute() && Path::new(reference).is_file() {
        return copy_local(reference, dest);
    } else if reference.starts_with("http://") || reference.starts_with("https://") {
        return http.download(reference, dest, "").await;
    } else {
        create_file_download(http, url, spec, reference, timeout).await?
    };
    // A download action can return in-band bytes (base64) or an authorized
    // path/URL. Accept only those three shapes; anything else is a concrete
    // failure, never a fabricated artifact.
    use base64::Engine as _;
    for key in ["content_base64", "base64", "content"] {
        if let Some(s) = payload.get(key).and_then(Value::as_str) {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(s.trim())
                .map_err(|e| format!("MCP artifact base64 decode failed: {e}"))?;
            return write_bytes(dest, &bytes);
        }
    }
    // WanGP v2.1 returns a ROOT-RELATIVE `download_url` alongside a still
    // virtual `path` (`@outputs/...`): the URL must win, otherwise retrieval
    // falls through to the misleading "no bytes/path" error. Keep the final
    // error honest by reporting the last candidate that was actually seen.
    let mut last_detail: Option<String> = None;
    for key in [
        "download_url", "path", "file_path", "filePath", "url", "uri", "file",
    ] {
        if let Some(s) = payload.get(key).and_then(Value::as_str) {
            let s = s.trim();
            if s.is_empty() {
                continue;
            }
            last_detail = Some(format!("{key}={s}"));
            if Path::new(s).is_absolute() && Path::new(s).is_file() {
                return copy_local(s, dest);
            }
            if s.starts_with("http://") || s.starts_with("https://") {
                return http.download(s, dest, "").await;
            }
            if s.starts_with('/') {
                if let Some(download_url) = absolute_url_from(url, s) {
                    return http.download(&download_url, dest, "").await;
                }
            }
        }
    }
    match last_detail {
        Some(detail) => Err(format!(
            "wangp_session download returned no artifact bytes/path for '{reference}' (last: '{detail}')"
        )),
        None => Err(format!(
            "wangp_session download returned no artifact bytes/path for '{reference}'"
        )),
    }
}

/// Poll a submitted WanGP job. `wait_s` is the server-side long-poll window
/// (Wan2GP caps it at 600): the call returns as soon as the job is terminal
/// OR the window elapses, with the job's latest progress snapshot either way.
/// Rides the same `wangp_session` tool transport as the upload/download
/// actions; `event_limit` stays 0 so each poll is a light progress read.
pub async fn get_job(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    job_id: &str,
    wait_s: u32,
    timeout: Duration,
) -> Result<Value, String> {
    session_action(
        http,
        url,
        spec,
        "get_job",
        json!({ "job_id": job_id, "wait_s": wait_s, "event_limit": 0 }),
        timeout,
    )
    .await
}

/// Stop a submitted WanGP job by its server-side id. The returned snapshot
/// reports `status: "interrupted"`; the engine treats that as a terminal,
/// user-requested stop.
pub async fn cancel_job(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    job_id: &str,
    timeout: Duration,
) -> Result<Value, String> {
    session_action(http, url, spec, "cancel_job", json!({ "job_id": job_id }), timeout).await
}

/// Latest progress as (fraction 0..=1, human label) from a job snapshot.
/// Prefers `progress.current_step/total_steps`, falls back to the percent
/// field, else keeps a 0.0 fraction with the phase/status text — never
/// fabricates a fraction. The label folds in "phase x/y" when step counts
/// are present so the UI can show "Denoising 12/50".
pub fn job_progress(snapshot: &Value) -> (f64, String) {
    let progress = snapshot.get("progress");
    let cur = progress.and_then(|p| p.get("current_step")).and_then(Value::as_i64);
    let total = progress.and_then(|p| p.get("total_steps")).and_then(Value::as_i64);
    let pct = progress.and_then(|p| p.get("progress")).and_then(Value::as_f64);
    let phase = progress
        .and_then(|p| p.get("phase").or_else(|| p.get("status")))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    let frac = match (cur, total, pct) {
        (Some(c), Some(t), _) if t > 0 => (c as f64 / t as f64).clamp(0.0, 1.0),
        (_, _, Some(p)) => (p / 100.0).clamp(0.0, 1.0),
        _ => 0.0,
    };
    let label = match (cur, total) {
        (Some(c), Some(t)) if phase.is_empty() => format!("{c}/{t}"),
        (Some(c), Some(t)) => format!("{phase} {c}/{t}"),
        _ => phase.to_string(),
    };
    (frac, label)
}

/// True when a snapshot reports a terminal job status (done / error /
/// interrupted) — the watch loop stops and hands the snapshot to the
/// terminal artifact/failure handling.
pub fn job_terminal(snapshot: &Value) -> bool {
    snapshot.get("done").and_then(Value::as_bool).unwrap_or(false)
        || matches!(
            snapshot.get("status").and_then(Value::as_str),
            Some("done" | "error" | "interrupted")
        )
}

fn copy_local(from: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    std::fs::copy(from, dest)
        .map(|_| ())
        .map_err(|e| format!("copy MCP artifact: {e}"))
}

fn write_bytes(dest: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    std::fs::write(dest, bytes).map_err(|e| format!("write MCP artifact: {e}"))
}

// ── Model-specific wire prompt shaping (pure, std-only) ────────────────────

/// Shape the outbound prompt according to the MODEL's declared prompt style.
/// Everything except `promptStyle: "plain-timed"` returns the ORIGINAL string
/// verbatim — no trim, no reorder, no colon cleanup, byte-for-byte identical.
pub fn transform_prompt_for_model(spec: &ModelSpecWire, prompt: &str, fps: u32) -> String {
    if spec.prompt_style.as_deref() != Some("plain-timed") {
        return prompt.to_string();
    }
    plain_timed_prompt(prompt, fps)
}

/// Shot-name labels are replaced with a trailing comma; every other colon
/// becomes ", ". Longest labels first so `extreme close:` wins over `close:`.
const SHOT_LABELS: &[(&str, &str)] = &[
    ("extreme close:", "extreme close-up shot,"),
    ("close-up:", "close-up shot,"),
    ("closeup:", "close-up shot,"),
    ("close:", "close-up shot,"),
    ("top-down:", "top-down shot,"),
    ("top:", "top-down shot,"),
    ("aerial:", "aerial shot,"),
    ("overhead:", "overhead shot,"),
    ("medium:", "medium shot,"),
    ("wide:", "wide shot,"),
    ("low:", "low shot,"),
    ("high:", "high shot,"),
];

/// Drop every angle-bracket tag, keeping inner text in document order.
fn strip_tags(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    while i < text.len() {
        if text.as_bytes()[i] == b'<' {
            if let Some(rel) = text[i..].find('>') {
                i += rel + 1; // skip the whole <tag ...> or </tag>
                continue;
            }
        }
        let ch = text[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// ASCII case-insensitive literal replacement (no regex crate). The lowercase
/// copy keeps byte offsets because `to_ascii_lowercase` never changes UTF-8
/// character widths.
fn replace_ci(text: &str, needle: &str, replacement: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let nl = needle.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    while i < text.len() {
        if lower.as_bytes()[i..].starts_with(nl) {
            out.push_str(replacement);
            i += nl.len();
        } else {
            let ch = text[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

fn replace_colons(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    while i < text.len() {
        let mut matched = false;
        for (from, to) in SHOT_LABELS {
            if lower.as_bytes()[i..].starts_with(from.as_bytes()) {
                out.push_str(to);
                i += from.len();
                matched = true;
                break;
            }
        }
        if matched {
            continue;
        }
        if text.as_bytes()[i] == b':' {
            out.push_str(", ");
            i += 1;
            continue;
        }
        let ch = text[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Strip the oral narration markers at a line/sentence start. `there is` /
/// `there are` are checked before the shorter `there ` prefix.
fn strip_leading_oral(s: &str) -> &str {
    let mut t = s.trim_start();
    loop {
        let low = t.to_ascii_lowercase();
        let mut n = 0usize;
        for marker in ["there are ", "there is ", "there ", "and then "] {
            if low.starts_with(marker) {
                n = marker.len();
                break;
            }
        }
        if n == 0 {
            return t;
        }
        t = t[n..].trim_start();
    }
}

fn oral_cleanup(text: &str) -> String {
    let replaced = replace_ci(text, " and then ", ", ");
    // A sentence starts at the text start and after `.`/`!`/`?` followed by
    // whitespace (a dot inside "1.5s" is not a sentence boundary).
    let mut out = String::with_capacity(replaced.len());
    let mut chunk_start = 0usize;
    for (i, ch) in replaced.char_indices() {
        if matches!(ch, '.' | '!' | '?') {
            let next = replaced[i + ch.len_utf8()..].chars().next();
            if next.map_or(true, |c| c.is_whitespace()) {
                out.push_str(strip_leading_oral(&replaced[chunk_start..=i]));
                out.push(' ');
                chunk_start = i + ch.len_utf8();
            }
        }
    }
    out.push_str(strip_leading_oral(&replaced[chunk_start..]));
    out
}

/// Story/event markers that H3's DWD speaks when they survive the prompt.
/// Phrases are matched literally (case-insensitive); single words need a
/// token boundary so a visual clause like "wide open sky" survives.
const STORY_PHRASES: &[&str] = &[
    "fithting with",
    "fighting with",
    "struck when",
    "poop over",
    "settles into",
    "shatters when",
    "emerges from",
    "forcing a",
    "comes and",
    "scene_0.shot_1",
    "navigates the",
    "tracking a towering",
    "redefine reality",
    "the scene shifts",
    "carries over",
    "leaves the story",
    "next clip",
    "hand-off",
];
const STORY_WORDS: &[&str] = &["develops", "opens", "continues", "desperate", "they"];

/// Split descriptive text at clause boundaries: commas, semicolons, the
/// middot separators used by `global_style`, newlines and sentence-ending
/// `. ` (but never the dot inside a cue like `1.5s`).
fn clause_slices(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut i = 0usize;
    while i < text.len() {
        let ch = text[i..].chars().next().unwrap();
        let sep_len = match ch {
            ',' | ';' | '\n' | '\r' | '·' | '•' => ch.len_utf8(),
            '.' if text[i + 1..].chars().next().map_or(true, char::is_whitespace) => 1,
            _ => 0,
        };
        if sep_len > 0 {
            out.push(&text[start..i]);
            i += sep_len;
            start = i;
        } else {
            i += ch.len_utf8();
        }
    }
    out.push(&text[start..]);
    out
}

fn is_story_clause(clause: &str) -> bool {
    let low = clause.to_ascii_lowercase();
    if STORY_PHRASES.iter().any(|marker| low.contains(marker)) {
        return true;
    }
    low.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .any(|word| STORY_WORDS.contains(&word))
}

/// Remove narrated story/events, keeping visual, style and ambience clauses.
/// Retaining nothing is legal: the caller emits an empty line, never crashes.
fn drop_story_clauses(text: &str) -> String {
    clause_slices(text)
        .into_iter()
        .map(str::trim)
        .filter(|clause| !clause.is_empty() && !is_story_clause(clause))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Strip tags, drop narration clauses, clean descriptive text, collapse
/// whitespace into one line. Colon/oral cleanup runs before timecodes exist.
fn clean_descriptive(text: &str) -> String {
    let coloned = replace_colons(&strip_tags(text));
    let mut lines = Vec::new();
    for line in coloned.split('\n') {
        let sanitized = drop_story_clauses(line);
        let collapsed = oral_cleanup(&sanitized)
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !collapsed.is_empty() {
            lines.push(collapsed);
        }
    }
    lines.join(" ")
}

/// Top-level text (global_style / audio / leftover tags) stays before the
/// timed block, one cleaned plain line per original source line.
fn push_plain_lines(out: &mut Vec<String>, text: &str) {
    for line in text.split('\n') {
        let cleaned = clean_descriptive(line);
        if !cleaned.is_empty() {
            out.push(cleaned);
        }
    }
}

/// Read `length="40f"` / `length="5s"` from a `<segments ...>` opening tag.
fn segment_length_seconds(attrs: &str, fps: u32) -> Option<f64> {
    let lower = attrs.to_ascii_lowercase();
    let b = lower.as_bytes();
    let mut from = 0usize;
    while let Some(rel) = lower[from..].find("length") {
        let start = from + rel;
        // Skip `mylength` / `data-length`: the attribute name must stand alone.
        if start > 0 && (b[start - 1].is_ascii_alphanumeric() || b[start - 1] == b'-') {
            from = start + 6;
            continue;
        }
        let mut j = start + 6;
        while j < b.len() && b[j].is_ascii_whitespace() {
            j += 1;
        }
        if j >= b.len() || b[j] != b'=' {
            from = start + 6;
            continue;
        }
        j += 1;
        while j < b.len() && b[j].is_ascii_whitespace() {
            j += 1;
        }
        if j < b.len() && (b[j] == b'"' || b[j] == b'\'') {
            j += 1;
        }
        let num_start = j;
        while j < b.len() && (b[j].is_ascii_digit() || b[j] == b'.') {
            j += 1;
        }
        if j == num_start || j >= b.len() {
            from = j.max(start + 6);
            continue;
        }
        let Ok(n) = attrs[num_start..j].parse::<f64>() else {
            from = j;
            continue;
        };
        return Some(match b[j] {
            b'f' => n / fps.max(1) as f64,
            b's' => n,
            _ => {
                from = j;
                continue;
            }
        });
    }
    None
}

/// Locate a real `<segments` opening tag (not `<segmentsX>`), or None.
fn find_segments_open(text: &str, from: usize) -> Option<usize> {
    let mut at = from;
    while let Some(rel) = text[at..].find("<segments") {
        let idx = at + rel;
        let next = text.as_bytes().get(idx + "<segments".len()).copied();
        if next.map_or(true, |c| c.is_ascii_whitespace() || c == b'>') {
            return Some(idx);
        }
        at = idx + "<segments".len();
    }
    None
}

/// Zero-padded mm:ss.cc clock, centiseconds floored (no integer truncation).
fn clock(seconds: f64) -> String {
    let cs = (seconds.max(0.0) * 100.0).floor() as u64;
    format!("{:02}:{:02}.{:02}", cs / 6000, (cs / 100) % 60, cs % 100)
}

/// Byte spans of `after Xs` / `for Xs along` cues inside a RAW tag body.
/// `lower` must be the ASCII-lowercase form of the body (same byte offsets).
fn cue_spans(lower: &str) -> Vec<(usize, usize)> {
    let b = lower.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0usize;
    while i < lower.len() {
        let key_len = if lower[i..].starts_with("after ") {
            6
        } else if lower[i..].starts_with("for ") {
            4
        } else {
            // Advance by a full UTF-8 character: tag bodies contain `·`
            // separators, and byte-stepping would slice inside them.
            i += lower[i..].chars().next().map_or(1, char::len_utf8);
            continue;
        };
        let num_start = i + key_len;
        let mut j = num_start;
        while j < b.len() && (b[j].is_ascii_digit() || b[j] == b'.') {
            j += 1;
        }
        if j == num_start || j >= b.len() || b[j] != b's' || lower[num_start..j].parse::<f64>().is_err() {
            i += lower[i..].chars().next().map_or(1, char::len_utf8);
            continue;
        }
        let mut end = j + 1;
        if key_len == 4 && lower[end..].starts_with(" along") {
            end += " along".len();
        }
        spans.push((i, end));
        i = end;
    }
    spans
}

/// Absolute tag range from the raw body's relative cues, clamped to the
/// parent segment. `after Xs` moves the start, `for Xs along` pulls the end in.
fn cue_bounds(body: &str, seg_start: f64, seg_end: f64) -> (f64, f64) {
    let lower = body.to_ascii_lowercase();
    let mut start = seg_start;
    let mut end = seg_end;
    for (from, to) in cue_spans(&lower) {
        let cue = &lower[from..to];
        let num = cue
            .trim_start_matches("after ")
            .trim_start_matches("for ")
            .trim_end_matches(" along")
            .trim_end_matches('s');
        if let Ok(value) = num.parse::<f64>() {
            if cue.starts_with("after ") {
                start = seg_start + value;
            } else {
                end = seg_end - value;
            }
        }
    }
    let clamp = |v: f64| v.max(seg_start).min(seg_end);
    let start = clamp(start);
    let end = clamp(end).max(start);
    (start, end)
}

/// Remove the relative cue prefix so only the descriptive clause is emitted.
fn strip_cue_prefix(body: &str) -> String {
    let lower = body.to_ascii_lowercase();
    let mut out = String::with_capacity(body.len());
    let mut cursor = 0usize;
    for (from, to) in cue_spans(&lower) {
        if from < cursor {
            continue;
        }
        out.push_str(&body[cursor..from]);
        cursor = to;
    }
    out.push_str(&body[cursor..]);
    out.trim_matches(|c: char| matches!(c, ' ' | '\t' | '\n' | '\r' | ',' | '-' | '·' | '•'))
        .to_string()
}

/// Closed inner `<tag>body</tag>` pairs in document order:
/// (lowercase name, raw body, opening byte, byte after closing tag).
fn inner_tags(inner: &str) -> Vec<(String, &str, usize, usize)> {
    let lower = inner.to_ascii_lowercase();
    let mut result = Vec::new();
    let mut cursor = 0usize;
    while let Some(rel) = inner[cursor..].find('<') {
        let open = cursor + rel;
        if inner[open..].starts_with("</") || inner[open..].starts_with("<!--") {
            cursor = open + 1;
            continue;
        }
        let Some(gt_rel) = inner[open..].find('>') else { break };
        let gt = open + gt_rel;
        let name = inner[open + 1..gt]
            .split(|c: char| c.is_ascii_whitespace() || c == '/' || c == '<')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if name.is_empty()
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            cursor = gt + 1;
            continue;
        }
        let close_pat = format!("</{}>", name);
        let Some(close_rel) = lower[gt + 1..].find(&close_pat) else {
            cursor = gt + 1;
            continue;
        };
        let close = gt + 1 + close_rel;
        result.push((name, &inner[gt + 1..close], open, close + close_pat.len()));
        cursor = close + close_pat.len();
    }
    result
}

/// Non-tag text inside a segment (defensive: today's prompt engine emits
/// only closed tag pairs) keeps the segment's full range, indented.
fn push_inner_gap(out: &mut Vec<String>, text: &str, start: f64, end: f64) {
    for line in text.split('\n') {
        let cleaned = clean_descriptive(line);
        if !cleaned.is_empty() {
            out.push(format!("  [{} - {}] {}", clock(start), clock(end), cleaned));
        }
    }
}

/// The "plain-timed" conversion: top-level plain lines first, then a segment
/// header plus one indented labelled line per inner tag with its own absolute
/// centisecond range. All text is cleaned BEFORE generated timecodes are
/// inserted, so the mm:ss.cc colons survive. A prompt with no `<segments>`
/// never gets a timecode.
fn plain_timed_prompt(prompt: &str, fps: u32) -> String {
    let fps = if fps == 0 { 24 } else { fps };
    let mut out: Vec<String> = Vec::new();
    let mut cursor = 0usize;
    let mut elapsed = 0.0f64;
    let mut segment_no = 0usize;

    while let Some(open) = find_segments_open(prompt, cursor) {
        push_plain_lines(&mut out, &prompt[cursor..open]);
        let open_end = prompt[open..]
            .find('>')
            .map(|i| open + i)
            .unwrap_or(prompt.len());
        let close = prompt[open_end..]
            .find("</segments>")
            .map(|i| open_end + i)
            .unwrap_or(prompt.len());
        let inner = &prompt[open_end + 1..close];

        segment_no += 1;
        let duration = segment_length_seconds(&prompt[open + "<segments".len()..open_end], fps)
            .unwrap_or(0.0)
            .max(0.0);
        let start = elapsed;
        let end = start + duration;
        out.push(format!(
            "[{} - {}] segment {}",
            clock(start),
            clock(end),
            segment_no
        ));

        let mut gap_cursor = 0usize;
        for (name, body, tag_open, tag_close) in inner_tags(inner) {
            push_inner_gap(&mut out, &inner[gap_cursor..tag_open], start, end);
            gap_cursor = tag_close;
            let (tag_start, tag_end) = cue_bounds(body, start, end);
            let cleaned = clean_descriptive(&strip_cue_prefix(body));
            out.push(format!(
                "  [{} - {}] {} — {}",
                clock(tag_start),
                clock(tag_end),
                name,
                cleaned
            ));
        }
        push_inner_gap(&mut out, &inner[gap_cursor..], start, end);

        elapsed = end;
        cursor = if close < prompt.len() {
            close + "</segments>".len()
        } else {
            prompt.len()
        };
    }
    push_plain_lines(&mut out, &prompt[cursor..]);
    out.join("\n")
}

// ── Pure parsing tests (stub HTTP drives the engine-level flow in provider.rs) ──

#[cfg(test)]
mod tests {
    use super::*;

    fn plain_timed_spec() -> ModelSpecWire {
        ModelSpecWire {
            id: "minimax_h3_fl2va_pruned_pi_dwd_2step".into(),
            prompt_style: Some("plain-timed".into()),
            ..Default::default()
        }
    }

    #[test]
    fn prompt_transform_passes_every_other_model_through_byte_for_byte() {
        let prompt = "  <global_style>wide: keep me EXACT</global_style> \n\t<timeline>x</timeline>  ";
        for spec in [
            ModelSpecWire::default(),
            ModelSpecWire {
                id: "ti2v_2_2".into(),
                prompt_style: Some("verbatim".into()),
                ..Default::default()
            },
        ] {
            assert_eq!(
                transform_prompt_for_model(&spec, prompt, 24),
                prompt.to_string(),
                "only the declared plain-timed style may reshape a prompt"
            );
        }
    }

    #[test]
    fn prompt_transform_plain_timed_exact_output() {
        let prompt = concat!(
            "<global_style>there Google bubble with comix eyes and eyebrows is fithting with M$ bubble and then they struck when Anthropic bubble comes and poop over both, lived-in cinematic space, motivated light, deep detail, tactile surfaces · bright neutral daylight · wide: rule_of_thirds framing · ambience: quiet location ambience, soft natural sound bed</global_style>\n",
            "<audio>ambience: soft rain</audio>\n",
            "<timeline>\n",
            "<segments length=\"5s\">\n",
            "<scene>Google bubble, lived-in cinematic space</scene>\n",
            "<camera>after 2s, for 1s along - close-up: fill_frame framing, shallow depth of field, 85mm lens</camera>\n",
            "</segments>\n",
            "<segments length=\"2s\">\n",
            "<scene>after 1s - Google bubble, bright daylight</scene>\n",
            "</segments>\n",
            "</timeline>",
        );
        let expected = concat!(
            "lived-in cinematic space, motivated light, deep detail, tactile surfaces, bright neutral daylight, wide shot, rule_of_thirds framing, ambience, quiet location ambience, soft natural sound bed\n",
            "ambience, soft rain\n",
            "[00:00.00 - 00:05.00] segment 1\n",
            "  [00:00.00 - 00:05.00] scene — Google bubble, lived-in cinematic space\n",
            "  [00:02.00 - 00:04.00] camera — close-up shot, fill_frame framing, shallow depth of field, 85mm lens\n",
            "[00:05.00 - 00:07.00] segment 2\n",
            "  [00:06.00 - 00:07.00] scene — Google bubble, bright daylight",
        );
        let shaped = transform_prompt_for_model(&plain_timed_spec(), prompt, 24);
        assert_eq!(shaped, expected);
        assert!(!shaped.contains('<') && !shaped.contains('>'));
        for forbidden in ["there", "and then", "struck when", "poop over", "fithting with"] {
            assert!(
                !shaped.to_ascii_lowercase().contains(forbidden),
                "narration leaked: {forbidden} in {shaped}"
            );
        }
    }

    #[test]
    fn prompt_transform_plain_timed_tag_for_along_pulls_end_earlier() {
        let prompt = "<segments length=\"5s\"><scene>for 1s along - wide: coast</scene></segments>";
        let expected = concat!(
            "[00:00.00 - 00:05.00] segment 1\n",
            "  [00:00.00 - 00:04.00] scene — wide shot, coast",
        );
        assert_eq!(transform_prompt_for_model(&plain_timed_spec(), prompt, 24), expected);
    }

    #[test]
    fn prompt_transform_plain_timed_handles_untagged_text_and_zero_fps() {
        let spec = plain_timed_spec();
        // No tags and no segments => cleanup only, never a timecode.
        assert_eq!(
            transform_prompt_for_model(&spec, "there are two things and then three  ", 24),
            "two things, three"
        );
        // fps 0 falls back to 24: 48f = 2s; a total over 60s rolls into mm.
        let prompt = "<segments length=\"48f\"><scene>there is a high: view</scene></segments>";
        assert_eq!(
            transform_prompt_for_model(&spec, prompt, 0),
            "[00:00.00 - 00:02.00] segment 1\n  [00:00.00 - 00:02.00] scene — a high shot, view"
        );
        // Centiseconds are floored: 40f @ 24fps = 1.666..s -> 00:01.66.
        let frames = "<segments length=\"40f\"><scene>aerial: coast</scene></segments>";
        assert_eq!(
            transform_prompt_for_model(&spec, frames, 24),
            "[00:00.00 - 00:01.66] segment 1\n  [00:00.00 - 00:01.66] scene — aerial shot, coast"
        );
        let long = "<segments length=\"90s\"><scene>aerial: coast</scene></segments>";
        assert_eq!(
            transform_prompt_for_model(&spec, long, 24),
            "[00:00.00 - 01:30.00] segment 1\n  [00:00.00 - 01:30.00] scene — aerial shot, coast"
        );
    }

    /// Live `wangp_session get_job` snapshots: running jobs carry
    /// `progress{current_step,total_steps,phase}`, terminal ones carry
    /// `result{success,errors,gallery_items}`. These shapes are the poll
    /// path's only input — no model / MCP server involved.
    #[test]
    fn job_snapshot_progress_and_terminal_detection() {
        let running = json!({
            "job_id": "j1", "done": false,
            "progress": {"current_step": 12, "total_steps": 25, "phase": "Denoising"}
        });
        assert!(!job_terminal(&running));
        let (frac, label) = job_progress(&running);
        assert!((frac - 0.48).abs() < 1e-9, "{frac}");
        assert_eq!(label, "Denoising 12/25");

        let pct = json!({"done": false, "progress": {"progress": 75.0, "status": "Sampling"}});
        assert!((job_progress(&pct).0 - 0.75).abs() < 1e-9);
        assert_eq!(job_progress(&pct).1, "Sampling");

        for terminal in [
            json!({"done": true, "result": {"success": true}}),
            json!({"done": false, "status": "error"}),
            json!({"done": false, "status": "interrupted"}),
        ] {
            assert!(job_terminal(&terminal), "{terminal}");
        }
    }

    #[test]
    fn terminal_snapshot_failure_and_artifacts_use_result_shape() {
        let failed = json!({
            "done": true,
            "result": {"success": false,
                "errors": [{"message": "CUDA out of memory"}], "generated_files": []}
        });
        assert!(generate_failure_message(&failed).unwrap().contains("CUDA out of memory"));

        let done = json!({
            "done": true,
            "result": {"success": true, "generated_files": [],
                "gallery_items": [{"media_id": "m1", "path": "@outputs/v.mp4"}]}
        });
        assert!(generate_failure_message(&done).is_none());
        assert_eq!(artifact_references(&done), vec!["m1", "@outputs/v.mp4"]);
    }

    #[test]
    fn rpc_request_is_jsonrpc_2() {
        let r = rpc_request(7, "initialize", json!({"x": 1}));
        assert_eq!(r["jsonrpc"], "2.0");
        assert_eq!(r["id"], 7);
        assert_eq!(r["method"], "initialize");
        assert_eq!(r["params"]["x"], 1);
        let init = initialize_request(DEFAULT_PROTOCOL_VERSION);
        assert_eq!(init["params"]["protocolVersion"], DEFAULT_PROTOCOL_VERSION);
        assert_eq!(init["params"]["clientInfo"]["name"], CLIENT_NAME);
    }

    #[test]
    fn parse_response_rejects_bad_envelope_and_rpc_error() {
        assert!(parse_response(&json!({"jsonrpc": "1.0", "result": {}})).is_err());
        let bad = parse_response(&json!({
            "jsonrpc": "2.0", "id": 2,
            "error": { "code": -32601, "message": "Method not found" }
        }));
        assert_eq!(bad.unwrap_err(), "MCP JSON-RPC error -32601: Method not found");
        let ok = parse_response(&json!({"jsonrpc": "2.0", "result": {"ok": true}})).unwrap();
        assert_eq!(ok["ok"], true);
        // HTTP 200 with an absent `result` still parses as a (later-validated)
        // null — the protocol envelope is what matters here.
        assert!(parse_response(&json!({"jsonrpc": "2.0"})).unwrap().is_null());
    }

    #[test]
    fn is_error_beats_structured_content() {
        let result = json!({
            "isError": true,
            "structuredContent": { "status": "failed" },
            "content": [{"type": "text", "text": "{\"message\":\"out of VRAM\"}"}],
        });
        let err = result_payload(&result).unwrap_err();
        assert!(err.contains("out of VRAM"), "error text must be surfaced: {err}");
    }

    #[test]
    fn structured_content_preferred_then_content_text_fallback() {
        let sc = json!({
            "structuredContent": { "status": "done", "generated_files": ["@outputs/v.mp4"] },
            "content": [{"type": "text", "text": "{\"status\":\"stale\"}"}],
            "isError": false
        });
        let payload = result_payload(&sc).unwrap();
        assert_eq!(payload["status"], "done");
        assert_eq!(generated_files(&payload), vec!["@outputs/v.mp4"]);

        let fallback = json!({
            "content": [{"type": "text", "text": "{\n  \"status\": \"done\",\n  \"generated_files\": [\"@outputs/a.mp4\", \"@outputs/b.mp4\"]\n}"}],
            "isError": false
        });
        let payload = result_payload(&fallback).unwrap();
        assert_eq!(generated_files(&payload).len(), 2);
        assert_eq!(generated_files(&payload)[0], "@outputs/a.mp4");
    }

    #[test]
    fn generated_files_handles_objects_and_dedupes() {
        let payload = json!({
            "generated_files": [
                { "path": "@outputs/one.mp4" },
                "@outputs/one.mp4",
                { "file_path": "@outputs/two.mp4" }
            ]
        });
        assert_eq!(
            generated_files(&payload),
            vec!["@outputs/one.mp4", "@outputs/two.mp4"]
        );
    }

    /// Exact failure shape verified from the owner's request.log (WanGP runs
    /// offline without its tokenizer files). Kept verbatim — the client must
    /// surface this text, never a synthesized "no generated_files" error.
    const OFFLINE_ERROR: &str =
        "special_tokens_map.json is missing and WanGP runs offline (--offline)...";

    fn wangp_failed_payload() -> Value {
        json!({
            "status": "error",
            "done": true,
            "job_id": "job-offline-1",
            "result": {
                "success": false,
                "artifacts": [],
                "errors": [
                    { "message": OFFLINE_ERROR, "stage": "generation" },
                    { "message": "second error must not win", "stage": "queue" }
                ],
                "failed_tasks": 1,
                "gallery_items": [],
                "successful_tasks": 0,
                "total_tasks": 1
            }
        })
    }

    #[test]
    fn generate_failure_message_surfaces_first_error_verbatim_plus_job_id() {
        let msg = generate_failure_message(&wangp_failed_payload()).unwrap();
        assert!(msg.contains(OFFLINE_ERROR), "verbatim cause missing: {msg}");
        assert!(msg.contains("job-offline-1"), "job id missing: {msg}");
        assert!(
            !msg.contains("second error"),
            "only the FIRST errors[] message is surfaced: {msg}"
        );

        // success=false alone (no telling status) is still a failure.
        let mut no_status = wangp_failed_payload();
        no_status.as_object_mut().unwrap().remove("status");
        assert!(generate_failure_message(&no_status).unwrap().contains(OFFLINE_ERROR));

        // interrupted with no errors[] still produces an explicit failure.
        let interrupted = json!({
            "status": "interrupted", "done": true, "job_id": "job-2",
            "result": { "success": false, "errors": [] }
        });
        let msg = generate_failure_message(&interrupted).unwrap();
        assert!(msg.contains("interrupted") && msg.contains("job-2"), "{msg}");

        // Legacy success + compacted v2.1 success are NOT failures.
        assert_eq!(
            generate_failure_message(&json!({
                "status": "done", "generated_files": ["@outputs/a.mp4"]
            })),
            None
        );
        assert_eq!(
            generate_failure_message(&json!({
                "status": "done", "done": true, "job_id": "job-ok",
                "result": { "success": true, "gallery_items": [] }
            })),
            None
        );
    }

    #[test]
    fn artifact_references_walk_generated_files_gallery_then_artifacts_in_order() {
        let payload = json!({
            "status": "done",
            "generated_files": ["@outputs/legacy.mp4"],
            "result": {
                "generated_files": ["@outputs/nested.mp4"],
                "gallery_items": [
                    { "media_id": "media-1", "path": "@outputs/g1.mp4" },
                    { "path": "@outputs/g2.mp4" }
                ],
                "artifacts": [
                    { "path": "@outputs/primary.mp4", "side_files": [
                        "@outputs/side1.mp4",
                        { "path": "@outputs/side2.mp4", "media_id": "side-media" }
                    ]}
                ]
            }
        });
        assert_eq!(
            artifact_references(&payload),
            vec![
                "@outputs/legacy.mp4",
                "@outputs/nested.mp4",
                "media-1",
                "@outputs/g1.mp4",
                "@outputs/g2.mp4",
                "@outputs/primary.mp4",
                "@outputs/side1.mp4",
                "@outputs/side2.mp4",
                "side-media",
            ]
        );
        // v2.1 compaction deleted ALL generated_files — gallery still resolves.
        let compacted = json!({
            "result": { "gallery_items": [{ "media_id": "gallery-1" }] }
        });
        assert_eq!(artifact_references(&compacted), vec!["gallery-1"]);
        assert!(artifact_references(&json!({})).is_empty());
    }

    #[test]
    fn find_ref_walks_nested_action_response() {
        let payload = json!({
            "status": "done",
            "result": { "media_id": "gallery-123", "path": "@outputs/x.png" }
        });
        let keys = vec!["media_id".to_string(), "path".to_string()];
        assert_eq!(find_ref(&payload, &keys).as_deref(), Some("gallery-123"));
        // A base64 blob is not a media reference.
        let b64 = json!({"content_base64": "AAAA,BBBB"});
        assert_eq!(find_ref(&b64, &keys), None);
    }

    #[test]
    fn initialize_ok_requires_mcp_identity() {
        assert!(!initialize_ok(&json!({"status": "ok"})));
        assert!(initialize_ok(&json!({"protocolVersion": "2025-06-18"})));
        assert!(initialize_ok(&json!({"serverInfo": {"name": "WanGP"}})));
    }

    #[test]
    fn absolute_url_from_resolves_root_relative_download_urls() {
        let base = "http://127.0.0.1:8765/mcp";
        let path = "/wangp_api/files/download/tok";
        assert_eq!(
            absolute_url_from(base, path).as_deref(),
            Some("http://127.0.0.1:8765/wangp_api/files/download/tok")
        );
        // Origin only (no trailing path on the base).
        assert_eq!(
            absolute_url_from("https://wangp.example", path).as_deref(),
            Some("https://wangp.example/wangp_api/files/download/tok")
        );
        assert_eq!(
            absolute_url_from("https://wangp.example/mcp", path).as_deref(),
            Some("https://wangp.example/wangp_api/files/download/tok")
        );
        // Virtual handles, relative paths and absolute URLs are not ours to rewrite.
        for other in [
            "@outputs/v.mp4",
            "wangp_api/files/download/tok",
            "https://elsewhere.example/v.mp4",
            "//elsewhere.example/v.mp4",
        ] {
            assert_eq!(absolute_url_from(base, other), None, "{other}");
        }
        assert_eq!(absolute_url_from("ftp://127.0.0.1:8765/mcp", path), None);
    }

    // ── WanGP v2.1 upload: pure framing checks (StubHttp flow in provider.rs) ──

    fn locked_upload_action() -> McpActionWire {
        serde_json::from_value(json!({
            "action": "create_file_upload",
            "filenameArg": "filename",
            "sizeArg": "size_bytes",
            "tokenPaths": ["token"],
            "chunkAction": "upload_chunk",
            "finishAction": "finish_upload",
            "refPaths": ["path", "media_id"]
        }))
        .unwrap()
    }

    #[test]
    fn upload_config_requires_v21_fields() {
        assert!(validate_upload_action(&locked_upload_action()).is_ok());
        // A legacy path-only spec deserializes, but the executor refuses it —
        // no silent fallback to sending an arbitrary filesystem path.
        let legacy: McpActionWire = serde_json::from_value(json!({
            "action": "create_file_upload", "pathArg": "path", "refPaths": ["media_id"]
        }))
        .unwrap();
        let err = validate_upload_action(&legacy).unwrap_err();
        assert!(err.contains("filenameArg"), "{err}");
        assert!(err.contains("v2.1"), "{err}");

        let mut missing_token = locked_upload_action();
        missing_token.token_paths.clear();
        assert!(validate_upload_action(&missing_token)
            .unwrap_err()
            .contains("tokenPaths"));
        let mut missing_ref = locked_upload_action();
        missing_ref.ref_paths.clear();
        assert!(validate_upload_action(&missing_ref)
            .unwrap_err()
            .contains("refPaths"));
    }

    #[test]
    fn upload_filename_is_bare_and_sanitized() {
        assert_eq!(upload_filename("C:/media/kf-1.png"), "kf-1.png");
        // Traversal + Windows-illegal characters never leave the component.
        assert_eq!(upload_filename("a/b/../my:kf?.png"), "mykf.png");
        assert_eq!(upload_filename(""), "unknown");
    }

    #[test]
    fn upload_chunks_respect_8mib_and_decode_round_trip() {
        assert_eq!(UPLOAD_CHUNK_BYTES, 8 * 1024 * 1024);
        let bytes = vec![0xABu8; UPLOAD_CHUNK_BYTES + 3];
        let chunks = upload_chunks(&bytes);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].0, 0);
        assert_eq!(chunks[1].0, UPLOAD_CHUNK_BYTES);
        use base64::Engine as _;
        let first = base64::engine::general_purpose::STANDARD
            .decode(&chunks[0].1)
            .unwrap();
        let second = base64::engine::general_purpose::STANDARD
            .decode(&chunks[1].1)
            .unwrap();
        assert_eq!(first.len(), UPLOAD_CHUNK_BYTES);
        assert_eq!(second, vec![0xABu8; 3]);
        assert_eq!([first, second].concat(), bytes);
        // Empty file still has one (empty) chunk shape helper result = none.
        assert!(upload_chunks(&[]).is_empty());
    }

    #[test]
    fn plain_timed_cue_scan_skips_multibyte_separators() {
        let prompt = "<global_style>style · wide shot</global_style>\
<timeline><segments length=\"24f\">\
<camera>wide shot, fill_frame framing · 14mm lens</camera>\
</segments></timeline>";
        let out = transform_prompt_for_model(&plain_timed_spec(), prompt, 24);
        assert!(out.contains("camera — wide shot, fill_frame framing, 14mm lens"), "{out}");
    }
}
