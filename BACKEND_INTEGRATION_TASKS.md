# Backend Integration Task List — VisionMachine v0.3.0

**Created:** 2026-08-26
**Updated:** 2026-08-26 (full saturation rewrite — see Revision History at bottom)
**Status:** Ready for fresh session implementation. Read ALL of this file before writing code.
**Current baseline:** v0.2.0 commit `3514cd3` (real backend wiring) — **but the current working tree has REGRESSED to a stub**. Recovery is Task 0.

---

## Critical Context

### Regression warning (read first)

Commit `3514cd3` (v0.2.0) contains working backend wiring: `AppState { db: Arc<Database> }`,
registered project/session commands, sqlx pool, migrations on startup. The **current uncommitted
working tree threw this away**:

- `lib.rs` `AppState` has NO `db` field; only `login_user / get_app_info / get_preflight_report` are registered.
- `init_database()` now **deletes any existing visionmachine.db on every launch** (`std::fs::remove_file`)
  and writes a hand-crafted 16-byte `"SQLite format 3\0"` header as the "database". This is NOT a valid
  SQLite file (zero pages, no schema) and the delete-on-start pattern is anti-persistence. It explains
  every "my data disappeared" symptom. This logic must be removed permanently — never reintroduce it.

### What Works (frontend, intact)

- ✅ ComposerPanel.svelte (~1489 lines): all 5 modals (Add Pipe, Add Keyframe url/txt2img/img2img,
  Segment edit, Type picker, Global prompt), pipe CRUD incl. reorder ↑/↓ + duplicate + delete,
  toast notification system (`showToast`).
- ✅ Workspace.svelte: backend-first load with localStorage fallback; per-user selection keys
  (`vm-selected-project-${userName}`).
- ✅ 32/32 unit tests passing.
- ✅ Purpose-built but ORPHANED components: `MultiThumbSlider.svelte` (367 lines, two-thumb drag,
  MIN_GAP=8, step snapping) and `FrameRuler.svelte` (224 lines, marker ticks, playhead) — imported by nobody.

### What's Broken / Missing

- ❌ Working tree backend is a stub (see regression warning). Commands deregistered, AppState lost db.
- ❌ `storage/composer_db.rs` calls `self.get_conn()` which does NOT exist on `Database`
  (struct only has `pool: SqlitePool`). Entire composer storage layer cannot compile as wired.
- ❌ TWO DIVERGENT SCHEMA TRUTHS:
  - `db.rs::migrate()` inline SQL creates `sessions(id, project_id, name, fps, resolution,
    orientation, pipes_json, total_generated_frames, ...)` — what live code writes;
  - `migrations/0001_create_schema.sql` defines `sessions` WITHOUT those columns plus a `composers`
    table; `0002_composer_schema.sql` adds session_settings/pipes/pipe_keyframes/pipe_prompt_nodes/
    pipe_generation_log. Neither migration file is ever executed by any code path.
- ❌ Frontend composer edits persist ONLY to localStorage; SQLite never receives pipe/keyframe/segment data.
- ❌ Dead UI: `viewMode = $state<'list'|'timeline'>('list')` in ComposerPanel header toggles state
  that renders identically either way — no timeline branch exists anywhere.
- ❌ Segment add/move/update validation failures are SILENT (`if (!validation.valid) return;`) — user
  reads it as "button doesn't work". Toast system exists but these three paths don't call it.
- ❌ No prompt compiler: TAG_SPECIFICATIONS.constructRule (json/xml/markdown/plain) unused; Generate
  button emits an event nothing handles.
- ❌ Startup hazards if v0.2.0 wiring is restored as-is:
  - `Database::new` connects `sqlite://{path}` WITHOUT create flag → fails on fresh install;
  - setup uses `tokio runtime Handle::current()` + `block_on` → panics outside a runtime context;
  - `tauri-plugin-log` is in Cargo.toml but never registered → all `log::info!` go nowhere.

### Root Causes

1. Defect-driven development: repeated crash-fix cycles rewrote files without preserving prior work.
2. Two parallel data models (TS app.ts vs Rust migrations) evolved independently with different tag
   sets, keyframe vocabularies, fps defaults. Every integration attempt trips on this.

---

## Design Rules (non-negotiable)

**R1 — Two-layer segment hierarchy.**
Layer 1 = GLOBAL top-tier nodes per pipe (root-level, parent_id NULL, tag `global_style`). Rendered
as a separate bar ABOVE tracks; never mixed into track rows. Layer 2 = segment timeline: every other
tag attaches ONLY to segments on its own per-tag track row. DB mapping: `pipe_prompt_nodes.parent_id`
NULL → global or segment-root node (distinguish by tag); children belong to that parent's row.
Constraint from 0002: one tag-type per parent row.

**R2 — Single frame-number space.**
Frame ruler and ALL sliders/tracks/knobs share one coordinate space of frame numbers
(0..pipe.lengthFrames), internally stored as frames (not percentages). Every position/length passes
through `snapTo8nPlus1`: `(f-1)>>3<<3 + 1`. Pipe min 41 frames; resolution caps 480p=441, 720p=241,
1080p=121. Ruler ticks (markerInterval=8), slider thumbs, segment boundaries, keyframe positions are
coordinate-locked: one drag updates the same frame values everywhere via a single store action.

**R3 — Keyframes: wide chips, aligned repositioning, validated sources.**
Keyframes render as wide chips (~72px) whose left edge maps to their frame position on the ruler row.
Repositioning snaps to 8n+1 and stays aligned with ruler coordinates. Max 3 slots per pipe
(DB CHECK slot_index BETWEEN 1 AND 3, UNIQUE(pipe_id, slot_index)).
Source validation: `url` requires non-empty imageSrc; `txt2img` requires prompt; `img2img` requires
non-empty referenceUrl — reject add/update with toast otherwise.

Tag palette/output contract (TAG_SPECIFICATIONS): scene #FF6B6B plain · camera #FFE66D json ·
rotation #4ECDC4 json · lighting #45B7D1 plain · effect #96CEB4 markdown · zoom #DDA0DD json ·
transition #FF6B35 plain. Route colors through CSS custom properties (--tag-*) for theming.

---

## Timeline Architecture: Nested Segments with Multi-Thumb Sliders

### Visual Structure

```
┌─────────────────────────────────────────────────────────────┐
│  FRAME RULER (0..lengthFrames, snaps to 8-grid)             │
│  [0]...[8]...[16]...[24]...[32]...[40]...[48]...[56]...   │
└─────────────────────────────────────────────────────────────┘
│  GLOBAL NODES (layer 1: R1)                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  [● global_style: "film noir" ●]                            │
└─────────────────────────────────────────────────────────────┘
│  PIPE KEYFRAMES (max 3 slots, wide chips ~72px)             │
│  [k1][k2][k3][+]  ← left edge = frame position on ruler     │
└─────────────────────────────────────────────────────────────┘
│  SEGMENT TRACKS (layer 2: R1, per-tag rows)                 │
│                                                             │
│  Scene (red #FF6B6B)                                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ●═══════════════●           ●══════●                │    │
│  │  segment A       segment B      segment C            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Camera (yellow #FFE66D)                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         ●══════════════●                           │    │
│  │          segment D                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Rotation (cyan #4ECDC4)                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ●═════●                                             │    │
│  │  segment E                                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [+Scene] [+Camera] [+Rotation] [+Lighting] ...             │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Thumb Slider Behavior

**Component:** `MultiThumbSlider.svelte` (367 lines)
**Props:** `values=[start, end]`, `min=0`, `max=pipe.lengthFrames`, `step=8`, `color=tagColor`

Each segment renders as one `<MultiThumbSlider>` on its tag track:

1. **Thumb dragging** — grab either thumb, drag horizontally along the track
2. **Frame snapping** — positions snap to multiples of 8 (0, 8, 16, 24...)
3. **Minimum span** — `MIN_GAP = 8` enforced: `end - start >= 8`
4. **Boundary validation** — after drag release:
   - `frameStart % 8 === 0` ✓ (valid boundary)
   - `frameEnd % 8 === 0` ✓ (valid boundary)
   - `(frameEnd - frameStart) >= 8` ✓ (min span)
   - `frameEnd <= lengthFrames - 1` ✓ (within pipe bounds)
5. **Overlap rejection** — same-tag overlaps cause revert + toast

**Critical distinction (8n+1 vs multiple of 8):**
```
Pipe length (totalFrames):    121 = 8×15 + 1  (8n+1 rule)
Valid segment boundaries:     0, 8, 16, 24...  (multiples of 8)
Last valid segment end:       120 = 121 - 1
```

The 8n+1 rule applies to **pipe length** (total frames), NOT to segment boundaries. Segments use multiples of 8 for both start and end.

### Adding Segments via Frame Ruler Interaction

**Primary path (Type Picker button):**
1. User clicks `[+Scene]` on a tag row
2. `openTypePicker(pipeIndex)` opens the type picker modal
3. User selects tag → `confirmTypeSelection()` called
4. Segment created at `frameStart=0, frameEnd=snapTo8(lengthFrames-1)`
5. Validation runs: overlap check + boundary check
6. If valid → `onUpdate` persists; if invalid → toast error

**Secondary path (click on ruler):**
1. User clicks on frame ruler position
2. `handleTimelineFrameSelect(frame)` fires
3. Opens type picker at that frame position
4. Same validation as above

**Removing segments:**
1. Click trash icon on segment chip
2. `removeSegmentAction(sessionId, pipeId, segmentId)`
3. Re-validates remaining segments for overlaps
4. Persists via `onUpdate`

### Pipe Scope Constraint

All segment operations are scoped to a single pipe:
- `frameStart`, `frameEnd` are relative to `pipe.lengthFrames`
- Different pipes have independent timelines (no cross-pipe segments)
- `lengthFrames` can differ per pipe (valid 8n+1 values: 41, 49, 57... up to resolution cap)

Resolution caps:
- `480p`: max 441 frames
- `720p`: max 241 frames  
- `1080p`: max 121 frames

### Frame Ruler Coordination

The `FrameRuler.svelte` component (224 lines) provides:
- Visual tick marks at `markerInterval` (default 8)
- Zoom level affects marker density
- Click handler: `onframeSelect(frame)` fires with snapped frame
- Used by composer to open add-segment at clicked position

### Validation Rules Summary

| Check | Rule | Error Message |
|-------|------|---------------|
| Boundary | `frameStart % 8 === 0` | "frameStart must be a multiple of 8" |
| Boundary | `frameEnd % 8 === 0` | "frameEnd must be a multiple of 8" |
| Span | `frameEnd - frameStart >= 8` | "minimum span is 8 frames" |
| Bounds | `frameEnd <= lengthFrames - 1` | "frameEnd exceeds max usable frame" |
| Overlap | No same-tag overlap | "Overlap detected for <tag>" |

---

## Canonical Data Contract

Single JSON shape agreed between frontend store and backend commands:

```
PipePayload {
  id, name, order_index,
  lengthFrames,                 // int, satisfies (n-1)%8==0, clamped [41, resCap]
  q: u32 (5..30), c: f32 (0.5..15),
  keyframes: [ { slot_index: 1|2|3, type: 'url'|'txt2img'|'img2img',
                 imageSrc?, prompt?, referenceUrl?, frame } ],   // frame = 8n+1
  globalNodes: [ { id, tag:'global_style', value } ],            // layer 1 (R1)
  segments:    [ { id, tag, value|prompt, frameStart, frameEnd } ] // layer 2 (R1)
}
```

Interim persistence: sessions.pipes_json holds the whole pipes array as JSON (columns already exist
in db.rs variant). Composer-table normalization (pipes / pipe_keyframes / pipe_prompt_nodes) lands in
Phase 5 after CRUD survives restarts. Do not attempt both at once.

---

## Implementation Phases

### Phase 0 — Recover backend wiring (BEFORE anything else)

```bash
git diff 3514cd3 -- src-tauri/src/lib.rs src-tauri/src/commands src-tauri/src/storage
```

Restore from `3514cd3`: `src-tauri/src/lib.rs`, `src-tauri/src/commands/*`, `src-tauri/src/storage/db.rs`.
Keep the new test files uncommitted in tests/. Then apply Phase 1 fixes on top. NEVER restore the
working-tree `init_database()` fake-header/delete-on-start version.

### Phase 1 — Startup correctness

File-by-file, each item verified before next:

1. `src-tauri/src/storage/db.rs` `Database::new`: connect URL must be `sqlite://{path}?mode=rwc`
   (create-if-missing). Keep `create_dir_all(parent)`. Delete the empty-file pre-check entirely.
2. `src-tauri/src/lib.rs` setup closure: replace BOTH
   `let rt = tokio::runtime::Handle::current(); rt.block_on(...)` occurrences with
   `tauri::async_runtime::block_on(...)`. No std Mutex around Database — sqlx Pool is Send+Sync;
   `AppState { db: Arc<Database> }` exactly as v0.2.0 had it.
3. Register logging: `.plugin(tauri_plugin_log::Builder::new().build())` on the Builder so log macros
   reach stderr/file. Without this you are blind for every later phase.
4. Default profile: in setup, after migrate, ensure a default profile row exists
   (`SELECT id FROM profiles LIMIT 1`; insert uuid "default" if none); store profile_id in AppState.
   All project queries filter by it. This kills the dummy-profile_id drift in projects.rs where
   create_project generated a random UUID per call.
5. Build fingerprint: expose version + build timestamp via existing `get_app_info`; App.svelte prints
   it in header. If fingerprint doesn't change after rebuild, you are looking at a stale artifact.
6. Gate: `cargo check` clean → app launches → DB file opens in sqlite3 CLI and lists tables →
   restart keeps data → fingerprint visible.

### Phase 2 — Schema single-truth

1. Make migration FILES executable truth: `migrate()` reads and executes `migrations/0001` then `0002`
   verbatim (include_str! at compile time, execute as batch).
2. Additive-only alignment migration `0003_align_sessions.sql` for columns live code writes that 0001
   lacks: `ALTER TABLE sessions ADD COLUMN fps INTEGER DEFAULT 24; ... resolution TEXT DEFAULT '720p';
   ... orientation TEXT DEFAULT 'horizontal'; ... pipes_json TEXT; ... total_generated_frames INTEGER DEFAULT 0;`
   Guard each ALTER (ignore "duplicate column" errors) since db.rs-created DBs may already have them.
   NEVER redefine/rename/drop existing columns.
3. Fix `composer_db.rs` compile mismatch: replace every `let mut conn = self.get_conn().await?` with
   direct pool calls (`.execute(&self.pool)` / `.fetch_all(&self.pool)` / `.fetch_optional(&self.pool)`);
   drop `query_as` row structs where they fight; serde_json row mapping like db.rs is acceptable.
4. Gate: fresh-install launch AND upgrade-from-old-db launch both succeed; `sqlite3 .schema` matches
   migration files + 0003 columns.

### Phase 3 — Session/Project CRUD real implementations

Commands (already shaped in v0.2.0; keep signatures):

- `create_project(profile_id, name, directory_path?) -> String` — persisted id.
- `list_projects(profile_id) -> Vec<Value>` — REAL query, not `Ok(vec![])` stub.
- `create_session(project_id, name, pipes_json?) -> String`.
- `list_sessions(project_id) -> Vec<Value>` returning fps/resolution/orientation/pipes_json too.
- `update_session(session_id, updates: Value)` — dynamic SET builder (exists in db.rs; bind typed
  values, not everything-as-string where avoidable).
- `delete_session(session_id)`.

Frontend (`Workspace.svelte`):
- On project select → `invoke('list_sessions', { projectId })` and merge into local model. Currently
  sessions are ONLY in localStorage after restart — bug.
- After create_project/create_session use the RETURNED id; never fabricate client-side UUIDs that
  diverge from DB rows.
- Keep localStorage fallback but mark state "unsynced" (badge in ProjectsPanel footer) when falling
  back, so silent divergence becomes visible.
- Remove dual-write shape drift: local SessionData assembled from backend response fields only.

Gate: manual E2E — login testuser → create project → check `projects` table row → create session →
`sessions` row → change FPS/add pipe → update_session writes → logout/login other user → zero
cross-contamination → full restart preserves everything.

### Phase 4 — Timeline restructure in frame space (frontend core)

Introduce `src/lib/composerStore.svelte.ts`: reactive store keyed by sessionId holding PipePayload[];
ComposerPanel reads/writes ONLY through actions (`addSegment, moveSegment, resizeSegment, setKF,
moveKF, addGlobal, removeGlobal, setPipeLength, ...`). Each action: mutate → validate → persist
(invoke + localStorage mirror) → revert + showToast on failure. No component mutates raw arrays
(ends the recurring "pipes undefined" bug class permanently).

Pure helpers in `src/lib/frameMath.ts` (unit-testable):
- `snap8n1(f) = ((Math.round((f-1)/8))*8)+1`
- `validateSegments(segs, len)`: same-tag overlap rejection, bounds 0 ≤ start < end ≤ len, min span 9.
- `validateKeyframe(kf)`: R3 source rules; slot 1..3; frame snapped.
- `clampLength(len, resolution)`.

Rendering per pipe row (replaces stacked param-rows entirely once parity confirmed):
- Shared coordinate helpers exported from store:
  `frameToX(f) = f / lengthFrames * trackWidthPx`; `xToFrame(x) = snap8n1(x / trackWidthPx * lengthFrames)`.
- FrameRuler: `totalFrames={pipe.lengthFrames} markerInterval={8}`; wire `onframeSelect` to shared
  `playheadFrame` state — ONE playhead across ruler + all tracks of the pipe (R2 lock).
- Per-tag track rows: render all 7 TagType rows always (dim empties — stable layout). Each segment =
  MultiThumbSlider instance with `min=0 max={lengthFrames} step=8 values=[frameStart, frameEnd]
  color={spec.color}`. Its built-in MIN_GAP=8 enforces minimum width; step=8 enforces grid (R2).
  onchange → resizeSegment action → validate → commit or revert+toast.
- Drag body-to-move: pointer capture, xToFrame under cursor, live preview during drag, single commit
  on pointerup (never save-per-frame).
- Global tier bar above tracks listing globalNodes chips (click → existing global modal). Outside
  frame space per R1.
- Keyframe chips per R3: wide, left-aligned to frame, drag-reposition snapped, click → edit modal,
  mode badge, warning border when img2img missing referenceUrl.
- Length input: snap → clamp [41, cap] → truncate out-of-bounds segments/keyframes WITH confirm toast
  listing what was cut.
- Wire the dead viewMode toggle: 'timeline' renders the structure above; 'list' may remain as compact
  table view — but both must render real content or be removed.
- Toast on EVERY validateSegments/validateKeyframe rejection (add/move/update paths currently silent).

### Phase 5 — Composer persistence normalization

Register thin command wrappers over composer_db functions (now compiling after Phase 2.3):
`get_composer(session_id)`, `save_pipe(payload)`, `delete_pipe(pipe_id)`, `set_keyframe(...)`,
`add_prompt_node / update_prompt_node / toggle_prompt_node / remove_prompt_node(...)`,
`get_or_create_session_settings / save_session_settings`. All `Result<Value, String>`, mapped to/from
PipePayload JSON. Store actions switch from pipes_json blob to normalized tables behind the same
action API — frontend components don't change.

### Phase 6 — Prompt compiler + generate stub honesty

`src/lib/compiler.ts`: PipePayload → structured payload string. Per-tag format from constructRule:
plain → text as-is; json → {"tag":..., "value":...}; markdown → `- {Tag}: {prompt}`.
Ordering: globalNodes first, segments sorted by frameStart, tags within a segment in
TAG_SPECIFICATIONS key order. Live preview panel in ToolsPanel (collapsible, copy button),
recompiles on store change. Generate button stays DISABLED with tooltip until a real generation
backend exists — do not fake progress.

### Phase 7 — Tests & continuous gates

Unit (vitest): snap8n1, clampLength, validateSegments overlap/bounds/minspan, validateKeyframe
source rules, compiler golden cases, store action revert-on-invalid.
Integration (Playwright): create project→session→pipe→add segment→drag knob (assert frame moves on
8-grid)→reload page→state persists via backend.
Every phase ends green: `cargo check` (src-tauri) + `npm run build` + `npm run validate`, then commit
with a descriptive message. One phase = one commit. No bulk scripted file mutation (the fix_*.cjs
pattern caused watcher/cache staleness and lost work before).

---

## Files Inventory

| File | Action |
|------|--------|
| `src-tauri/src/lib.rs` | Restore v0.2.0 wiring; apply Phase 1 fixes; register plugin-log + all commands |
| `src-tauri/src/storage/db.rs` | ?mode=rwc; file-based migrate() incl. 0003; keep Arc<Database> pattern |
| `src-tauri/src/storage/composer_db.rs` | Replace get_conn with pool calls (Phase 2.3) |
| `src-tauri/migrations/0001,0002` | Executed verbatim by migrate(); unchanged content |
| `src-tauri/migrations/0003_align_sessions.sql` | NEW additive column alignment |
| `src-tauri/src/commands/sessions.rs, projects.rs` | Real impls; default profile filter; no stub returns |
| `src/components/Workspace.svelte` | list_sessions on select; returned ids; unsynced badge |
| `src/lib/composerStore.svelte.ts` | NEW reactive store + actions |
| `src/lib/frameMath.ts` | NEW pure snap/validate/clamp helpers |
| `src/lib/compiler.ts` | NEW constructRule compiler |
| `src/components/ComposerPanel.svelte` | Phase 4 restructure; consume store; wire viewMode; toasts on reject |

## Success Criteria for v0.3.0

- [ ] No delete-on-start / fake-header DB logic anywhere in repo
- [ ] Fresh install launches, migrates, persists across restart (both project/session rows)
- [ ] list_projects/list_sessions return real DB data filtered by default profile
- [ ] cargo check + npm run build + npm run validate all green
- [ ] Build fingerprint changes visibly on rebuild
- [ ] Composer renders ruler + per-tag tracks + knob-dragged segments in frame space (R1/R2/R3 hold)
- [ ] All validation rejections produce visible toasts
- [ ] Keyframe img2img without referenceUrl cannot be saved
- [ ] Composer edits round-trip through SQLite (normalized tables)
- [ ] Compiler preview reflects TAG_SPECIFICATIONS formats
- [ ] Playwright E2E: edit → reload → persisted

## Rollback Plan

Phase commits are independent. To roll back phase N:
`git revert <phase-N-commit>` — do NOT revert the whole range (that is how v0.2.0 got lost).
Keep `git tag v0.3.0-phase-N` after each gate passes.

## Revision History

- 2026-08-26 v2: Full saturation rewrite. Added: regression warning + Task 0 recovery from 3514cd3;
  design rules R1/R2/R3; canonical PipePayload contract; phases reordered (schema truth before CRUD,
  timeline before normalization); composer_db get_conn fix; 0003 additive migration; plugin-log;
  build fingerprint; viewMode wiring; silent-validation toasts; compiler phase; test gates;
  per-phase rollback. Superseded: Mutex<Database> proposal (does not compile across await; Pool is
  already Sync), localStorage-only composer plan, "empty file created at startup" claim.
