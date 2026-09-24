fn main() {
    tauri_build::build();

    // Bake the active compile-time target triple into the binary so the
    // ffmpeg sidecar locator (`src/generation/ffmpeg.rs`) can compute the
    // exact sidecar filename Tauri names it (`ffmpeg-<triple>`, + `.exe` on
    // Windows) and resolve it next to the executable. Cargo sets `TARGET`
    // to the active `--target` (or the host triple when building for the
    // host), so a Windows binary cross-compiled from a Linux/WSL host still
    // bakes in the correct `x86_64-pc-windows-msvc` triple.
    let target = std::env::var("TARGET").unwrap_or_default();
    println!("cargo:rustc-env=TARGET_TRIPLE={}", target);

    // Re-run only when the target changes.
    println!("cargo:rerun-if-env-changed=TARGET");
}
