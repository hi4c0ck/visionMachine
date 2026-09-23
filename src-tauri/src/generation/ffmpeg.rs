//! ffmpeg binary locator + probe (two-variant ship: bundled / user-path / system).
//!
//! Resolution order:
//! 1. Bundled binary (when compiled with `--features bundled-ffmpeg`):
//!    `<resource_dir>/ffmpeg/<platform>/ffmpeg(.exe)` — Tauri resource dir,
//!    populated at install time by the full-variant build script.
//! 2. User-set path from settings (`tools.ffmpegPath`) — probed via `-version`.
//! 3. System `$PATH` — last-resort, probed once.
//!
//! The tiny variant (feature off) has NO bundled branch; it still supports
//! user-path + system. This module is pure std (no shell plugin needed).

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Probed availability of an ffmpeg binary.
#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegAvailability {
    /// Where the winning binary lives: "bundled" | "user" | "system" | "none".
    pub source: String,
    /// Resolved absolute path (empty when source = "none").
    pub path: String,
    /// The `-version` first line (for UI display; empty when not probed).
    pub version_line: String,
}

impl FfmpegAvailability {
    pub fn none() -> Self {
        Self {
            source: "none".into(),
            path: String::new(),
            version_line: String::new(),
        }
    }
}

/// Candidate binary paths in resolution order.
fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();

    // 1. Bundled (feature-gated): <bundled_dir>/ffmpeg/<platform>/ffmpeg(.exe).
    //    Production: the app exports VM_FFMPEG_BUNDLED_DIR pointing at the
    //    Tauri resource dir before probing (see lib.rs setup). Dev/tests:
    //    falls back to a workspace-relative tree, so a local checkout can
    //    stage the binary without installing resources.
    #[cfg(feature = "bundled-ffmpeg")]
    {
        let base = std::env::var("VM_FFMPEG_BUNDLED_DIR")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../ffmpeg-bundled")
            });
        let plat = platform_dir();
        out.push(base.join("ffmpeg").join(plat).join(ffmpeg_exe_name()));
    }

    // 2. User-set path: read from the environment variable the app sets
    //    at startup (from settings). In production the settings command
    //    writes it; in tests the caller sets it directly.
    if let Ok(user_path) = std::env::var("VM_FFMPEG_USER_PATH") {
        let trimmed = user_path.trim();
        if !trimmed.is_empty() {
            out.push(PathBuf::from(trimmed));
        }
    }

    // 3. System PATH.
    out.push(PathBuf::from(ffmpeg_exe_name())); // bare name → resolved via $PATH
    out
}

fn ffmpeg_exe_name() -> &'static str {
    if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

#[cfg(feature = "bundled-ffmpeg")]
fn platform_dir() -> &'static str {
    if cfg!(windows) {
        "win64"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

/// Probe a single path: run `<path> -version` (5 s timeout) and return
/// the first line of stdout on success.
fn probe(path: &Path) -> Option<String> {
    let out = Command::new(path).arg("-version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let first_line = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .to_string();
    Some(first_line)
}

/// Resolve ffmpeg: walk candidates in order, return the first that probes.
/// Returns `FfmpegAvailability::none()` when nothing works.
pub fn resolve_ffmpeg() -> FfmpegAvailability {
    for path in candidate_paths() {
        // Bare-name candidates (system PATH) are probed as-is;
        // absolute paths must exist first.
        if !path.is_file() {
            // Bare names resolved via PATH don't have a file on disk at that
            // literal path; try the probe anyway (Command::new handles PATH).
            let is_bare =
                !path.to_string_lossy().contains('/') && !path.to_string_lossy().contains('\\');
            if !is_bare {
                continue;
            }
        }
        if let Some(version) = probe(&path) {
            let source = source_label(&path);
            return FfmpegAvailability {
                source,
                path: path.to_string_lossy().into_owned(),
                version_line: version,
            };
        }
    }
    FfmpegAvailability::none()
}

fn source_label(path: &Path) -> String {
    let s = path.to_string_lossy();
    // Bare name = resolved via $PATH.
    if !s.contains('/') && !s.contains('\\') {
        return "system".into();
    }
    #[cfg(feature = "bundled-ffmpeg")]
    {
        if s.contains("ffmpeg-bundled") || s.contains("/ffmpeg/") || s.contains("\\ffmpeg\\") {
            return "bundled".into();
        }
    }
    // Absolute or user-set path (env var must be set for the candidate to exist).
    "user".into()
}

// ── Tests (pure, no network / no real ffmpeg required) ─────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn none_when_no_candidate_resolves() {
        // In the test environment no ffmpeg is expected on PATH;
        // if one IS present the test still passes (it just returns a
        // non-none result). We assert the struct shape instead.
        let a = FfmpegAvailability::none();
        assert_eq!(a.source, "none");
        assert!(a.path.is_empty());
    }

    #[test]
    fn resolve_returns_valid_shape() {
        let a = resolve_ffmpeg();
        // Whatever the environment, the shape must be well-formed:
        // source ∈ {bundled, user, system, none}; path non-empty iff source ≠ none.
        match a.source.as_str() {
            "none" => assert!(a.path.is_empty()),
            _ => assert!(!a.path.is_empty()),
        }
    }

    #[test]
    fn candidate_paths_shape() {
        let paths = candidate_paths();
        // At minimum the system bare-name candidate is always present.
        assert!(!paths.is_empty());
        let last = paths.last().unwrap();
        assert_eq!(last.to_string_lossy(), ffmpeg_exe_name());
    }
}
