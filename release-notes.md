# VisionMachine v0.7.10

### Your work stays put
- Your settings, theme choice, and saved layouts now persist across app restarts instead of quietly resetting to defaults.

### A calmer interface
- The timeline now scrolls the active pipe into view as playback moves past it.
- The generation and settings dialogs are easier to read and stay consistent with the rest of the app.
- The projects panel selection is calmer, with more familiar folder icons.

# VisionMachine v0.7.9

### Image browser (new)
- Reuse any image from the session — generated, extracted from a frame, or uploaded — for any keyframe or subject

### Live generation feedback
- While a piece is generating you see it working, and it swaps to the finished picture the moment it's ready

### Fixes
- Sorted out a number of bugs and rough edges you've been running into

# VisionMachine v0.7.8

### Models
- Removed agnes-image-2.1-flash and agnes-video-v2.0

### Subject references
- Subject refs in prompt modals (lightbox preview, [SubjectN] insert)

### Pipes & session
- Per-pipe crop override
- Session video aspect-ratio and resolution pickers (model-filtered)
- Image size is now session-level

### UI
- ToolsPanel hero with session/pipe breadcrumb navigation
- Compact profile panel

# VisionMachine v0.7.7

### Composer & focus
- The tools panel is a progressive hero: a clickable **Session / Pipe**
  breadcrumb walks you up and down the focus level; the right
  Generate/Compose actions appear for whatever you're focused on. The
  pipe-level **Generate** carries a subtle corner notch so you can tell
  the scope at a glance.
- **Per-pipe crop override** (D2): each pipe can pin its own crop mode,
  independent of the session default. The override survives a session
  load round-trip.
- **Model-filtered resolution presets**: the RESOLUTION dropdown now
  shows only the tiers the selected video model actually supports.
  Arbitrary W×H pixel inputs are gone — the API takes discrete tiers.

### Subject references
- **Preview & cite a subject ref.** Click a subject-ref thumbnail to open
  the shared **lightbox** (wheel-zoom 0.2–8×, drag-to-pan, double-click
  toggle, reset button). The lightbox is reused for every image preview
  in the project.
- **`[SubjectN]` tokens.** Any prompt modal (tag, global, sound) shows
  the pipe's subject refs in a compact footer strip: click a thumbnail to
  open the lightbox, click **+** to insert `[SubjectN]` into the prompt
  (N = order in the refs list).
- Subject-ref modal drops per-piece size override and "Use frame range"
  — those now live at the session level.

### Keyframes
- **Piece history** — clicking a keyframe or subject-ref thumbnail opens
  the in-place lightbox; the modal's history strip keeps every prior
  generation and switching to one persists the selection.
- **Keyframe modal** drops the "Use frame range" toggle and the
  per-piece Size selector — it now carries a **pipe crop override**
  select that matches the per-pipe override in the hero.

### Media controls
- **Video-size picker** clamps to the model's declared limits and is
  orientation-aware (a 16:9 ratio won't appear in a vertical session).
- When the target video size changes, settled image pieces are marked
  `forceRegen=true` so they re-generate at the new size; the video
  pre-seed is skipped for those.
- **Preemptive image downscale (D4)**: local images larger than 5760px on
  the longer side are downscaled with ffmpeg before the provider sees
  them, so an oversized reference no longer 413's.

### Top panel & playback
- The top-panel cluster gives you transport controls plus "play outside"
  (opens the current preview in your system player).
- Frame carousel: an Immersive Snaps toggle plus two auto-scroll speeds —
  steady is a constant-velocity roll so cards no longer snap or flicker.

### Icon set
- A custom **50-mark app-chrome icon atlas** in the Atlas gold language
  replaces ad-hoc unicode glyphs across every panel (projects, profile,
  top panel, composer, status, misc). The atlas ships as
  `public-static/icons/app-chrome-sprite.svg` and is injected once at
  startup via `<ChromeIcon>`.

### Profile & settings
- **Compact profile panel**: the stats strip is one line of mono text at
  the bottom of the panel; Settings and Logout are icon buttons next to
  the avatar.
- Settings modal is driven by the icon set — no raw unicode in the tabs.

### Stability and generation flow
- The running-generation pill is compact and status-driven, and shows
  the same percentage as the progress modal.
- ffmpeg filter chains are `;`-separated — the old un-separated glue
  caused "Trailing garbage after a filter: concat" crashes on compose.
- Generation logs carry a human-readable timestamp next to the
  machine-readable one.

### Rust backend
- `ComposerConfig` gains `video_ratio`; `Pipe` gains `crop_override`.
  `StageContext` carries `video_ratio` through the shaper, and
  `guard_supported` clamps a session's tier/ratio to the model's
  declared limits before it reaches the provider.
- `ratio_compatible_with_orientation` gates the video_ratio override:
  a 16:9 ratio is ignored in a vertical session.
- All constructor sites updated; `crop_mode` threaded through
  `SourceVideo` and the compose filter chain.

# VisionMachine v0.7.6

### Generation
- Agnes Video V2.0 is marked obsolete: the provider has retired it
  and it now works only on legacy terms (runs on the 2.5-series
  engine); the catalog shows it as such
- 503 "video queue full": instead of the old single 2-minute wait,
  the poller probes the queue every ~15 s, so a run joins the queue
  the moment a slot frees and the progress view shows the retry state
  instead of looking frozen
- Prechecks: paid models are blocked from a run, and media pieces
  without a source image are flagged before it starts
- Settings self-heal: a stored model id the catalog no longer knows
  falls back to the preset default, so the model picker can't end up
  empty

### Sessions
- Rename: Enter saves and unfocuses; the new name no longer reverts on
  re-select
- A composed session video now survives an app restart
- Closing the window mid-run asks first; "keep working" no longer
  kills the running tasks, and a wedged preview recovers instead of
  staying un-closeable

### UI
- Session generation modal: two-pane — scrollable pipe list left, run
  controls right

# VisionMachine v0.7.5

### Provider settings (the main fix)
- Provider status chip now always matches reality: configure a provider and
  it shows configured immediately; clear the key and it shows "key needed"
  immediately — no logout required
- Switching the provider preset clears the API key with it, so a key from
  the old vendor can no longer masquerade as "Configured"

### Stability
- A slow startup settings load can no longer overwrite a provider config
  you just saved (stale-load guard in the settings store)
- Projects list scrolls; profile panel stays pinned in landscape layout

### Docs
- README screenshot section rewritten as a friendly "A quick look"
  guide, with two short motion clips of the composer and the projects
  panel

# VisionMachine v0.7.4

### Linux support
- Official Linux AppImage build (full variant, bundled ffmpeg) alongside
  the Windows MSIs — same GitHub Release, both platforms
- Linux AppImage build fixed to run natively; release CI asserts the
  artifact exists

### Repo
- Canonical GPL-3.0 license text + attribution addendum moved to NOTICE
- GitHub issue templates, PR template, declarative label sync
- CI: Rust unit tests run on every PR; release pipeline hardened
  (production-only tag guard, multi-platform publish)

# VisionMachine v0.7.3

### Session generation (new)
- Generate an entire session at once: all pipes run as one coordinated
  group (compact progress view with per-pipe stages), then the composed
  session video is spliced automatically (auto-compose) and attached to
  the preview
- Run-scoped stats: quality (Q) and creativity (C) can be overridden per
  run and persist with the session; the progress view shows per-run stats
- Follow-up pipe failures fail fast with a clear reason instead of stalling
  the whole group

### Session video (new)
- "Compose session video" button in the tool panel (splices all pipe clips
  back-to-back in pipe order via the ffmpeg concat demuxer, with a
  filter-complex fallback)
- Composed video attaches to BOTH the top-panel preview and the tool-panel
  Preview section — after auto-compose finishes AND after a manual compose
  run; an "Open in preview" button on the session video restores it to the
  top panel after you switch to a per-pipe clip
- Frame carousel: sliding the session video's frame sweep auto-selects the
  owning pipe and each pipe's ruler pin shows its LOCAL frame (the global
  frame minus that pipe's spliced start), so the playhead lands at the
  right position on the right pipe
- Two ship variants: `tiny.msi` (no bundled ffmpeg — pipe generation works
  out of the box; session compose needs an ffmpeg path in Settings → Tools)
  and `full.msi` (bundled ffmpeg sidecar, compose works out of the box)

### Generation hardening
- Artifact downloads are now retryable: provider CDNs that drop a body
  mid-transfer are bounded-retried, streamed to a .part file under a size
  cap, verified, then atomically renamed — a failed fetch never leaves a
  partial or stale artifact behind
- Transient 503s on video polling use a capped backoff ladder with a
  "provider load looks broken" reset after 6 minutes
- Subject img2img reference URLs are preserved across regeneration
- Composer timeline duration validation uses the effective clip timeline
  (longer audio tails no longer cause false "too short" rejections)

### Provider status fix
- A provider with a missing API key now shows a RED "Key needed" dot
  instead of the model name reading as "ready" (the warning was being
  truncated off the chip)

### Repo / release
- New user-facing README, GPL-3.0 license, PR size gate, stale-issue
  bot, and release CI (production-only guard)
- Rust unit tests now run in CI on every PR, not just locally
- Session-video frame mapping extracted to a pure module with dedicated
  unit tests (boundary frames, out-of-order pipes, local↔global round-trip)

# VisionMachine v0.7.2
## Windows MSI installers

Windows x64 installers published on every tagged release. Two variants:

- **Tiny** — no bundled ffmpeg. Pipe generation works out of the box;
  session video compose requires an ffmpeg path in Settings → Tools.
- **Full** — ships a bundled ffmpeg sidecar (~155 MB, Btbn GPL build);
  session compose works out of the box, user path still takes precedence.

Install via `msiexec /i VisionMachine_<ver>_x64_en-US.msi`. Both builds
are unsigned (no code-signing certificate configured yet), so Windows
SmartScreen shows an "unknown publisher" warning on first install.
Click **More info → Run anyway**.

Builds run on GitHub Actions:
- `build.yml` — frontend (vite + svelte-check + vitest) and Rust
  (cargo check + cargo test, both variants) on every push/PR.
- `release.yml` — builds both MSI variants on `v*` tags that are
  reachable from the `production` branch (production-only guard).

# VisionMachine v0.6.0

### Generation flow (pipe-level, engine-ready)
- Generate button in the pipe inspector: modal shows presets + the final
  prompt (read-only scrollable view + copy), produced by the domain prompt
  engine that summarizes the pipe's zones and tag prompts into sections
- Progress modal: real task stages (keyframe/subject images → final video)
  with per-stage progress from the backend task poll; cancel-all aborts
  the whole task; finished video attaches to the pipe and plays in the
  top-panel preview (native <video>); proper empty state until a real
  engine produces files (no mock)
- Reference accessibility check before generation: unreachable URLs are
  red-out and named in the modal; generation never starts broken

### Rulers
- Global frame ruler moved to a tiny overlay strip at the bottom of the
  top-panel Frame preview; disabled by default (opts into a special mode
  in future development)
- Pipe rulers gained a small themed pin notice: frame number + seconds
  (1 decimal) at the playhead position

### Tests & hygiene
- New unit suites: task poller, generation outcomes, generation store
  (artifact attach / ref status / save payload), subject-ref type/prompt
  round-trips, Rust serde legacy defaults (type/prompt/status,
  last_generation)
- Removed dead constants (engineNotConfigured, lastGenPreview)
- Version aligned to 0.6.0 across Cargo.toml / Cargo.lock /
  tauri.conf.json / package.json / APP_VERSION

# VisionMachine v0.5.0

### Stability
- Fixed app-wide "Session not found" crash: composer store now
  self-heals missing sessions (register-on-mutate) instead of throwing;
  session-create fallback and backend-load fallback hydrate the store;
  composer viewport state (active pipe, playhead) resets on session
  switch
### Refactor
- ComposerPanel split into ComposerRows/*, ComposerMenus/*,
  ComposerModals/*, ComposerTimeline/TimelineSection (panel 1960 →
  ~590 lines)
- Drag math extracted to src/lib/dragMath (unit-tested,
  single-clamp body drag)
