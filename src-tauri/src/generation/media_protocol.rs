//! Custom `media://` URI scheme protocol for streaming media-tree artifacts
//! to the webview.
//!
//! Replaces the `read_media_file` IPC command, which JSON-encoded the whole
//! file (a 30 MB video became a 30 M-element JSON array — ~200 MB transient,
//! blocking a tokio thread). The protocol streams file bytes directly to the
//! WebView with HTTP Range support for video seeking.
//!
//! URL contract (the frontend depends on this exact format):
//! `media://localhost/<url-encoded-absolute-path>` — e.g. the path
//! `D:\media\session\video.mp4` is requested as
//! `media://localhost/D%3A%5Cmedia%5Csession%5Cvideo.mp4`.
//! On Windows the webview serves custom schemes as
//! `http://media.localhost/<path>`; the path component is identical, so the
//! handler only reads the URI path.
//!
//! The handler percent-decodes the path, rejects traversal (`..` components)
//! and non-absolute paths, validates the path against the known media roots
//! (the same guard as `read_media_file`), and serves the file. It never
//! panics — every failure becomes an HTTP error response.

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use sqlx::Row;
use tauri::http::{header, Method, Request, Response, StatusCode};
use tauri::{App, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::AppState;

/// Register the `media` URI scheme protocol.
///
/// Tauri 2 has no `App::register_uri_scheme_protocol` (that was Tauri 1); the
/// protocol is registered through a plugin. Note that config windows are
/// created before the `setup` hook runs, so `lib.rs` also registers the same
/// [`handler`] on the `Builder` chain — this covers webviews created after
/// setup. Both registrations point at the same handler.
pub fn register<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let plugin = tauri::plugin::Builder::<R>::new("media")
        .register_asynchronous_uri_scheme_protocol("media", handler)
        .build();
    app.handle().plugin(plugin)
}

/// Serve a media-tree file for a `media://localhost/<encoded-path>` request
/// (Windows/WebView2 requests it as `http://media.localhost/<encoded-path>`;
/// wry reverts that to the canonical URI before calling this handler).
///
/// Non-blocking by contract: the file I/O runs on a dedicated worker thread so
/// the WebView2 UI thread is never pinned by disk reads. The sync
/// `register_uri_scheme_protocol` variant would run this handler *inline on
/// the UI thread*, and a burst of thumbnails + a `<video>`'s hundreds of
/// Range reads for a rich session then starves the renderer's event loop
/// (the "session select freezes, backend healthy, heartbeat stale" symptom).
/// `responder.respond` is called from the worker; wry posts it back to the UI
/// thread. Never panics: every failure becomes an HTTP error response.
pub fn handler<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app_handle = ctx.app_handle().clone();
    std::thread::spawn(move || {
        let response = match app_handle.try_state::<AppState>() {
            Some(state) => {
                // Gated to keep the hot media path quiet in production.
                if std::env::var("VM_DEBUG_MEDIA").is_ok() {
                    eprintln!(
                        "[MEDIA] handler (worker): {} {}",
                        request.method(),
                        request.uri()
                    );
                }
                serve(&state, request)
            }
            None => error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "app state unavailable",
                false,
            ),
        };
        responder.respond(response);
    });
}

/// The actual request handling (pure, no UI-thread work). Factored out of
/// `handler` so the worker thread can own it without the `UriSchemeContext`
/// borrow crossing the thread boundary.
fn serve(state: &AppState, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let is_head = *request.method() == Method::HEAD;

    // 0. CORS preflight. The app's webview origin differs from the
    //    `media.localhost` host, and the carousel's side-frame decode uses
    //    cross-origin paths (WebCodecs `EncodedVideoFileSource` issues a
    //    ranged fetch; the capture `<video crossorigin=anonymous>`). A
    //    request carrying a non-safelisted `Range` header triggers a
    //    preflight, so answer it here. A media-file server needs no
    //    credentials, so a wildcard origin is correct (see respond()).
    if *request.method() == Method::OPTIONS {
        return respond(
            StatusCode::NO_CONTENT,
            &[
                ("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS".to_string()),
                ("Access-Control-Allow-Headers", "Range, Content-Type".to_string()),
                ("Access-Control-Max-Age", "86400".to_string()),
            ],
            Vec::new(),
        );
    }

    // 1. Extract + percent-decode the filesystem path from the URI path
    //    (strip the single leading `/` that separates host from path).
    let raw_path = request.uri().path();
    let encoded = raw_path.strip_prefix('/').unwrap_or(raw_path);
    let decoded = match percent_decode(encoded) {
        Some(d) => d,
        None => return error_response(StatusCode::BAD_REQUEST, "invalid path encoding", is_head),
    };

    // 2. Traversal + absolute-path guards.
    if decoded.split(['/', '\\']).any(|c| c == "..") {
        return error_response(StatusCode::BAD_REQUEST, "path traversal rejected", is_head);
    }
    let mut requested = PathBuf::from(&decoded);
    if !requested.is_absolute() {
        return error_response(StatusCode::BAD_REQUEST, "path must be absolute", is_head);
    }

    // 2b. Preview-sibling fallback (Session-8 black-frame regression): the
    //     frontend routes thumbnails/previews to a small on-disk sibling
    //     (`foo.mp4` -> `foo.proxy.mp4`, `foo.png` -> `foo.thumb.jpg`) so the
    //     GPU decode buffer stays bounded. Those siblings are created by
    //     backfill and are NOT present for most legacy artifacts, so a
    //     requested sibling can 404 even though the original exists right
    //     next to it -> black <img>/<video> (and, because the carousel decodes
    //     its side-card thumbnails from the top-panel video source, black
    //     side-card placeholders too). When the requested file is a preview
    //     sibling that is missing on disk, fall back to the ORIGINAL in the
    //     same directory. The original is inside the same media root (the
    //     sibling and original share a directory), so the root guard below
    //     still applies and no new IPC surface is opened. A non-sibling path
    //     (the normal case) is left untouched.
    if !requested.is_file() {
        if let Some(original) =
            preview_sibling_original(&requested).or_else(|| thumb_sibling_original(&requested))
        {
            requested = original;
        }
    }

    // 3. Media-root guard (same check as `read_media_file`): the path must
    //    live under a known session/project/app-data media root. `state` is
    //    passed in by `handler` (already resolved on the worker thread), so
    //    this thread never touches a UI-thread borrow.
    // Read from the synchronous cache — a blocking `RwLock::read` is safe
    // here because `handler` runs the worker thread, not the WebView2 UI
    // thread. Never `block_on` an async DB lock in the handler.
    let inside_root = state
        .media_roots_cache
        .read()
        .map(|roots| roots.iter().any(|root| requested.starts_with(root)))
        .unwrap_or(false);
    if !inside_root {
        return error_response(
            StatusCode::FORBIDDEN,
            "path not inside a known media root",
            is_head,
        );
    }

    // 4. Existence + length.
    if !requested.is_file() {
        return error_response(StatusCode::NOT_FOUND, "media file not found", is_head);
    }
    let file_len = match std::fs::metadata(&requested) {
        Ok(m) => m.len(),
        Err(_) => return error_response(StatusCode::NOT_FOUND, "media file not found", is_head),
    };
    let content_type = content_type_for(&requested);

    // 5. Range requests (video seeking): 206 + Content-Range, reading only
    //    the requested slice via seek + take (never the whole file).
    if let Some(range_value) = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
    {
        return match parse_range(range_value, file_len) {
            Some((start, end)) => {
                let len = end - start + 1;
                let body = if is_head {
                    Vec::new()
                } else {
                    match read_range(&requested, start, len) {
                        Ok(b) => b,
                        Err(_) => {
                            return error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                "failed to read file range",
                                is_head,
                            )
                        }
                    }
                };
                respond(
                    StatusCode::PARTIAL_CONTENT,
                    &[
                        ("Content-Type", content_type.to_string()),
                        ("Content-Length", len.to_string()),
                        ("Accept-Ranges", "bytes".to_string()),
                        ("Content-Range", format!("bytes {start}-{end}/{file_len}")),
                    ],
                    body,
                )
            }
            None => respond(
                StatusCode::RANGE_NOT_SATISFIABLE,
                &[
                    ("Content-Type", "text/plain; charset=utf-8".to_string()),
                    ("Content-Range", format!("bytes */{file_len}")),
                    ("Content-Length", "range not satisfiable".len().to_string()),
                ],
                if is_head {
                    Vec::new()
                } else {
                    b"range not satisfiable".to_vec()
                },
            ),
        };
    }

    // 6. Full body (HEAD: headers only, no body).
    let body = if is_head {
        Vec::new()
    } else {
        match std::fs::read(&requested) {
            Ok(b) => b,
            Err(_) => {
                return error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to read file",
                    is_head,
                )
            }
        }
    };
    respond(
        StatusCode::OK,
        &[
            ("Content-Type", content_type.to_string()),
            ("Content-Length", file_len.to_string()),
            ("Accept-Ranges", "bytes".to_string()),
        ],
        body,
    )
}

/// Reconstruct the ORIGINAL media path from a preview-sibling path, or None
/// when `path` is not a preview sibling.
///
/// Mirrors the frontend's `previewSiblingPath` in `$lib/mediaUrl.ts` EXACTLY:
///   - video  `foo.mp4` -> `foo.proxy.mp4`   (so this maps back to `foo.mp4`)
///   - image  `foo.png` -> `foo.thumb.jpg`    (so this maps back to `foo.png`)
/// The sibling and original share a directory, so the original is always
/// inside the same media root as the requested sibling — the root guard in
/// `serve` still applies. Used only when the requested sibling is missing on
/// disk (legacy artifacts that backfill has not generated yet), so a black
/// 404 is replaced by the original instead.
fn preview_sibling_original(path: &Path) -> Option<PathBuf> {
    let file_name = path.file_name()?.to_str()?;
    let dir = path.parent()?.to_path_buf();
    if file_name.ends_with(".proxy.mp4") {
        // foo.proxy.mp4 -> foo.mp4
        let original = format!("{}.mp4", file_name.strip_suffix(".proxy.mp4")?);
        return Some(dir.join(original));
    }
    // `.thumb.jpg` siblings are handled by `thumb_sibling_original`
    // (the original image extension is not known from the sibling name).
    None
}

/// For a missing `.thumb.jpg` sibling, return the first existing original
/// image in the same directory that the sibling was derived from. The
/// sibling name is `<base>.thumb.jpg` where `<base>` is the original minus
/// its extension, so `<base>.png` / `<base>.jpg` / `<base>.webp` are the
/// candidates. Returns the first that exists, or None.
fn thumb_sibling_original(path: &Path) -> Option<PathBuf> {
    let file_name = path.file_name()?.to_str()?;
    let base = file_name.strip_suffix(".thumb.jpg")?;
    let dir = path.parent()?.to_path_buf();
    for ext in ["png", "jpg", "jpeg", "webp"] {
        let candidate = dir.join(format!("{}.{}", base, ext));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Content-Type for a media file, by (case-insensitive) extension.
fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") => "video/mp4",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("json") => "application/json",
        _ => "application/octet-stream",
    }
}

/// Parse a single-range `Range` header (`bytes=start-end` or `bytes=start-`)
/// against `file_len`, returning the inclusive `(start, end)` byte offsets.
///
/// Returns `None` for anything unusable: wrong unit, multi-range, malformed
/// numbers, `end < start`, or a start at/past EOF. The end is clamped to
/// `file_len - 1`. Suffix ranges (`bytes=-500`) are not supported.
fn parse_range(header: &str, file_len: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    // Single range only; a comma means multi-range, which we don't serve.
    if spec.contains(',') {
        return None;
    }
    let (start_s, end_s) = spec.split_once('-')?;
    let start: u64 = start_s.trim().parse().ok()?;
    if file_len == 0 || start >= file_len {
        return None;
    }
    let end = if end_s.trim().is_empty() {
        file_len - 1
    } else {
        let e: u64 = end_s.trim().parse().ok()?;
        e.min(file_len - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

/// Read exactly `len` bytes starting at `start` (seek + take — the rest of
/// the file is never touched).
fn read_range(path: &Path, start: u64, len: u64) -> std::io::Result<Vec<u8>> {
    let mut file = std::fs::File::open(path)?;
    file.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::with_capacity(len as usize);
    file.by_ref().take(len).read_to_end(&mut buf)?;
    Ok(buf)
}

/// Percent-decode a URI path segment (`%XX` → byte, then UTF-8). `+` stays
/// literal (correct for path segments, unlike query strings). `None` on
/// malformed escapes or invalid UTF-8.
fn percent_decode(input: &str) -> Option<String> {
    fn hex_val(b: u8) -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            b'A'..=b'F' => Some(b - b'A' + 10),
            _ => None,
        }
    }
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return None;
            }
            let hi = hex_val(bytes[i + 1])?;
            let lo = hex_val(bytes[i + 2])?;
            out.push((hi << 4) | lo);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Build a response without ever panicking (header values here are static or
/// numeric, so the builder cannot fail; the fallback is belt-and-braces).
///
/// Media protocol no-store policy: every response — 200, 206, 416, errors —
/// carries `Cache-Control: no-store` + `Pragma: no-cache` + `Expires: 0`
/// so Chromium's WebView2 native HTTP cache NEVER stores the bytes. The
/// protocol hands out fresh on-disk bytes on every request (Range-aware
/// so a video seek still re-fetches the slice it needs); caching in the
/// renderer's native buffer pool is pure waste and it is the direct cause
/// of the 2-5 GB unbounded `msedgewebview2.exe` balloon observed on a fast
/// multi-session swing (each composed session video ~30-300 MB accumulates
/// per visit, never evicted, across 7+ switches).
fn respond(status: StatusCode, headers: &[(&str, String)], body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder().status(status);
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
    builder = builder
        .header(header::CACHE_CONTROL, "no-store, no-cache, must-revalidate, max-age=0")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        // CORS: the app origin differs from the `media.localhost` host and the
        // carousel's side-frame decode is cross-origin (WebCodecs ranged fetch
        // + capture `<video crossorigin=anonymous>`). A media-file server
        // needs no credentials, so a wildcard origin is correct.
        .header("Access-Control-Allow-Origin", "*");
    builder.body(body).unwrap_or_else(|_| {
        Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new()))
    })
}

/// Plain-text error response. For HEAD the body is dropped but
/// `Content-Length` still reports what GET would have returned.
fn error_response(status: StatusCode, message: &str, is_head: bool) -> Response<Vec<u8>> {
    respond(
        status,
        &[
            ("Content-Type", "text/plain; charset=utf-8".to_string()),
            ("Content-Length", message.len().to_string()),
        ],
        if is_head {
            Vec::new()
        } else {
            message.as_bytes().to_vec()
        },
    )
}

/// All known media roots — mirrors `media_roots` in `commands/generation.rs`
/// exactly (that function is private to the commands module, so the check is
/// replicated here): session `directory_path` trees, project
/// `directory_path` trees, the default app-data media tree, and the
/// per-profile user catalog containers.
///
/// Public so `lib.rs` can populate the `media_roots_cache` at startup.
pub async fn collect_media_roots(db: &crate::storage::db::Database) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(rows) = sqlx::query("SELECT directory_path FROM sessions WHERE directory_path IS NOT NULL AND directory_path != ''")
        .fetch_all(&db.pool)
        .await
    {
        for r in rows {
            if let Ok(Some(dir)) = r.try_get::<Option<String>, _>(0) {
                let trimmed = dir.trim().to_string();
                if !trimmed.is_empty() {
                    roots.push(PathBuf::from(trimmed));
                }
            }
        }
    }
    if let Ok(rows) = sqlx::query("SELECT directory_path FROM projects WHERE directory_path IS NOT NULL AND directory_path != ''")
        .fetch_all(&db.pool)
        .await
    {
        for r in rows {
            if let Ok(Some(dir)) = r.try_get::<Option<String>, _>(0) {
                let trimmed = dir.trim().to_string();
                if !trimmed.is_empty() {
                    roots.push(PathBuf::from(trimmed));
                }
            }
        }
    }
    if let Some(d) = dirs::data_local_dir() {
        roots.push(d.join("com.visionmachine.desktop").join("media"));
    }
    if let Some(home) = dirs::home_dir() {
        if let Ok(rows) = sqlx::query("SELECT name FROM profiles")
            .fetch_all(&db.pool)
            .await
        {
            for r in rows {
                if let Ok(Some(n)) = r.try_get::<Option<String>, _>(0) {
                    let n = n.trim().to_string();
                    if !n.is_empty() {
                        roots.push(
                            home.join("VisionMachine")
                                .join(sanitize_dir_name(&n))
                                .join("Projects"),
                        );
                    }
                }
            }
        }
    }
    roots
}

/// Filesystem-safe name for a directory layer (mirrors `sanitize_dir_name`
/// in `commands/generation.rs`, which is private to the commands module).
fn sanitize_dir_name(s: &str) -> String {
    let cleaned: String = s
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "default".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_type_by_extension() {
        assert_eq!(content_type_for(Path::new("video.mp4")), "video/mp4");
        assert_eq!(content_type_for(Path::new("clip.MP4")), "video/mp4");
        assert_eq!(content_type_for(Path::new("img.png")), "image/png");
        assert_eq!(content_type_for(Path::new("img.jpg")), "image/jpeg");
        assert_eq!(content_type_for(Path::new("img.jpeg")), "image/jpeg");
        assert_eq!(content_type_for(Path::new("img.webp")), "image/webp");
        assert_eq!(content_type_for(Path::new("anim.gif")), "image/gif");
        assert_eq!(content_type_for(Path::new("data.json")), "application/json");
        assert_eq!(
            content_type_for(Path::new("file.bin")),
            "application/octet-stream"
        );
        assert_eq!(
            content_type_for(Path::new("noext")),
            "application/octet-stream"
        );
    }

    #[test]
    fn parse_range_forms() {
        assert_eq!(parse_range("bytes=0-1023", 4096), Some((0, 1023)));
        assert_eq!(parse_range("bytes=1024-", 4096), Some((1024, 4095)));
        assert_eq!(parse_range("bytes=0-", 4096), Some((0, 4095)));
        // End clamps to the file length.
        assert_eq!(parse_range("bytes=4000-9999", 4096), Some((4000, 4095)));
        // Start at/past EOF is unsatisfiable.
        assert_eq!(parse_range("bytes=4096-", 4096), None);
        assert_eq!(parse_range("bytes=9999-10000", 4096), None);
        // Malformed / unsupported forms.
        assert_eq!(parse_range("bytes=abc-def", 4096), None);
        assert_eq!(parse_range("items=0-10", 4096), None);
        assert_eq!(parse_range("bytes=10-5", 4096), None);
        assert_eq!(parse_range("bytes=0-10,20-30", 4096), None);
        assert_eq!(parse_range("bytes=-500", 4096), None);
        // Empty file: nothing is satisfiable.
        assert_eq!(parse_range("bytes=0-", 0), None);
    }

    #[test]
    fn percent_decode_paths() {
        assert_eq!(
            percent_decode("D%3A%5Cmedia%5Csession%5Cvideo.mp4").as_deref(),
            Some(r"D:\media\session\video.mp4")
        );
        assert_eq!(percent_decode("plain"), Some("plain".to_string()));
        assert_eq!(
            percent_decode("%2Fhome%2Fuser%2Fv.mp4").as_deref(),
            Some("/home/user/v.mp4")
        );
        assert_eq!(percent_decode("%zz"), None);
        assert_eq!(percent_decode("%2"), None);
        assert_eq!(percent_decode("%"), None);
    }

    #[test]
    fn preview_sibling_original_video() {
        // foo.proxy.mp4 -> foo.mp4
        let p = PathBuf::from(r"C:\media\foo.proxy.mp4");
        assert_eq!(
            preview_sibling_original(&p),
            Some(PathBuf::from(r"C:\media\foo.mp4"))
        );
        // a non-sibling path is left alone
        let q = PathBuf::from(r"C:\media\foo.mp4");
        assert_eq!(preview_sibling_original(&q), None);
    }

    #[test]
    fn preview_sibling_original_video_bare() {
        // A bare "x.proxy.mp4" has an empty parent; it still maps to "x.mp4".
        // (Real requests are absolute paths, guarded upstream in serve().)
        assert_eq!(
            preview_sibling_original(Path::new("x.proxy.mp4")),
            Some(PathBuf::from("x.mp4"))
        );
        // A plain non-sibling name has no mapping.
        assert_eq!(preview_sibling_original(Path::new("x.mp4")), None);
    }
}
