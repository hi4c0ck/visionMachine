# Bug batch 2026-11-19 — eleven confirmed fixes (1–11)

> User-reported bug list, diagnosed with file:line evidence (4 parallel
> research lanes + parent spot-checks + live Agnes API probes), confirmed
> decisions logged below. Execute as THREE batch commits on
> `feat/bug-batch-nov19` off `c515f25` (feat/director-production-identity tip).
> Gates per batch: `cargo test` (Rust lanes), `npx svelte-check` (0 errors),
> `npx vitest run`, `npm run build`. Never push. One commit per batch; this
> brief is its own docs commit first.

## Confirmed decisions (user, 2026-11-19)

- **Item 8**: user challenged the cached 400 reports → live re-probed (22
  requests, evidence below). Fix = real img2img wiring + inversion at the
  wire chokepoint + honest badges where the provider has no knob.
- **Item 7**: dynamics must be **context-driven**, not a flat mood constant:
  driven by how much generation info the user provides, long-narrative vs
  dramatic-action intent, and the run-scale decision model (pipe count ×
  clip length vs the user-adjustable goal length). Long goal → narrative
  deliberate pacing; short goal + action content → kinetic.
- **Item 10**: **per-boundary** trim sliders + a top-tier master control
  that moves them all. Sign semantics: negative cuts the PREVIOUS pipe's
  tail, positive cuts the NEW pipe's head, 0 = classic lossless splice.
- **Item 5**: mockup frame (HTML→PNG) FIRST for approval, then implement.
- **Scope**: all 11, three batches: ① 1,2,4,11 ② 3,5,8,9,10 ③ 6,7.

## Item 8 live-probe evidence (2026-11-19, key from harness/.env)

Bodies: `scratch/agnes-probe-results/*.json` (request ids inside).

| route | guidance_scale | num_inference_steps | guidance / creativity / cfg |
|---|---|---|---|
| image txt2img | 400 "not supported by text image queue" | 400 same | 400 same |
| image **img2img** | **200** at 0 / 0.5 / 15 / 20 / 30 | **200** at 18 | — |
| video flash `mode:text` | 400 "not an allowed request field" | 400 "forbidden field" | 400 |
| video flash `mode:keyframe` | 400 | — | — |
| video paid 2.5 | 400 (field check precedes size check) | — | — |

`quality` on video: 400 "forbidden field". `GET /v1/models`: no newer video
engine than the 2.5 series. Conclusion: the old catalog comment was
over-generalized from txt2img probes — **img2img accepts both knobs**.
Effect magnitude on bytes is unverified (CDN client-egress 403 gate);
acceptance + range are verified.

---

# Batch ① — reactivity + persistence (items 1, 2, 4, 11)

## Item 1+4 — pipe/session previews + keyframe chips frozen after confirm/terminal

**Root cause (shared, verified against Svelte 5.57.3 runtime source).**
Store data is plain objects in a plain Map (`composerStore/index.ts:36`).
All mutators write IN PLACE (`generation.ts:31,81-86`, `keyframes.ts:53-93`,
`pipes.ts`). `notifyUpdate` → `touchSession` bumps `sessionRevisions[id]`;
`selectedSession` (`Workspace.svelte:168-182`) returns a fresh SHALLOW shell
`{...s}` — the pipes array + pipe objects stay shared by reference (the
anti-heap-ratchet design, comment 122-133). `ComposerPanel.svelte:155`
`pipes = $derived(session?.pipes ?? [])` returns the SAME array → Svelte 5
derived strict-equality (`deriveds.js:86`, `equality.js:4-6`) never bumps
the write version → the keyed each (`ComposerPanel.svelte:887`) never
reconciles → children keep identical pipe prop references →
`KeyframesRow.svelte:77-110` and `ToolsPanel.svelte:319-341` effects never
re-run. Data attach + persistence are CORRECT; only the UI is frozen
(proof: the "Open in preview" click reads the live object and works).

**Fix — one root-cause change + two independent links:**

1. **Pipe-reference replacement.** New shared helper
   `touchPipe(session, pipeId)` in `src/lib/composerStore/pipes.ts`:
   `session.pipes = session.pipes.map(p => p.id === pipeId ? { ...p } : p)`.
   Shallow copy of ONE pipe; untouched pipes keep references (bounds churn,
   preserves the single-producer/one-copy design). Call it LAST (after all
   writes to the pipe) in every pipe-content mutator:
   - `generation.ts`: attachLastGeneration, attachGeneratedImage, markRefStatus
   - `keyframes.ts`: add (upsert + push), remove, update/move paths
   - `subjectRefs.ts`: all ref mutators
   - `pipes.ts`: updateQ, updateC, setMediaMode, setTrimBoundary,
     setCropOverride, rename/resize/add/remove
   - `elements.ts` / `segments.ts` / `tags.ts`: every timeline mutator
   Audit with grep for `pipe.` writes in composerStore; no mutator missed.
2. **Terminal → top-panel re-attach.** In `Workspace.handleTaskTerminal`
   (~2793-2810), after successful attachLastGeneration: when
   `view.sessionId === selectedSessionId` and the top panel is not owning a
   composed session video (or currently shows this pipe's old clip),
   re-attach via the existing `openPreview(pipe)` path. Group runs reach
   the same hook (pipe-terminal → reconcileTerminal → handleTaskTerminal).
   Session-video precedence preserved.
3. **Session re-compose reload.** `attachSessionVideo`
   (`Workspace.svelte:234-260`): append a run-unique cache-bust query
   (`?v=<Date.now()>`) to the resolved URL for the FIXED
   `session-video/session.mp4` path. Safe: the media handler decodes only
   `request.uri().path()` (`media_protocol.rs:113`); the changed src string
   forces the attribute update + a fresh fetch (new HTTP cache key). Pipe
   clips are task-scoped unique paths — no bust needed there.

**Tests.** Re-pin held-reference tests to re-read `session.pipes[0]` after
calls: `tests/unit/generation-store.test.ts:95-163`,
`tests/unit/keyframes.test.ts:113-166` (in-place upsert semantics
intentionally become replace-ref semantics; ID + sibling-field preservation
assertions stay). NEW: `touchPipe` unit test (replaced pipe ref, untouched
siblings ref-stable, array new); mapBackendPipes-style roundtrip assertion
that a mutated pipe propagates a new reference through the store.
No component-mount tests exist; the reactivity chain is runtime-verified.

## Item 2 — mediaMode lost on every session load

**Root cause.** `mapBackendPipes` (`session-io.ts:90-153`) omits
`mediaMode`; `normalizePipe` (`validators.ts:192`) coerces undefined →
`'keyframes'`. Saved (`index.ts:733`) + persisted (`models/composer.rs:322-325`)
but never read back → Reference lock silently reverts on load/switch/restart;
engine (DB `media_mode`, `group.rs:940-946`) and UI disagree.

**Fix.** One field in `mapBackendPipes`:
`mediaMode: p.mediaMode === 'reference' ? 'reference' : 'keyframes'`.
NEW test: backend pipe payload with `mediaMode:'reference'` through
mapBackendPipes + normalizePipe survives (the existing
`composer-integration.test.ts:829-847` pins save only — extend with the
load leg). Do NOT touch dual-model toggle visibility (by design) or the
dead `onmediamodechange` prop (no incidental refactor).

## Item 11 — director generation data lost on restart

**Root cause (4 broken links; flow docs/golden/critic handle ARE persisted).**
- **A — scratch wipe race**: persist `$effect` (`DirectorPanel.svelte:577-601`)
  fires 800ms after mount with `edits:[]` (doc not loaded yet; panel is
  always mounted, `SessionView.svelte:117-129`) and OVERWRITES
  `director_scratch.json` before `hydrateScratch` (542-569) ever reads it.
- **B — error latch**: `flowsLoadedFor = sid` set BEFORE the await (907);
  catch (977-980) only console.warns → a transient listFlows failure at
  cold start latches the session into "no flows" forever (guard 872).
- **C — hydration gated**: hydrateScratch only runs from the
  localExtract seeding effect (490) which bails for pre-engine docs
  (330-335); scratch entry branch dead (565 empty-idea precedence vs
  localStorage draft 191).
- **D — signals write-only**: `director_log_signal` appends
  (`director.rs:689-733`); NO read-back command exists → gate
  confirmations / learning state never re-hydrate.
- Memory-only state: `extractedPrompt` (1125), run log + `runDurationMs`
  (227,1077), `confirmedGates` (220). Mood not on EngineRun → backfill
  resets to 50 when draft lost (1011-1015).

**Fix.**
1. Per-session `scratchHydratedFor` flag: persist effect SKIPS all writes
   (especially `edits:[]` / file-clear) until hydration settled for that
   session; hydrateScratch sets it. Call hydrateScratch from the session
   settle path INDEPENDENT of the engine-gated seeding effect (fixes A+C).
2. Seed-effect catch: clear `flowsLoadedFor` + one bounded retry (1500ms)
   so a transient failure cannot latch (fixes B).
3. Scratch payload gains `extractedPrompt` + `runDurationMs` (additive
   JSON fields; hydrate restores them; old payloads load unchanged).
   Put payload build/merge logic in `directorStore` helpers with unit
   tests (no component-mount harness exists).
4. NEW Rust command `director_list_signals(session_id)` → parsed
   `flow_signals.jsonl` rows (pure read, tolerant of malformed lines);
   register in invoke_handler. DirectorPanel re-hydrates `confirmedGates`
   from gate-confirm signals on session open; Scoreboard learning strip
   shows the real signal count (fixes D).
5. `EngineRun` gains `mood: Option<u8>` (`#[serde(default)]`, additive —
   old docs load None); stamped at run; `backfillEntryFromEngine` prefers
   it over the 50 fallback.

**Tests.** Rust: director_list_signals roundtrip + malformed-line
tolerance; flow_doc additive-mood roundtrip (old doc without mood loads).
TS: directorStore scratch payload build/merge/hydrate helpers (guard
semantics: no write before settled; additive fields survive old payloads).
Pins kept green: `flow_doc.rs:328-368`, `director.rs:1498-1515`.

**Batch ① commit**: `fix(composer+director): batch ① — pipe-ref reactivity bridge, mediaMode roundtrip, director persistence (items 1,2,4,11)`

---

# Batch ② — settings coherence + session/compose UI (items 3, 5, 8, 9, 10)

## Item 3 — Q/C messy between tools panel and generation box

**Root causes (verified).** RC1 stale-seed phantom overrides:
`SessionGenerateModal.svelte:106-123` seeds locals once; in-place row edits
while open make stale-local ≠ new-row → the diff ships the OLD value as a
run override, reverting the panel edit. RC2 range mismatch: modal Q1-50 /
C1-30 (375-380) vs validators Q5-30 / C0.5-15 (`validators.ts:105-110`);
wire overrides unclamped, Rust accepts raw (`generation.rs:350-359`).
RC3 debounce race: engine reads SQLite (`generation.rs:378-400`) but
`confirmGenerate` never flushes the 800ms-debounced saveSession.
RC4 defaults never propagate: addPipe hardcodes 18/7 (`pipes.ts:29-30`),
Director materialize `Pipe::new` 18/7 (`models/composer.rs:402-403`);
global defaults finite-only validated (`guards.ts:139-140`).
RC5 panel sliders edit activePipe with no pipe-name label.

**Fix.**
1. SessionGenerateModal: per-field dirty tracking — the diff map compares
   against the value SEEDED AT OPEN, and unedited fields re-sync when the
   row changes; a phantom override can never ship. (Keep the diff-only
   wire contract: `tests/unit/sessionGeneration.test.ts:104-129`.)
2. One range source: export Q/C min/max/step constants from
   `validators.ts`; consume in ToolsPanel (585-593), SettingsDefaults
   (74-95), SessionGenerateModal (375-380). Clamp pipeParams before send;
   Rust `build_pipe_start` validates PipeParamOverride (defense in depth,
   concrete Err on out-of-range).
3. `await saveSession(...)` flush at the top of confirmGenerate +
   confirmSessionGenerate (kills the DB-read race).
4. Defaults propagation: addPipe + Director materialize receive
   generationDefaults q/c (materialize params additive; `Pipe::new`
   fallback stays 18/7 for legacy callers); range-validate
   generationDefaults in guards.ts + settings.rs sanitize (mirror
   validateQ/CValue; re-pin `settings.rs:372-422` qValue=99 case → clamped).
5. ToolsPanel Q/C sliders labeled with the target pipe name.

**Tests.** NEW: modal seeding/diff reconciliation logic (extract to a
testable helper in `src/lib/` if needed — no mount harness); Rust
override-validation test; settings range-clamp re-pin; addPipe defaults
test (re-pin `composer-integration.test.ts:85-86`).

## Item 8 — Creativity/Quality: real img2img wires + inversion + honest badges

**Ground truth**: live-probe matrix above. img2img accepts
`guidance_scale` (0–30 verified) and `num_inference_steps`; txt2img and
ALL video routes reject every name tried.

**Fix.**
1. Catalog data (`catalog.ts` + Rust `specs.rs` mirror): image 2.5-flash
   gains `guidance: 'guidance_scale'`, NEW `steps: 'num_inference_steps'`,
   NEW `guidanceRange: [0.5, 15]` (product units), NEW
   `img2imgOnly: true` condition flag on both knobs. Type contract
   `types/settings.ts` + `specs.rs` extended additively (absent → old
   behavior: logged only).
2. Shaper (`shaper.rs`): `guidance_value` gates on the img2img condition
   (`ctx.reference_url.is_some()`) AND applies the INVERSION at this
   single wire chokepoint: `wire = (range_min + range_max) - c_value`
   (product higher = more dreaming → wire lower guidance = less prompt
   adherence; provider CFG semantics higher = less dreaming). NEW
   `steps_value` sends qValue verbatim under `spec.steps` (same img2img
   gate; steps direction matches product Q). UI/store/log values stay in
   PRODUCT units — never invert outside the shaper.
3. Honest UI badges (ToolsPanel + GenerateModal + SessionGenerateModal):
   C/Q hint text driven by resolved specs — "img2img keyframes only;
   txt2img & video: not supported by the provider" when the active model
   lacks the knobs; no dead-slider silence. Strings in `constants.ts`.
4. Docs: `docs/agnes-model-catalog.md` Q4 section + catalog.ts comments
   updated with the 2026-11-19 probe matrix (request ids).

**Tests.** Re-pin `shaper.rs:773-786`
(image_gen_guidance_gated_by_spec_flag) → txt2img omits; img2img sends
INVERTED guidance (c=7, range [0.5,15] → wire 8.5) + steps verbatim;
spec without guidance/steps → omitted; inversion math pinned at range
endpoints (c=0.5→15, c=15→0.5). specs.rs additive-deserialize pin kept.
Frontend: badge-logic helper test (resolveSpecs-driven).

## Item 9 — session modal check-all masters (force last frame + 8f trim)

**Current state**: per-pipe checkboxes already wired end-to-end
(`SessionGenerateModal.svelte:138-177,382-395` → diff maps →
`group.rs` force_last_frames / trim_boundary). ZERO backend changes.

**Fix.** Two master controls above the pipe list:
- "Force last frame — all" checkbox: sets/clears every `forceEligible` id
  (interior keyframe-mode pipes, 138-145); indeterminate state when mixed.
- "Experimental 8f boundary trim — all" checkbox: sets/clears every
  `trimEligible` id; visible only when `composeGateOn` (settings
  experimental gate, 168).
Diff maps, onConfirm signature, Workspace wiring unchanged. Strings in
`constants.ts`. NEW vitest: master-toggle logic helper (all/none/mixed →
indeterminate; eligibility respected).

## Item 10 — compose selection modal + per-boundary signed trim

**Current state**: Compose button invokes immediately with `pipe_ids:null`
(Workspace:2384-2387); backend ALREADY supports explicit pipe_ids +
ordering (`generation.rs:1600-1709`). Trim today = boolean head-only 8f
(`composeTrim.ts`, `compose.rs:69-74,310-312`). No compose modal exists.

**Fix.**
1. NEW `src/components/ComposerModals/ComposeSelectModal.svelte`: ordered
   pipe list (name · lengthFrames · lastGeneration status/generatedAt ·
   video path basename), checkboxes (default: pipes with done
   lastGeneration), select-all/none, per-boundary trim slider between
   consecutive SELECTED pipes (stops -24/-16/-8/0/+8), top-tier master
   slider that sets all boundaries. Confirm disabled: <2 selected or no
   ffmpeg. Two-tier card rows per the ui-density rules; token-driven CSS.
2. Workspace.composeSessionVideo opens the modal; confirm passes chosen
   ids as `pipe_ids` + the signed boundary map.
3. Rust: `ComposeSessionVideoInput` gains
   `overlap_frames: Option<HashMap<String, i32>>` (key = the NEW pipe's id
   at each boundary; negative = cut previous tail, positive = cut new
   head). `SourceVideo` gains `tail_trim_frames: u32` alongside existing
   head `trim_frames`; `filter_args` cuts the previous clip's tail
   (`trim=end_frame=...` + atrim lock-step) for negative values; any
   nonzero trim forces the re-encode path. Legacy boolean `trim_boundary`
   map stays supported (maps to +8 head) for session-run auto-compose.
4. `composeTrim.ts` extended: signed map builder + master-set helper;
   `sessionVideoLayout.ts:29-40` subtracts trimmed frames per boundary so
   the playhead→pipe mapping stays correct (fixes the existing 8f drift).
5. Group auto-compose keeps the boolean path unchanged (item 9 masters).

**Tests.** Rust: tail-trim filter_args (+ audio lock-step), signed-map
resolution (negative→previous tail, positive→new head, 0→lossless),
mixed-sign boundaries; re-pin existing head-trim tests. TS:
composeTrim signed-map + master helper tests; sessionVideoLayout
trim-adjusted starts; composeSessionVideo payload shape (pipe_ids +
overlap_frames pass through).

## Item 5 — session progress redesign (MOCKUP FIRST)

**Current state (inventory verified)**: `CompactPipesProgress.svelte` —
560px modal, body `min(46vh,420px)`, ~40px collapsed rows, expanded
stage-bodies stack forever (no auto-collapse), current pipe never
scrolled/pinned (plan S6/P3 required it — never implemented), Overall
band vanishes when busy=false. D6 (no backdrop close, OK disabled while
busy), D10 (minimize + pill), stale read-only rows, compose outcome band
— all must survive.

**Deliverable order**: (a) HTML mockup frame → PNG (ui-mockup-image
skill; production-identity vocabulary; realistic 8-pipe data) for user
approval; (b) implement after approval. Design direction: single-expand
accordion (predecessor auto-collapses on advance), pinned "now
generating" strip above the scroll area, auto-scroll current row into
view, taller/wider body budget, per-row meta chips (stage count ·
elapsed), Overall band persists through compose. State helpers extend
`src/lib/compactPipes.ts` (unit-testable); shared `.gen-stage-*` /
`.gen-progress-*` CSS reused, not forked.

**Batch ② commit**: `feat(composer): batch ② — Q/C coherence, img2img creativity wires, session masters, compose select modal, group progress redesign (items 3,5,8,9,10)`

---

# Batch ③ — director engine (items 6, 7)

## Item 6 — nested zones instead of one flat timeline

**Root cause (verified).** `materialize.rs:83-95` builds ONE
`Segment::new(0, len)` and dumps every plan section flat into it. The
plan's Scene-arc sections TILE the shot 1:1 with S3 sub-slices
(`seed.rs:705-744`, windows `(s0,s1)`); Motion is a bounded sub-window
(785-791), Transition in/out at head/tail (809-868). The composer model
(`models/composer.rs:59-64`), promptEngine (`summarizePipe:188-201` — one
`<segments length>` block per zone, nested closed tag pairs + position
cues) and TimelineSection ALL support multi-zone already. This is the
user's `<timezone><tag1/><tag2/></timezone>` design; materialize starves it.

**Fix — `plan_pipe_to_composer` only (plan emission unchanged).**
1. Derive zone boundaries from the Scene-arc sections (they tile
   [0, shot_f]; no-slice fallback = one full-clip Scene → one zone,
   legacy behavior).
2. For every non-Scene section: clip/split its frame range against the
   zone tiling; emit one tag fragment per intersected zone (same prompt,
   same lane spec). Guarantees containment + no same-type overlap
   (composer-timeline-sla.md). Scene tags map 1:1 into their own zone.
   Motion sub-windows / Transition head-tail land inside their slice
   zones; a crossing transition splits at the boundary.
3. Snap INTERNAL boundaries to the 8-frame grid; merge sub-8f zones into
   the neighbor; pipe ends stay exact. (Plan frames are @24 —
   `derive.rs:18`; the pipe frame space is unchanged, no fps conversion.)
4. Sustained base / global_style unchanged (pipe-scope element).

**Tests.** Re-pin `materialize.rs:174-244` +
`seed.rs:2593-2655` to the nested shape: zone count == Scene-arc count,
zones tile [0,len] exactly, every tag contained in its zone, no same-type
overlap, fragment prompts byte-equal to the source section, 8-grid
internal boundaries. `engine_plan_structure_is_pinned_exactly` UNCHANGED
(plan emission untouched). Golden fixtures: regenerate only if the
contract fixture carries materialized pipes (check at implementation).
NEW: prompt-wire test — a materialized 3-slice pipe through the TS
summarizePipe mirror emits 3 `<segments>` blocks with nested tags
(vitest, pipe fixture from the Rust pin).

## Item 7 — context-driven dynamics (user decision above)

**Root cause (verified, compound).** Cinematic band hardcodes crane+slow
(`seed.rs:2290-2298`) and WHOLESALE OVERRIDES leaf motion (2054-2065);
tree motion intent is 3/4 slow-or-normal (`tree.rs:762-780,821-827`);
branch energy never drives speed (234-239); motion = 1-2s finite window
then hold (785-791); sustained slow bed in global_style (640-660);
`speed_ramp` in vocab but never emitted (`tag_vocabulary.rs:59-61`);
Node A cinematic directive says "slow deliberate moves" (2333-2339).

**Fix — a run-scale-level dynamics resolver (the user's decision model).**
1. NEW `tree.rs::resolve_dynamics(driver, resolved_scale, target_duration_s,
   mood, idea_richness) -> DynamicsBand` — closed enum
   `deliberate | measured | dynamic | kinetic`, deterministic, tested.
   Rule shape: cuts-per-second density (shots_total / target) + driver
   (action/exploration up, atmosphere/character down) + idea clause
   richness; the user-raised goal length grows scenes (narrative) and
   lowers density → deliberate; short goal + action content → kinetic.
   Resolved ONCE in `director_run_flow` next to resolve_run_scale (single
   resolution invariant) and fed to BOTH template + LLM paths.
2. `build_specs_and_timeline`: mood band keeps clip/transitions/effects/
   contrast; motion = leaf-derived intent MODULATED by (branch energy,
   dynamics band) — no wholesale override. High-energy turn leaves keep
   fast_whip at high dynamics; deliberate keeps today's slow/normal.
3. `plan_from_engine` move windows: dynamics scales the move fraction —
   kinetic: move fills most of the slice + a second non-overlapping move
   event mid-slice where the slice is long; deliberate: today's bounded
   48/36/24f windows. `speed_ramp` emitted at dynamic/kinetic transitions.
4. `derive.rs::motion_text`: speed_ramp phrasing + dynamic descriptors
   (closed-vocab token + prose, V2 tag-closure preserved).
5. `MoodProfile::directive`: dynamics-aware Node A line (kinetic →
   "dynamic layered moves, shifting energy"; deliberate → today's text).
6. global_style sustained bed: never a sustained "slow" bed at
   dynamic/kinetic (dominant-speed phrasing).

**Tests.** NEW: resolve_dynamics determinism + ordering (long narrative
goal → deliberate; short action goal → kinetic; pins win); band
modulation preserves leaf fast_whip at kinetic; move-window tiling +
non-overlap at kinetic; speed_ramp closure (V2). RE-PIN (expected drift,
byte-stable deterministic cases): `engine_plan_structure_is_pinned_exactly`,
`mood_drifts_deterministic_structure`, `tree_drives_s2_s3_on_the_entry_path`,
V7 nudge tests, `node_a_body_matches_fixture_contract`, golden fixtures
(regenerate_golden_fixtures). **TS mirror lockstep** (dual-mirrors rule):
`DirectorPanel.svelte:296-492` motionText/moveF + any dynamics surface in
Extract — byte-compatible with the Rust changes.

**Batch ③ commit**: `feat(director): batch ③ — nested zone materialization + context-driven dynamics (items 6,7)`

---

## Standing invariants (all batches)

- Exactly one final producer per rendered state; the store remains the
  single writer (touchPipe replaces refs INSIDE the store, never in UI).
- Tag-closure (V2) + S5 V1..V7 stay clean by construction.
- One resolution of run scale (and now dynamics) in director_run_flow.
- Dual mirrors byte-compatible (Rust plan ↔ TS Extract).
- No incidental refactors; scope = the files listed per item.
- Golden drift is expected on item 7 — say so explicitly in the commit
  body; pin deterministic cases byte-identical.