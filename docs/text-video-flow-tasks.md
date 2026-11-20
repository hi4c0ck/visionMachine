# Video-Flow Harness — Task Plan (text → learned-fidelity session-space structure)

Working task file for the **text-to-video flow harness**. Branch:
`feature/text-video-flow` off `develop`. Phases in order; checkboxes = done.

## The locked aim (do not re-litigate)

> **Translate user entry text into a solid, generation-ready structure through a
> few *mutations* that *expand* the entry into *additional layers of content*,
> while *maintaining user desire* and keeping the **real output** as close as
> possible to **the image the user had at entry.**

Locked interpretation (from the recursive grilling rounds):

- **"Close to the user's image" is a *learned property*, not a hand-coded rule.**
  Fidelity = a **local, continuously-trained model** (a built-in model, trained
  manually on signals, trainable on the user's machine). The harness is a
  *consumer* of that model; a **separate trainer** produces it.
- **"Additional layers of content" = verbosity expansion + ambient
  independence.** "Girl walks into forest" → *also* atmosphere grade, the
  forest, the road, and non-main content that **lives on its own dynamics**
  (birds, wind, a distant figure). Layers, not a single flat text.
- **The harness does NOT touch the current pipe schema.** It lives in
  **session space**; the **final step *regenerates* pipes** (destructive, no
  fallback), not a fallback to existing pipe data.
- **That's why versioning started early:** a destructive replace is only safe
  to replay when the *exact* version triple that produced it is recorded.

## Locked invariants (I1–I9, all test-pinned)

- **I1 — Isolation.** Each mutation is a pure function of *its own typed input*
  + its config + scoped provenance. Expand never sees `Structured`; structure
  never sees intent clauses beyond span ids; critic sees only `CriticInput`;
  lower sees only `Structured`; regen sees only `Lowered`.
- **I2 — Descendable score.** `ScoreTree.overall == combinator(leaf scores)`.
  The overall is *derived* (Mean / Min / Weighted, configurable), never a
  free value → a user can always open it and see which element dragged it.
- **I3 — Provenance chain.** Every produced element traces: element →
  structured section → novel span → intent clause (`SpanId` / `ClauseId`).
- **I4 — Self-sufficient.** The structured text is viable to lower into
  elements *without* referencing the current pipe state.
- **I5 — Destructive + versioned.** `RegenerationContract` replaces pipes;
  `fallback: None` by construction; it records the `(flow_version,
  step_versions, model_version)` triple.
- **I6 — Tiny build spec.** A local model is `LocalWeightsOnly` **or**
  `Additive { base, heads }` (LoRA/adapter-style): a new signal retrains one
  head without touching the base.
- **I7 — Append-only signals.** `flow_signals.jsonl`, one record per
  preference event; the trainer replays history deterministically.
- **I8 — Verbosity layers.** The novel adds atmosphere / environment /
  ambient-with-own-dynamics layers on top of the primary.
- **I9 — Pipes untouched.** The harness emits its own `FlowElement`, NOT
  `composer::Pipe`. `steps/materialize.rs` is a *deferred* composer-adapter,
  off-mission until pipes are regenerated.

## Locked forks (from the last two rounds)

- **F-A — critic target = the *text-side* transition** (`intent → structured`),
  scored now; the *rendered-video* quality layer is a **future head** on the
  same critic (`SignalKind::Rate` is the seam for it).
- **F-B — local model = base + additive heads**; the build spec enumerates
  the heads.

## Module map (`src-tauri/src/generation/video_flow/`)

```
mod.rs          orchestrator VideoFlow::run_full (→ FlowDocument) + plan_only + run (phase0 back-compat)
config.rs       FlowConfig + per-step params (expand/structure/materialize/critic/learn),
                ScoreCombinator, FLOW_VERSION=1
error.rs        FlowError (EmptyInput/TextOutput/Structure/Materialize/UnknownTag/
                Overflow/LlmNotConfigured/Critic/Lower/Model/Provenance/Signal)
intent.rs       IntentSnapshot (ground truth), decompose_clauses, SpanId, ClauseId, AssetRef
novel.rs        Novel (primary + secondary + ambient), LayeredExpander + PassthroughLayeredExpander
plan.rs         VideoTag, PlanSection (+ from: Vec<SpanId>), PlanPipe, StructuredVideoPlan
critic.rs       ScoreTree (descendable I2), Critic trait + DefaultCritic stub, CriticInput
learn.rs        ModelBuildSpec (LocalWeightsOnly / Additive), ModelResolver + StubModelResolver
signal.rs       SignalRecord, SignalLog, append_signal_jsonl, SignalKind (I7)
regen.rs        lower_to_elements (→ FlowElement, I4/I9), RegenerationContract (I5), VersionTriple
flow_doc.rs     FlowDocument (the session-space persisted artifact, triple-versioned)
steps/expand.rs      Phase-0 deterministic expander (text → flat novel)
steps/structure.rs   MarkerStructurer (marker grammar → StructuredVideoPlan)
steps/materialize.rs Deferred composer-adapter (off-mission, I9) — kept for back-compat
```

## Phase 0 — deterministic spine + learned-fidelity scaffolding  ✅

All deterministic; every LLM / local-model / trainer concern sits behind a
trait so the Phase-0 pipeline is fully testable with zero external deps.

- [x] `intent` → `novel` (layered) → `structure` → `critic` (descendable
      ScoreTree) → `lower` (FlowElement + trace) → `regen` (destructive
      contract + version triple) → `FlowDocument` (session-space artifact).
- [x] **Tiny build spec** (`learn.rs`): `LocalWeightsOnly` | `Additive(base,
      heads)` + a weight-free `StubModelResolver`.
- [x] **Signal log** (`signal.rs`): append-only JSONL, `SignalKind` =
      EditDiff / Accept / Reject / Rate (Rate = the F-A rendered-layer seam).
- [x] **Provenance** (`SpanId`/`ClauseId` + `PlanSection.from`): the I3 chain
      is now real, not aspirational.
- [x] **Critic invariant tests** pin I2 (overall = combinator(leaves); a
      hand-built bad tree fails `verify_descendable`).
- [x] **Regeneration tests** pin I5 (destructive, no fallback, triple wired
      + round-trips).
- [x] **Session-space artifact** (`FlowDocument`) pins I4 + versioning
      (save/load under the session root, default filename `flow.v{N}.json`).

**Tests: `cargo test --lib video_flow` = 63/63; full `generation` = 224/224.**
`cargo check` clean (only the 2 pre-existing `composer.rs` dead-code warnings).

## Phase 1 — LLM expand (provider LLM) + local structurer

- [ ] `LlmExpander : LayeredExpander` — the **provider LLM** (provider
      settings, F-A) writes the *layered* novel (primary + secondary +
      ambient). Seed from `ExpandParams.seed` when the model supports it.
- [ ] `LlmStructurer : TextStructurer` — local; emits the *same marker
      grammar*, parsed by the deterministic `MarkerStructurer` core. A bad LLM
      marker is a named `UnknownTag`/`TextOutput` error, not a silent drop
      (the "careful text output" guarantee is kept by validation, not trust).
- [ ] Bump `expand.step_version` / `structure.step_version` additively.
- [ ] Tests: LLM novel clears `validate_novel`; LLM marker → valid plan;
      malformed marker → named error; caps still enforced.

## Phase 2 — real critic (local model via the build spec)

- [ ] A **trained** `Critic` behind the `Critic` trait, resolved by
      `ModelResolver` from `learn.rs` (a real, non-stub `ModelBuildSpec`).
      `DefaultCritic` stays the untrained fallback.
- [ ] **Score descent stays I2** — the trained critic must still pass
      `verify_descendable`; a head that breaks the descent fails the run.
- [ ] `SignalKind::Rate` (rendered-video quality) lands as a *future head*
      (F-A) — the critic's target moves from text-side to the rendered clip
      without changing the tree shape.

## Phase 3 — signals → separate trainer (the "continuously on the user's
machine" path)

- [ ] The harness **captures** `SignalRecord`s (EditDiff / Accept / Reject /
      Rate) into `flow_signals.jsonl` (I7). **It does not train.**
- [ ] A **separate** trainer consumes the log + retrains one **additive head**
      (F-B) without touching the base. The trainer lives *outside* this module
      (a build / training tool); the harness only points at the produced build
      via `ModelBuildSpec` / `ModelResolver`.
- [ ] Tests: a signal log round-trips; a retrained head is referenced by a
      newer `ModelBuildSpec` that the resolver loads; an old flow doc still
      replays on the old version (the I5 payoff).

## Phase 4 — regeneration wiring (session domain)

- [ ] `commands/generation.rs` gains a **regeneration contract** command
      (thin; delegates to `VideoFlow::run_full` + `RegenerationContract`).
      The UI reads the `FlowDocument` from the session and, on approval,
      **destructively replaces** the session's pipes from `contract.elements`
      (I5/I9 — the harness never mutated the pipes; this is the only write).
- [ ] Frontend flow service mirrors `pieceGeneration.ts`:
      `runTextFlow(sessionId, text, overrides)` → invoke command; render the
      `StructuredVideoPlan` + `ScoreTree` preview + the version chip.

## Phase 5 — validation

- [ ] `cargo test` full + `npx vitest run` + `npx svelte-check` once UI lands.
- [ ] Golden corpus: a few entry-texts with hand-verified expected
      `ScoreTree` + `FlowElement` trace, so the fidelity invariants are
      asserted against real examples, not just synthetic markers.

## Guardrails (do not repeat)

- cargo builds: **unsandboxed host shell only** (WSL/bubblewrap + /mnt/d = I/O
  hang). `git commit -F <tempfile>` for long messages. Big writes → chunk.
- Don't touch the reserved `models/viewmodel.rs` state machine.
- **Do not write `composer::Pipe` inside the harness** (I9). The only place
  pipes are written is the Phase-4 regeneration command, *from* the harness's
  `FlowElement`s.
