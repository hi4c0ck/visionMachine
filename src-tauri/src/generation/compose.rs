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

use std::path::Path;
use std::process::Command;

use crate::generation::ffmpeg::FfmpegAvailability;

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
    /// Output file not found after a successful exit (ffmpeg quirk).
    OutputMissing,
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
            Self::OutputMissing => write!(f, "ffmpeg exited ok but output file missing"),
        }
    }
}

/// Build the ffmpeg concat-demuxer manifest text.
///
/// One `file '<abs path>'` line per source, in timeline order. Windows paths
/// contain single quotes and backslashes that the ffmpeg concat demuxer
/// does NOT understand well, so we normalize to forward-slash, double-quote
/// the value, and escape embedded double-quotes. This is the documented
/// portable form for Windows.
pub fn build_concat_manifest(sources: &[SourceVideo]) -> String {
    sources
        .iter()
        .map(|s| {
            let p = s.path.replace('\\', "/");
            // Escape embedded double-quotes (rare in our paths, but safe).
            let escaped = p.replace('"', "\\'");
            format!("file \"{}\"", escaped)
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

/// Run a single ffmpeg command and return its exit code + a short stderr tail.
fn run_ffmpeg(ffmpeg: &FfmpegAvailability, args: &[String]) -> (i32, String) {
    let out = Command::new(&ffmpeg.path).args(args).output();
    match out {
        Ok(o) => {
            let tail = String::from_utf8_lossy(&o.stderr)
                .lines()
                .take(40)
                .collect::<Vec<_>>()
                .join("\n");
            (o.status.code().unwrap_or(-1), tail)
        }
        Err(e) => (-1, format!("spawn failed: {e}")),
    }
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

    let manifest = manifest_dir.join("concat.txt");
    std::fs::write(&manifest, build_concat_manifest(sources))
        .map_err(|e| ComposeError::SourceMissing(format!("manifest write: {e}")))?;

    // Ensure the output parent dir exists (session_generation_dirs already
    // does this, but be defensive).
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ComposeError::SourceMissing(format!("output dir: {e}")))?;
    }

    // 1) Lossless copy.
    let (code, copy_tail) = run_ffmpeg(ffmpeg, &copy_args(&manifest, out_path));
    if code == 0 && out_path.is_file() {
        return Ok(ComposeResult {
            output_path: out_path.to_string_lossy().into_owned(),
            ffmpeg_source: ffmpeg.source.clone(),
        });
    }

    // 2) Re-encode fallback.
    let (code2, filter_tail) = run_ffmpeg(ffmpeg, &filter_args(sources, out_path));
    if code2 == 0 && out_path.is_file() {
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
        filter_detail: if code2 == 0 {
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
    fn manifest_uses_forward_slashes_and_quotes() {
        let m = build_concat_manifest(&srcs());
        let lines: Vec<&str> = m.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("file \"C:/proj/"));
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
    fn compose_refuses_with_no_ffmpeg() {
        let none = FfmpegAvailability::none();
        let r = compose_session_video(&none, &srcs(), Path::new("o.mp4"), Path::new("."));
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
        let r = compose_session_video(&fake, &missing, Path::new("o.mp4"), Path::new("."));
        assert!(matches!(r, Err(ComposeError::SourceMissing(_))));
    }
}
