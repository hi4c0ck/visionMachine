//! Session-video composition: stitch per-pipe `video.mp4` into one session
//! video via the ffmpeg locator (docs/plan-session-video-and-carousel.md, A4).
//!
//! Two code paths:
//! - **Lossless concat demuxer** (`-c copy`): when all inputs share
//!   codec+resolution (our pipeline renders every pipe at the session
//!   fps/resolution/orientation, so this is the expected path). Fast,
//!   zero quality loss.
//! - **Re-encode fallback** (concat filter + libx264): when the copy fails
//!   (parameter mismatch / codec mismatch). Still one ffmpeg call.
//!
//! Pure planning/arg-building functions are unit-testable without ffmpeg;
//! the `compose` entry point shells out via `std::process::Command`.

use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::generation::ffmpeg::{probe, FfmpegAvailability};

/// Cooperative cancellation shared with the blocking composition worker.
pub type ComposeCancel = Arc<AtomicBool>;

/// Registry of at most one active composition per session.
#[derive(Clone, Default)]
pub struct ComposeRegistry {
    active: Arc<Mutex<HashMap<String, ComposeCancel>>>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ComposeStartError {
    AlreadyRunning,
}

impl ComposeRegistry {
    pub fn start(&self, session_id: &str) -> Result<(String, ComposeCancel), ComposeStartError> {
        let mut active = self.active.lock().expect("compose registry poisoned");
        if active.contains_key(session_id) {
            return Err(ComposeStartError::AlreadyRunning);
        }
        let operation_id = uuid::Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        active.insert(session_id.to_string(), Arc::clone(&cancel));
        Ok((operation_id, cancel))
    }

    pub fn cancel(&self, session_id: &str) -> bool {
        let active = self.active.lock().expect("compose registry poisoned");
        if let Some(cancel) = active.get(session_id) {
            cancel.store(true, Ordering::Release);
            true
        } else {
            false
        }
    }

    pub fn finish(&self, session_id: &str) {
        self.active
            .lock()
            .expect("compose registry poisoned")
            .remove(session_id);
    }
}

/// One source clip for the concat (a pipe's last-gen video).
#[derive(Debug, Clone)]
pub struct SourceVideo {
    /// Stable label (pipe name or id) for logs / UI.
    pub label: String,
    /// Absolute path to the `video.mp4`.
    pub path: String,
}

/// Output of a successful compose: the written file + the ffmpeg source.
#[derive(Debug, Clone)]
pub struct ComposeResult {
    pub output_path: String,
    /// Which ffmpeg binary did the work (bundled/user/system).
    pub ffmpeg_source: String,
}

/// Errors from the compose flow.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComposeError {
    /// No ffmpeg binary resolved.
    NoFfmpeg,
    /// A source video is missing on disk.
    SourceMissing(String),
    /// Both concat strategies failed.
    BothStrategiesFailed {
        copy_detail: String,
        filter_detail: String,
    },
    /// The user requested cancellation; the active child was terminated.
    Cancelled,
    /// Output file not found after a successful exit (ffmpeg quirk).
    OutputMissing,
    /// Output was written but could not be decoded.
    OutputInvalid(String),
}

impl std::fmt::Display for ComposeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoFfmpeg => write!(f, "no ffmpeg available (bundled/user/system)"),
            Self::SourceMissing(label) => write!(f, "source video missing: {label}"),
            Self::BothStrategiesFailed {
                copy_detail,
                filter_detail,
            } => write!(
                f,
                "ffmpeg concat failed. copy: {copy_detail}; filter: {filter_detail}"
            ),
            Self::Cancelled => write!(f, "session video composition cancelled"),
            Self::OutputMissing => write!(f, "ffmpeg exited ok but output file missing"),
            Self::OutputInvalid(detail) => write!(f, "ffmpeg output invalid: {detail}"),
        }
    }
}

/// Build the ffmpeg concat-demuxer manifest text.
///
/// One `file '<abs path>'` line per source, in timeline order. The ffmpeg
/// concat demuxer requires SINGLE-quoted values with backslashes escaped —
/// double-quoted paths are rejected by ffmpeg >= 7 ("Invalid argument"),
/// verified against the bundled Btbn ffmpeg 9.0 build. Backslashes are
/// normalized to forward slashes (accepted on Windows) and escaped. This is
/// the only form the bundled build accepts.
pub fn build_concat_manifest(sources: &[SourceVideo]) -> String {
    sources
        .iter()
        .map(|s| {
            let p = s.path.replace('\\', "/");
            // Escape embedded single-quotes (rare in our paths, but safe).
            let escaped = p.replace('\'', "\\'");
            format!("file '{}'", escaped)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Lossless copy args: `-f concat -safe 0 -i manifest -c copy -movflags +faststart out`.
pub fn copy_args(manifest_path: &Path, out_path: &Path) -> Vec<String> {
    vec![
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        manifest_path.to_string_lossy().into_owned(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        out_path.to_string_lossy().into_owned(),
    ]
}

/// Re-encode fallback args: `-i a -i b … -filter_complex concat=n=N:v=1:a=0[v]
/// -map [v] -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart out`.
pub fn filter_args(sources: &[SourceVideo], out_path: &Path) -> Vec<String> {
    let n = sources.len();
    let mut args: Vec<String> = Vec::new();
    let mut filter = String::new();
    for (i, s) in sources.iter().enumerate() {
        args.push("-i".into());
        args.push(s.path.clone());
        filter.push_str(&format!("[{i}:v]"));
    }
    filter.push_str(&format!("concat=n={n}:v=1:a=0[v]"));
    args.extend_from_slice(&[
        "-filter_complex".into(),
        filter,
        "-map".into(),
        "[v]".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "veryfast".into(),
        "-crf".into(),
        "20".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-movflags".into(),
        "+faststart".into(),
        out_path.to_string_lossy().into_owned(),
    ]);
    args
}

/// Run one ffmpeg command with a ten-minute hard timeout. Returns exit code,
/// stderr tail, and whether the process was killed by the timeout.
fn run_ffmpeg(
    ffmpeg: &FfmpegAvailability,
    args: &[String],
    cancel: &ComposeCancel,
) -> (i32, String, bool, bool) {
    if cancel.load(Ordering::Acquire) {
        return (-1, "cancelled before start".into(), false, true);
    }
    let mut child = match Command::new(&ffmpeg.path)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => return (-1, format!("spawn failed: {e}"), false, false),
    };
    let mut stderr = child.stderr.take();
    let stderr_reader = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(pipe) = stderr.as_mut() {
            use std::io::Read;
            let _ = pipe.read_to_string(&mut text);
        }
        text
    });
    let deadline = Instant::now() + Duration::from_secs(600);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let tail = stderr_reader.join().unwrap_or_default();
                let lines: Vec<&str> = tail.lines().take(40).collect();
                return (status.code().unwrap_or(-1), lines.join("\n"), false, false);
            }
            Ok(None) if cancel.load(Ordering::Acquire) => {
                let _ = child.kill();
                let _ = child.wait();
                return (-1, "cancelled".into(), false, true);
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return (-1, "timed out after 10 minutes".into(), true, false);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return (-1, format!("wait failed: {e}"), false, false),
        }
    }
}

/// Metadata needed to prove a composed output matches its source clips.
#[derive(Debug, Clone, PartialEq)]
pub struct VideoMetadata {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub duration_seconds: f64,
    pub frame_count: u64,
}

/// The source-derived values the final output must satisfy.
#[derive(Debug, Clone, PartialEq)]
pub struct ExpectedMetadata {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub duration_seconds: f64,
    pub frame_count: u64,
}

/// Resolve ffprobe for composition, in preference order:
/// 1. A sibling `ffprobe` next to the resolved ffmpeg binary — the FULL
///    variant ships both as sidecars (`ffmpeg(.exe)` + `ffprobe(.exe)`), so a
///    bundled build always finds ffprobe in the same directory.
/// 2. System `ffprobe` on $PATH — the last resort for the TINY variant
///    (ffmpeg-only), where composition falls back to the ffmpeg-stderr
///    metadata parser when this misses.
///
/// FFmpeg distributions generally ship both tools with the same name; a
/// sidecar-only bundle may omit ffprobe, so PATH is intentionally checked
/// independently of the ffmpeg resolution.
pub fn resolve_ffprobe(ffmpeg: &FfmpegAvailability) -> Option<PathBuf> {
    let exe = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    let ffmpeg_path = Path::new(&ffmpeg.path);
    if let (Some(parent), Some(name)) = (ffmpeg_path.parent(), ffmpeg_path.file_name()) {
        if let Some(stem) = name.to_string_lossy().strip_prefix("ffmpeg") {
            let mut sibling = parent.join(format!("ffprobe{}", stem));
            if sibling.is_file() {
                return Some(sibling);
            }
            sibling = parent.join(exe);
            if sibling.is_file() {
                return Some(sibling);
            }
        }
    }
    let system = PathBuf::from(exe);
    probe(&system).map(|_| system)
}

/// Extract the first video stream from ffprobe JSON. Unreadable/missing
/// numeric fields are rejected instead of being silently treated as zero.
pub fn parse_ffprobe_video(json: &str) -> Result<VideoMetadata, String> {
    let root: Value =
        serde_json::from_str(json).map_err(|e| format!("invalid ffprobe JSON: {e}"))?;
    let stream = root
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| {
            streams
                .iter()
                .find(|s| s.get("codec_type").and_then(Value::as_str) == Some("video"))
        })
        .ok_or_else(|| "ffprobe returned no video stream".to_string())?;
    let codec = stream
        .get("codec_name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "video stream has no codec_name".to_string())?
        .to_string();
    let width = stream
        .get("width")
        .and_then(Value::as_u64)
        .ok_or_else(|| "video stream has no width".to_string())? as u32;
    let height = stream
        .get("height")
        .and_then(Value::as_u64)
        .ok_or_else(|| "video stream has no height".to_string())? as u32;
    let duration = stream
        .get("duration")
        .and_then(Value::as_str)
        .or_else(|| {
            root.get("format")
                .and_then(|f| f.get("duration"))
                .and_then(Value::as_str)
        })
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v > 0.0)
        .ok_or_else(|| "video stream has no positive duration".to_string())?;
    let frame_count = stream
        .get("nb_frames")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or_else(|| {
            "video stream has no numeric nb_frames; ffprobe must use -count_frames".to_string()
        })?;
    if width == 0 || height == 0 || frame_count == 0 {
        return Err("video stream has zero resolution or frame count".into());
    }
    Ok(VideoMetadata {
        codec,
        width,
        height,
        duration_seconds: duration,
        frame_count,
    })
}

/// Sources must be compatible before a copy concat can be trusted. Use the
/// first source as the expected profile and sum its frame count/duration.
pub fn plan_expected_metadata(sources: &[VideoMetadata]) -> Result<ExpectedMetadata, String> {
    let first = sources
        .first()
        .ok_or_else(|| "no source metadata".to_string())?;
    Ok(ExpectedMetadata {
        codec: first.codec.clone(),
        width: first.width,
        height: first.height,
        duration_seconds: sources.iter().map(|s| s.duration_seconds).sum(),
        frame_count: sources.iter().map(|s| s.frame_count).sum(),
    })
}

/// Build the re-encode fallback expectation. The concat filter normalizes all
/// sources to libx264, but preserves the first source's dimensions and totals.
pub fn plan_filter_metadata(sources: &[VideoMetadata]) -> Result<ExpectedMetadata, String> {
    let first = sources
        .first()
        .ok_or_else(|| "no source metadata".to_string())?;
    Ok(ExpectedMetadata {
        codec: "h264".into(),
        width: first.width,
        height: first.height,
        duration_seconds: sources.iter().map(|s| s.duration_seconds).sum(),
        frame_count: sources.iter().map(|s| s.frame_count).sum(),
    })
}

/// Validate real output metadata. Duration tolerance absorbs container timing
/// rounding, while codec/resolution and frame count remain strict invariants.
pub fn validate_metadata(
    actual: &VideoMetadata,
    expected: &ExpectedMetadata,
) -> Result<(), String> {
    if actual.codec != expected.codec {
        return Err(format!(
            "codec mismatch: expected {}, got {}",
            expected.codec, actual.codec
        ));
    }
    if actual.width != expected.width || actual.height != expected.height {
        return Err(format!(
            "resolution mismatch: expected {}x{}, got {}x{}",
            expected.width, expected.height, actual.width, actual.height
        ));
    }
    let duration_tolerance = (expected.duration_seconds * 0.02).max(0.10);
    if (actual.duration_seconds - expected.duration_seconds).abs() > duration_tolerance {
        return Err(format!(
            "duration mismatch: expected {:.3}s, got {:.3}s",
            expected.duration_seconds, actual.duration_seconds
        ));
    }
    if actual.frame_count != expected.frame_count {
        return Err(format!(
            "frame count mismatch: expected {}, got {}",
            expected.frame_count, actual.frame_count
        ));
    }
    Ok(())
}

fn run_capture(
    program: &Path,
    args: &[String],
    cancel: &ComposeCancel,
) -> Result<(i32, String, String), String> {
    if cancel.load(Ordering::Acquire) {
        return Err("metadata probe cancelled".into());
    }
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    let out_thread = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(p) = stdout.as_mut() {
            use std::io::Read;
            let _ = p.read_to_string(&mut s);
        }
        s
    });
    let err_thread = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(p) = stderr.as_mut() {
            use std::io::Read;
            let _ = p.read_to_string(&mut s);
        }
        s
    });
    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        match child.try_wait().map_err(|e| format!("wait failed: {e}"))? {
            Some(status) => {
                return Ok((
                    status.code().unwrap_or(-1),
                    out_thread.join().unwrap_or_default(),
                    err_thread.join().unwrap_or_default(),
                ))
            }
            None if cancel.load(Ordering::Acquire) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("metadata probe cancelled".into());
            }
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("metadata probe timed out after 2 minutes".into());
            }
            None => std::thread::sleep(Duration::from_millis(25)),
        }
    }
}

/// Parse the final `frame=` and `out_time_us=` progress records emitted by
/// `ffmpeg -f null -progress pipe:1`. This fallback keeps validation available
/// when a sidecar distribution ships ffmpeg but not ffprobe.
pub fn parse_ffmpeg_decode_progress(text: &str) -> Result<(u64, f64), String> {
    let mut frame_count = None;
    let mut duration_us = None;
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim();
        match key.trim() {
            "frame" => frame_count = value.parse::<u64>().ok(),
            "out_time_us" => duration_us = value.parse::<u64>().ok(),
            _ => {}
        }
    }
    let frames = frame_count
        .filter(|v| *v > 0)
        .ok_or_else(|| "ffmpeg decode returned no frame count".to_string())?;
    let duration = duration_us
        .filter(|v| *v > 0)
        .map(|v| v as f64 / 1_000_000.0)
        .ok_or_else(|| "ffmpeg decode returned no output duration".to_string())?;
    Ok((frames, duration))
}

/// Parse the input-stream codec + resolution from ffmpeg's stderr.
///
/// Tolerant of build-dependent line formats (the parser-only fallback used
/// when no ffprobe sibling ships): real-world ffmpeg builds emit the stream
/// line with a `Stream #0:0` prefix, the codec token as `h264` (not `H.264`),
/// and dimensions space- or comma-separated after the codec (often
/// `1088x832 [SAR 1:1]`), so the first numeric `WxH` token — not just the
/// token right after the codec — is accepted. `Input #` boundaries guard
/// against the OUTPUT stream block (codec `wrapped_avframe` for the null
/// sink), which would poison the codec/resolution comparison.
fn parse_ffmpeg_stream_metadata(stderr: &str) -> Result<(String, u32, u32), String> {
    // Split on input-block boundaries: the block after each `Input #` label
    // starts with its index digit, everything else (incl. the Output block)
    // is discarded.
    let input_block = stderr
        .split("Input #")
        .find(|block| block.starts_with(|c: char| c.is_ascii_digit()))
        .unwrap_or("");
    let stream_lines: Vec<&str> = input_block
        .lines()
        .filter(|line| {
            line.trim_start().starts_with("Stream #") || line.trim_start().starts_with("Video:")
        })
        .collect();
    let line = stream_lines
        .iter()
        .find(|line| line.contains("Video:"))
        .copied()
        .ok_or_else(|| "ffmpeg returned no input video stream metadata".to_string())?;
    // The codec token is the first token after `Video:` (e.g. `h264`).
    // Dimension/side-data tokens may follow the codec separated by commas, so
    // strip a trailing comma before using it as a codec identity.
    let codec = line
        .split("Video:")
        .nth(1)
        .unwrap_or_default()
        .trim()
        .split_whitespace()
        .next()
        .ok_or_else(|| "ffmpeg returned no video codec".to_string())?
        .trim_end_matches(',')
        .to_string();
    // The resolution is the first `WxH` token anywhere on the line — it may be
    // space-separated (`h264 ... 1088x832`) or comma-separated
    // (`h264, 1088x832`), and newer builds print it inside the `Stream #` line.
    let dimensions = stream_lines
        .iter()
        .find_map(|line| {
            line.split(|c: char| c.is_whitespace() || c == ',')
                .find_map(|token| {
                    let token = token.trim().trim_end_matches(']');
                    let (w, h) = token.split_once('x')?;
                    let w: u32 = w.parse().ok()?;
                    let h: u32 = h.parse().ok()?;
                    (w > 0 && h > 0).then_some((w, h))
                })
        })
        .ok_or_else(|| "ffmpeg returned no input video resolution".to_string())?;
    Ok((codec, dimensions.0, dimensions.1))
}

fn inspect_video(
    ffmpeg: &FfmpegAvailability,
    ffprobe: Option<&Path>,
    path: &Path,
    cancel: &ComposeCancel,
) -> Result<VideoMetadata, String> {
    if let Some(ffprobe) = ffprobe {
        let args = vec![
            "-v".to_string(),
            "error".to_string(),
            "-select_streams".to_string(),
            "v:0".to_string(),
            "-count_frames".to_string(),
            "-show_streams".to_string(),
            "-show_format".to_string(),
            "-of".to_string(),
            "json".to_string(),
            path.to_string_lossy().into_owned(),
        ];
        let (code, stdout, stderr) = run_capture(ffprobe, &args, cancel)?;
        if code != 0 {
            return Err(format!(
                "ffprobe exit {code}: {}",
                stderr.lines().rev().take(8).collect::<Vec<_>>().join("; ")
            ));
        }
        return parse_ffprobe_video(&stdout);
    }
    let args = vec![
        "-hide_banner".into(),
        "-nostats".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-i".into(),
        path.to_string_lossy().into_owned(),
        "-map".into(),
        "0:v:0".into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ];
    let (code, stdout, stderr) = run_capture(Path::new(&ffmpeg.path), &args, cancel)?;
    if code != 0 {
        return Err(format!(
            "ffmpeg decode exit {code}: {}",
            stderr.lines().rev().take(8).collect::<Vec<_>>().join("; ")
        ));
    }
    let (frame_count, duration_seconds) = parse_ffmpeg_decode_progress(&stdout)?;
    let (codec, width, height) = parse_ffmpeg_stream_metadata(&stderr)?;
    Ok(VideoMetadata {
        codec,
        width,
        height,
        duration_seconds,
        frame_count,
    })
}

fn validate_output(
    ffmpeg: &FfmpegAvailability,
    out_path: &Path,
    expected: &ExpectedMetadata,
    cancel: &ComposeCancel,
) -> Result<(), ComposeError> {
    if !out_path.is_file() {
        return Err(ComposeError::OutputMissing);
    }
    if out_path.metadata().map(|m| m.len() == 0).unwrap_or(true) {
        return Err(ComposeError::OutputInvalid("zero-byte output".into()));
    }
    let ffprobe = resolve_ffprobe(ffmpeg);
    let actual = inspect_video(ffmpeg, ffprobe.as_deref(), out_path, cancel).map_err(|detail| {
        if cancel.load(Ordering::Acquire) {
            ComposeError::Cancelled
        } else {
            ComposeError::OutputInvalid(detail)
        }
    })?;
    if cancel.load(Ordering::Acquire) {
        return Err(ComposeError::Cancelled);
    }
    validate_metadata(&actual, expected).map_err(ComposeError::OutputInvalid)
}

/// Compose one session video from ordered per-pipe videos.
///
/// Strategy: write the manifest + run the lossless copy; on a non-zero exit
/// (codec/parameter mismatch) fall back to the re-encode filter. A
/// successful exit with a missing output file is an error.
pub fn compose_session_video(
    ffmpeg: &FfmpegAvailability,
    sources: &[SourceVideo],
    out_path: &Path,
    manifest_dir: &Path,
    cancel: &ComposeCancel,
) -> Result<ComposeResult, ComposeError> {
    if ffmpeg.source == "none" {
        return Err(ComposeError::NoFfmpeg);
    }
    if sources.is_empty() {
        return Err(ComposeError::SourceMissing("no sources".into()));
    }
    // Validate every source exists before invoking ffmpeg (concrete error
    // per missing clip instead of a generic ffmpeg failure).
    for s in sources {
        if !Path::new(&s.path).is_file() {
            return Err(ComposeError::SourceMissing(s.label.clone()));
        }
    }
    std::fs::create_dir_all(manifest_dir)
        .map_err(|e| ComposeError::SourceMissing(format!("manifest dir: {e}")))?;

    crate::generation::clear_session_compose_artifacts(manifest_dir);
    let manifest = manifest_dir.join("concat.txt");
    std::fs::write(&manifest, build_concat_manifest(sources))
        .map_err(|e| ComposeError::SourceMissing(format!("manifest write: {e}")))?;
    // The clear above guarantees no stale manifest/output from an earlier
    // (possibly failed) attempt survives into this one — the manifest always
    // matches the current sources, and a failed attempt leaves no orphaned
    // session.mp4 behind.

    // Ensure the output parent dir exists (session_generation_dirs already
    // does this, but be defensive).
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ComposeError::SourceMissing(format!("output dir: {e}")))?;
    }

    let ffprobe = resolve_ffprobe(ffmpeg);
    if cancel.load(Ordering::Acquire) {
        return Err(ComposeError::Cancelled);
    }
    let source_metadata = sources
        .iter()
        .map(|s| {
            inspect_video(ffmpeg, ffprobe.as_deref(), Path::new(&s.path), cancel).map_err(|e| {
                if cancel.load(Ordering::Acquire) {
                    ComposeError::Cancelled
                } else {
                    ComposeError::OutputInvalid(format!("source {} metadata: {e}", s.label))
                }
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let copy_expected =
        plan_expected_metadata(&source_metadata).map_err(ComposeError::OutputInvalid)?;
    let filter_expected =
        plan_filter_metadata(&source_metadata).map_err(ComposeError::OutputInvalid)?;

    // 1) Lossless copy.
    let (code, copy_tail, copy_timeout, copy_cancelled) =
        run_ffmpeg(ffmpeg, &copy_args(&manifest, out_path), cancel);
    if copy_cancelled {
        return Err(ComposeError::Cancelled);
    }
    if code == 0 && out_path.is_file() {
        validate_output(ffmpeg, out_path, &copy_expected, cancel)?;
        return Ok(ComposeResult {
            output_path: out_path.to_string_lossy().into_owned(),
            ffmpeg_source: ffmpeg.source.clone(),
        });
    }
    if copy_timeout {
        return Err(ComposeError::BothStrategiesFailed {
            copy_detail: copy_tail,
            filter_detail: "not attempted after copy timeout".into(),
        });
    }

    // 2) Re-encode fallback.
    let (code2, filter_tail, filter_timeout, filter_cancelled) =
        run_ffmpeg(ffmpeg, &filter_args(sources, out_path), cancel);
    if filter_cancelled {
        return Err(ComposeError::Cancelled);
    }
    if code2 == 0 && out_path.is_file() {
        validate_output(ffmpeg, out_path, &filter_expected, cancel)?;
        return Ok(ComposeResult {
            output_path: out_path.to_string_lossy().into_owned(),
            ffmpeg_source: ffmpeg.source.clone(),
        });
    }

    Err(ComposeError::BothStrategiesFailed {
        copy_detail: if code == 0 {
            "copy exited 0 but output missing".into()
        } else {
            format!("copy exit {code}: {copy_tail}")
        },
        filter_detail: if filter_timeout {
            filter_tail
        } else if code2 == 0 {
            "filter exited 0 but output missing".into()
        } else {
            format!("filter exit {code2}: {filter_tail}")
        },
    })
}

// ── Tests (pure arg/manifest builders — no ffmpeg required) ────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn srcs() -> Vec<SourceVideo> {
        vec![
            SourceVideo {
                label: "Pipe 1".into(),
                path: "C:\\proj\\Session\\Pipe 1\\t1\\video.mp4".into(),
            },
            SourceVideo {
                label: "Pipe 2".into(),
                path: "C:\\proj\\Session\\Pipe 2\\t2\\video.mp4".into(),
            },
        ]
    }

    #[test]
    fn manifest_uses_forward_slashes_and_single_quotes() {
        let m = build_concat_manifest(&srcs());
        let lines: Vec<&str> = m.lines().collect();
        assert_eq!(lines.len(), 2);
        // Single-quoted values (the only form ffmpeg >= 7 accepts) +
        // forward-slash Windows paths.
        assert!(lines[0].starts_with("file '"), "line: {}", lines[0]);
        assert!(!lines[0].contains('\\'), "backslash: {}", lines[0]);
        assert!(lines[0].contains("/"), "no slash: {}", lines[0]);
        assert!(lines[0].contains("/Pipe 1/t1/video.mp4"));
        assert!(lines[1].contains("/Pipe 2/t2/video.mp4"));
        // No backslashes survive.
        assert!(!m.contains('\\'));
    }

    #[test]
    fn copy_args_shape() {
        let a = copy_args(Path::new("m.txt"), Path::new("out.mp4"));
        let s: Vec<&str> = a.iter().map(|x| x.as_str()).collect();
        assert_eq!(
            s,
            vec![
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                "m.txt",
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                "out.mp4"
            ]
        );
    }

    #[test]
    fn filter_args_shape() {
        let a = filter_args(&srcs(), Path::new("out.mp4"));
        let s: Vec<&str> = a.iter().map(|x| x.as_str()).collect();
        // -i x -i y -filter_complex [0:v][1:v]concat=n=2:v=1:a=0[v] -map [v] …
        assert_eq!(s[0], "-i");
        assert_eq!(s[2], "-i");
        let fc_idx = s.iter().position(|x| *x == "-filter_complex").unwrap();
        assert!(s[fc_idx + 1].contains("[0:v][1:v]concat=n=2:v=1:a=0[v]"));
        assert!(s.iter().any(|x| *x == "libx264"));
        assert!(s.iter().any(|x| *x == "yuv420p"));
        assert_eq!(*s.last().unwrap(), "out.mp4");
    }

    #[test]
    fn parses_ffprobe_metadata_and_rejects_missing_frames() {
        let json = r#"{"streams":[{"codec_type":"video","codec_name":"h264","width":1280,"height":720,"duration":"2.5","nb_frames":"60"}],"format":{"duration":"2.5"}}"#;
        let m = parse_ffprobe_video(json).unwrap();
        assert_eq!(m.codec, "h264");
        assert_eq!((m.width, m.height, m.frame_count), (1280, 720, 60));
        assert!(parse_ffprobe_video(r#"{"streams":[{"codec_type":"video","codec_name":"h264","width":1,"height":1,"duration":"1"}]}"#).is_err());
    }

    #[test]
    fn parses_ffmpeg_decode_progress_and_stream_metadata() {
        let progress = "frame=12\nfps=24\nout_time_us=500000\nprogress=end\n";
        assert_eq!(parse_ffmpeg_decode_progress(progress).unwrap(), (12, 0.5));
        // Real ffmpeg stderr shape: the INPUT block (with its stream line) plus
        // a later OUTPUT block that must NOT be read (its codec is the null
        // sink's `wrapped_avframe`, which would poison the comparison).
        let metadata = parse_ffmpeg_stream_metadata(
            "Input #0, mov,mp4, from 'in.mp4':\n  Duration: 00:00:02.00\n  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080 [SAR 1:1], 24 fps\nStream mapping:\n  Stream #0:0 -> #0:0 (h264 (native) -> wrapped_avframe (native))\nOutput #0, null:\n  Stream #0:0: Video: wrapped_avframe, 1920x1080\n",
        )
        .unwrap();
        assert_eq!(metadata, ("h264".into(), 1920, 1080));
    }

    // Regression: the fallback parser (no-ffprobe sidecar build) used to fail
    // on `Stream #0:0`-prefixed lines and comma-separated dimensions, which is
    // what Gyan/BtbN-era builds print. Each shape below must parse.
    #[test]
    fn parses_stream_metadata_with_stream_prefix_and_comma_dimensions() {
        // `Stream #0:0:` prefix + comma-separated dimensions + SAR bracket.
        let stderr = "Input #0, mp4, from 'in.mp4':\n  Stream #0:0: Video: h264 (High), yuv420p, 1088x832 [SAR 1:1], 24 fps\nOutput #0, null:\n  Stream #0:0: Video: wrapped_avframe, 1088x832\n";
        assert_eq!(
            parse_ffmpeg_stream_metadata(stderr).unwrap(),
            ("h264".into(), 1088, 832)
        );
        // Older builds print the dimensions space-separated right after the
        // codec token inside an output-less block.
        let stderr2 = "Input #0, mov:\n  Video: h264, 1280x720\n";
        assert_eq!(
            parse_ffmpeg_stream_metadata(stderr2).unwrap(),
            ("h264".into(), 1280, 720)
        );
    }

    #[test]
    fn plans_and_validates_composed_metadata() {
        let sources = vec![
            VideoMetadata {
                codec: "h264".into(),
                width: 640,
                height: 360,
                duration_seconds: 1.0,
                frame_count: 24,
            },
            VideoMetadata {
                codec: "h264".into(),
                width: 640,
                height: 360,
                duration_seconds: 2.0,
                frame_count: 48,
            },
        ];
        let expected = plan_expected_metadata(&sources).unwrap();
        assert_eq!(expected.frame_count, 72);
        assert!(validate_metadata(
            &VideoMetadata {
                codec: "h264".into(),
                width: 640,
                height: 360,
                duration_seconds: 3.0,
                frame_count: 72
            },
            &expected
        )
        .is_ok());
        assert!(validate_metadata(
            &VideoMetadata {
                codec: "h264".into(),
                width: 640,
                height: 360,
                duration_seconds: 3.0,
                frame_count: 71
            },
            &expected
        )
        .is_err());
        assert!(plan_filter_metadata(&sources).unwrap().codec == "h264");
    }

    #[test]
    fn compose_refuses_with_no_ffmpeg() {
        let none = FfmpegAvailability::none();
        let cancel = Arc::new(AtomicBool::new(false));
        let r = compose_session_video(&none, &srcs(), Path::new("o.mp4"), Path::new("."), &cancel);
        assert!(matches!(r, Err(ComposeError::NoFfmpeg)));
    }

    #[test]
    fn compose_refuses_missing_source() {
        // A fake ffmpeg availability that points at an existing file; the
        // source path is guaranteed-missing.
        let fake = FfmpegAvailability {
            source: "system".into(),
            path: "ffmpeg".into(),
            version_line: String::new(),
        };
        let missing = vec![SourceVideo {
            label: "X".into(),
            path: "C:\\definitely\\not\\here.mp4".into(),
        }];
        let cancel = Arc::new(AtomicBool::new(false));
        let r = compose_session_video(&fake, &missing, Path::new("o.mp4"), Path::new("."), &cancel);
        assert!(matches!(r, Err(ComposeError::SourceMissing(_))));
    }

    #[test]
    fn registry_tracks_cancels_and_prevents_duplicate_session_compose() {
        let registry = ComposeRegistry::default();
        let (_id, cancel) = registry.start("session-a").unwrap();
        assert!(matches!(
            registry.start("session-a"),
            Err(ComposeStartError::AlreadyRunning)
        ));
        assert!(registry.cancel("session-a"));
        assert!(cancel.load(Ordering::Acquire));
        assert!(!registry.cancel("missing"));
        registry.finish("session-a");
        assert!(registry.start("session-a").is_ok());
    }

    #[test]
    fn cancelled_ffmpeg_run_never_spawns_process() {
        let cancel = Arc::new(AtomicBool::new(true));
        let ffmpeg = FfmpegAvailability {
            source: "system".into(),
            path: "definitely-not-ffmpeg".into(),
            version_line: String::new(),
        };
        let (_code, detail, _timeout, cancelled) =
            run_ffmpeg(&ffmpeg, &["-version".into()], &cancel);
        assert!(cancelled);
        assert_eq!(detail, "cancelled before start");
    }
}
