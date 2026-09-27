# VisionMachine Roadmap

Living roadmap. Items marked **[x]** are shipped and verified in code (status
re-checked 2026-09-27 against `production` @ v0.7.4). Open items are small and
shippable — each links to the doc/component that owns the detail. Anything
"parked" is a known improvement we deferred on purpose, not forgotten.

---

## ✅ Shipped (verified in code)

- **Session-level "generate all"** — `SessionGenerateModal` + `CompactPipesProgress`
      group runner + auto-compose. Shipped v0.7.3. `docs/session-generation-plan.md`
      (P0–P1 backend done; P2–P4 frontend wiring + validation is the remaining
      polish, tracked under "Session generation modal quality" below).
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

---

## Release pipeline (GitHub Actions → GitHub Release)

The tag-pushed release flow works end-to-end (`v0.7.4` proves it):
guard → Windows MSI (tiny + full) → Linux AppImage (full) → single published
release. Follow-ups:

- [ ] **Rename release assets to `VisionMachine_tiny` / `VisionMachine_full` /
      `VisionMachine_full.AppImage`** (drop the platform extension, keep the
      variant). Parked — no rebuild now; lands with the next tag. Touches the
      capture + publish steps in `.github/workflows/release.yml` and the
      release-notes body.
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

- [ ] **Point the default branch at `production`**
      (Settings → Branches → Default branch → `production`). This is the
      actual unblocker: it makes GitHub see the license, `CONTRIBUTING.md`,
      `CODE_OF_CONDUCT.md`, and the `CODEOWNERS`/`dependabot`/issue+PR
      templates already on `production`. `main` can stay as a stale reference
      or be deleted once the switch is confirmed.
- [ ] **Make `LICENSE` the verbatim canonical GPL-3.0 text** so the detector
      tags it `GPL-3.0` (choosealicense fuzzy-matches the *whole* file; the
      custom preamble + appended `VISIONMACHINE ATTRIBUTION ADDENDUM` break the
      match). Move the addendum fully into `NOTICE.md` (the standards-
      compliant home for copyright + extra conditions; the §4/§14 legal effect
      is unchanged). The "others" the community page still lists as absent:
      a `FUNDING.yml` (optional), repo **topics**, and `CONTRIBUTING`/
      `CODE_OF_CONDUCT` *on the default branch*.

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

### Session generation modal — quality pass

The group runner works; what's left is UX polish + the P2–P4 wiring from
`docs/session-generation-plan.md`:

- [ ] `startWatchingGroup` auto-advance on `pipe-terminal` (per-pipe
      `reconcileTerminal` unchanged), terminal footer, cancel-all → group
      cancel, `focus-generate` disabled during a group (S12).
- [ ] Compact-pipes group progress rows expand into the per-pipe stage list
      (current `GenerationProgressModal` body, verbatim, per pipe).
- [ ] Vitest: group auto-advance, cancel-all, stale-row UI, policy control.

### Paid models support

Today paid models are **read-only** (visible in Settings, parameters shown, but
can't be confirmed for generation — the `readOnly` gate in `Workspace` /
`ProviderCard` / `GenerateModal`). The actual billing story is open:

- [ ] **Pick a paid-model billing model** (credit / subscription / pay-per-
      generation) and define the entitlement surface.
- [ ] Wire an **entitlement / quota check** into the generation start path so a
      paid model becomes generable once the user has access.
- [ ] Surface **quota / credit state** in the provider chip + Settings.
- [ ] Backend: persist entitlement + meter usage per generation run.

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
- [ ] Pipe-level settings (length / fps / Q / C / resolution) that diverge from
      the session default should be visually flagged.

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
`docs/agnes-model-catalog.md`). What's open:

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
- [ ] **`fresh-reef` branch** — unmerged; contains the prompt-engine XML rewrite
      + fps-inherited seconds math. Decide whether it's the next product line or
      to be rebased/discarded.
- [ ] **cargo + ffmpeg cache warm on CI** — both already cached; confirm the
      cache-hit path holds across the double-build consolidation above.

---

## How to ship a version (checklist)

1. Bump `version` in `src-tauri/tauri.conf.json` (the single source of truth).
2. `npm run sync:meta` (or let `beforeBuildCommand` run it) to align
   `package.json`, `Cargo.toml`, `Cargo.lock`, and `src/constants.ts`.
3. Commit on `production`, push.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` — the guard only builds tags
   reachable from `production`.
5. Watch the `Release (build on tag)` run; the release page gets
   `VisionMachine_tiny` / `VisionMachine_full` / `VisionMachine_full.AppImage`
   (once the asset-rename task above lands) plus the release-notes body.

> The release-notes text lives in the `publish-release` step of
> `.github/workflows/release.yml` — edit it there and future tags inherit it.
