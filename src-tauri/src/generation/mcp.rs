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

use crate::generation::specs::{McpActionWire, McpSpecWire};

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
    for key in ["path", "file_path", "filePath", "url", "uri", "file"] {
        if let Some(s) = payload.get(key).and_then(Value::as_str) {
            let s = s.trim();
            if s.is_empty() {
                continue;
            }
            if Path::new(s).is_absolute() && Path::new(s).is_file() {
                return copy_local(s, dest);
            }
            if s.starts_with("http://") || s.starts_with("https://") {
                return http.download(s, dest, "").await;
            }
        }
    }
    Err(format!(
        "wangp_session download returned no artifact bytes/path for '{reference}'"
    ))
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

// ── Pure parsing tests (stub HTTP drives the engine-level flow in provider.rs) ──

#[cfg(test)]
mod tests {
    use super::*;

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
}
