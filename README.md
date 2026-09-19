# VisionMachine

VisionMachine is an **AI-powered video-generation studio** with a professional
timeline composer. You describe *what you want* — scenes, camera moves,
lighting, style, sound — on a drag-and-drop timeline, and the app turns that
composition into a **real generated video** you can watch, re-run, and iterate
on. It is a desktop app (Windows today; built on Tauri, so it is portable to
macOS/Linux) plus a browser/E2E fallback.

## What it delivers

- **A composer you direct.** Build a video as *pipes* (tracks), each with
  keyframes, timed **segments/zones**, and typed **tags**
  (scene, camera, rotation, lighting, effect, zoom, transition).
- **Prompting that reads like a shot list.** Global style + Sound lanes and
  per-tag prompts are compiled into one structured generation prompt —
  no hand-assembled prompt files.
- **Real generation flow.** One click runs the engine: keyframe/subject images
  first, then the final video, with a live progress modal, per-stage progress,
  and cancel. The finished video attaches to the pipe and plays in the preview.
- **Reference-based consistency.** Up to 5 subject reference images (optional
  frame ranges) keep a subject visually consistent across the pipe.
- **Projects & sessions.** Hierarchical, persisted in SQLite (source of
  truth); localStorage only as a browser/E2E fallback.

### Screenshot

_The main screen: frame preview on top, project/session sidebar on the left,
the pipe-composer timeline in the center, and the tools/inspector panel on the
right._

## Tech stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Svelte 5, TypeScript, Vite |
| Desktop shell | Tauri 2 |
| Backend   | Rust, SQLite |
| Engine    | Agnes AI (image + video) via a provider-engine abstraction |
| Styling   | CSS custom properties (theme tokens) |

## Install

### Prerequisites

- **Node.js 18+** (20 recommended) and **npm**
- **Rust stable** toolchain (`rustc` + `cargo`)
- **Tauri CLI** — either `cargo install tauri-cli` or `npm install -g @tauri-apps/cli`
- Platform deps:
  - **Windows**: Visual Studio Build Tools (MSVC) + WebView2
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.0`, `libgtk-3`, and other Tauri 2 Linux deps
    (see the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/))

### Run in development

```bash
npm install
npm run tauri dev
```

### Build & install for yourself

```bash
npm run tauri build
```

This produces a platform installer + a standalone binary:

- **Windows MSI**: `src-tauri/target/release/bundle/msi/VisionMachine_*.msi`
- **Portable exe**: `src-tauri/target/release/vision-machine.exe`
- **macOS**: `src-tauri/target/release/bundle/macos/VisionMachine.app`
- **Linux**: `src-tauri/target/release/bundle/deb/…` (or `.rpm` / `.AppImage`)

Install the MSI (or double-click the exe / `.app` / package) and you're done.

### Data & logs

- Database (source of truth): `%LOCALAPPDATA%\com.visionmachine.desktop\visionmachine.db`
- Logs: `%LOCALAPPDATA%\com.visionmachine.desktop\logs\`
- Browser/E2E mode: sessions also cache to `localStorage` (no Tauri backend).

## Usage

### Creating your first project

1. Launch the app; enter your name on the welcome screen.
2. Click **Create Project** in the left sidebar, name it, optionally set a path.
3. Click the **+** under the project to add a session.
4. Select the session to open the composer.

### Working in the composer

- **Keyframes** — click **+** in the keyframe row (up to 3 per pipe; URL /
  txt2img / img2img).
- **Global prompt** — click the blue **Global** pill to open its prompt editor;
  the prompt shows inline on the pill.
- **Sound** — click **+** → **♪ Sound** to add a Sound lane; click the amber
  pill to edit its prompt (the `sound:` section of the generated prompt).
- **Segments** — click **+ Add Segment** to drop a timed zone, then add typed
  tags (scene/camera/lighting/…) with drag-resize.
- **Settings** — right panel: FPS, resolution, quality, creativity.

### Generating

Open the pipe, hit **Generate**. The progress modal walks through keyframe →
subject images → final video with per-stage progress and cancel; the finished
video plays in the top-panel preview.

## Documentation

- [Composer timeline rules (SLA)](docs/composer-timeline-sla.md) — the 8-frame
  engine floor, the ≈1s zone guideline, and the tag composition model
- [Release notes](release-notes.md)

## Branch & release model

| Branch | Role |
|--------|------|
| `main` | **Established / stable.** Only what is released ever lives here. |
| `develop` | **Default working branch.** All feature branches cut from here and land here first. |
| `release` | **Incremental releases.** Cut from `develop` at release time; each release is tagged `0.1.0.x` where `x` is the incremental build counter. |

Flow: `feature/*` → `develop` → `release` → `main`.

- **Feature branches** are created from `develop` and merged back into
  `develop` (CI runs on every push/PR to `develop` and `main`).
- **Releases**: bump the version in `release`, tag as `0.1.0.(x+1)`, push —
  the release CI builds a Windows installer + executable and publishes a
  GitHub Release.

## Building from source

The repo's own build tooling wraps `tauri build` with progress, health checks
and resource guards:

```bash
# Quick foreground build with live progress
node scripts/build/runner.mjs

# Lightweight preset for low-RAM machines (no LTO, 2 jobs, split codegen)
node scripts/build/runner.mjs --light

# Track / watch / stop a running build
npm run build:status
npm run build:watch
npm run build:stop
```

Or drive `tauri` directly:

```bash
npm run tauri build          # release build (MSI + exe on Windows)
npm run tauri build -- --debug
```

## Testing

```bash
npm test          # unit (vitest)
npm run test:e2e  # playwright (desktop E2E)
npm run check     # svelte-check type-check
```

## Troubleshooting

- **White screen** — check the dev console; usually a missing type export or a
  Svelte reactivity/`$props` mismatch.
- **Build fails** — clear `src-tauri/target` and rebuild; on Windows make sure
  the MSVC build tools are installed.
- **DB errors** — ensure the app-data directory is writable; check the logs.

## License

_MIT — see [LICENSE](LICENSE) (add it before opening the repo)._
VisionMachine ships an AI video-generation workflow; the Agnes model endpoints
and any API keys are your responsibility to configure and bill.
