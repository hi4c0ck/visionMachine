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
