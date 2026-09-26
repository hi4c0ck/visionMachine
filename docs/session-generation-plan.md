# Session Generation — Full Execution Plan (saturated)

Session-level "generate all" (D3 follow-through from `docs/generation-flow-tasks.md`):
run every pipe in a session as one orchestrated group — pipe tasks execute
**sequentially in `order_index` timeline order**, then the group optionally
auto-composes the session video via the existing `compose_session_video`
machinery. No new provider, no new model surface — session generation is
pure orchestration over the existing per-pipe flow. UI = one modal styled
like the pipe generation modal, with **compact per-pipe generation rows
that expand into the per-pipe stage list** (the current
`GenerationProgressModal` body, verbatim, per pipe).

Branch: `session-generation` off `develop` (80d28b6). House style: no code
in this doc — it is the checklist for implementation.

## Grounding (re-inspected + verified 2026-09-25, develop @ 80d28b6)

### Registry (single generation executor, tauri-free)
- `TaskRegistry` (`src-tauri/src/generation/registry.rs`):
  `start(view, input)` enforces `MAX_CONCURRENT_TASKS = 1` (L42, L351-357);
  `run_task` stage loop (L463-629); `cancel`/`cancel_all` (L425-448).
- **Terminal ordering (verified, all four paths):**
  `finish_done` (L631-642), `finish_cancelled` (L644-667),
  `finish_fail_fast` (L672-693), `abort_with_error` (L695-722) each do
  `refresh_progress` → `persist_terminal` (awaited) → `emit_terminal`.
  ⇒ when the sink observes a terminal event, the predecessor's DB row is
  already written. Safe for "start next pipe on terminal."
- **Event sink is a single slot** (L139-141): `set_event_sink(
  impl Fn(GenTaskEvent) + Send + Sync + 'static)`, held as
  `Arc<RwLock<Option<EventSink>>>`. Wiring is one closure in `lib.rs`
  (L134-143): `emit_to("main", "gen-task", &event)`.

### Compose (reused verbatim, no new compose code)
- `compose::compose_session_video` takes an **explicit `&[SourceVideo]`
  list** (L611+) — sources are caller-provided, the `last_generation`
  scan is only the *command*'s default resolution (L433-448), not the
  function's. A group passing run-completed pipe paths sidesteps it.
- `ComposeRegistry` is **global, keyed by `session_id`**
  (`compose.rs` L29-32 `HashMap<String, ComposeCancel>`; owned by
  `AppState.compose_registry`, `lib.rs` L20/L31). The standalone
  `compose_session_video` command acquires it (L521-523) + `finish`
  (L543) — a group compose must use the **same instance** from
  `AppState`, never its own, or the one-compose-per-session guard is
  bypassed.
- Output path is a **fixed name** `<session-root>/session-video/session.mp4`
  (L497) — no run-hash. A group compose and a standalone compose of the
  same session overwrite the same file (accepted, documented in Risks).
- `ComposeCancel` (`Arc<AtomicBool>`, L26) threads into the ffmpeg
  process + the ComposeRegistry finish path — group cancel can stop it.

### Commands (thin boundary, house patterns)
- `start_generation` (`commands/generation.rs` L127-250): builds initial
  `GenerationTaskView` (stages via `TaskRegistry::build_stages` L183),
  precomputes `request_log` via `pipe_media_dirs` (L195-199), spawns
  `run_task` (L403-405), returns `{ task_id, view }` for instant render.
  The group's per-pipe start reuses this exact sequence — the group
  just loops it.
- `get_generation_task` (L252-298) is a **pure read** with a DB fallback
  that rebuilds the full view from `video_generation_tasks`
  (`stages_json`, `request_log`, `started_at`, `output_path`). ⇒
  expanded rows for *other* pipes in the compact-pipes UI need **no new
  command** — `get_generation_task` per pipe suffices.

### DB
- `video_generation_tasks` (migration 0005): already session-scoped
  (`session_id`, `pipe_id`) — **no migration for pipe rows**.
- `generation_logs` (0006) is upserted by `add_generation_log`
  (`storage/db.rs` L836-862): the INSERT lists columns explicitly —
  `INSERT INTO generation_logs (task_id, session_id, pipe_id,
  entry_json, updated_at) … ON CONFLICT (task_id) DO UPDATE SET …`.
  An additive `group_id TEXT NULL` column = one statement edit + the
  ON CONFLICT list; old rows stay NULL, no backfill.

### Frontend
- `Workspace.handleGenerate` (L1011-1016) = the session button, today
  just toasts `sessionGenRoadmap` — **the entry point we replace**.
- `confirmGenerate` (L1113+) = per-pipe path: `pipePrechecks` →
  `start_generation` invoke (10 s guard L1144-1159) →
  `startWatchingTask(taskId, initialView)` (L1321-1351: poller +
  `subscribeGenTask` + `reconcileTerminal`).
- `subscribeGenTask` (`src/lib/generationEvents.ts` L32-37): plain
  `listen('gen-task', …)`; browser fallback = no-op unlisten.
- `handleTaskTerminal` (L1404-1480) keys `attachLastGeneration` /
  `markRefStatus` on **per-pipe `view.sessionId + view.pipeId`** —
  group runs never leak into per-pipe persistence (verified L1432-1438).
- `ToolsPanel` L364-369: `focus-generate` (pipe-level) button is live
  during any run; it must be disabled while a group is active (one
  binding).
- `GenerationProgressModal` body = per-pipe stage list; the compact row
  is a NEW small component wrapping it (see UI surface).

## Locked decisions (verified, do not re-litigate)

- **S1. Sequential, in `order_index`.** One pipe task active at a time —
  the registry's `MAX_CONCURRENT_TASKS = 1` guard enforces it; the group
  coordinator starts pipe N+1 only on N's terminal.
- **S2. One group = many existing tasks.** Each pipe keeps its full
  existing lifecycle (stages, progress, cancel, request.log, DB row,
  `gen-task` event stream). The group is a thin coordinator, not a new
  task type.
- **S3. Failure policy (modal, user-chosen):** `stop` (default) —
  first pipe terminal-error → cancel remaining, group → `error`, report
  which pipe + why. `continue` — failed pipe skips, next runs; group
  ends `done-with-errors`. User cancel → cancel current task + drop
  queue, group → `cancelled`.
- **S4. Auto-compose (default ON, checkbox).** After the last pipe
  reaches terminal, the coordinator composes from **this run's
  completed pipes only** (explicit `SourceVideo`s, never the
  `last_generation` scan — a 2-pipe run must not splice an unregenerated
  3rd pipe). Compose runs through the **shared `AppState.compose_registry`**
  (one compose per session, same guard as the standalone button).
  Compose failure (no ffmpeg / codec mismatch / source missing) does NOT
  fail the group: pipes succeeded → group stays `done`, compose is a
  separate `compose_state`/`compose_error` footer field.
- **S5. Progress = stage-count-weighted average** across the group's
  pipe tasks (a pipe with 0 image stages moves the bar faster — it's
  cheaper). Inside-pipe progress unchanged.
- **S6. One modal, compact-pipes layout.** Group modal = the pipe
  generation modal's style + a **compact row per pipe** (name ·
  progress · status) that **expands into the per-pipe stage list**
  (the current `GenerationProgressModal` body, verbatim, per pipe).
  Current pipe = expanded by default, auto-advanced on terminal.
- **S7. Group index = one new table** (`generation_groups`) + one
  additive column (`generation_logs.group_id TEXT NULL`). No new
  table for pipe rows (they exist).
- **S8. Session button swap-in:** `handleGenerate` →
  `openSessionGenerateModal` (new `SessionGenerateModal`, sibling of
  `GenerateModal`, reuses its pre-check / model pickers).
- **S9. Sink chaining (Option A, verified).** The coordinator wraps the
  registry's single event sink: UI sink runs first, then a group
  dispatch keyed by a `task_id → group_id` reverse index. **Zero
  changes to `registry.rs`** — no module-graph cycle, no terminal-hook
  edits. (Option B rejected: a direct `group.on_pipe_terminal` call
  from `registry.rs` would make registry depend on group, breaking the
  tauri-free layering.)
- **S10. Stale group row = frontend detection, pure-read backend.**
  `get_generation_group` never writes on load (house style:
  `get_generation_task` is a pure read, L252-298). A `running` row
  whose live task is gone (post-restart) is shown by the UI as a
  read-only "stale — app restarted" state. No migration, no side
  effect.
- **S11. No new Tauri capability entry.** `default.json`'s
  `core:default` includes `core:event:default`; `gen-task` already rides
  it (lib.rs L134-143 ↔ generationEvents.ts L32-37). The new
  `group-event` channel rides the same permission.
- **S12. Pipe-level generate button is disabled while a group is
  active** (cheap binding in `ToolsPanel`; honest rejection would be
  "Generation already in progress" — the one-active guard still fires,
  but the disabled state is kinder).

## Wire contracts

### Frontend — `src/components/ComposerModals/SessionGenerateModal.svelte` (new)
- Props: `{ session, pipes, open, onConfirm, onClose }`.
- Body: ordered pipe list (name · lengthFrames · stage count ·
  per-pipe pre-check result), failure-policy segmented control
  (`stop`/`continue`), auto-compose checkbox (default checked), models +
  seed pickers (lifted from `GenerateModal` into a shared
  `ModelPickers.svelte` or inlined).
- Confirm disabled when: no pipes, or (policy `stop`) any pipe fails its
  pre-check. In `continue` mode, failing pipes render red but the run
  starts for the healthy ones (explicit user choice).
- Pre-checks per pipe: `pipePrechecks` from `src/lib/settings` (already
  used by `confirmGenerate`) — one pass over all pipes, concrete
  messages (8n+1 violation, cap overflow, missing txt2img prompt…).

### Frontend — `src/lib/composerStore/sessionGeneration.ts` (new, tiny)
- `startSessionGeneration({ sessionId, models, seed, policy, autoCompose })`
  → invoke `start_session_generation` → `{ group_id, first_task_id,
    first_view }`.
- `subscribeGroupEvent(groupId, cb)`: `listen('group-event', …)` with
  the browser no-op fallback (same shape as `subscribeGenTask`).
- Per-pipe terminal side-effects (attachLastGeneration, markRefStatus,
  log upsert) stay in `reconcileTerminal` — the group only aggregates.

### Rust — `commands/generation.rs` (add)
- `StartSessionGenerationInput { session_id, image_model?, video_model?,
   seed?, profile_id?, image_spec?, video_spec?,
   pipe_ids: Option<Vec<String>>,       // None = all pipes, order_index
   failure_policy: "stop" | "continue",
   auto_compose: bool }` (serde camelCase, tolerant deserialization,
   same style as `StartGenerationInput`).
- `start_session_generation(input) → { group_id, first_task_id,
   first_view }` — Err concrete (no pipes / none healthy / one active
  task from a manual run).
- `get_generation_group(group_id) → GenerationGroupView` (pure read,
  registry cache → DB fallback, mirroring `get_generation_task`).
- `cancel_generation_group(group_id)` — no-op on terminal/unknown
  (same tolerance as `cancel_generation`).
- Group events: new `GroupEvent` payload on the **existing sink**
  (kinds: `pipe-started`, `pipe-terminal`, `compose-started`,
  `compose-terminal`, `group-terminal`), routed through the wrapped
  sink closure → `emit_to("main", "group-event")`.

### Rust — `generation/group.rs` (new module, the coordinator)
- `GroupRun { group_id, session_id, pipe_task_ids: Vec<String>,
   queue: VecDeque<String>, current: Option<String>,
   failure_policy, auto_compose,
   session_video_path: Option<String>,
   compose_state: ComposeState, compose_error: Option<String>,
   cancel: Arc<AtomicBool> }`
- `GroupStatus { Running, Done, DoneWithErrors, Error, Cancelled }`
- `GenerationGroupView { group_id, session_id, status,
   pipes: Vec<GroupPipeView { pipe_id, task_id, status, progress,
     error: Option<String> }>,
   progress: f32, session_video_path: Option<String>,
   compose_state, compose_error, started_at }`
- `GroupCoordinator` (owns `HashMap<group_id, GroupRun>` + a
  `HashMap<task_id, group_id>` reverse index, behind `Arc<Mutex<>>`;
  holds the registry, db, and `AppState`'s `ComposeRegistry` — the
  **shared** one):
  - `start_group(input)`: builds one start sequence per pipe (reusing
    `TaskRegistry::build_stages` + `pipe_media_dirs`), starts pipe #1,
    queues the rest; returns the first task's initial view.
  - **Sink-wrap on construction**: read the current sink, install a
    chain (UI sink first, then group dispatch). Filter by the reverse
    index; on `gen-task` terminal of a member → queue the next pipe or
    (queue empty) → optional compose → group terminal. Failure policy
    applied here.
  - `cancel_group`: sets the group cancel flag → cancels the current
    pipe task (existing `registry.cancel`) + drops the queue; the
    compose step checks the flag before `compose_registry.start`
    (the `ComposeCancel` from the shared registry honors it).
  - Compose step: direct call into `compose::compose_session_video`
    with **explicit `SourceVideo`s** from this run's completed pipes,
    through the shared `AppState.compose_registry`; capture its
    `ComposeError` into `compose_state`, don't fail the group.
- Registration in `mod.rs` + `lib.rs`: `AppState { generation,
  group: Arc<GroupCoordinator> }`; the three commands into
  `invoke_handler!`.

### DB — migration `00XX_generation_groups.sql` (new)
- Table `generation_groups (group_id PK, session_id FK→sessions
  ON DELETE CASCADE, status TEXT DEFAULT 'running', progress REAL,
  pipes_json TEXT, failure_policy TEXT, auto_compose INTEGER,
  session_video_path TEXT, compose_state TEXT, compose_error TEXT,
  error TEXT, started_at INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`.
- Additive column `generation_logs.group_id TEXT NULL` (one ALTER).
- `add_generation_log` INSERT + ON CONFLICT lists gain `group_id`
  (the only write-path edit; see #5 above).

## UI surface (compact-pipes style, S6)

- `ToolsPanel.svelte` — `btn-generate` (session) opens
  `SessionGenerateModal` instead of toasting the roadmap.
  `focus-generate` (pipe-level, L364-369) gains a `groupActive`
  disabled binding (S12).
- `Workspace.svelte`:
  - `handleGenerate` → `openSessionGenerateModal` +
    `confirmSessionGenerate(...)` (mirror of `confirmGenerate`:
    per-pipe pre-checks → invoke `start_session_generation` with the
    10 s guard → `startWatchingGroup(groupId, firstView)`).
  - `startWatchingGroup`: watches the **current pipe task** with the
    existing poller + `subscribeGenTask` (the modal body is
    unchanged), plus `subscribeGroupEvent` for pipe transitions:
    - `pipe-terminal` → run the existing `reconcileTerminal` for that
      pipe (attach video, log upsert — today's per-pipe code,
      unchanged) → auto-advance to the next pipe's task view.
    - `group-terminal` → footer flips to terminal summary (N done /
      M failed / compose status + the D6 "keep open until OK" rule).
  - Cancel button while active: "Cancel all" = cancel the whole group
    (S3), same toast behavior.
  - On group terminal with `session_video_path`: top-panel video
    (Frame.svelte) + carousel target = the composed file (A5/B4
    pattern; `read_media_file`/`toMediaUrl` already serve it).
- `GenerationProgressModal` / new compact row component:
  - **Compact row** (per pipe, default for non-current pipes):
    pipe name · progress bar · status chip (queued/running/done/
    error/cancelled · compose tag for the group row).
  - **Expanded body** (the current pipe): today's stage list, verbatim.
  - **Expanding a *finished or other* pipe**: fetch
    `get_generation_task(task_id)` (DB fallback returns full
    `stages_json` + `request_log` + `started_at` — verified) → render
    the same stage list read-only. No new command.
  - `request_log` expander: per-task file
    (`<pipe>/<task>/request.log`), no collision across pipes.
  - Scroll/focus when the current pipe auto-advances: keep the
    expanded row pinned to the top (or follow the user's last expanded
    row — whichever has less churn), and do not lose keyboard focus on
    the D6-not-closable backdrop.
- `constants.ts`: new strings (session modal copy, group terminal
  summaries, compose-in-group errors, failure-policy labels, stale
  group note). No inline literals (house rule).

## Phases (checkboxes)

### P0 — Group core (Rust, no UI changes)
- [ ] `generation/group.rs`: `GroupRun` / `GroupCoordinator` /
      `GenerationGroupView` + `GroupEvent`; `lib.rs` state + module +
      sink wrap (S9).
- [ ] Reverse index `task_id → group_id` populated on each pipe start;
      sink dispatch filters on it.
- [ ] Migration 00XX + db methods (insert/update/get group row,
      `generation_logs.group_id` ALTER + `add_generation_log` edit).
- [ ] `start_session_generation` command: sequential start, queue the
      rest, return first task's initial view (the exact
      `start_generation` sequence, per pipe).
- [ ] `get_generation_group` (pure read, S10) + `cancel_generation_group`.
- **Tests** (cargo, in `group.rs` + `registry.rs`):
  - [ ] group of 3 pipes starts task #1 only; #2 starts on #1
        terminal (persist-before-emit ordering, #2 above).
  - [ ] `stop` policy: pipe #2 error → #3 never started, group
        `error`, remaining cancelled/never-inserted.
  - [ ] `continue` policy: #2 error → #3 runs; group
        `done-with-errors` with per-pipe statuses.
  - [ ] cancel group mid-pipe → current task cancelled, queue dropped,
        group `cancelled`.
  - [ ] restart-eviction: `get_generation_group` after terminal → DB
        fallback row (like the task fallback test); a `running` row
        with no live task returns as-is (UI shows stale, no write).

### P1 — Compose step (S4)
- [ ] Coordinator post-queue step: explicit `SourceVideo`s from this
      run's **completed** pipes → `compose::compose_session_video`
      through the **shared `AppState.compose_registry`** with the
      group's cancel flag → `session_video_path` / `compose_state`.
- [ ] Compose failure → group stays done; `compose_error` recorded.
- [ ] `auto_compose = false` → step skipped.
- **Tests**:
  - [ ] compose invoked only on full success (continue-policy: only
        `done` pipes are sources).
  - [ ] compose error does not flip group status; cancel flag honored.
  - [ ] shared-registry guard: a concurrent standalone compose for the
        same session → `COMPOSITION_ALREADY_RUNNING` (the guard is the
        shared `AppState.compose_registry`, not a per-group one).

### P2 — Frontend wiring
- [ ] `SessionGenerateModal.svelte` (ordered pipe list, per-pipe
      pre-checks, policy control, compose checkbox, shared model
      pickers).
- [ ] `sessionGeneration.ts` store service + `subscribeGroupEvent`
      channel (`group-event` in constants).
- [ ] `Workspace.svelte`: `handleGenerate` swap-in,
      `startWatchingGroup`, auto-advance on `pipe-terminal`
      (per-pipe `reconcileTerminal` unchanged), terminal footer,
      cancel-all → group cancel, `focus-generate` disabled during a
      group (S12).
- **Tests** (vitest):
  - [ ] modal confirm-disabled logic (no pipes / stop-policy pre-check
        failure / continue-policy allowed).
  - [ ] auto-advance state machine: `pipe-terminal` events drive
        current-task swap; terminal group stops the watcher.
  - [ ] `start_session_generation` invoke payload shape (mock invoke,
        assert pipe_ids / policy / auto_compose pass through).
  - [ ] stale detection: a `running` group row with no live task
        renders the read-only note, no poller spin.

### P3 — Compact-pipes UI (S6)
- [ ] Compact row component (name · progress · status) + expandable
      stage list = `GenerationProgressModal` body verbatim, per pipe.
- [ ] Expanded *other* pipe → `get_generation_task` (DB fallback,
      no new command), read-only stage list + `request_log` expander.
- [ ] Auto-advance keeps the current pipe's row expanded/pinned.
- **Tests** (svelte/vitest):
  - [ ] expand/collapse state survives an auto-advance without losing
        keyboard focus (D6 invariant).
  - [ ] fetching an other pipe's view by task_id renders its stages
        (mock `get_generation_task` DB-fallback shape).

### P4 — Polish + validation
- [ ] svelte-check 0 errors; full `npm run build` (tiny variant — no
      ffmpeg gating change; compose-in-group surfaces the existing
      "no ffmpeg" hint as its `compose_error`).
- [ ] Desktop build (`runner.mjs --light --features bundled-ffmpeg`,
      kill `vision-machine.exe` first); manual: 3-pipe session —
      stop-policy error case, full success, cancel case, auto-composed
      video opens in top panel + carousel.
- [ ] Generation log: one `GenerationLogEntry` per pipe (unchanged,
      each redacted) tagged with `group_id` in `generation_logs`.
- [ ] Update `docs/plan-session-video-and-carousel.md` A5 note:
      composed video is now also reachable via the group auto-compose.

## Order of work (commits)

1. `feat: session generation group core (coordinator + sink wrap + DB + commands)` — P0.
2. `feat: session group auto-compose step (shared registry, run-completed sources)` — P1.
3. `feat: session generation modal + compact-pipes group progress wiring` — P2 + P3.
4. `test/docs: session generation validation + log group tag + stale-row UI` — P4.

## Risks / notes (saturated)

- **Sink chaining (S9)** is the only surgical cut. The coordinator
  wraps the registry's single sink (UI first, then group dispatch).
  Verify the wrapped closure stays `Send + Sync + 'static` and that
  `emit_to("main", "gen-task")` is untouched for the existing
  single-pipe flow (the chain must not reorder the UI sink behind the
  group dispatch — UI first, always).
- **Restart-stale group row (S10)**: a `running` row survives the DB
  but its in-memory queue is gone. Pure-read backend; the UI shows
  "stale — app restarted" read-only when a `running` group has no live
  task (poller times out / `get_generation_group` returns the row but
  no current task id resolves to a live registry entry).
- **Compose source selection (S4)** is the subtle part: passing
  explicit `SourceVideo`s (run-completed pipe paths) sidesteps the
  `last_generation` scan, so an unregenerated pipe never leaks in.
  The output is a fixed `session.mp4` name — a group compose and a
  standalone compose of the same session overwrite the same file
  (accepted: same-session overwrite is a feature, not a bug).
- **Shared `ComposeRegistry` (verified global, keyed by session_id)**:
  a standalone "Compose" button and a group compose for the *same*
  session collide (by design, one compose per session). Different
  sessions don't. The group must use `AppState.compose_registry`, not
  its own instance.
- **No scope creep**: session-level *prompt* generation (one prompt
  output → all pipes) is out; each pipe still runs its own prompt
  engine (`summarizePipe`). Multi-profile / per-pipe model overrides are
  out — one model set per group run (v1).
- **Per-pipe persistence isolation (verified)**:
  `attachLastGeneration` / `markRefStatus` key on the per-pipe
  `view.sessionId + view.pipeId` (Workspace L1432-1438) — group runs
  never contaminate the per-pipe artifact linkage.
