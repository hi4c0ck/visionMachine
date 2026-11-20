# VisionMachine Roadmap

Living roadmap. Items marked **[x]** are shipped and verified in code (status
re-checked 2026-11-20 against `feat/bug-batch-nov19` @ v0.7.11 release prep,
pushed to origin). Open items are small and shippable — each links to the
doc/component that owns the detail. Anything "parked" is a known improvement
we deferred on purpose, not forgotten.

---

## ✅ Shipped (verified in code)

- **Session-level "generate all"** — `SessionGenerateModal` + `CompactPipesProgress`
      group runner + auto-compose. Shipped v0.7.3. `docs/session-generation-plan.md`.
- **Session video compose** — "Compose session video" button + auto-compose +
      frame-carousel spliced-frame mapping. Shipped v0.7.3.
      `docs/plan-session-video-and-carousel.md`.
- **Provider engine** — image/video HTTP stages, media tree + secret redaction,
      reference-accessibility pre-check, artifact retry/atomic-rename.
      `docs/provider-engine-tasks.md` (Phases A–E).
- **Agnes model catalog + settings** — catalog, seed, settings store/modal UI,
      per-run model override, keyless-provider red-dot.
      `docs/agnes-model-catalog.md`, `docs/settings-provider-tasks.md`.
- **Keyframe / subject thumbnails** — generated-preview thumbnails with
      readiness dots + force-regenerate. `KeyframesRow` / `SubjectRefsRow`.
- **Folder / media structure (tier 1)** — the E3 per-session/pipe media tree +
      secret redaction (`src-tauri/src/generation/media.rs` `session_media_root`
      + per-pipe layout) is shipped. **This is only tier 1.** The "folder
      structure masterpiece" (profile-level roots, better session/project
      organization, user-visible browsing/management of the on-disk tree) is a
      separate larger task — see the dedicated section below.
- **Two-variant ship** — `tiny` (no ffmpeg) / `full` (bundled ffmpeg sidecar)
      MSI + AppImage. `release-notes.md` v0.7.2–v0.7.4.

### v0.7.11 batch (in release prep — awaiting owner sign-off)

- **Director mode — film-set identity** — idea → novel → film structure →
      step chain; slate take line, tally lamps, script-page scene cards,
      Extract cue sheet; re-run from any step (RETAKE, upstream locked);
      regenerate pipes from the plan (replace / append, per-step replay).
      `docs/manuals/director-mode.md`.
- **Director persistence, end to end** — every take persists as
      `flow.v{N}.json` under the session; restart restores the newest readable
      take (the seed effect's self-cancelling latch is fixed — the restore
      loop now actually loads); take identity stamped on save and re-stamped
      on load so the TAKE line shows the file's real number.
- **Context-driven pacing** — shot density reads the idea: narrative ideas
      breathe, action ideas cut fast; mood steers look, not tempo.
- **Session progress redesign** — pinned "now" strip (active pipe + stage +
      elapsed), single-expand accordion with lazy stage fetch, overall band
      with phase chip, compose outcome band. `docs/manuals/session-generation.md`.
- **Compose selection + junction trim** — pick which pipes to join; per-
      junction signed overlap map (trim/extend) keyed by pipe id, persisted
      with the session; preview a subset without generating the rest.
- **Q/C abolition** — Quality/Creativity controls removed from every UI
      surface (the provider ignores them on almost every route); the data
      model stays — stored defaults still flow silently on img2img.
- **Composer-aligned folder tabs** — Pipes / Director / Extract stay on the
      meta strip, aligned to the composer's left/right edges; active tab
      raised, inactive recessed.
- **Dev-only diagnostics** — Scoreboard tab, RAM/stall pill, and the
      localhost monitor dashboard are DEV-gated; release builds bind no
      diagnostic port (support opt-in: `VM_DASHBOARD=1`).
- **Manuals** — Director mode + session generation/progress guides, English,
      illustrated with live app screenshots; README carries the Director
      value proposition + manual links.

---

## v0.7.11 — release prep status

Prep complete on `feat/bug-batch-nov19` (pushed): version bump, release
notes, manuals, debug audit, diagnostics gating. Remaining gate: **owner
test sign-off**, then merge → `develop` → `production`, tag `v0.7.11`,
push, verify CI + release assets.

Carried items verified against the current code:

- [x] **Remove legacy Agnes Video V2.0** — DONE 2026-11-11 (P1-7): the retired
      `agnes-video-v2.0` catalog entry, the dead `video-job-frames` fps-native
      engine branch + its prechecks block, and the TS `video-job-frames`
      request format are gone; the 2.5-series is the only video engine. Saved
      settings naming the retired id self-heal on load.
- [x] **Per-model video size selection** — SHIPPED: the session resolution
      dropdown offers only the tiers the active model declares
      (`availableResolutionsForModel`), ratios are orientation-filtered, and
      `effectiveVideoAspect` mirrors the Rust shaper.
- [x] **Remove frames from keyframe / subject modals** — verified 2026-11-20:
      no frame-position input remains in `KeyframeModal` / `SubjectRefModal`;
      frame position stays owned by the composer (the remaining frame math
      is the slot-1 "use last frame" action, which is composer-owned).
- [x] **Session generation modal quality pass** — superseded by the v0.7.11
      progress redesign: pinned now-strip tracks the active pipe on terminal
      advance, the accordion expands one pipe's stage list at a time (lazy
      fetch), cancel-all stops the group, and the compact-pipes/group logic
      is pinned by vitest (`compactPipes.test.ts` et al. in the 712-test suite).

### Module-size debt (P3, track-don't-block)
Large single-file modules a future refactor should split (no correctness
issue today; all gates stay green): `provider.rs`, `commands/generation.rs`,
`generation/group.rs`, `generation/compose.rs`, `commands/director.rs`
(sizes as of v0.7.4 — re-measure when splitting). Split by concern when one
of these files next gets a behavior change.

---

## Next target (v0.7.12) — owner decision 2026-11-20

**Lead: paid models + local models.** Two workstreams, one theme — widen
what can generate beyond the free Agnes tier.

### Paid models support (lead)

Today paid models are **read-only** (visible in Settings, parameters shown, but
can't be confirmed for generation — the `readOnly` gate in `Workspace` /
`ProviderCard` / `GenerateModal`). The billing story is open:

- [ ] **Pick a paid-model billing model** (credit / subscription / pay-per-
      generation) and define the entitlement surface.
- [ ] Wire an **entitlement / quota check** into the generation start path so a
      paid model becomes generable once the user has access.
- [ ] Surface **quota / credit state** in the provider chip + Settings.
- [ ] Backend: persist entitlement + meter usage per generation run.

### Local models support (new)

Run generation against the user's own hardware — no API key, no per-frame
fees, private by construction. Scope to shape:

- [ ] **Local provider abstraction** — OpenAI-compatible local endpoints
      (llama.cpp server / LM Studio / Ollama class) for text; decide the
      local image/video path (ComfyUI-class workflow server vs. deferred).
- [ ] **Catalog + capabilities** — local model entries with honest limits
      (context, resolutions, speed class); hardware-aware expectations in
      the UI (a local 7B is not a cloud video engine).
- [ ] **Settings UX** — endpoint URL + health probe, keyless flow, clear
      offline/error states distinct from provider outages.
- [ ] **Generation semantics** — local jobs may be synchronous or
      queue-polled; the task registry + progress view must handle both
      without faking cloud-style job ids.

### Backlog (carried, not leading)

- [ ] **Tools panel view pass** — redesign the right-panel inspector so the
      session → pipe → segment → tag context reads clearly: a header showing
      which entity the settings/inspector currently edits, no silent
      cross-level writes (explicit "apply to pipe" / "apply to session"),
      and a visual flag on pipe-level values that diverge from the session
      default. (Carried from v0.7.8/v0.7.9 targets.)

---

## Release pipeline (GitHub Actions → GitHub Release)

The tag-pushed release flow works end-to-end (`v0.7.4` proves it):
guard → Windows MSI (tiny + full) → Linux AppImage (full) → single published
release. Follow-ups:

- [ ] **Rename release assets to `VisionMachine_tiny` / `VisionMachine_full` /
      `VisionMachine_full.AppImage`** (drop the platform extension, keep the
      variant). Parked — lands with a future tag. Touches the capture +
      publish steps in `.github/workflows/release.yml` and the release-notes
      body. (Verified 2026-11-20: not yet in the workflow.)
- [ ] **Code-sign the Windows MSIs.** No cert configured; SmartScreen shows an
      "unknown publisher" warning today (noted in the release body). Add a
      signing step + secret once a cert is available.
- [ ] **Wire a macOS installer.** Btbn publishes no darwin ffmpeg asset, so the
      `macos-arm64` row in `build.yml` is commented out; Linux/Windows are the
      only published platforms. See the 3-step re-enable note block in
      `.github/workflows/build.yml`.
- [ ] **Stop the `build.yml` tag-run from double-building installers.** CI's
      `release` job still builds the same installers on tag push as compile
      gates; now that `release.yml` owns publishing, that's redundant. Gate the
      CI `release` job out of the tag trigger to cut tag-push build cost.
- [ ] **AppArmor guidance on Linux.** The AppImage is unsigned by design;
      distros with AppArmor policies may block first launch. Document the
      allow step or ship a signed/patched AppImage.

---

## Distribution / packaging

- [ ] **Auto-update channel.** No updater wired yet. Once a signing cert
      exists, add `tauri-plugin-updater` + a release-update manifest so full-
      variant users can pick up patches without a manual re-download.
- [ ] **Per-platform install layout doc.** Document expected on-disk locations
      (and where generated frames / composed videos land) for support — the
      media-tree root resolution is in `media.rs` `session_media_root`.

---

## Repo / community profile

GitHub's community page reports **no license + missing profile files** even
though `LICENSE`/`NOTICE.md`/`CONTRIBUTING.md`/`CODE_OF_CONDUCT.md` are
committed. Root cause: **the repo's default branch is `main`, a stale
ancestor of `production`**. GitHub reads the community profile (license
badge, contributing, CoC, CODEOWNERS/dependabot/issue+PR templates) from the
*default branch only*, and `main` predates the GPL-3.0 `LICENSE` and the
`.github` config that landed on `production`. So the detector sees none of it.

Two distinct fixes (do both):

- [x] **Default branch: keep `main` (decision 2026-10-26 — do not switch
      to `production`)**. `main` stays the repo default branch. Trade-off
      accepted: GitHub's community page reads the profile (license badge,
      `CONTRIBUTING`/`CODE_OF_CONDUCT`, issue+PR templates, `CODEOWNERS`/
      dependabot config) from the *default branch* only, so it will keep
      showing "no license / missing files" — the license itself lives in the
      repo (`LICENSE` = verbatim GPL-3.0 + `NOTICE.md`) and on every GitHub
      Release. Re-open this item only if the community-page badge ever
      becomes a requirement.
- [x] **Make `LICENSE` the verbatim canonical GPL-3.0 text** (shipped
      v0.7.10): the file is now a byte-exact copy of the GNU distributed
      `gpl-3.0.txt` (verified against two independent mirrors), no custom
      preamble, complete tail. The copyright + the full `VISIONMACHINE
      ATTRIBUTION ADDENDUM` live in `NOTICE.md` (the standards-compliant home
      for copyright + extra conditions; the §4/§14 legal effect is
      unchanged), and `NOTICE.md`'s stale "addendum is in LICENSE" reference
      was fixed.

---

## Folder structure masterpiece (bigger, separate task)

Tier 1 (the media tree) is done. The rest is a dedicated workstream:

- [ ] **Profile-level roots** — a stable per-profile on-disk root so multiple
      accounts don't collide under one app-data dir.
- [ ] **Better session organization** — a project → session → pipe tree the
      user can actually browse/rename/relocate, not just an implicit E3 layout.
- [ ] **User-visible media management** — in-app view of where frames / composed
      videos / sidecars land, with open-in-explorer + cleanup/prune actions.
- [ ] **Document the layout** for support (pairs with the "Per-platform install
      layout doc" item above).

---

## Product

### UI — top panel (design, resizing, more functions)

`Frame.svelte` is a static preview surface with no resize logic:

- [ ] **Top-panel resize** — let the frame/preview region be resized (drag
      handle or a fixed set of sizes), persist the chosen size per session.
- [ ] **More functions** — add the playback controls that the carousel +
      preview need (play/pause, frame step, loop, speed) beyond the current
      frame-carousel sweep.
- [ ] Design pass: confirm the layout hierarchy (preview vs. carousel vs.
      composed session video) reads well and the "Open in preview" restore path
      is discoverable.

### Right panel — better session/pipe divergence

`ToolsPanel` is a context-sensitive inspector (project → session → pipe →
segment → tag) but the session-vs-pipe divergence UX isn't designed yet:

- [ ] Make the **session-level vs. pipe-level** context explicit in the panel
      header (which entity the settings/inspector currently edit).
- [ ] Avoid the inspector silently writing session-level values when a pipe is
      focused (and vice-versa) — add a clear "apply to pipe" / "apply to
      session" affordance.
- [ ] Pipe-level settings (length / fps / resolution) that diverge from the
      session default should be visually flagged. (Q/C no longer exists as
      UI — abolished in v0.7.11.)

### Resolution / size selection

Session-level 480p/720p/1080p exists in `ToolsPanel`, but `resolutionPresets.ts`
is a **placeholder** pending provider-sourced sizes:

- [ ] Source the **sizes each provider actually supports** from the provider
      API / catalog and surface them (replace the hard-coded 480/720/1080p
      options with per-model limits, e.g. the `1K/2K/3K/4K` sets in
      `catalog.ts`).
- [ ] Orientation-driven default already maps to a resolution
      (`resolutionPresets.ts`); keep it, but make it respect the provider's
      supported set.
- [ ] Validate the chosen resolution against the active model's `limits`
      (already partially in `prechecks.ts`).

### Keyframes / subjects — preview

Thumbnails + readiness dots + regenerate are shipped. Open polish:

- [ ] **Live preview of the generated frame** at the keyframe/subject position
      in the top-panel frame (not just the chip thumbnail) — "where does this
      keyframe land on the timeline" scrubbing.
- [ ] Batch-preview / hover-zoom on the chip thumbnails.

### Save the selected mode (keyframes / subjects / text) + dynamic UI

A **`pipe.mediaMode`** already exists and persists (Rust `media_mode` with a
`'keyframes'` default, carried in the composer JSON blob; the UI toggles
keyframes⇄reference for models whose `media.modes` is exclusive, Q7 in
`docs/agnes-model-catalog.md`; the mode-switch stickiness fix shipped in
v0.7.11). What's open:

- [ ] **Add a `text` mode** to the media-mode enum (models that take neither
      keyframes nor reference subjects — prompt-only). Extend `media.modes` /
      the toggle in `ComposerPanel.mediaState` + the Rust `Pipe` serde default.
- [ ] **Dynamic row visibility** for all three modes: the composer should show
      the keyframes row, the subjects row, or neither (text) driven by
      `effMode`, not just the two-mode `showKf`/`showSubjects` pair today.
- [ ] **Round-trip guarantee**: saving with a mode the active model doesn't
      support (e.g. switching to a shared-array model) currently silently
      coerces back to `keyframes` (`validators.ts` L171) — surface that
      coercion to the user (toast / badge) instead of losing the stored mode.

### Provider catalog / model list

- [ ] Surface the full Agnes model catalog in the provider picker with the
      paid/free + per-model `limits` (resolutions, seconds, tags) already in
      `catalog.ts`.

### Known limitations to close (from the v0.3.0 doc, still open)

- [ ] **Multi-user isolation** — profiles exist but cross-user isolation is
      untested.
- [ ] **Mobile / responsive** — timeline UI is desktop-first; responsive pass
      needed.
- [ ] **Real-time collaboration** — no multi-editor sync yet.
- [ ] **Playwright E2E gate** — wire the browser E2E into CI as a gate.

---

## Build / tooling

- [ ] **Larger runners.** `--light` keeps release builds inside GitHub's
      default-runner RAM; once we move to larger self-hosted runners, drop
      `--light` to restore full LTO / codegen units.
- [x] **`fresh-reef` branch — RESOLVED 2026-11-20, deleted.** Verified
      obsolete: its prompt-engine XML rewrite + fps-inherited seconds math
      already landed on `develop` as `10d372d` (rebased equivalent of
      `39c476f`); `tests/unit/promptEngine.test.ts` is byte-identical, and
      develop's `promptEngine.ts` is one cast-fix ahead. Its settings
      additions are superseded (Q/C abolished). Local branch deleted with
      owner approval; it never existed on origin.
- [ ] **cargo + ffmpeg cache warm on CI** — both already cached; confirm the
      cache-hit path holds across the double-build consolidation above.

---

## How to ship a version (checklist)

1. Bump `version` in `package.json` (**the single source of truth** — the
   release-version-rules skill owns this; never hand-edit the derived files).
2. `npm run sync:meta` (or let `beforeBuildCommand` run it) to align
   `src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, and
   `src/constants.ts` FROM `package.json`.
3. Commit on `production`, push.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` — the guard only builds tags
   reachable from `production`.
5. Watch the `Release (build on tag)` run; the release page gets
   `VisionMachine_tiny` / `VisionMachine_full` / `VisionMachine_full.AppImage`
   (once the asset-rename task above lands) plus the release-notes body.

> The release-notes text lives in the `publish-release` step of
> `.github/workflows/release.yml` — edit it there and future tags inherit it.
