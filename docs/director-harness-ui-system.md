# Director's Harness — UI Design System (tabbed composer)

> Status: **design document, corrected 2026-10-29 after grill.** Supersedes the
> wizard/plumbing version of this file (commit 17a9025) — the shape was wrong
> (4-step wizard disconnected from the timeline). This version is the
> user-approved shape: one tabbed container inside the composer panel.
> No code is authorized by this document; it is the frozen design contract.
>
> Rust home: `src-tauri/src/generation/video_flow/` (Phase 0, 74 tests green, 44caf03).
> Data types referenced: `FlowDocument`, `ScoreTree`, `SignalRecord`, `VersionTriple`,
> `StructuredVideoPlan` — all on disk, all verified.

---

## 1. The container: composer panel → switchable tabs

The composer panel (today: pipe rows + keyframes/subjects) becomes a **tabbed
shell**. The tab bar sits in the panel header position:

```
┌────────────────────────────────────────────────────────────┐
│ [ Pipes ]  [ Director ]  [ Extract ]  [ Scoreboard ]        │
├────────────────────────────────────────────────────────────┤
│  session context line:  <session name> · 3 pipes · 72f     │
├────────────────────────────────────────────────────────────┤
│  <active tab body — continuous surface, Template A>        │
└────────────────────────────────────────────────────────────┘
```

- **Tabs**: hairline-ruled, no pills, no card wash. Active = 1px `--accent`
  underline + weight 600; inactive = `--text-secondary` weight 400.
- **Quiet badges** (mono, 10px, `--text-muted`): Director `●n` while a run is
  in flight; Extract `n sections` when fresh structural text has never been
  regenerated; Scoreboard `stale` when a newer flow doc exists than the one
  being scored.
- **Session context line** never changes between tabs — one spatial anchor.
- **Pipes tab** = today's composer, byte-identical. It is the before/after
  reference for regeneration.
- **State survives tab switches** (scroll, collapsed blocks, in-flight runs).
  Tab switch = sin-tween crossfade of bodies; no re-mount.

Rationale (I9): the composer keeps working for the current pipe schema while
the harness matures; nothing here touches pipe editing, generation modals, or
the timeline coordinate invariant.

---

## 2. TextBlock — the single shared text component

Every editable text artifact in the harness uses **one** component. Its
geometry is extracted from the modal textareas that already exist:
`.modal-textarea` (`composer-modal.css:98–115`, `resize: vertical`) + the
auto-size measurement pattern from `GlobalPromptModal` / `TagPromptModal`
(`bind:this={textareaEl}` + ResizeObserver-style loop). Nothing new is
invented; it becomes a first-class component at build time.

```
┌ header:  <label>  ────────────────────────────  [ lock ]  ┐
│                                                           │
│   [shared resizable textarea]                      ◉      │
│   ◉ = generation trigger, overlapped bottom-right         │
└ footer:  <word count> · <floor status> ───────────────────┘
```

**Geometry rules**
- Resizable bottom-right grip, `resize: vertical`, min 3 lines, no max.
- **Generation icon (◉)**: the trigger itself (no separate button), anchored
  bottom-right inside the block's padding. Clearance rule: it reserves a
  `max(16px, icon-radius)` no-text zone around itself; when the last typed
  line comes within **16px** of the icon edge, the icon scales down
  continuously (sin-tweened); when text recedes it scales back. It never
  overlaps a glyph. In-flight: ◉ becomes a thin `--accent` progress ring,
  slow constant rotation, disabled.
- **Lock (header, right of label)**: one padlock icon, closed/open.
  - **Open**: fully editable.
  - **Closed**: auto-set the moment generation of this block completes. The
    block **collapses to 1 row** (first line, ellipsized; click = read-only
    expand overlay, still no editing). ◉ hidden/disabled. Changing the text
    requires **manual unlock** → full text re-expands, lock opens.
  - Purpose (user requirement): edit the text *without* accidentally
    triggering regeneration of downstream steps. While closed, no user
    action can re-run a step that consumes this block.
- **Word-floor footer**: live count vs the expand floor (the `novel.rs`
  invariant), `--text-muted` normal, `--warning-color` when under floor.

Lifecycle applied to: **direction block**, **each novel layer block**, and
**Extract section prompts**. Novel layers auto-lock on expand completion;
re-running the structure step is always a deliberate press on the step
chain (§3), never an auto-trigger from an unlocked block edit.

---

## 3. Director tab — the mutation workspace

Vertical stack on one continuous surface:

```
① DIRECTION      TextBlock (direction)                    [lock]
   "a quiet river town at dawn, one fixed camera…"
② NOVEL         layer rows, auto-locked after expand       [lock] each
   primary  184 words ▸    secondary  96 ▸    ambient  41 ▸
   (collapsed to 1 row; click = read-only expand; unlock to edit)
③ STEP CHAIN    4 step rows, one line each:
   expand      v1 · provider LLM · 2.1s · ✓
   structure   v1 · provider LLM · 0.8s · ✓
   critic      v0 · untrained stub · ✓
   lower       v1 · local · ✓
④ RUN           [Run all]   [Re-run from structure]  (secondary, quiet)
```

- **Step row fields are real**: `step_version` lives on each step params
  struct (`config.rs`, all = 1 today); the brain label (`provider LLM` /
  `local`) is the C-SWITCH routing string from the step's config; duration
  measured around the call; status = pass / named failure.
- **Failure display**: a failed row turns `--danger-color`; under it, the
  **named** `FlowError` text verbatim (`structure: unknown tag 'cutaway'`) —
  never a generic "error". This is the LangSmith execution-timeline pattern
  compressed to four rows.
- **Re-run from step N**: re-runs only steps N..end; all blocks producing
  steps < N stay locked. The run's `VersionTriple` records exactly which
  step versions executed → "kept expand v1, re-ran structure v2" is visible
  without a log.
- **In-flight**: downstream blocks dim to 50% (sin-tween, not hidden); the
  producing block's ◉ shows the progress ring.

---

## 4. Extract tab — the final structural text

The fully-stepped, **self-sufficient** text (I4). One block per plan
section, in frame order:

```
────────────────────────────────────────────────────────────
scene          00–24
────────────────────────────────────────────────────────────
  A quiet river town at dawn, one fixed camera…        [copy]
  source: —
────────────────────────────────────────────────────────────
camera         24–48
lighting       48–72
transition     72–80
────────────────────────────────────────────────────────────
```

- **Tag = plain word.** `--text-secondary`, natural case, left of the frame
  range (mono). **No color, no chip, no background** — corrected from the
  first draft (tag-color system retracted; `Motion`→`Zoom` mapping is not a
  clean 1:1, and structural areas have no reason to wear color).
- **Only tags the run actually produced appear.** The list is exactly
  `plan.pipes[0].sections` — no empty rows ever.
- **Provenance line** per section: `source: direction "dawn" · novel:primary¶3`
  when populated. **Data gap (named):** `structure.rs` currently writes
  `from: Vec::new()` (Phase-0 marker structurer); the field +
  `#[serde(default)]` carrier is verified and tested, so the view renders
  `source: —` today and fills in when the LLM structurer (Phase 1b)
  populates `from`. Broken provenance → `FlowError::Provenance` shown
  named, never silent.
- **Three actions, tab top row:**
  - **[Copy all]** — entire structural text, markdown shape, clipboard.
    "Extract" literal: take this text out, regenerate pipes from it later
    (the I4 promise made usable).
  - **[Save]** — persist `FlowDocument` as `flow.v{N}.json` under the
    session root (existing `FlowDocument::save`/`load` + `write_json`);
    versions coexist, never overwrite.
  - **[Regenerate pipes]** — the only visually destructive control:
    `--danger-color` text on `--danger-bg` strip, fixed copy:
    *"replaces N pipes · no fallback · replay via triple v{flow}/v{critic}"*.
    Opens the existing D3-style confirm modal listing the pipe ids that die.
    Routes through the existing `save_composer` command path (I9: the harness
    never writes composer files directly).
- **Diff strip** under the list: per section, current vs last regenerated
  doc: `unchanged / prompt changed / range changed / new / removed` —
  `--text-muted / --accent / --warning-color / --success-color /
  --danger-color`. A pure function over two persisted `FlowDocument`s (the
  "machine-checkable paper edit" pattern): the user sees exactly what
  regeneration will do *before* pressing the destructive button.

---

## 5. Scoreboard tab — four questions, all data on disk

Design target per user: **the system is the primary goal, not live data.**
Every panel exists and renders from Phase-0 data; panels light up as
critic/signal data matures.

### 5.1 Q1 · "Where is the weak spot in this run?" — top block

- Group the run's `ScoreTree` leaves by tag: leaf `s{i}` ↔
  `plan.primary().sections[i].tag` (**verified**: `mod.rs:151` builds
  `CriticSectionView { id: format!("s{i}") }` — ordinal join, 1:1).
- Average leaf score per **used** tag type only (a run with no effects
  shows 5 bars, never an empty effect row).
- **Bars: neutral fill** (`--bg-elevated` body, `--accent` tip), **no
  per-tag color** (retracted). Only color in the block: score number turns
  `--warning-color` below 0.4, `--danger-color` below 0.25. All numbers
  mono.
- Sorted **worst first** — the eye lands on the problem.
- Click a row → culprit sections under it: `range · prompt snippet · you
  re-wrote this n×` (n = `EditDiff` count for that `target_span` from the
  JSONL log; `SignalLog::for_span` already does this filter).

```
weak spots in run #7 · 5 tags used
──────────────────────────────────────────────
  transition   0.20  ▓▓░░░░░░░░░░   ← 2 sections:
      48–52  "hard cut to interior"      re-written 3×
      72–80  "match cut on the boat"     re-written 1×
  effect       0.50  ▓▓▓▓░░░░░░░░
  camera       0.70  ▓▓▓▓▓▓░░░░░░░
  scene        0.85  ▓▓▓▓▓▓▓▓░░░░░
```

### 5.2 Q2 · "Did the update drift quality?" — golden set

- **Flag any run's direction text as golden** (star icon on the run row).
- **Data gap (named):** no `golden` flag exists anywhere yet → additive
  per-session `golden.json`:
  `{ text, flow_doc_version, baseline_scores: [ (section_id, f64) ], starred_at }`.
  One new small file; zero changes to existing types.
- View: each golden direction × current critic version = re-scores,
  diffed against the recorded baseline: `+0.04 / −0.11 / ≈` in mono,
  delta `--success-color` / `--danger-color` past threshold.
- Any golden run regressing past threshold → header strip turns
  `--danger-color`: "2 golden runs dropped since critic v2→v3". This is the
  **stable-quality** requirement made checkable in the UI (the Rust side is
  already pinned by `scoring_tests.rs` replay tests).

### 5.3 Q3 · "Should I keep critic head v3?" — A/B comparison

- Two columns: head v2 | head v3, the same golden direction texts,
  per-section score bars in each column, one quiet **[Promote]** action.
- **No new storage needed:** load two `flow.v{N}.json` docs; require same
  text hash + same `flow_version`, differing `critic_model_version`
  (the triple is stored inside each doc — verified `RegenerationContract.version`).
  The on-device equivalent of Braintrust's prompt playground: local data
  only, nothing exported.
- Empty state: "flag ≥2 golden runs and train 2 heads to compare".

### 5.4 Q4 · "Is it actually learning?" — learning strip (bottom)

One line, top-right: `critic: head v3 · 41 signals · 18 golden · 5 tags covered`.
- Signal tallies: `edit 22 · accept 12 · reject 7` — `SignalLog::counts_by_kind()`
  (exists, tested).
- Coverage: distinct `target_span`s with ≥1 signal / total sections seen —
  the trainer-ready metric.
- **Sparkline**: overall score across the session's persisted `flow.v{N}.json`
  files (the only chart in the tab; deliberately tiny, mono axis, `--text-muted`
  gridline = 0.5).
- **[Accept] / [Reject]** on each run row = the annotation queue: review
  *is* training data (I7 append-only), no separate labeling ceremony.
- Phase-0 display: `critic: untrained (stub)` badge (read from
  `FlowDocument.critic_model.untrained`); strips render their empty states,
  never fake data.

### 5.5 Real-world grounding (why these four)

| Q | Real pattern | Source practice |
|---|---|---|
| Q1 | checkpoint-level bottleneck reports | DirectorBench (arXiv 2605.30090): localizes weak dimensions per unit |
| Q2 | golden-set regression gates | promptfoo / Braintrust / EvalShift: "every production bug becomes a new case"; per-rubric floors |
| Q3 | side-by-side prompt/model A/B before shipping | Braintrust & Arize playgrounds: same inputs, two versions, quality+latency per variant |
| Q4 | implicit feedback / edit-rate learning | Kuaishou skip-rate learning (arXiv 2308.13249, deployed, billion-scale); production feedback-loop practice (accept-unchanged=positive, immediate-regen=negative, **edit rate = strongest**) |
| (exec tracing) | per-step timeline, per-span duration | LangSmith/Langfuse nested-trace dashboards — our step chain (§3) is that, compressed to 4 rows |

---

## 6. Motion & token rules (global)

- **One motion language**: every state change — tab switch, block
  collapse/expand, lock open/close, icon scale, run cascade dim, bar
  entry, drawer open — uses **slow sine easing**, 400–600ms. No bounce, no
  snap, no spring.
- **Data gap (additive, one line):** `design-system.css` currently has
  `--transition-slow: 0.4s cubic-bezier(0.16,1,0.3,1)` which is *not* a
  sin curve. Add `--transition-sin: 0.5s cubic-bezier(0.37,0,0.63,1)` —
  pure additive token, exactly the "step 1 = additive token additions"
  rule in `design-lab.md`.
- Collapse = height + opacity sin-tweened together; text never jumps; the
  1-row locked state glides into place. Progress rings rotate at constant
  slow speed, no speed variation.
- **Color discipline (corrected):**
  - Tags are **words, never colors.** Structural views carry zero tag color.
  - Color reserved for *state* only: score thresholds (`--warning-color`
    <0.4, `--danger-color` <0.25), destructive copy (`--danger-color` on
    `--danger-bg`), run success (`--success-color`), active tab/progress
    (`--accent`).
  - No new color, gradient, or glow anywhere in the harness (Template A
    constraint, `design-lab.md` §3).
- **Type:** `--font-mono` (JetBrains Mono, now defined in
  `design-system.css`) for frame ranges, timecodes, versions, scores, word
  counts. `--font-sans` (Inter) for everything else. Labels natural case;
  hierarchy by weight/size, never uppercase.

---

## 7. Grill results — what survived contact with the data

### 7.1 Survived (verified against repo facts)

| Design element | Evidence |
|---|---|
| Shared resizable text component | `.modal-textarea` class + auto-size pattern already in `composer-modal.css:98–115`, `GlobalPromptModal`, `TagPromptModal` — extracted, not invented |
| Per-step version rows | `step_version: u32` on each step params struct (`config.rs`); `VersionTriple` in `regen.rs` |
| Learning strip data | `SignalLog::counts_by_kind()` / `for_span()` (`signal.rs`, tested); sparkline source = persisted `flow.v{N}.json` (`flow_doc.rs`, save/load verified, called from `mod.rs`) |
| Old→new diff strip | pure function over two persisted `FlowDocument`s |
| Q1 tag grouping | `mod.rs:151` `id: format!("s{i}")` → ordinal 1:1 join with `plan.primary().sections[i]` |

### 7.2 Retracted (first draft was wrong)

1. **Tag-color system** — 1:1 was sold as comfort but `Motion` maps "nearest
   is Zoom" (source comment) and user ruled structural areas color-free.
   → tags are plain words; the 6 `--tag-*` colors are **unused by the harness**.
2. **"Golden runs exist for free"** — no `golden` flag exists in
   `SignalRecord` or `FlowDocument`. → additive `golden.json` per session (§5.2).
3. **Per-tag bar colors** — retracted with #1; bars neutral, threshold colors
   only (§5.1).

### 7.3 Named data gaps + their one-item fixes

| Gap (drawn ahead of data) | Fix (additive only) |
|---|---|
| Provenance chips: `structure.rs` writes `from: Vec::new()` today | view renders `source: —` now; populated by Phase 1b LLM structurer; carrier + `#[serde(default)]` already tested |
| Q3 A/B keyed on two critic versions of one text | no new storage: key on the triple *inside* each `flow.v{N}.json` (same text hash + flow_version, differing critic_model_version) |
| Sin-tween token missing | one additive line: `--transition-sin` in `design-system.css` |
| Signal capture has no production caller | the four plumbing commands of the superseded doc remain the writers (Phase 2b); `append_signal_jsonl` verified + tested, just unwired |
| `golden` flag absent | `golden.json` per session (§5.2) |

---

## 8. Locked decisions

1. Composer panel gains a **tabbed shell**; Pipes tab is byte-identical (I9).
2. One **TextBlock** component for all harness text; geometry from the
   existing modal textareas.
3. **Lock semantics**: auto-close after generation, collapse-to-1-row,
   manual unlock to edit; closed ⇒ no accidental regeneration.
4. **Gen icon** overlapped bottom-right with the 16px no-text-zone rule.
5. Tags are **plain words**; harness uses **zero** tag colors.
6. Destructive actions always carry fixed "no fallback · replay via triple"
   copy and route through the existing `save_composer` path.
7. Scoreboard is **read-first**: four question blocks, empty states honest,
   no fake data.
8. All motion is slow sine; tokens additive-only against `design-system.css`.
9. This document authorizes **no code**; implementation follows it in the
   Phase order of the decision-map.
