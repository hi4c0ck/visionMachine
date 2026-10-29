# Director's Harness — UI System Spec

> Status: **DECLARED (design frozen for Phase 1–3), not yet built.**
> Companion to: `docs/video-flow-solutions-map.md`, `docs/video-flow-case-decision-map.md`.
> Rust home: `src-tauri/src/generation/video_flow/` (Phase 0 done, 74 tests, commit 44caf03).
> This doc declares the **entire UI surface** the director's harness will expose, so
> Phase 1 (LLM slots) and Phase 2 (fidelity loop) are built *against this contract*
> instead of discovering the UI shape later.

---

## 1. Scope and non-goals

**In scope:** every view, command, state, and error surface needed for a user to
`entry text → review the structured plan → signal accept/reject → apply regeneration`,
and for the app to capture those signals for on-device learning.

**Out of scope (locked):**
- No trainer UI. The trainer is a separate binary consuming `flow_signals.jsonl`
  (I7). The app only captures and *loads* trained heads via `ModelResolver` (`learn.rs`).
- No model-settings screen. The LLM expand step (1a) reuses the **existing**
  provider settings system: `src/components/Settings/ProviderCard.svelte`,
  `ProviderStatus.svelte`, and `src/lib/settings/store.ts` (`getSettings`).
  The open LLM prompt is a harness concern, not a user-facing setting.
- No `composer::Pipe` editing from the harness UI (I9). The composer keeps its own
  tools; the harness only *replaces* pipes through `RegenerationContract` (3b).
- No rendered-video critic UI in Phase 1–2. `SignalKind::Rate` exists in `signal.rs`
  but has no UI surface until the critic moves to the rendered layer (Phase 2d+).

---

## 2. The existing UI system (what we plug into)

Grounded facts, as of commit 44caf03:

| Fact | Where |
|---|---|
| App shell: `App.svelte` → `Workspace.svelte` + `Footer` + `ErrorHandler` + `WindowControls` | `src/App.svelte` |
| Tool selection: `activeTool: string \| null` (`$state`), set via `onselect` | `Workspace.svelte:67`, `:2465` |
| Focus model: `ComposerFocus { level: 'project' \| 'session' \| … }`, breadcrumb ancestors via `onfocuschange` | `Workspace.svelte:90`, `ToolsPanel.svelte` props |
| Inspector pattern: `ToolsPanel` receives `session`, `project`, `focus`, `qValue`/`cValue` (quality/creativity) and renders context-sensitive sections | `src/components/ToolsPanel.svelte` |
| Modal system: `ComposerModals/*` + shared `composer-modal.css` (accent confirm/cancel buttons, `--accent` = `#ff3e00`) | `src/components/ComposerModals/`, `composer-modal.css` |
| Store architecture: per-domain modules in `src/lib/composerStore/` (`pipes.ts`, `segments.ts`, `tags.ts`, `elements.ts`, `generation.ts`, `sessionGeneration.ts`, `validators.ts`, `migrations.ts`, `session-io.ts`, …) | `src/lib/composerStore/` |
| Backend bridge: `invoke` from `@tauri-apps/api/core`; commands in `src-tauri/src/commands/*.rs`, registered at `lib.rs:480` via `tauri::generate_handler!` | `src-tauri/src/commands/` |
| Existing progress modals: `GenerationProgressModal.svelte`, `CompactPipesProgress.svelte` — the pattern for long-running pipeline steps | `src/components/ComposerModals/` |
| Toasts: `src/lib/flashToast.ts`; global error surface: `ErrorHandler.svelte` | `src/lib/`, `src/components/` |
| Session media layout: sessions carry `directory_path`; flow docs persist as `flow/flow.v{N}.json` under the session root (`FlowDocument::save`, reuses `media::write_json`) | `video_flow/flow_doc.rs` |

**Placement decision:** the director's harness is a **new tool** in the workspace
tool system — `activeTool = 'director'` — rendered in the inspector slot
(`ToolsPanel` region), with its own modal set. It does **not** replace the
composer tool; it coexists. Rationale: I9 — the composer stays fully functional
for the current pipe schema while the harness matures separately.

---

## 3. Views (four, all under one tool)

The director tool renders one vertical inspector with four collapsible views,
mirroring the pipeline stages of `VideoFlow::run_full` (`video_flow/mod.rs`):

### 3.1 V1 — Entry & Run
- **Content:** plain-text editor (the user's entry text), a **Run** button, and a
  step progress strip: `expand → structure → critic → lower` (each lights up as
  the command returns; the backend runs the whole flow synchronously — progress
  is coarse at flow-level, not token-level).
- **State:** `idle | running | ready | error`. While `running`, the Run button
  is disabled and the strip animates (pattern: `GenerationProgressModal`).
- **Wiring:** calls `director_run_flow` (§5). On success, stores the
  `FlowDocument` in the director store (§6) and switches to V2.
- **Errors:** `FlowError` mapped per §7 (e.g. `EmptyInput` = inline validator
  message under the textarea, not a toast).

### 3.2 V2 — Plan (the structured text)
- **Content:** the `StructuredVideoPlan` as an editable list of sections:
  `VideoTag` (camera/lighting/…), frame range `start–end`, prompt text.
  Header row shows pipe `title` + `global_style`.
- **Editing is signal capture (I7):** every prompt/range edit, on commit
  (blur or Enter), appends an `EditDiff` `SignalRecord` via
  `director_log_signal` (§5), `target_span` = the section's stable id
  (`p{pipe}:{tag}:{start}..{end}`, the label `regen.rs` already derives).
- **Provenance (I3):** each section row shows its `from: Vec<SpanId>` spans as
  clickable chips → hover shows the originating intent clause text
  (`FlowDocument.intent`).
- **Wiring:** reads/writes the director store; edits are local until the user
  Accepts or Regens (§3.4).

### 3.3 V3 — Scores
- **Content:** the `ScoreTree` rendered as a **descending tree**: root
  (overall) → section leaves, leaf score as a 0–1 bar, combinator shown
  (`mean | min | weighted`) from `CriticParams`. The user can click any leaf;
  V2 scrolls to that section (two-way link, V2↔V3).
- **Phase 0 display:** `DefaultCritic` produces all-0.5 leaves — the view still
  renders, with a badge `critic: untrained (stub)` read from
  `FlowDocument.critic_model.untrained`. This makes the *shape* visible before
  the real model lands (2a).
- **Invariant shown:** a footnote line `overall = combinator(leaves)` with the
  live computed value — the I2 property the tests pin, surfaced to the user so
  "quality" is always an explainable number.

### 3.4 V4 — Contract & Apply
- **Content:** the `RegenerationContract` in plain terms:
  - version triple, read-only: `flow v{flow_version} · step {expand}/{structure}/{critic} · model v{critic_model_version}`
  - element count + "replaces N pipes, **no fallback**" warning (I5, fixed copy —
    the word *destructive* is always visible)
  - two actions: **[Accept]** (captures `Accept` signal, persists
    `FlowDocument` via `director_save_flow`) and **[Apply to session]**
    (opens the destructive-confirm modal §3.5, then calls `director_apply_regen`).
- **[Reject]** (captures `Reject` signal) sits next to Accept.

### 3.5 M1 — Destructive-confirm modal
- New `ComposerModals/DirectorRegenModal.svelte`, styled by `composer-modal.css`.
- Shows: which pipes will be replaced (count + ids from the contract), the
  version triple, and the fixed line *"There is no fallback — replay uses the
  recorded version triple."* Confirm is the accent button; cancel is the
  neutral one (both classes already in the modal CSS).

---

## 4. State machine (the whole tool, one machine)

```
idle ──Run──▶ running ──ok──▶ ready(plan view)
                 │err
                 ▼
            error ──fix input──▶ idle
ready ──edit sections──▶ ready(dirty)        [EditDiff signals appended]
ready(dirty) ──Accept──▶ accepted            [Accept signal, doc persisted]
ready(dirty) ──Reject──▶ rejected            [Reject signal, run discarded]
accepted ──Apply──▶ applying ──ok──▶ applied (pipes replaced, contract closed)
                        │err
                        ▼
                    apply-error (I5: NO rollback — message says "pipes unchanged,
                    regeneration failed: {FlowError}"; user can fix and re-Apply)
```

Rules:
- `applied` is terminal for that triple: re-running the flow starts a fresh
  `FlowDocument` (new `flow.v{N}` coexists on disk — `flow_doc.rs` versioned
  filename, so history is preserved by construction).
- `apply-error` never restores old pipes (I5 forbids a fallback path); the
  only recovery is fixing the error and re-applying.

---

## 5. Tauri command surface (new file `src-tauri/src/commands/director.rs`)

Registered in `lib.rs` `generate_handler!` alongside `commands/composer.rs`
and `commands/generation.rs`. All return `Result<_, String>` like the existing
commands; errors are the `FlowError` Display strings (§7 keeps the mapping
stable).

| Command | Args | Returns | Notes |
|---|---|---|---|
| `director_run_flow` | `session_dir: String, text: String` | `serde_json::Value` (a `FlowDocument`) | Calls `VideoFlow::default_flow().run_full(&text)`; persists the doc to `<session_dir>/flow/flow.v{N}.json` |
| `director_load_flow` | `session_dir, flow_version: u32` | `FlowDocument` | `FlowDocument::load` — restores V2–V4 from disk |
| `director_log_signal` | `session_dir, kind: String, target_span: String, note: Option<String>` | `()` | Maps `kind` → `SignalKind`, `ts = now`, `record_id = SpanId`-style counter; `append_signal_jsonl` to `<session_dir>/flow/flow_signals.jsonl` (I7: append-only, never rewritten) |
| `director_apply_regen` | `session_dir, flow_version: u32` | `Vec<pipe ids replaced>` | Loads the doc, calls the materialize adapter (`steps/materialize.rs`, I9: the only composer touchpoint, deferred-by-design), writes pipes through the **existing** `save_composer` command path — the harness never writes composer files directly |

Constraints the UI must honor (locked):
- No command bypasses the triple: `director_apply_regen` re-validates
  `contract.version` matches the doc's `version_triple()` before replacing.
- `director_log_signal` accepts only the four `SignalKind` strings
  (`edit_diff`, `accept`, `reject`, `rate`); unknown kind → `Signal` error.
  (`rate` has no UI caller until Phase 2d+.)

---

## 6. Director store (new `src/lib/directorStore/`)

Mirrors the `composerStore/` module style, one small module:

| File | Owns |
|---|---|
| `index.ts` | `directorStore`: `state: { status, document: FlowDocumentJSON \| null, dirty, applyState }` + actions `run`, `editSection`, `logSignal`, `accept`, `reject`, `apply` — each action = invoke + optimistic store update + toast on error (`flashToast`) |
| `types.ts` | TS mirror of `FlowDocument` / `ScoreTree` / `RegenerationContract` / `SignalRecord` (camelCase — identical to the Rust `#[serde(rename_all = "camelCase")]` wire shape, so no conversion layer) |
| `provenance.ts` | `from` span-id → intent clause text resolver (feeds V2 chips, V3 footnotes) |

The store is **separate from** `composerStore` on purpose: I9 at the UI layer.
Only `apply` crosses into composer state, and only through `save_composer`.

---

## 7. Error surface (FlowError → UI, complete table)

Every `FlowError` variant (`error.rs`, 13 variants) has exactly one declared
UI destination. No variant is silently swallowed, no variant becomes a
generic "error":

| Variant | UI destination | Presentation |
|---|---|---|
| `EmptyInput` | V1 textarea | inline validator message under the input |
| `TextOutput(String)` | V1 / V2 (step that failed) | step progress strip flags the step; message = the Rust detail string, verbatim |
| `Structure(String)` | V1 strip (`structure` step) | same pattern |
| `Materialize(String)` | M1 result | apply-error state (§4) |
| `UnknownTag(String)` | V2 section row | red chip on the offending tag: `unknown tag '{kw}'` |
| `Overflow(String)` | V2 | banner: `limit overflow: {detail}` |
| `LlmNotConfigured` | V1 Run button | button disabled + hint `no LLM provider configured` → link to the existing Settings modal (`ProviderCard`) |
| `Critic(String)` | V3 | scores view renders last-good tree + banner `critic: {detail}` |
| `Lower(String)` | M1 result | apply-error |
| `Model(String)` | V3 badge / M1 | `model build: {detail}` |
| `Provenance(String)` | V2 chips | chip strike-through + `provenance: {detail}` |
| `Signal(String)` | V4 | toast only (signal capture never blocks review) |

Global fatal (command-level panic / I/O): `ErrorHandler.svelte` (existing),
no harness-specific copy.

---

## 8. Component file map (to be created, Phase 3a)

```
src/components/Director/
  DirectorPanel.svelte        # inspector body: hosts V1–V4, owns view switching
  director-view-input.svelte  # V1
  director-view-plan.svelte   # V2 (section rows, provenance chips, edit commit)
  director-view-scores.svelte # V3 (tree + bars + combinator footnote)
  director-view-contract.svelte # V4 (triple, count, accept/reject/apply)
src/components/ComposerModals/
  DirectorRegenModal.svelte   # M1
src/lib/directorStore/        # §6
src-tauri/src/commands/
  director.rs                 # §5 (registered in lib.rs generate_handler!)
```

Reuse, do not recreate: `composer-modal.css` (M1), `flashToast` (toasts),
`GenerationProgressModal` pattern (V1 strip), `SettingsModal`/`ProviderCard`
(`LlmNotConfigured` hint link).

---

## 9. Signal capture contract (UI action → I7 record, complete)

| User action | SignalKind | target_span | note |
|---|---|---|---|
| Edit a section prompt/range, commit | `EditDiff` | section id (`p0:camera:0..24` style) | old/new diff, short |
| **[Accept]** | `Accept` | `root` | — |
| **[Reject]** | `Reject` | `root` | optional one-line reason |
| (future) rate a rendered video | `Rate` | element id | 0–10 value |

Invariants: one line per event, `ts` = capture time, `record_id` unique per
session log; the file is **never** truncated or reordered (I7 — the trainer
replays it). The UI has no UI to view raw signals in Phase 1–3; that's a
debug tool, not a user feature.

---

## 10. Phase mapping (which UI piece unlocks which backend step)

| Phase | UI deliverable | Backend dependency |
|---|---|---|
| 1 | V1 usable with real LLM expand/structure content (strip + plan); V2/V3/V4 render from real docs | 1a/1b LLM slots (uses existing provider settings, no new UI config) |
| 2 | V3 shows real scores (drop the "untrained" badge); V4 captures Accept/Reject → signals file | 2a local critic, 2b signal wiring (V2 edits already emit EditDiff from Phase 1) |
| 3 | DirectorPanel wired into the tool system (`activeTool='director'`); M1 + `director_apply_regen` | 3b materialize adapter |

The spec is ordered so **nothing in §3–§9 blocks Phase 1**: V2–V4 can render
Phase-0 stub documents immediately and simply get better data as phases land.

---

## 11. Locked decisions (do not re-open without a case-map entry)

1. Director = **new coexisting tool**, not a composer replacement (I9).
2. LLM settings = **existing** `Settings/ProviderCard` system; no new config UI.
3. Regeneration is **always modal-confirmed** with fixed destructive copy (I5).
4. Signals are **captured, never displayed raw** in Phase 1–3 (trainer is external).
5. Store is a **new `directorStore`**; only `apply` crosses into composer state.
6. All wire types are camelCase mirrors of the Rust `FlowDocument` — one
   `types.ts`, zero conversion code.
