# Handoff — Video-Generation Pipeline Run

Last updated: 2026-09-21 (post-compaction re-investigation, tree verified clean).

## 1. Goal

Harden the Tauri/Svelte video-generation pipeline in `VisionMachine`
(branch `develop`, HEAD `b94eac6`, 4 local commits ahead of `origin/develop`
at `a6c5713` — **not yet pushed**):

1. Polling floor: never poll the provider faster than every 10 s. ✅
2. Long-run 503/429 saturation: warn the user that provider load may be
   broken, and offer a **Reset generation** button (cancel current task,
   replay identical params — models + seed from the last confirm). ✅
3. Stop keyframe/subject images stacking on one output file; give image
   stages a task-scoped output dir (like the existing `<session>/<pipe>/<task>`
   dir) with unique, stable names. ✅
4. Media-mode / subject-mode injection: fix the request shaper so the right
   mode is sent (subject-mode must not silently send `mode: keyframe`); keep
   it agnostic — a future mode tumbler UI will land later. ✅
   (User originally muddled this item; the confirmed ask was: fix the
   injection, don't build the tumbler now.)

Later in the same run, follow-up fixes were requested and are all committed:

- Status dot on keyframe/subject chips: green = asset valid
  (txt2img/img2img settled preview, or valid URL for `url` mode), red =
  broken, neutral = pending; clicking it force-regenerates the piece
  (non-destructive `forceRegen` flag — the settled asset stays valid until
  the fresh one lands; the dot shows a pulsing "queued" ring while flagged).
- Subject count bug (removed subjects still counting) — fixed.
- Eye/visible mechanic: totally broken (no way to unhide, trapped capacity,
  blocked adding subjects). User: obsolete it. Done — `visible` is now a
  parse-only inert field; all refs always render and count.
- "Cancel all" can't quit the app (see **Open bug**, section 5).
- Desktop build unlocked by user ("now we can build desktop").

## 2. Repo / working-tree state (verified 2026-09-21)

```
b94eac6 (HEAD -> develop) fix: obsolete eye/visible mechanic + non-destructive regen-queue flag
4a7ded9 fix: show readiness dot alongside thumbnail + correct subject count
f90636d feat: keyframe/subject status dot with force-regenerate
e8acbb9 feat: per-task image dirs + stable ref ids, cross-fall media mode, poll/download diagnostics, 503 reset, 10s poll floor
b11507f Add generation flow: provider engine, task registry, and generation UI
a6c5713 (origin/develop) ← 4 commits behind origin; working tree CLEAN
```

Everything planned is committed; nothing staged or dirty.
`git diff --stat b11507f..HEAD` = 24 files, +1668/−248.

## 3. What landed and where (map for orientation)

### e8acbb9 — pipeline features
- `src-tauri/src/generation/provider.rs`
  - `POLL_INTERVAL` = **10 s floor** (was 8 s; rationale: tighter cadence
    only burns quota and keeps us off the 429/503 radar).
  - 503 `video_queue_full` backoff ladder 30/60/120 s then hold; `rate-
    limited` status band 0.51–0.53; `saturated_since` stamp on the video
    stage so the UI can time the saturation.
  - **Transport-error hardening for video polling**: log + retry with the
    same backoff (30/60/120 s, fail after 3 consecutive) instead of dying
    the task — this is the fix for the user's observed error
    `"video poll transport: error sending request for url
    (https://apihub.agnes-ai.com/agnesapi?video_id=…)"`.
  - **Diagnostics (request.log)**: image/video downloads and polls now
    write a redacted `request.log` entry with HTTP status + body preview on
    both success and failure — "we had nothing about response logging,
    need to carry them for better diagnostics".
- `src-tauri/src/generation/media.rs`
  - `pipe_media_dirs` returns a third **task-scoped images dir**:
    artifacts write to `<root>/<pipe>/<task>/images/<ref_id>.png` (stable
    ref id via `EngineStage.ref_id` — keyframe/subject ids), so consecutive
    tasks never stack on one file and old images stay cached in the old
    generation folder (user's "old = cached in previous generation folder"
    expectation). `last_image` stacking is gone.
- `src-tauri/src/generation/shaper.rs`
  - **Media-mode cross-fall**: when the flagged kind has no content but the
    other does (and the model supports it), the shaper cross-falls to the
    other media kind instead of silently dropping to text — the fix for
    "mode: keyframe sent even though subjects were set". Request generation
    is now agnostic about the mode toggle; a future UI tumbler can feed it.
  - Subject-mode injection fixed properly per the user's clarification
    (item 4 was misread early in the run; confirmed ask: fix, don't defer).
- `src/components/ComposerModals/GenerationProgressModal.svelte`
  - Saturation warning: after **6 min** (user: "cap of 45 min, above ~6
    min consistent 503 is a bad sign") of the video stage in the 0.51–0.53
    backoff band, show a "provider load looks broken" notice + **Reset
    generation** button.
- `src/components/Workspace.svelte`
  - `resetGeneration()`: cancel the active task, wait for the terminal
    `cancelled` event, then replay `confirmGenerate` with `lastGenerateParams`
    (models + seed captured at the last confirm — **seed comes from the
    settings preset**, per user).
- 91 cargo tests pass at that commit.

### f90636d / 4a7ded9 / b94eac6 — status-dot + cleanup
- `src/lib/refReadiness.ts` — pure `refDotState(pipeId, refId, ref, brokenRefs)`
  → `ready | broken | pending` (green / red / neutral). Unit-tested
  (`tests/unit/refReadiness.test.ts`).
- `src/components/ComposerRows/{KeyframesRow,SubjectRefsRow}.svelte`
  - The dot is a persistent status **badge overlaid on the media box corner**
    (earlier version only rendered when no thumbnail resolved — that's why
    "dot updates weren't visible at build"; fixed in 4a7ded9).
  - Click → `onRegenerate(refId)` → `queueRefRegen` store action.
  - Subject add-button count keyed off total refs (post eye-mechanic
    obsolescence) — removing a subject frees the slot.
- `src/lib/composerStore/generation.ts`
  - `queueRefRegen`: sets `ref.forceRegen = true` (non-destructive — the
    settled `previewRemoteUrl`/`previewLocalPath` stay, asset stays valid,
    the registry's Ready-skip is just overridden on the next run).
  - `attachGeneratedImage`: clears `forceRegen` when the fresh artifact
    lands → dot's "queued" ring disappears, state affects the next run.
  - **This directly answers the user's bug report**: "when I click the
    green dot to regenerate I can't switch it back to valid, we should
    trigger state which will affect the generation run, don't clear ref
    data" → the old destructive `clearRefPreview` was replaced by the
    `forceRegen` flag.
- `b94eac6` — eye/visible obsolescence:
  - Eye toggle removed from `SubjectRefsRow`; chips always render; count =
    total refs (no hidden-state capacity trap → "I can't add subject
    because of it" fixed).
  - `visible` stays a **parse-only inert field** on `SubjectReference`
    (frontend `src/types/app.ts` + Rust `src-tauri/src/models/composer.rs`),
    explicitly documented "kept only so legacy data still parses. Do not
    re-use."
  - Generation paths (`registry.rs` `build_stages`/pre-seed, prechecks,
    `refCheck.ts`, generation log) no longer exempt `visible=false` refs.
  - `force_regen` round-trips through composer JSON + Rust models.
  - Updated: `tests/unit/prechecks.test.ts`, `tests/unit/refReadiness.test.ts`.

## 4. Locked decisions & user answers from the run (don't re-litigate)

- **Polling**: always ≥ 10 s; "simple improvement if confident" only — no
  stage machinery.
- **Saturation**: 45-min hard cap; ~6 min of consistent 503 → warn. Stop
  polling / stop the task is the correct way to reset. Seed comes from the
  settings preset.
- **Image dirs**: task-scoped, simple; keep actual images in the
  `../images`-style folder is fine, but keyframe/subject names must be
  unique/different. Old artifacts = stay cached in the previous generation's
  folder (no migration needed for on-disk old data).
- **Mode injection**: fix it properly (agnostic request building, no tumbler
  UI now). Future tumbler = later task.
- **Dot**: green/red by asset validity (URL check for `url` mode), click =
  force regenerate, non-destructive state.
- **Eye mechanic**: obsolete — remove restrictions, keep field inert.
- Tasks can run in parallel later → keep `MAX_CONCURRENT_TASKS`-style
  registry generic (currently `MAX_CONCURRENT_TASKS = 1`).

## 5. "Cancel all" can't quit the app — FIXED (uncommitted)

Symptom (user): clicking **Cancel all** (progress-modal footer) or the
close-guard **"Cancel task & close"** produces an error, and neither the
modal nor the app closes.

Root cause map (verified in current tree):

1. `src-tauri/src/lib.rs` `on_window_event` — close guard: on
   `CloseRequested` with `active_task_count() > 0` → emit `close-blocked`
   + `api.prevent_close()`.
2. `src/components/Workspace.svelte`:
   - `closeAnyway()` (L171): cancels **only `activeTaskId`** via
     `cancel_generation`, then **immediately** re-issues
     `getCurrentWindow().close()`.
   - The cancel is cooperative (flag in `registry.rs::cancel`, engine
     notices between poll ticks — up to `POLL_INTERVAL`=10 s, or up to
     120 s while sitting on the 503 backoff hold), so at the moment the
     re-close lands the task is still non-terminal → guard fires again →
     `close-blocked` listener re-opens the modal, even though
     `closeAnyway` first set `closeBlocked = false`. Race + re-trigger.
   - `cancelActiveTask()` (L1242, the modal's "Cancel all") errors out when
     the task is already terminal or the invoke fails → toast, no close.

Fix (implemented, uncommitted — commit pending user OK):

- `registry.rs`: `cancel` — unknown/terminal/evicted tasks are now no-op
  instead of `Err("Task not found")` (terminal/evicted tasks shouldn't error
  the caller). New `cancel_all()` sets the flag on every non-terminal task,
  returns the count actually cancelled.
- `commands/generation.rs`: new thin command `cancel_all_generation()`
  (no input — the close guard has no task ids, just a count); registered in
  `lib.rs` alongside the existing commands.
- `Workspace.svelte`:
  - `closeAnyway`: calls `cancel_all_generation`, then polls
    `generation_active_task_count` (250 ms cadence, 30 s deadline) until 0
    before re-issuing the window close. A `closeCancelling` state keeps the
    guard modal open in a "Cancelling generation…" state (buttons disabled)
    during the wait — no more error + vanished modal.
  - `close-blocked` listener ignores re-triggers while `closeCancelling`
    (the re-close lands after the active count is already 0, so no re-block
    in the normal path; if the engine is mid-503-hold and the deadline
    expires first, the next close attempt re-blocks with the modal still
    visible showing the in-progress state).
  - `keepWorking` is a no-op while `closeCancelling` so the user can't
    dismiss mid-cancel.
- `cancelActiveTask` (the progress modal's "Cancel all") needed no change:
  the backend tolerance fix above already stops the error-toast path —
  cancelling an evicted/terminal task is now silent, and the poller's next
  tick delivers the terminal `cancelled` state so the modal's OK footer
  unlocks as designed (D6).

## 6. Next steps (concrete)

1. ~~Fix the cancel-all / quit bug~~ — done (see §5); **commit it**:
   `fix: cancel-all can now quit the app (cancel_all_generation + terminal-wait close-anyway)`,
   touching `registry.rs`, `commands/generation.rs`, `lib.rs`, `Workspace.svelte`,
   + the registry cancel tests below.
2. Verify: cargo tests (`cd src-tauri && cargo test` — includes the new
   cancel-all + tolerant-cancel unit tests), `npx vitest run`, then a
   desktop smoke test: start a video generation → "Cancel task & close" →
   modal shows "Cancelling…" → app quits cleanly once the engine notices.
3. Push: 5 commits ahead of `origin/develop` after the commit; user has not
   asked to push yet.
4. Backlog (explicitly deferred): mode-tumbler UI for media/subject modes;
   `MAX_CONCURRENT_TASKS > 1` parallelism; package-level 2img generation
   history (user said "keep it simple — that's just a minor improvement",
   task-scoped dirs already cover the stacking problem).

## 7. Pitfalls

- **`visible` is a trap**: it's inert on purpose (legacy parse only). If
  someone re-adds eye UI or generation exemptions off it, re-breaks the
  "can't add subject / trapped capacity" bug. Type comments say "Do not
  re-use."
- `forceRegen` semantics: queued ≠ invalid. The dot keeps its readiness
  color; only a pulsing ring + tooltip mark the queue. Don't "fix" the dot
  to red while queued.
- The close guard and cancel are **cooperative, not pre-emptive**: the
  engine only observes `cancel` between provider polls — up to 10 s normal,
  up to 120 s on the 503 hold. Any "close the app right after cancel"
  logic must tolerate that window (await terminal, don't race it).
- `request.log` path is precomputed at `start_generation` via
  `pipe_media_dirs` (same helper the engine uses) — keep that alignment
  if the on-disk layout changes; the modal expander depends on it matching
  exactly (`<root>/<pipe>/<task>/request.log`).
- `SubjectReference.visible` + `force_regen` are serde-mapped between
  camelCase JSON (frontend) and snake_case Rust (`composer.rs`);
  round-trip tests exist in both languages — extend both when adding fields.
- The modal is deliberately **unclosable by X/backdrop/Esc** (D6): any
  "user can't close the modal" report should be diagnosed against that
  intent first — the only exits are the footer button (Cancel all while
  active, OK on terminal) and Minimize.
- `MAX_CONCURRENT_TASKS = 1`: `start_generation` rejects with
  "Generation already in progress" — reset/replay relies on the slot
  freeing after terminal `cancelled`, which is why `resetGeneration`
  polls every 250 ms for the terminal.
- **Unpushed local commits** (4 ahead of origin/develop): `e8acbb9`,
  `f90636d`, `4a7ded9`, `b94eac6`. Don't lose them; don't push without
  asking.
- Windows host / Tauri build: build-state dir and `dist/` are present;
  desktop builds are now allowed by the user, but long `tauri build` runs
  need `timeout_ms` or background running — don't run them as one-liners
  that hang the session.

## 8. Key file map

| Area | Files |
|---|---|
| Registry / cancel / tasks | `src-tauri/src/generation/registry.rs` |
| Provider engine (poll, 503, transport retry, request.log) | `src-tauri/src/generation/provider.rs` |
| Shaper (media-mode / cross-fall / injection) | `src-tauri/src/generation/shaper.rs` |
| Per-task image dirs | `src-tauri/src/generation/media.rs` |
| Commands (start/get/cancel/active-count/read_media_file) | `src-tauri/src/commands/generation.rs` |
| Close guard | `src-tauri/src/lib.rs` (`on_window_event`) |
| Composer Rust model (visible/force_regen round-trip) | `src-tauri/src/models/composer.rs` |
| Progress modal (saturation warning + Reset) | `src/components/ComposerModals/GenerationProgressModal.svelte` |
| Close-guard modal + resetGeneration/closeAnyway | `src/components/Workspace.svelte` |
| Dot logic (pure) | `src/lib/refReadiness.ts` (+ `tests/unit/refReadiness.test.ts`) |
| queueRefRegen / attachGeneratedImage / forceRegen | `src/lib/composerStore/generation.ts`, `composerStore/index.ts` |
| Chip UI (dot badge, counts, add button) | `src/components/ComposerRows/{KeyframesRow,SubjectRefsRow}.svelte` |
| Prechecks (media caps, url check) | `src/lib/settings/prechecks.ts` (+ `tests/unit/prechecks.test.ts`) |
| Types (GenerationTaskView/StageView, forceRegen, saturatedSince) | `src/types/app.ts` |
