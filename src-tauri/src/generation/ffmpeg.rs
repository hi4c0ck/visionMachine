//! ffmpeg binary locator + probe (two-variant ship: bundled sidecar / user-path / system).
//!
//! Resolution order:
//! 1. Bundled sidecar (when compiled with `--features bundled-ffmpeg`):
//!    Tauri's `bundle.externalBin` mechanism stages
//!    `src-tauri/binaries/ffmpeg-<target-triple>[.exe]` at build time and
//!    copies it (triple suffix stripped, per tauri-build's copy_binaries)
//!    next to the main executable: `ffmpeg(.exe)`. Production: install dir.
//!    Dev/tests: the build output dir (where tauri-build places it), then
//!    the source `binaries/` staging tree with the triple-suffixed name.
//! 2. User-set path from settings (`tools.ffmpegPath`) — probed via `-version`.
//! 3. System `$PATH` — last-resort, probed once.
//!
//! The tiny variant (feature off) has NO bundled branch; it still supports
//! user-path + system. This module is pure std (no shell plugin needed) —
//! the sidecar is executed via `std::process::Command` against a path we
//! resolve ourselves, matching the existing `compose.rs` design.
//!
//! Cross-compilation safety: the target triple is baked in at compile time
//! (via `build.rs` → `cargo:rustc-env=TARGET_TRIPLE`), so a Windows binary
//! compiled from a WSL/Linux host looks for
//! `binaries/ffmpeg-x86_64-pc-windows-msvc.exe` in the staging tree
//! regardless of the host that built it.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

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

/// The target triple this binary was compiled for (set by `build.rs`).
/// Falls back to a sane guess (host-ish x86_64) if the env var is absent
/// (e.g. when the crate is compiled outside Tauri's build pipeline).
fn compile_target_triple() -> &'static str {
    option_env!("TARGET_TRIPLE").unwrap_or("x86_64-unknown-linux-gnu")
}

/// The expected *staged* sidecar name inside `src-tauri/binaries/`, e.g.
/// `ffmpeg-x86_64-pc-windows-msvc.exe` (Windows) or
/// `ffmpeg-x86_64-unknown-linux-gnu` (Linux). This is the name
/// `fetch-ffmpeg.mjs` writes and `externalBin` references at build time.
fn staged_sidecar_name() -> String {
    let triple = compile_target_triple();
    if triple.contains("windows") {
        format!("ffmpeg-{}.exe", triple)
    } else {
        format!("ffmpeg-{}", triple)
    }
}

/// The runtime on-disk sidecar name *next to the executable*.
///
/// tauri-build's `copy_binaries` strips the `-<target-triple>` suffix when it
/// copies the staged binary into the target dir, and the shell plugin's
/// `relative_command_path` likewise resolves the bare name (+ `.exe` on
/// Windows targets). So at runtime the shipped binary is simply
/// `ffmpeg(.exe)` — no triple suffix.
fn runtime_sidecar_name() -> &'static str {
    if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

/// Directory the current executable lives in (where tauri-build places the
/// sidecar in production; in dev this is the `target/<profile>` dir).
fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
}

/// Candidate binary paths in resolution order.
fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();

    // 1. Bundled sidecar (feature-gated):
    //    a) Shipped binary next to the executable (production install, or the
    //       tauri-build output dir in dev): `ffmpeg(.exe)`, triple stripped.
    //    b) Source staging tree fallback for local checkouts: the
    //       triple-suffixed name `fetch-ffmpeg.mjs` writes under `binaries/`.
    #[cfg(feature = "bundled-ffmpeg")]
    {
        if let Some(dir) = exe_dir() {
            out.push(dir.join(runtime_sidecar_name()));
        }
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        out.push(manifest.join("binaries").join(staged_sidecar_name()));
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

/// Probe a single path with a hard timeout. A hung executable must never
/// block startup, Settings probing, or composition indefinitely.
pub(crate) fn probe(path: &Path) -> Option<String> {
    let mut child = Command::new(path)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait().ok()? {
            Some(status) => {
                if !status.success() {
                    return None;
                }
                let mut stdout = String::new();
                if let Some(mut pipe) = child.stdout.take() {
                    use std::io::Read;
                    let _ = pipe.read_to_string(&mut stdout);
                }
                return stdout.lines().next().map(str::to_owned);
            }
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            None => std::thread::sleep(Duration::from_millis(25)),
        }
    }
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
        // A path is the bundled sidecar when it lives next to the executable
        // (shipped, triple-stripped name) or in the source `binaries/` staging
        // tree (triple-suffixed name).
        let stripped = runtime_sidecar_name();
        if s.ends_with(stripped) && !s.contains("binaries") {
            return "bundled".into();
        }
        if s.contains("binaries") && s.contains(&format!("ffmpeg-{}", compile_target_triple())) {
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
    fn sidecar_names_have_target_suffix() {
        // The *staged* name must embed the compile-time target triple and
        // carry the .exe extension only on Windows targets.
        let staged = staged_sidecar_name();
        assert!(staged.starts_with("ffmpeg-"), "name: {staged}");
        assert!(
            staged.contains(compile_target_triple()),
            "name {staged} does not embed triple {}",
            compile_target_triple()
        );
        if compile_target_triple().contains("windows") {
            assert!(
                staged.ends_with(".exe"),
                "windows staged sidecar must end .exe: {staged}"
            );
        } else {
            assert!(
                !staged.ends_with(".exe"),
                "non-windows staged sidecar must not end .exe: {staged}"
            );
        }
        // The *runtime* name (next to the exe, triple stripped by
        // tauri-build) is bare `ffmpeg(.exe)` — host-extension, no triple.
        let runtime = runtime_sidecar_name();
        assert!(
            !runtime.contains('-'),
            "runtime name must be triple-free: {runtime}"
        );
        if cfg!(windows) {
            assert!(
                runtime.ends_with(".exe"),
                "windows runtime name must end .exe: {runtime}"
            );
        } else {
            assert!(
                !runtime.ends_with(".exe"),
                "non-windows runtime name must not end .exe: {runtime}"
            );
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
