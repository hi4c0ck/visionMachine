# Plan: session video (ffmpeg, two ship variants) + top-panel frame carousel

Goal: (1) stitch per-pipe `video.mp4` into one session video — shipped as two
installer variants (full = bundled ffmpeg binary, tiny = no binary, feature
gated, manual ffmpeg path via settings allowed); (2) carousel mode for the
top panel: concrete center frame + 2–3 overlapped, lower cards on each side,
8-frame steps (relaxable for perf), frames fetched at runtime via WebCodecs
(decoder does the work — no manual frame splitting). A tiny toggle button in
the top panel switches playback ⇄ carousel on the fly.

## A. Session video (concat) — backend

### A1. Composer / ordering
- Session video = sequential concatenation of selected pipes' last-gen
  `video.mp4`, ordered by `orderIndex` (the timeline layout is already
  sequential; no crossfade/overlay/audio mixing in v1).
- Source per pipe: `Pipe.last_generation.video_path`
  (`<session>/<pipe-name>/<task>/video.mp4`). Refuse with a concrete
  per-pipe reason if any selected pipe has none.
- Output: `session_generation_dirs(session_root, task_id)` →
  `<session>/session-video/<run-hash>.mp4` + `output.json`
  (`{ kind: "session", sourcePipes: [{pipeId, taskId, videoPath}], fps, frameCount }`),
  mirroring the provider's output.json convention so the backfill/log paths
  can pick it up uniformly.
- New command `compose_session_video { session_id, pipe_ids? }` in
  `commands/generation.rs`; registers in `lib.rs`; returns the output path.

### A2. ffmpeg locator (variant-aware, user-overridable)
Resolution order for the binary:
1. user-set `ffmpegPath` from settings (Settings → new "Tools" field) if it
   resolves and runs (`-version` probe) — this is the escape hatch for the
   tiny build;
2. bundled binary: `<resource_dir>/ffmpeg/<platform>/ffmpeg(.exe)` when the
   build was made with the `bundled-ffmpeg` cargo feature;
3. system `$PATH` `ffmpeg` (permissive fallback, probed once at app start).
Exposes `probe_ffmpeg() -> FfmpegAvailability { bundled | user | system | none }`
so the UI can render the feature state honestly (chips/toolbar), plus
`which_ffmpeg()` returning the winning path.

### A3. Two ship variants (build-time, not runtime bloat)
- Cargo feature in `src-tauri/Cargo.toml`:
  `bundled-ffmpeg` (off by default).
- `tauri.full.conf.json` (deep-merged over `tauri.conf.json` via the runner's
  `--config` override when the feature is on) gets
  `"bundle": { "externalBin": ["binaries/ffmpeg"] }` — Tauri's sidecar
  mechanism: sidecars are filtered + renamed at build time based on the
  active target triple, so only the matching
  `src-tauri/binaries/ffmpeg-<target-triple>[.exe]` is packaged. At
  install time the sidecar lands next to the main exe (triple suffix
  stripped by tauri-build's copy_binaries). Tiny variant: no sidecar
  declared → installer stays small.
- `scripts/build/` gains two npm targets reusing `runner.mjs`:
  - `build:desktop` (existing) → **tiny** variant (feature off; no
    sidecar staged; installer stays small).
  - `build:desktop:full` → sets `--features bundled-ffmpeg` and stages
    the target ffmpeg into `src-tauri/binaries/ffmpeg-<triple>` before
    tauri bundle. Staging: download pinned `Btbn/buildffmpeg` release
    asset (single-file windows build w/ GPL libs, ~90 MB) in a
    `scripts/build/fetch-ffmpeg.mjs` (cached in `build-state/ffmpeg-cache`
    so repeated builds don't re-download). The script is target-aware:
    `node fetch-ffmpeg.mjs <triple>` or `TARGET_TRIPLE=<triple>` selects
    the destination architecture, so cross-compilation
    (Windows-from-WSL) stages the right binary.
- Binary naming: the staged sidecar keeps the triple suffix
  (`ffmpeg-x86_64-pc-windows-msvc.exe`); tauri-build strips it when
  copying to the build output, so the shipped binary is plain `ffmpeg.exe`
  next to the app exe. The backend locator
  (`src/generation/ffmpeg.rs`) resolves: `<exe_dir>/ffmpeg(.exe)`
  (shipped) → `src-tauri/binaries/ffmpeg-<triple>[.exe]` (dev/checkout)
  → user path → system $PATH, so feature-on/feature-off never hardcodes.
- Feature gating (tiny variant must NOT break): behind
  `#[cfg(feature = "bundled-ffmpeg")]` only the "bundled" branch of the
  locator exists; user-path + PATH branches remain in both variants. Frontend
  feature flag: a small `appCapabilities()` command returning
  `{ ffmpeg: bundled|user|system|none, sessionVideo: bool }`;
  `compose` button disabled w/ tooltip when none.
- Installer: two MSI artifacts per release (`…-tiny.msi`, `…-full.msi`);
  `beforeBuildCommand` unchanged; version suffix via `build-state` (no
  tauri.conf change needed if we keep the same version and just name the
  bundle dirs differently post-build — simplest: copy/rename the MSI
  after `tauri build`).

### A4. Concat execution (Rust, no external service)
- Prefer **lossless concat demuxer** when all inputs share codec+resolution
  (our pipeline does: same session fps/res/orientation):
  - write a manifest `file '<abs>'` per source →
    `ffmpeg -f concat -safe 0 -i manifest.txt -c copy -movflags +faststart out.mp4`
  - fast, no re-encode, zero quality loss.
- Fall back to **concat filter re-encode** on probe mismatch or copy failure:
  `ffmpeg -i a -i b … -filter_complex "[0:v][1:v]…concat=n=N:v=1:a=0[v]" -map [v] -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart out.mp4`
- Run via `std::process::Command` (no shell plugin needed), captured
  stderr → last 40 lines into the run's `request.log` (redacted per P6);
  10-min timeout for 720p class inputs; progress: parse `-progress pipe:1`
  for the UI (optional phase 2).
- Frame-count guard: session total = Σ(8n+1) is itself 8m+1 only if pipes
  are whole-counts; verify the result length matches Σ within ±2 frames
  (codec drop-frame safety) and record in `output.json`.

### A5. UI wiring
- Tools panel / session header: "Compose session video" button
  (enabled when ≥1 pipe has a last video; shows which pipes are missing).
- On success → `openPreview`-style flow points the top panel `<video>` at
  the composed file (`read_media_file`/`toMediaUrl` already serve local paths);
  store `lastGeneration` analog on the session (new optional
  `SessionData.sessionVideo` field, persisted with the composer save) so the
  carousel (B) has a target for it too.
- tiny variant: button tooltip "Compose requires ffmpeg — add a path in
  Settings or install the Full build" when `ffmpeg: none`.
- Session generation group auto-compose exposes the same composed
  `session.mp4` after all selected pipes finish successfully; it uses the
  current run's pipe outputs and the same top-panel/carousel media path.

## B. Carousel mode — frontend (no new deps)

> Status (implemented): `src/lib/frameDecoder.ts` (B1), `src/components/FrameCarousel.svelte`
> (B2), `Frame.svelte` mode toggle (B3), `Workspace.svelte` wiring (B4) all landed.
> Tests: `tests/unit/frameCarousel.test.ts` (window math, 8-grid snap, dip scale).
> The WebCodecs decode pipeline (FrameSource) is implemented but is the one piece
> that needs a real H.264 blob in a WebView2/Chromium runtime to confirm — it
> degrades to placeholder neighbor cards when `VideoDecoder`/`EncodedVideoFileSource`
> are unavailable, so the carousel never hard-fails.

### B1. Frame fetching: WebCodecs decoder (the decoder does it)
- `src/lib/frameDecoder.ts` (new, pure frontend module):
  - `openDecoder(url|bytes, { fps, width?, height? }) → FrameSource`:
    fetch bytes (Tauri `read_media_file` → `Response`), then
    `VideoDecoder.configure({ codec: probe from metadata (default avc1.4d… H.264
    720p baseline), hardwareAcceleration: 'no-preference' })`.
  - Seek strategy: **keyframe-limited decode** — decode forward from the
    nearest preceding keyframe index; frame index k → time `k / fps`;
    stop at target; returns `ImageBitmap` via `createImageBitmap(videoFrame)`
    then `videoFrame.close()`. Cache sampled frames in an LRU
    (`Map` ~16 entries, evicted on carousel move) — scrolling back = no
    re-decode.
  - Fallback path (cheap, no perf risk): if `VideoDecoder` unavailable
    (older WebView2), use the existing `<video>` element with
    `seeked` + `canvas.drawImage` for the *center* card only; neighbors
    show placeholders. Keeps feature alive, degrades gracefully.
- 8-frame stepping: `step = 8` (composer-grid). Perf lever already there:
  if 720p+ decode feels heavy at 24fps, switch to **sub-sample 8/2**
  (every other step) — same API, one constant. Snap playhead to `round(f/8)*8`.

### B2. `FrameCarousel.svelte` (new component)
- Props: `{ video: {url,label} | null; totalFrames; fps; frame }` —
  reuses the `ruler` shape from `Frame.svelte` (ticks/total/frame).
- Layout: horizontal strip, center card full height, ±1 at 85% + dip,
  ±2/±3 at 70%/55% + opacity fade + horizontal overlap (negative margins),
  click/drag advances `frame` by ±8 (grid snap); center card is a live
  `<video>` (keeps free playback), neighbors are decoded `<img>`
  (JPEG dataURL) — 2-3 each side as approved.
- Frame-number labels under cards (frame idx / ≈seconds at fps).

### B3. Top-panel toggle (playback ⇄ carousel, on the fly)
- `Frame.svelte` gains `mode: 'playback' | 'carousel'` (`$state`, tiny button
  in the top row next to the play/pause, icon ⇄). Switching does NOT reload
  the video source: playback keeps the `<video>`; carousel keeps the same
  element (paused) for the center + spins up `FrameSource` for neighbors.
- State survives the toggle (center frame = current `video.currentTime`
  snapped to grid); both modes drive the same `selectedFrame` in
  `Workspace.svelte` so the ruler/composer stay in sync (single source of
  truth — no new store).

### B4. Wiring in `Workspace.svelte`
- `previewVideo` → pass `totalFrames` (Σ pipes, already computed via
  `totalFrames` derived) + `fps`; carousel reads the same
  `pipe.lastGeneration.videoPath` or composed session video (A5) —
  composed session video is the *primary* carousel target when present.

## C. Settings: manual ffmpeg path (both variants)
- New settings field `tools.ffmpegPath` (string, optional; stored in the
  existing settings blob, camelCase like the rest — no `rename_all` on
  settings commands; keep plain `#[tauri::command]`).
- Settings UI: one input + "Test" (runs `-version` probe via a new
  `probe_ffmpeg_path(path)` command; never executes user paths without
  allowlisting `ffmpeg`/`ffprobe` executable names — anti-PATh-traversal:
  resolve + check the basename is exactly `ffmpeg(.exe)`/`ffprobe(.exe)`).

## D. Test plan
- Rust: `probe_ffmpeg` resolution order (unit tests w/ fake dirs);
  manifest writer (concat demuxer text is pure data → table test);
  feature-compile check (`cargo check --features bundled-ffmpeg` +
  default-off build both compile).
- Frontend vitest: LRU eviction; 8-grid snap; carousel window math
  (visible = 2n±3); `frameDecoder` fake-decoder tests (jsdom: assert
  fallback path, no crash when `VideoDecoder` is undefined).
- svelte-check 0 errors; full `npm run build` for both variants;
  manual: compose a 2-pipe session in tiny build w/ user ffmpeg path
  (expect success + top-panel session video), same in full build with no
  settings (expect bundled used), carousel toggle on/off with 241-frame
  pipe video.

## E. Order of work (commits)
1. `feat: ffmpeg locator + settings path + feature flag` (A2, C, probe
   command; UI chip shows availability) — no ffmpeg present yet, all
   feature-gated, tiny build unaffected.
2. `feat: compose_session_video (concat demuxer + filter fallback)` (A1, A4)
   — runs only when a binary resolves.
3. `feat: full build variant (bundle resources + staging script)` (A3) —
   `build:desktop:full`, pinned Btbn release, MSIs renamed.
4. `feat: top-panel carousel (WebCodecs sparse sampling + toggle)` (B) —
   pure frontend, lands after 3 so it has a session video to ride on
   (pipe videos work too).
5. `fix/docs: capability gating + tooltips for tiny variant` (A5 polish).

## F. Risks / notes
- Btbn builds are GPL-licensed builds (LGPL core + GPL libs) — shipping the
  *binary* (not source) is distribution-only; keep a NOTICE in
  `src-tauri/bin/ffmpeg/` documenting provenance + version pin.
- WebView2 VideoDecoder availability: stable since Chromium 100;
  `navigator.gpu`-class devices all fine on Win10/11 target — fallback
  path (B1) covers the edge.
- H.264 `-c copy` concat needs identical SPS/PPS across inputs; our
  provider renders all pipes at the same session resolution/fps so copy is
  expected to work; filter fallback is the safety net (and it's still
  one ffmpeg call, no UI difference).
- Don't touch the `rename_all = "snake_case"` flat-arg commands in
  `generation.rs` (`get_generation_task`, `cancel_generation`) — they're a
  committed correct state (JS side sends `task_id`), per eeb2e16.
