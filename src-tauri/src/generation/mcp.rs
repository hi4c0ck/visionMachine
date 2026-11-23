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

use crate::generation::specs::McpSpecWire;

use super::provider::{HttpClient, RequestAuth};

/// MCP Streamable-HTTP servers may answer either JSON or SSE; advertise both.
pub const MCP_ACCEPT: &str = "application/json, text/event-stream";
/// Protocol version observed from the owner's local server (endpoint probe
/// 2026-11-23). It is protocol data, not owner config.
pub const DEFAULT_PROTOCOL_VERSION: &str = "2025-06-18";

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

/// Upload a LOCAL media file through a `wangp_session` action and return the
/// AUTHORIZED reference the server handed back (Gallery media id or an
/// authorized path). No arbitrary filesystem access: the server validates the
/// path against its own allowlist; a failed/empty response is a hard error so
/// image input is never silently dropped.
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
            "i2v needs mcp.actions.upload (wangp_session upload action) — local image input cannot be sent as an arbitrary path".to_string()
        })?;
    if action.action.trim().is_empty() || action.path_arg.trim().is_empty() {
        return Err("mcp.actions.upload is incomplete (action + pathArg required)".into());
    }
    let ref_path = std::path::Path::new(path);
    if !ref_path.is_file() {
        return Err(format!(
            "local media '{path}' is not a readable file — i2v upload aborted"
        ));
    }
    let mut args = Map::new();
    args.insert(action.path_arg.clone(), Value::String(path.to_string()));
    let payload = call_tool(
        http,
        url,
        &spec.tools.session,
        json!({ "action": action.action, "arguments": Value::Object(args) }),
        timeout,
    )
    .await?;
    find_ref(&payload, &action.ref_paths).ok_or_else(|| {
        format!(
            "wangp_session '{}' returned no authorized media reference for '{path}' — checked {}",
            action.action,
            action.ref_paths.join(", ")
        )
    })
}

/// Retrieve a generated artifact referenced by a `wangp_generate` result.
/// Absolute paths are read locally; virtual `@outputs` paths go through a
/// `wangp_session` download action (path / URL / base64 in the response).
pub async fn retrieve_artifact(
    http: &dyn HttpClient,
    url: &str,
    spec: &McpSpecWire,
    reference: &str,
    dest: &Path,
    timeout: Duration,
) -> Result<(), String> {
    let source = if Path::new(reference).is_absolute() && Path::new(reference).is_file() {
        return copy_local(reference, dest);
    } else if reference.starts_with('@') {
        let action = spec
            .actions
            .as_ref()
            .and_then(|a| a.download.as_ref())
            .ok_or_else(|| {
                "virtual MCP artifact needs mcp.actions.download (wangp_session download action)".to_string()
            })?;
        if action.action.trim().is_empty() || action.path_arg.trim().is_empty() {
            return Err("mcp.actions.download is incomplete (action + pathArg required)".into());
        }
        let mut args = Map::new();
        args.insert(action.path_arg.clone(), Value::String(reference.to_string()));
        Some(call_tool(
            http,
            url,
            &spec.tools.session,
            json!({ "action": action.action, "arguments": Value::Object(args) }),
            timeout,
        )
        .await?)
    } else {
        None
    };
    let Some(payload) = source else {
        return Err(format!(
            "MCP artifact '{reference}' is neither an absolute path nor a virtual @outputs reference — no safe retrieval route"
        ));
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
}
