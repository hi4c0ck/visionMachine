# VisionMachine v0.7.6

### Video generation
- Agnes Video V2.0 (legacy ID) now runs on the 2.5 wire shape (seconds /
  size / reference media) — the "mode=keyframes requires image as a list
  of at least 2 items" 400 is gone; when a pipe falls below the model's
  media floor the shaper downgrades to text-to-video instead of shipping
  a broken job
- Media-mode lock: the tumbler now shows the EFFECTIVE wire mode the
  engine will ship — a locked kind with no pieces quietly cross-falls to
  the other kind (or text-only) with a one-line note; real defects
  (media caps, empty reference images) still block

### Fixes
- Session rename: Enter saves and unfocuses the editor; renamed sessions
  no longer revert to the old name on re-select
- Footer attribution reads "Horizones Machines" (was glued together)
- A session video composed in a previous run now survives an app
  restart: selection falls back to the generation group's DB record, so
  the preview re-attaches instead of going silent
- "Copy session & run there" in the session generate modal keeps your
  in-flight edits: run-local changes survive the copy and per-pipe
  edits re-map onto the copy's fresh pipe ids
- 503 video-queue-full no longer dead-waits: the poller probes the
  queue on a short retry backoff instead of sitting on a long timeout

### Stability
- Close guard: closing the window while generation is live asks to
  confirm; "keep working" disarms the backend force-close watchdog so it
  no longer kills the running tasks
- Renderer heartbeat: a wedged webview is detected and logged instead of
  a frozen, un-closeable window
- Settings self-heal: a stored model id the catalog no longer knows is
  migrated to the preset's default generable model on load; read-only
  (paid) models are blocked in prechecks and media pieces without a
  source image are flagged before the run starts

### UI
- Session generate modal: wide two-pane layout (scrollable pipe list
  left, run controls right; stacks to one column under 640 px)
- Welcome page: full-width horizontal film-stripe band with the logo
  frame hovering over it
- Group progress modal restyled to the shared modal anatomy

### Tooling
- Dependabot: actions/checkout 4 → 7; npm 11 tree (TypeScript 7, vitest
  5, svelte-plugin 7, jsdom 30); Rust: sqlx 0.9 + 14 dep updates
- svelte-check now runs on the TS7 native compiler (`--tsgo`)
- LF line endings enforced repo-wide via .gitattributes

### Docs
- README provider section links to the Agnes API key (replaces the
  "built-in presets need no key" claim) and gains a Settings → Providers
  motion clip
- License/copyright lines read "@Horizones Machines" (two words) in
  LICENSE, NOTICE, README and CONTRIBUTING

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
