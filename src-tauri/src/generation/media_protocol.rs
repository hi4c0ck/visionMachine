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
use tauri::{App, Manager, Runtime, UriSchemeContext};

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
        .register_uri_scheme_protocol("media", handler)
        .build();
    app.handle().plugin(plugin)
}

/// Serve a media-tree file for `media://localhost/<encoded-path>` requests.
///
/// Never panics: every failure (bad encoding, traversal, outside the media
/// roots, missing file, unreadable range) becomes an HTTP error response.
pub fn handler<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let is_head = *request.method() == Method::HEAD;

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
    let requested = PathBuf::from(&decoded);
    if !requested.is_absolute() {
        return error_response(StatusCode::BAD_REQUEST, "path must be absolute", is_head);
    }

    // 3. Media-root guard (same check as `read_media_file`): the path must
    //    live under a known session/project/app-data media root.
    let app_handle = ctx.app_handle();
    let state = match app_handle.try_state::<AppState>() {
        Some(s) => s,
        None => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "app state unavailable",
                is_head,
            )
        }
    };
    // Read from the synchronous cache — never block_on an async DB lock
    // here (deadlock at startup when the DB mutex is contended). The cache
    // is populated at startup and refreshed when sessions/projects change.
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
fn respond(status: StatusCode, headers: &[(&str, String)], body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder().status(status);
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
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
}
