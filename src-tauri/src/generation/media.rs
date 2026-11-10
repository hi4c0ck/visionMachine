//! Generation media tree + secret redaction (docs/provider-engine-tasks.md,
//! Phase B). E3 layout per session/pipe; P6/E1 redaction guarantees no API
//! key ever reaches a persisted or shown string.
//!
//! Pure + std only — testable without a DB or HTTP.

use std::fs;
use std::path::{Path, PathBuf};

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

/// Filename prefix of the per-pipe clips a group run stages into
/// `session-video/`: `pipe-<orderIndex>-<safePipeName>.mp4`. Shared so the
/// staging writer and the stale-clip sweeper can never drift apart.
pub const STAGED_CLIP_PREFIX: &str = "pipe-";

/// True for the per-pipe staged clips a group run copies into
/// `session-video/` (`pipe-<orderIndex>-<safePipeName>.mp4`).
pub fn is_staged_session_clip(name: &str) -> bool {
    name.starts_with(STAGED_CLIP_PREFIX) && name.ends_with(".mp4")
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
/// **Staged per-pipe clips are NEVER touched here.** The compose core calls
/// this with `manifest_dir` == the same `session-video/` dir the current run
/// staged its clips into, and the manifest it is about to write references
/// exactly those files — deleting them here would guarantee every group
/// auto-compose fails with "source missing". Stale clips from an EARLIER run
/// are cleared separately by `clear_staged_session_clips`, which only the
/// group-start path calls (before it stages anything).
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
        let n = entry.file_name().to_string_lossy().into_owned();
        if n == "concat.txt" || n == "session.mp4" {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Remove the `pipe-<n>-<name>.mp4` staged clips a PREVIOUS group run left in
/// the session-video dir. Called at group start (before this run stages any
/// clip of its own) so a stale staged set can never be mistaken for the
/// current run's sources.
///
/// Distinct from `clear_session_compose_artifacts`, which runs inside the
/// compose core and must leave the CURRENT run's staged clips alone.
pub fn clear_staged_session_clips(out_dir: &std::path::Path) {
    if !out_dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(out_dir) else {
        return;
    };
    for entry in entries.flatten() {
        if is_staged_session_clip(&entry.file_name().to_string_lossy()) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Archive the session's previous final video (if any) so a new composition
/// does not silently overwrite it: `session.mp4` moves to
/// `session-video/archive/session-<unix-ms>.mp4`. The session keeps its
/// final-video history instead of only the latest wired one.
///
/// Best-effort: an archive failure (IO) never blocks the new composition —
/// the stale-clear would have removed the output file anyway.
pub fn archive_previous_session_video(out_path: &std::path::Path) {
    if !out_path.is_file() {
        return;
    }
    let Some(out_dir) = out_path.parent() else {
        return;
    };
    let archive_dir = out_dir.join("archive");
    if std::fs::create_dir_all(&archive_dir).is_err() {
        return;
    }
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = archive_dir.join(format!("session-{ms}.mp4"));
    if let Err(e) = std::fs::rename(out_path, &dest) {
        log::warn!(
            "[Media] could not archive previous session video {} ({e})",
            out_path.display()
        );
        return;
    }
    log::info!(
        "[Media] archived previous session video -> {}",
        dest.display()
    );
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
/// Per-piece standalone generation history tree:
///
/// ```text
/// <sessionRoot>/<pipe-name>/pieces/
///   keyframes/<refId>/
///     <unixMs>-<seq>.png    # one file per generation, never overwritten
///     history.jsonl         # append-only manifest (newest last)
///   subjects/<refId>/
///     ...
/// ```
///
/// Deliberately separate from the task-scoped `<pipe>/<task>/images/<refId>.png`
/// layout (which the full-pipe video run overwrites per task): this is a
/// piece's OWN accumulating history, so regenerating a keyframe/subject from
/// its modal appends a new artifact + manifest line instead of erasing the
/// previous generations. `safe_dir_name` on every layer keeps a crafted id
/// from escaping the tree.
pub fn piece_history_dirs(
    session_root: &std::path::Path,
    pipe_name: &str,
    kind: &str,
    ref_id: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let safe_pipe = safe_dir_name(pipe_name);
    let safe_kind = safe_dir_name(kind);
    let safe_ref = safe_dir_name(ref_id);
    let dir = session_root
        .join(&safe_pipe)
        .join("pieces")
        .join(&safe_kind)
        .join(&safe_ref);
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok((dir.clone(), dir.join("history.jsonl")))
}

/// Per-pipe directory for user-sourced image assets (extracted last frames,
/// locally-picked img2img bases). Distinct from the task-scoped `<pipe>` dirs
/// and the append-only `pieces/` history: this is a small, pipe-scoped scratch
/// area for images the user explicitly sourced rather than generated.
///
/// ```text
/// <sessionRoot>/<pipe-name>/user-images/
///   last-frame-<taskId>.png   # extracted from a prior pipe's last-gen video
///   local-<refId>-<unixms>.png # a locally-picked img2img base
/// ```
pub fn user_image_dir(session_root: &std::path::Path, pipe_name: &str) -> Result<PathBuf, String> {
    let dir = session_root
        .join(safe_dir_name(pipe_name))
        .join("user-images");
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Windows-illegal characters in a single filename/directory component.
/// NTFS also strips a trailing run of dots/spaces from a name, so
/// `trim_end_matches` on those is applied in `scrub_file_component`.
///
/// Rationale (session 2026-11-10): LLM Node A titles like "Scene 1**:**
/// Departure" flow through `plan_from_engine` into the composer pipe
/// title, which becomes a filesystem component via `pipe_media_dirs`.
/// `create_dir_all` then fails with `os error 123` (ERROR_INVALID_NAME)
/// because `:` is reserved on NTFS. Defense is at this data boundary,
/// not in the LLM prompt or the UI.
const ILLEGAL_FILE_CHARS: &[char] = &['<', '>', ':', '"', '\\', '/', '|', '?', '*'];

/// Windows reserved device names. A bare name equal to one of these
/// (case-insensitive, no extension) is illegal in NTFS even though the
/// characters are legal — `NUL`, `CON`, `COM1`…, `LPT9`. Guarded in
/// `scrub_file_component` by appending a `_` suffix so the result is
/// still creatable.
const NT_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Drop characters that are illegal in a Windows NTFS filename component,
/// plus C0/DEL control chars, plus a trailing run of `.` or ` ` (NTFS
/// silently strips those on create). If the result is a bare reserved
/// device name, append `_` so the string is a legal component.
///
/// Non-ASCII legal characters (e.g. `·` U+00B7, Cyrillic, CJK) are
/// preserved: they are UTF-16 legal on NTFS and keeping them preserves
/// readability of LLM-authored titles.
/// Public so the other name→path sanitizer (`commands::generation::
/// `safe_session_name`) can share the exact same scrub — one source of the
/// Windows-illegal rule, so the two cannot drift apart.
pub fn scrub_file_component(s: &str) -> String {
    let mut out: String = s
        .chars()
        .filter(|c| !ILLEGAL_FILE_CHARS.contains(c) && !c.is_control())
        .collect();
    // Strip a trailing run of `.` / ` ` (NTFS drops these on create).
    while out.ends_with('.') || out.ends_with(' ') {
        out.pop();
    }
    // A bare reserved device name is illegal even with only legal characters.
    if NT_RESERVED.iter().any(|r| out.eq_ignore_ascii_case(r)) {
        out.push('_');
    }
    out
}

/// Reject path-traversal AND Windows-illegal filename characters in a
/// filesystem component. `id` may be a real name (pipe title, session
/// name) or an identifier (uuid, ref id); either way the result is a
/// single, safe NTFS component. Falls back to "unknown" for an empty
/// result so the caller gets a deterministic, creatable directory name
/// instead of `create_dir_all("")` erroring.
pub fn safe_dir_name(id: &str) -> String {
    // `Path::file_name` strips any `../` traversal the id could carry
    // (a crafted path like `..\\evil` or `a/b`). On Windows it also
    // treats `/` as a separator. The colon / other-illegal characters
    // survive `file_name()`, so we scrub them next.
    let base = std::path::Path::new(id)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let scrubbed = scrub_file_component(base);
    if scrubbed.trim().is_empty() {
        "unknown".to_string()
    } else {
        scrubbed
    }
}

// ── Proxy / thumb path helpers ──────────────────────────────────────────────

/// Proxy path for a video original: `video.mp4` -> `video.proxy.mp4`,
/// `session.mp4` -> `session.proxy.mp4` (same dir). The frontend loads the
/// 240p proxy in the 180px top panel instead of the full 720p/1080p file
/// via blob URL (RAM leak). Generated synchronously at write time.
pub fn proxy_path(original: &Path) -> PathBuf {
    let parent = original
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();
    let stem = original
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    let ext = original.extension().and_then(|s| s.to_str());
    let name = match ext {
        Some(e) if !e.is_empty() => format!("{stem}.proxy.{e}"),
        _ => format!("{stem}.proxy"),
    };
    parent.join(name)
}

/// Thumb path for an image original: `ref.png` -> `ref.thumb.jpg` (same dir).
/// 320px-wide JPEG generated synchronously at write time for fast preview.
pub fn thumb_path(original: &Path) -> PathBuf {
    let parent = original
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();
    let stem = original
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("ref");
    parent.join(format!("{stem}.thumb.jpg"))
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
///
/// Each line carries TWO timestamp fields so the log reads properly in a
/// viewer / editor:
///   - `ts`      : epoch SECONDS (machine-readable; kept for stable sorting
///                 and any tooling that already parses the numeric form).
///   - `tsLocal` : human-readable LOCAL wall-clock `YYYY-MM-DD HH:MM:SS.mmm`
///                 — the format a user actually wants when reading the log.
/// Both are set from the SAME instant so they never drift.
pub fn append_request_log(
    path: &std::path::Path,
    entry: &serde_json::Value,
    secrets: &[&str],
) -> Result<(), String> {
    let now = chrono::Local::now();
    let ts_local = now.format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let redacted = redact(
        secrets,
        &serde_json::json!({
            "ts": now.timestamp(),
            "tsLocal": ts_local,
            "entry": entry,
        })
        .to_string(),
    );
    use std::io::Write;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    writeln!(f, "{redacted}").map_err(|e| format!("append {}: {e}", path.display()))
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

    /// The 2026-11-10 regression pin: LLM scene titles like
    /// "Scene 1: Departure · shot 1" carried a `:` (the natural
    /// "Scene N: …" pattern), which `create_dir_all` rejects on Windows
    /// (ERROR_INVALID_NAME / os error 123). `safe_dir_name` must scrub it
    /// so the dir component is legal, while keeping the readable parts.
    #[test]
    fn safe_dir_name_scrubs_windows_illegal_chars() {
        // The exact failure from the log: pipe title built from an LLM scene
        // "Scene 1: Departure" + " · shot 1". The `:` must go; `·` (U+00B7,
        // NTFS-legal non-ASCII) and spaces stay.
        assert_eq!(
            safe_dir_name("Scene 1: Departure · shot 1"),
            "Scene 1 Departure · shot 1"
        );
        // NTFS-illegal characters in the middle of a string (where `Path::
        // file_name()` returns the whole thing, not a truncated tail) are
        // scrubbed by `scrub_file_component`.
        //
        // Note: `a:b` at position 0 is parsed by the Windows path parser as
        // a drive prefix (`a:` + `b`), so `file_name()` already returns just
        // "b" and the scrub sees a clean component — the interesting case is
        // a colon **in the middle**, which is what LLM scene titles produce.
        assert_eq!(safe_dir_name("xab:yc"), "xabyc");
        assert_eq!(safe_dir_name("a<b"), "ab");
        assert_eq!(safe_dir_name("a>b"), "ab");
        assert_eq!(safe_dir_name("a\"b"), "ab");
        assert_eq!(safe_dir_name("a|b"), "ab");
        assert_eq!(safe_dir_name("a?b"), "ab");
        assert_eq!(safe_dir_name("a*b"), "ab");
        // Path separators: `Path::file_name()` already truncates to the
        // last component; the scrub then sees a clean string.
        assert_eq!(safe_dir_name("a/b"), "b");
        assert_eq!(safe_dir_name("a\\b"), "b");
        // A colon-only name falls back to the empty-component default
        // ("unknown"), never an empty dir component.
        assert_eq!(safe_dir_name(":"), "unknown");
        // A reserved device name gets a `_` suffix (bare `con`/`NUL` are
        // illegal even though the characters are legal).
        assert_eq!(safe_dir_name("CON"), "CON_");
        assert_eq!(safe_dir_name("NUL"), "NUL_");
        // Trailing dots/spaces are trimmed (NTFS strips them on create).
        assert_eq!(safe_dir_name("name..."), "name");
        assert_eq!(safe_dir_name("name   "), "name");
        // Legal non-ASCII titles survive intact (readability preserved).
        assert_eq!(safe_dir_name("The Departure · shot 1"), "The Departure · shot 1");
    }

    #[test]
    fn scrub_file_component_drops_only_illegal_chars() {
        // The shared rule (also used by `safe_session_name`): illegal Windows
        // chars + control chars out, legal (incl. non-ASCII) chars in.
        assert_eq!(scrub_file_component("a:b"), "ab");
        assert_eq!(scrub_file_component("a\x00b"), "ab");
        assert_eq!(scrub_file_component("a·b"), "a·b");
        assert_eq!(scrub_file_component("NUL"), "NUL_");
        assert_eq!(scrub_file_component("x.."), "x");
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
    fn proxy_path_video_mp4() {
        assert_eq!(
            proxy_path(Path::new("video.mp4")),
            PathBuf::from("video.proxy.mp4")
        );
    }

    #[test]
    fn proxy_path_session_mp4() {
        assert_eq!(
            proxy_path(Path::new("session.mp4")),
            PathBuf::from("session.proxy.mp4")
        );
    }

    #[test]
    fn proxy_path_preserves_dir() {
        assert_eq!(
            proxy_path(Path::new("/a/b/video.mp4")),
            PathBuf::from("/a/b/video.proxy.mp4")
        );
    }

    #[test]
    fn thumb_path_ref_png() {
        assert_eq!(
            thumb_path(Path::new("ref.png")),
            PathBuf::from("ref.thumb.jpg")
        );
    }

    #[test]
    fn thumb_path_preserves_dir() {
        assert_eq!(
            thumb_path(Path::new("/a/b/ref.png")),
            PathBuf::from("/a/b/ref.thumb.jpg")
        );
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
