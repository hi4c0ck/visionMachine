# Generation Flow — Task Plan (pipe-level, provider-engine-ready)

Working task file. Phases in order; checkboxes = done state. Branch: `generation-flow` off `develop`.
NO code in this doc — it is the checklist for implementation.

## Locked decisions (from discussion — do not re-litigate)

- D1. **No mock engine.** The generation engine is a future provider/LLM-selection system.
  This task builds the architecture (trait + slot + registry + tasks) with the slot UNCONFIGURED:
  engine-dependent stages fail fast with a real error state; `url`-type items are `ready`.
  No simulated progress, no fake output.
- D2. **Prompt = one string.** `promptEngine` returns a single string (shaped-script content:
  `<heuristics>` block + per-tag `<..>` sections). It is passed as `{ prompt: "..." }` in the
  generation request. UI view = plain read-only text box (mid size, scroll, expand toggle, copy).
- D3. **Pipe generation is the concrete case.** Session-level "generate all" is a FUTURE task;
  session buttons get an "on the roadmap" toast so they don't look broken.
- D4. **Subjects follow keyframe preset rules:** `url` → imageUrl (ready),
  `txt2img` → prompt, `img2img` → imageUrl as reference + prompt. `url` items listed as `ready` in progress.
- D5. **Fail-fast accessibility:** on Confirm, check every remote URL referenced by the pipe
  (keyframe `imageSrc`/`referenceUrl`, subject `imageUrl` reference). Any unreachable →
  NO task created, red toast naming the URL, modal stays open, and the offending
  keyframe/subject CHIP is red-out on the timeline (persist until re-validated).
  Mid-run, losing access to a reference aborts the whole task immediately.
- D6. **Progress modal: no X button.** Esc/backdrop while running → toast "Task not finished",
  stays open. Close allowed only in terminal states. "Cancel all" stops everything + closes.
- D7. **Sequential now, parallel later:** registry is generic; `MAX_CONCURRENT` option in code
  (default 1 → second start rejected).
- D8. **Modal is read-only** (presets: session fps/res/orientation + pipe Q/C — display only).
- D9. **Video preview/ffmpeg deferred:** top panel gets native `<video>` + play button;
  "casual preview" in tool panel = muted-looping `<video>` thumb. No ffmpeg, no poster
  extraction. With no engine, there is no video file → proper empty states everywhere.

## Re-inspected code facts (grounding, 2026-09-14)

- `Workspace.handleGenerate` (Workspace.svelte:733) = console.log stub; ToolsPanel has 2 session-level
  Generate buttons (`btn-generate` L132, `focus-generate` L259). Pipe inspector (ToolsPanel L266)
  already has the "No last-gen preview" placeholder.
- `KeyframesRow` chips: `.kf-chip.kf-filled` / `.kf-empty` (img + `k{n}` label + ×); used in both
  uiVariant A and FIXED aux panel (headerless). `SubjectRefsRow` chips: `.sr-chip` (eye, img/dot,
  range, ×, `+ sN` add). No broken-state classes yet.
- `SubjectRefModal` today: imageUrl + useFrames + range only; Confirm disabled on empty imageUrl.
  `KeyframeModal` pattern to mirror: `mode-selector` (URL/Txt2Img/Img2Img), conditional fields,
  derived `kfValid`.
- `composerStore/index.ts saveSession` (L412) **whitelists fields**: keyframes = whole object
  (status persists free), subjectReferences = {id,imageUrl,useFrames,frameStart,frameEnd,visible}
  → NEW subject fields + pipe `lastGeneration` MUST be added to the whitelist to persist.
- MAX_KEYFRAMES=3, MAX_SUBJECT_REFS=5 (ComposerPanel L64-65).
- Rust: `models/composer.rs` `Pipe`/`SubjectReference` = camelCase serde, no lastGeneration.
  `viewmodel.rs` reserved state machine (GenerationTask/TaskStatus/PipeStatus/generation_queue) —
  marked "do NOT delete without re-architecting"; keep as-is, build alongside in `generation/`.
- DB: legacy `generation_tasks` (0002) has FK→prompt_nodes, unusable. `generated_frames` is live
  (accounts stats). Migrations run 0001,0002,0004 (0003 not executed). `db.rs migrate()` +
  `run_additive_columns` are the append points.
- No Tauri events on frontend (invoke/poll pattern, `isTauri()` guards). Capabilities: core+log
  only — no asset protocol/fs plugin. `flashToast` = error|info only.
- Tests: vitest in `tests/unit/*.test.ts` (mock `@tauri-apps/api/core`, `createMockSession`
  helper pattern, e.g. subjectRefs.test.ts); 276 passing; playwright 50 (browser, E2E-safe since
  generate UI is Tauri-guarded); cargo tests in `src-tauri/src/...`.

---

## Phase 0 — Data model + persistence

- [ ] `src/types/app.ts`
  - [ ] `SubjectReference`: add `type?: KeyframeType` (default `'url'`), `prompt?: string`, `status?: GenerationStatus`.
  - [ ] `PipeRow`: add `lastGeneration?: { taskId: string; videoPath: string; generatedAt: number; status: 'done'|'error'|'cancelled' } | null`.
  - [ ] `GenerationTaskView` / `GenerationStageView` (id, label, kind: 'image'|'video', sourceKind: 'keyframe'|'subject'|'video', sourceId, status: 'ready'|'pending'|'generating'|'done'|'error'|'cancelled', progress: number, error?: string, imageOutput?: string).
- [ ] `src-tauri/src/models/composer.rs`
  - [ ] `SubjectReference`: mirror fields with `#[serde(default, skip_serializing_if = "Option::is_none")]` (old blobs keep parsing).
  - [ ] `Pipe`: add `last_generation: Option<LastGeneration>` (new tiny struct) with same defaults.
- [ ] `src/lib/composerStore/index.ts saveSession` (L429-436)
  - [ ] extend subjectReferences whitelist: `type`, `prompt`, `status`.
  - [ ] extend pipe serialization: `lastGeneration: pipe.lastGeneration ?? null`.
- [ ] Migration `src-tauri/migrations/0005_video_generation_tasks.sql` (new):
  table `video_generation_tasks (id, session_id FK→sessions ON DELETE CASCADE, pipe_id TEXT, status TEXT, progress REAL, stages_json TEXT, output_path TEXT, error TEXT, created_at, updated_at)`.
- [ ] `src-tauri/src/storage/db.rs` — execute 0005 in `migrate()` (after 0004).
- [ ] `src-tauri/src/storage/tasks_db.rs` (new, tiny): `insert_task`, `update_task`, `get_task`,
  `finalize_task` — sqlx against the new table.
- [ ] `src/lib/composerStore/generation.ts` (new, tiny service): `attachLastGeneration(sessionId, pipeId, gen)` + `markRefStatus(sessionId, pipeId, kind, refId, status)` — single mutations, `notifyUpdate()`, persist via existing save path.
- [ ] `src/lib/composerStore/index.ts` — register + re-export the new service (constructor `services` map + bottom export block, same pattern as others).

**Phase 0 tests**
- [ ] `tests/unit/` (extend `subjectRefs.test.ts` or new `generation-store.test.ts`): subject type/prompt/status round-trip through `updateSubjectRef`/`addSubjectRef`; `attachLastGeneration` sets + persists (whitelist check by calling `saveSession` and inspecting mocked `invoke` payload).
- [ ] Rust: `cargo test` — new `tasks_db` round-trip test (insert/update/finalize/get), 0005 migration applies cleanly on a temp DB; model serde default test (old-shape JSON deserializes).

## Phase 1 — Prompt engine (domain)

- [ ] `src/lib/promptEngine.ts` (new, pure):
  - [ ] `summarizePipe(pipe: PipeRow): string` — the single prompt string:
    - [ ] `<heuristics>` block: global style line, joined active scene prompts, zone count + ranges, keyframe inventory (slot@frame·type), subject inventory (n, types).
    - [ ] per-tag section `<{tagname} frames="{s}-{e}" zone="{n}">` content rendered via `constructRule` (reuse from `compiler.ts` — import it, don't copy); zones sorted by frameStart; repeated tag types allowed (multiple same-named sections).
    - [ ] content = `tag.prompt || String(tag.value)`.
  - [ ] keep `compiler.ts` untouched (ToolsPanel live preview still uses it).
- [ ] No UI coupling — engine is the only consumer at generate time.

**Phase 1 tests** (`tests/unit/promptEngine.test.ts`)
- [ ] fixture pipe (reuse style of `tests/unit/compiler.test.ts`): heuristics lines present + ordered.
- [ ] sections: one per tag, correct `frames`/`zone` attrs, content per constructRule (plain vs json tag).
- [ ] repeated same-type tags → repeated sections; empty pipe → heuristics only, no sections.
- [ ] out-of-order zones/segments → sorted by frameStart.

## Phase 2 — Generation backend (tiny modules, engine slot empty)

New module `src-tauri/src/generation/`:
- [ ] `types.rs` — `TaskState`, `StageState`, `GenerationStageView` (serde camelCase mirrors of frontend types), `StageKind`/`SourceKind`.
- [ ] `engine.rs` — `trait GenerationEngine` (takes a provider-settings struct, extensible for the future provider/LLM system) + engine slot (`Option<Box<dyn GenerationEngine>>`, None for now). Engine-missing = stage fails with `Error("Engine not configured")` — a REAL failure, not simulated progress.
- [ ] `registry.rs` — `TaskRegistry`: `HashMap<task_id, TaskHandle>` behind `Arc<Mutex<>>`; spawn tokio task per generation (async, main thread never blocked); per-task cancel flag; **`MAX_CONCURRENT: usize = 1` option** (flip to allow parallel later); build stages from a pipe snapshot: keyframes + subjects — `url` type → instant `ready`, `txt2img`/`img2img` → image stage (engine), then one final `video` stage (engine). Fail-fast rule D5: if any required reference is unreachable at run time, whole task aborts immediately.
- [ ] `commands/generation.rs` (new, thin): `start_generation { session_id, pipe_id } → task_id` (rejects when slot busy → "Generation already in progress"), `get_generation_task { task_id } → TaskView`, `cancel_generation { task_id }` (cancel all stages, persist `cancelled`).
- [ ] `lib.rs` — `mod generation;` + `AppState { generation: Arc<GenerationService> }` (small struct: registry + engine slot + db access) + register 3 commands in `invoke_handler!`.
- [ ] `commands/mod.rs` — `pub mod generation;`.
- [ ] Do NOT delete/modify `models/viewmodel.rs` reserved state machine (its header says re-architecture required).

**Phase 2 tests** (`src-tauri/src/generation/` + storage, `cargo test`)
- [ ] stage building: fixture `ComposerConfig` → expected stage list (ready/generation order, labels, source ids).
- [ ] sequential: second `start` while one active → Err("already in progress"); after cancel → allowed.
- [ ] cancel: active task → all stages `cancelled`, DB row finalized, engine task aborted via cancel flag.
- [ ] engine-missing: image/video stages end `error "Engine not configured"`, ready stages stay `ready`, task terminal `error`, no fake progress values.
- [ ] task DB round-trip (insert/update/get/finalize) + cascade: deleting session removes its task rows.

## Phase 3 — Reference accessibility (D5, works without engine)

- [ ] `src/lib/refCheck.ts` (new, tiny): `collectRemoteUrls(pipe) → Array<{ refKind: 'keyframe'|'subject', refId: string, url: string }>` (keyframe `url`→imageSrc, `img2img`→referenceUrl; subject `url`/`img2img`→imageUrl; skip txt2img — no URL) + `checkUrls(urls, timeoutMs=5000) → broken[]` (fetch w/ AbortController; local non-http paths → existence check via fs command later, for now treat as uncheckable/skip).
- [ ] `Workspace.svelte`: transient `brokenRefs` state (Set of `pipeId:refId`) + `recheckRef(pipeId, refId)` (single-ref re-validate, clears from set on success).
- [ ] `ComposerPanel.svelte` — receive `brokenRefs` prop, forward to rows.
- [ ] `KeyframesRow.svelte` — `broken` prop (Set or contains-fn): `.kf-chip` gets `kf-broken` class (red border + ⚠ marker).
- [ ] `SubjectRefsRow.svelte` — same: `.sr-chip` gets `sr-broken`.
- [ ] `composer-row.css` — `.kf-broken` / `.sr-broken` states (red border, red-tinted bg, warning icon).
- [ ] `KeyframeModal.svelte` / `SubjectRefModal.svelte` — on URL-field change of an existing ref (confirm), notify `onUrlChanged?.(refId)` so Workspace re-validates that single ref (red-out clears automatically on success).

**Phase 3 tests**
- [ ] `tests/unit/refCheck.test.ts`: collection (per type, skips txt2img, only http(s)), timeout → broken, success → clear; AbortController fires at timeout.
- [ ] red-out logic is pure class binding — covered visually in manual test (no unit).
- [ ] Playwright: unchanged (components Tauri-guarded where relevant; chip classes don't affect existing selectors — verify suite stays 50/50).

## Phase 4 — Generate confirm modal (pipe inspector)

- [ ] `ToolsPanel.svelte` pipe-focus inspector (L266+): add **Generate** button (`APP_CONSTANTS.strings.generate`), props `onGeneratePipe`, `pipeBusy` (task active → disabled); replace "No last-gen preview" block with last-gen slot: `pipe.lastGeneration?.videoPath` → casual `<video muted loop autoplay>` thumb; absent → clean empty state ("No generation yet"). Click thumb → `onOpenPreview(pipe)`.
- [ ] `ComposerModals/GenerateModal.svelte` (new, uses `composer-modal.css`):
  - [ ] presets block read-only (D8): fps/res/orientation + Q/C.
  - [ ] prompt block: readonly text box (mid height, overflow-y auto), **expand toggle**, **copy button** (`navigator.clipboard` + toast).
  - [ ] Confirm → `onConfirm()` (Workspace orchestrates: refCheck → start_generation).
  - [ ] Cancel → close.
- [ ] `Workspace.svelte`: `generateModalOpen` state + `openGenerateModal(pipeId)` (wired from ToolsPanel; `!isTauri()` → button hidden/disabled, E2E-safe); on confirm success → close confirm, open progress modal with `task_id`.
- [ ] `Workspace.handleGenerate` (session stub L733): info toast `"Session generation is on the roadmap"` (D3).

**Phase 4 tests**
- [ ] svelte-check clean; manual: modal opens from pipe inspector only, prompt string matches `summarizePipe` output (devtools compare), copy works, expand scrolls.
- [ ] Playwright: unaffected (Tauri-guarded) — keep 50/50.

## Phase 5 — Generation progress modal + completion flow

- [ ] `ComposerModals/GenerationProgressModal.svelte` (new):
  - [ ] poll `get_generation_task` every 1000ms while open + non-terminal; cleanup on close/unmount.
  - [ ] stage list in order: sub-images (keyframes then subjects; `ready` items shown `ready`, D4) → final video; per-stage status pill + progress.
  - [ ] **no X button** (D6): Esc/backdrop while running → `flashToast("Task not finished")` + stay open; terminal states → allow close.
  - [ ] **Cancel all** → `cancel_generation` + close.
- [ ] Completion wiring (Workspace):
  - [ ] terminal `done` (only possible once a real engine lands) → green success toast, attach `lastGeneration` via `attachLastGeneration`, keyframe/subject statuses via `markRefStatus` (url items → `done`, engine items → their stage result).
  - [ ] terminal `error` → red toast with task error; `markRefStatus` engine items → `error`; `lastGeneration` stays absent.
  - [ ] terminal `cancelled` → info toast "Generation cancelled".
- [ ] `flashToast.ts` — add `success` kind (green styling), keep `error`/`info`.
- [ ] `constants.ts` — new strings: `taskNotFinished`, `generationCancelled`, `sessionGenRoadmap`, `engineNotConfigured` hints (single source, no inline literals in components).

**Phase 5 tests**
- [ ] `tests/unit/` progress-poll logic extracted to `src/lib/taskPoller.ts` (start/stop interval, terminal-stop) → unit-testable without Tauri: polls until terminal, stops on unmount, never double-fires.
- [ ] status-flip helper (which refs get which status from a stage list) — pure fn in `src/lib/` + unit test (url→done, engine item→stage status).
- [ ] Manual: unconfigured engine path — confirm with valid refs → progress modal shows ready + engine stages → instant `Engine not configured` error state → red toast, keyframe error marks, no lastGeneration.

## Phase 6 — Top-panel video (Frame.svelte)

- [ ] `Frame.svelte` — new `video: { url: string; label: string } | null` prop: when set, render `<video>` (180px container) + **play/pause button** (native event handlers, no ffmpeg); absent → keep current empty state (D9).
- [ ] media URL plumbing (deferred-aware): `src/lib/mediaUrl.ts` tiny helper — `toMediaUrl(path)` returns asset-protocol URL under `isTauri()` (`convertFileSrc`), `null` otherwise; with no engine there are no files yet, so this path renders nothing today. NOTE for engine-landing task: enable Tauri asset protocol scoped to `<app_data>/media` or add a `read_media_file` blob command.
- [ ] `Workspace.svelte` — `previewVideo` state; `onOpenPreview(pipe)` from ToolsPanel sets it (lastGeneration + `toMediaUrl`); pass to `<Frame video={...}>`.

**Phase 6 tests**
- [ ] svelte-check + manual: empty state renders in top panel with no generation; (with a local test video file later) play/pause works — verify in manual build.

## Phase 7 — Build + full validation

- [ ] `npx svelte-check` → 0 errors.
- [ ] `npx vitest run` → all green (existing 276 + new suites).
- [ ] `npx playwright test` → 50/50 (generate UI Tauri-guarded; confirm chip classes didn't break selectors).
- [ ] `cd src-tauri && cargo test` → all green (new generation/ + tasks_db + serde-default tests).
- [ ] Desktop build on **host shell (unsandboxed)**, app closed (kill `vision-machine.exe` + any hung msiexec first): `npm run build` then `npm run tauri build`. Verify MSI timestamp is fresh.

## Phase 8 — Delivery (only on user word)

- [ ] manual-test branch with the build → user manual tests.
- [ ] commit (message via temp file + `git commit -F`), merge → `develop` AND `main`, push branch + `develop` + `main`.
- [ ] update `release-notes.md` entry for the feature (v0.6.0? — decide with user).

---

## Build/commit guardrails (from prior lost session — do not repeat)

- cargo/tauri builds: **unsandboxed host shell only** (WSL/bubblewrap + /mnt/d = LTO/WiX I/O hang).
- `git commit -m "<long>"` fails with "input not fully received" → write message to temp file, `git commit -F <file>`, delete file.
- Big `write_file`/`edit_file` payloads get dropped → split into small chunks.
- `MSYS_NO_PATHCONV=1 taskkill //IM vision-machine.exe` (Git Bash mangles `/IM`).
- PowerShell `$_` inline via Git Bash is mangled → use `.ps1` temp file with `powershell -File`.
- PDB filename-collision warning during `tauri build` (bin vs lib target) is harmless — ignore.

## Future (explicitly OUT of scope here)

- Provider/LLM selection system + real engine implementation behind `GenerationEngine`.
- Session-level "generate all pipes" (D3) — sequential/parallel orchestration.
- Asset-protocol or blob media delivery for generated files (lands with the engine).
- ffmpeg integration / poster-frame extraction (D9).
- `manual-test` / `recover-pipe-fixes` branch cleanup.
