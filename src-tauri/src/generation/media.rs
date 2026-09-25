//! Generation media tree + secret redaction (docs/provider-engine-tasks.md,
//! Phase B). E3 layout per session/pipe; P6/E1 redaction guarantees no API
//! key ever reaches a persisted or shown string.
//!
//! Pure + std only — testable without a DB or HTTP.

use std::fs;
use std::path::PathBuf;

/// Resolution order for the session media root (E3 / O6):
/// 1. the session's own `directoryPath` when set (`<projectDir>\session_<ts>`),
/// 2. else the project's explicit `directoryPath`,
/// 3. else the default profile-hash tree under the app-data dir.
pub fn session_media_root(
    session_dir: Option<&str>,
    project_dir: Option<&str>,
    default_root: Option<&std::path::Path>,
) -> Option<std::path::PathBuf> {
    if let Some(d) = session_dir.map(str::trim).filter(|d| !d.is_empty()) {
        return Some(std::path::PathBuf::from(d));
    }
    if let Some(d) = project_dir.map(str::trim).filter(|d| !d.is_empty()) {
        return Some(std::path::PathBuf::from(d));
    }
    default_root.map(|p| p.to_path_buf())
}

/// Per-pipe tree under the session root (name-consistent layout):
///
/// ```text
/// <sessionRoot>/<pipe-name>/
///   images/
///     log.jsonl         # append-only artifact history (task-scoped files below)
///   <task_id>/          # task_id = uuid (generation hash), the per-run dir
///     images/
///       <refName>.png   # generated keyframe/subject bitmaps, one per task
///                       # (task-scoped + unique ref name, so no two artifacts
///                       # ever share/overwrite a file)
///     video.mp4
///     output.json
///     request.log
/// ```
///
/// `pipe_name` is the pipe's human name (e.g. "Pipe 1"), sanitized for the
/// filesystem; the task dir stays the raw generation hash (uuid) so
/// consecutive runs of the same pipe never collide.
///
/// Returns `(pipe-level images dir, task dir, task-scoped artifact images
/// dir)`. All three are created; the pipe-level dir holds the append-only
/// `log.jsonl`, the task-scoped dir holds each generation's own bitmaps so
/// consecutive tasks never stack artifacts on one file.
pub fn pipe_media_dirs(
    session_root: &std::path::Path,
    pipe_name: &str,
    task_id: &str,
) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let safe_pipe = safe_dir_name(pipe_name);
    let safe_task = safe_dir_name(task_id);
    let images = session_root.join(&safe_pipe).join("images");
    let task = session_root.join(&safe_pipe).join(&safe_task);
    let task_images = task.join("images");
    fs::create_dir_all(&images).map_err(|e| format!("create {}: {e}", images.display()))?;
    fs::create_dir_all(&task).map_err(|e| format!("create {}: {e}", task.display()))?;
    fs::create_dir_all(&task_images)
        .map_err(|e| format!("create {}: {e}", task_images.display()))?;
    Ok((images, task, task_images))
}

/// Remove the stale artifacts of an earlier session-composition attempt
/// (`concat.txt` manifest + `session.mp4` output) from the session-video dir.
///
/// The output dir is shared between the auto-compose group flow and the
/// standalone "compose session" button. An earlier partial/failed attempt
/// can leave a manifest whose source set does NOT match the current one —
/// clearing both at the start of a new attempt guarantees the ffmpeg run
/// always sees exactly the current sources and a failed attempt can never
/// leave a misleading `session.mp4` behind.
///
/// `output.json` (written only on success) is left in place: it belongs to
/// the last *successful* composition and the next successful attempt
/// overwrites it. Best-effort: IO errors are swallowed (the compose flow
/// re-creates the manifest either way).
pub fn clear_session_compose_artifacts(out_dir: &std::path::Path) {
    if !out_dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(out_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let n = name.to_string_lossy().into_owned();
        if n == "concat.txt" || n == "session.mp4" {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Session-level generation tree under the session root (full-session
/// artifacts — the session's own generation log, shared across pipes):
///
/// ```text
/// <sessionRoot>/<task_id>/   # task_id = session generation hash
///   output.json
///   request.log
/// ```
///
/// Returns `(task dir, task-scoped images dir)`. Both are created.
pub fn session_generation_dirs(
    session_root: &std::path::Path,
    task_id: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let safe_task = safe_dir_name(task_id);
    let task = session_root.join(&safe_task);
    let task_images = task.join("images");
    fs::create_dir_all(&task).map_err(|e| format!("create {}: {e}", task.display()))?;
    fs::create_dir_all(&task_images)
        .map_err(|e| format!("create {}: {e}", task_images.display()))?;
    Ok((task, task_images))
}
/// Reject path-traversal characters in ref/task ids so a crafted id can
/// never escape the media tree.
pub fn safe_dir_name(id: &str) -> String {
    let base = std::path::Path::new(id)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if base.is_empty() {
        "unknown".to_string()
    } else {
        base.to_string()
    }
}

// ── Redaction (P6 / E1) ─────────────────────────────────────────────────────

/// Mask the given secrets everywhere they appear in `s` (E1: request/response
/// dumps, error strings, anything persisted or shown). Idempotent — a second
/// pass can never reintroduce a real key.
pub fn redact(secrets: &[&str], s: &str) -> String {
    let mut out = s.to_string();
    for sec in secrets {
        let k = sec.trim();
        if k.is_empty() {
            continue;
        }
        out = out.replace(k, "[API_KEY]");
    }
    out
}

/// Redact the Bearer token out of an HTTP header value.
pub fn redact_authorization(header: &str, api_key: &str) -> String {
    let key = api_key.trim();
    if key.is_empty() {
        return header.to_string();
    }
    header.replacen(key, "[API_KEY]", usize::MAX)
}

/// Append one JSON line to a `.jsonl` file (create if missing).
pub fn append_jsonl(path: &std::path::Path, line: &serde_json::Value) -> Result<(), String> {
    let s = serde_json::to_string(line).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    writeln!(f, "{s}").map_err(|e| format!("append {}: {e}", path.display()))
}

/// Write a single JSON document atomically-enough for our use (temp+rename
/// not required; the engine writes these once).
pub fn write_json(path: &std::path::Path, doc: &serde_json::Value) -> Result<(), String> {
    let s = serde_json::to_string_pretty(doc).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| format!("write {}: {e}", path.display()))
}

/// Append a redacted request/response line to the task `request.log`.
pub fn append_request_log(
    path: &std::path::Path,
    entry: &serde_json::Value,
    secrets: &[&str],
) -> Result<(), String> {
    let redacted = redact(
        secrets,
        &serde_json::json!({ "ts": chrono_secs(), "entry": entry }).to_string(),
    );
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    writeln!(f, "{redacted}").map_err(|e| format!("append {}: {e}", path.display()))
}

fn chrono_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn session_media_root_prefers_session_dir() {
        let got = session_media_root(
            Some("/proj/sess"),
            Some("/proj"),
            Some(Path::new("/default")),
        );
        assert_eq!(got.as_deref(), Some(Path::new("/proj/sess")));
    }

    #[test]
    fn session_media_root_falls_back_to_project_then_default() {
        let got = session_media_root(Some("  "), Some("/proj"), Some(Path::new("/default")));
        assert_eq!(got.as_deref(), Some(Path::new("/proj")));
        let got = session_media_root(None, None, Some(Path::new("/default")));
        assert_eq!(got.as_deref(), Some(Path::new("/default")));
        assert_eq!(session_media_root(None, None, None), None);
    }

    #[test]
    fn safe_dir_name_strips_traversal() {
        assert_eq!(safe_dir_name("../evil"), "evil");
        assert_eq!(safe_dir_name("..\\evil"), "evil");
        assert_eq!(safe_dir_name("ok"), "ok");
        assert_eq!(safe_dir_name(""), "unknown");
    }

    #[test]
    fn pipe_media_dirs_creates_pipe_task_and_task_scoped_images() {
        let dir = std::env::temp_dir().join(format!("vm_media_dirs_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let root = dir.join("root");
        let (images, task_dir, task_images) = pipe_media_dirs(&root, "pipe-1", "task-1").unwrap();
        assert!(images.is_dir(), "pipe-level images dir created");
        assert!(task_dir.is_dir(), "task dir created");
        assert!(task_images.is_dir(), "task-scoped images dir created");
        // Task-scoped images dir lives inside the task dir, not the pipe dir.
        assert!(task_images.starts_with(&task_dir));
        assert_eq!(images, root.join("pipe-1").join("images"));
        assert_eq!(task_dir, root.join("pipe-1").join("task-1"));
        assert_eq!(
            task_images,
            root.join("pipe-1").join("task-1").join("images")
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn redact_masks_every_occurrence_and_is_idempotent() {
        let key = "sk-supersecret123";
        let payload = format!(r#"{{"auth": "Bearer {key}", "notes": "key {key} reused"}}"#);
        let once = redact(&[key], &payload);
        assert!(!once.contains(key));
        assert_eq!(
            once,
            r#"{"auth": "Bearer [API_KEY]", "notes": "key [API_KEY] reused"}"#
        );
        // Idempotent: second pass changes nothing.
        assert_eq!(redact(&[key], &once), once);
        // Empty secrets are no-ops.
        assert_eq!(redact(&[""], "Bearer sk-x"), "Bearer sk-x");
    }

    #[test]
    fn redact_authorization_masks_bearer_token() {
        let out = redact_authorization("Bearer sk-abc123", "sk-abc123");
        assert_eq!(out, "Bearer [API_KEY]");
        // No key → untouched.
        assert_eq!(
            redact_authorization("Bearer sk-abc123", "  "),
            "Bearer sk-abc123"
        );
    }

    #[test]
    fn append_jsonl_appends_lines() {
        let dir = std::env::temp_dir().join(format!("vm_media_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let log = dir.join("log.jsonl");
        let _ = fs::remove_file(&log);
        append_jsonl(&log, &serde_json::json!({"refId": "k1", "n": 1})).unwrap();
        append_jsonl(&log, &serde_json::json!({"refId": "k1", "n": 2})).unwrap();
        let content = fs::read_to_string(&log).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(lines[0]).unwrap()["n"],
            1
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(lines[1]).unwrap()["n"],
            2
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn request_log_redacted_never_emits_real_key() {
        let dir = std::env::temp_dir().join(format!("vm_media_reqlog_{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let req = dir.join("request.log");
        let _ = fs::remove_file(&req);
        let key = "sk-hush456";
        let entry = serde_json::json!({
            "method": "POST",
            "auth": format!("Bearer {key}"),
            "body": {"prompt": "cat"}
        });
        append_request_log(&req, &entry, &[key]).unwrap();
        let content = fs::read_to_string(&req).unwrap();
        assert!(!content.contains(key));
        assert!(content.contains("[API_KEY]"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_json_round_trip() {
        let dir = std::env::temp_dir().join(format!("vm_media_json_{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let out = dir.join("output.json");
        let doc = serde_json::json!({"videoPath": "x", "status": "done"});
        write_json(&out, &doc).unwrap();
        let back: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&out).unwrap()).unwrap();
        assert_eq!(back["status"], "done");
        let _ = fs::remove_dir_all(&dir);
    }
}
