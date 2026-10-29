# Video-Flow Harness — Case → Solution Decision Map (TERMINAL deliverable)

> The grind goal was: *explore similar project objectives worldwide to find
> solutions of our cases.* Eight research waves produced the evidence. This
> document is the **integration** — for each of our cases, **the one solution we
> adopt**, the **concrete mechanism** (copyable, not just "some project does
> this"), the **source**, and the **Rust type it lands in** on
> `feature/text-video-flow`. This is the actionable output the exploration was
> for.

Legend: **ADOPT now** (deterministic, repo-owned, testable this branch) vs
**DEFER to seam** (weight/trainer/runtime in the separate critic project) vs
**ADOPT field shape** (copy the schema/field list, don't copy the project).

---

## C0 — the core goal: "keep the real output as close as the user imagined at entry"

**Solution (ADOPT now):** a **coverage-aware faithfulness oracle** judged
against the **user's intent as the complete oracle** (not the real world).
Fidelity = **atomic-claim PRECISION** (no *invented* content) ⊗ **RECALL**
(no *dropped* intent), per-dimension, never holistic.

**Concrete mechanism:**
- Derive the **required-elements checklist** with no golden: **TICK** (judge LLM
  decomposes the instruction into a YES/NO checklist) + **DeCE recall** (criteria
  extracted from the *user's own* required information). *(arXiv 2410.03608 /
  2509.16093.)*
- **Reference-free, deterministic** scoring: **Ragas faithfulness** = decompose
  into atomic claims → NLI-verify each against context (a DeBERTa cross-encoder
  = a cheap deterministic backend) → `supported/total`. The *context* = our
  intent/novel. This is the **HuDA-class floor made algorithmic.**

**Lands in Rust:** extend `critic.rs` — `CriticInput` gains
`required_elements: Vec<ClauseId>`; `ScoreNode` leaf gains
`checks: Vec<AtomicCheck>` where
`AtomicCheck { dimension, claim, verified, evidence_ref, rationale }`;
`DefaultCritic` computes **coverage (recall: intent clauses → sections via
`from`)** + **support (precision: section claims → intent)**. Overall stays
descendable (I2).

---

## C1 — text → structured → generation with mutation layers

**Solution (ADOPT field shape):** the `intent → novel → structured → lower`
spine is **industry norm** (ViMax, novel-to-storyboard, MAVIN, ComfyTV). We keep
it and **add the two layers the field proves are load-bearing but we lack:**
1. an ordered **keyframe / narrative-state sequence** (VideoAuteur "actions,
   captions, keyframes");
2. a **subject/asset registry bound by id** (novel-to-storyboard `*_asset_ids`,
   S2S2T anaphora resolution, MAVIN ID-aware propagation).

**Concrete mechanism:** novel-to-storyboard's output **field list** (
`narrative_arc, llm_shot_code, emotion, estimated_duration (4–15s),
content_lines, scene_blocking, visual_description, *_asset_ids`) + **SKEL
`@openskeleton/spec`** (an open JSON-Schema to *validate* our structured layer
against) + **storyboard2video** ("deterministic render — the picture must be
*computed, not guessed*") as the downstream anchor. MAVIN's continuity
mechanisms (boundary-aware attention, ID-aware mask) are **DEFERRED to the
render side (Phase 4)**; the harness only produces the structured input they
consume.

**Lands in Rust:** `plan.rs` `PlanSection` / `StructuredVideoPlan` gains
`narrative_arc`, `estimated_duration`, `asset_ids: Vec<String>`, and a top-level
`subjects: Vec<SubjectPlan>` + ordered `keyframes`. Validate against a SKEL-style
JSON-Schema (new `validate_schema` step).

---

## C2 — learned per-element fidelity, descending from overall

**Solution (ADOPT now the floor + shape; DEFER the learned ceiling):** a
**two-scale descendable `ScoreTree`** — per-unit leaves + an **aggregate-aware
root** (Memory-Guided B-Roll: per-shot judges + a sequence critic that catches
*only-in-the-aggregate* failures like character drift / repetition).

**Concrete mechanism:**
- Leaf = a **FIRM-Video** "check-before-you-score" checklist (verified-only
  aggregation + natural-language rationales).
- **Reproducible aggregation**: **From Rubrics to Reliable Scores** locks a
  **versioned rubric bundle** (traits / checklist / scoring / hash) so the
  score is deterministic; **RubricArmor** = the gate "can a *bad* plan still
  check every box?" (if yes, the checklist is too weak).
- **User-tunable per-dimension weights** (VideoReward Flow-NRG; Seedance PAS).

**Lands in Rust:** `ScoreNode` gains `checks: Vec<AtomicCheck>` +
`rubric_bundle_id: u32`; `ScoreTree` root gains `aggregate_failures:
Vec<AggregateFault>` so `overall = F2(coverage,support) ⊗ weighted-mean(leaf
dims) ⊕ aggregate`; `CriticParams.dimensions: Vec<{dim, weight}>` (user-tunable).
`DefaultCritic` = the deterministic floor; a learned critic re-scores the *same
tree* later (DEFER via `Critic` trait + `ModelResolver`).

---

## C3 — session-space layers + destructive regeneration

**Solution (ADOPT now):** **source-of-truth inversion** — the **`structured.vN`
layer is the single canonical record**; pipes are a **derived view rebuilt on
demand**; working buffers are **session-ephemeral**. Regeneration is
**per-unit, not whole-flow**: a failed unit is re-derived; approved units are
preserved.

**Concrete mechanism:**
- **dsh-desktop** (a Tauri *harness*) already does this: an **event log holds
  events only; state is a per-session watermark + a persisted projection cache
  `(sessionId, key, ver, seq, val)`** — event-sourcing/CQRS **shipped in a
  local desktop shell** (proves it's not cloud-only).
- **Epicenter/Kohaku/luthier**: "rebuild creates version N+1, **never mutates
  N**"; a **destructive-confirm** gate; `.vN` files + **non-destructive
  migration**; "opening never falls back."
- **polaris-local-first**: "derived data must **never block source backup**;
  only source data is user truth." → we back up the structured layer, never the
  pipes.

**Lands in Rust:** decompose the monolithic `FlowDocument` into
`flow/{intent,novel,structured,fidelity}.vN.json` + `manifest.json` (index +
version triple). `RegenerationContract` → per-element `approved: bool` +
`regen_state` + stable `id`; whole-flow replace = the *all-unapproved* special
case; "rebuild creates N+1, never mutates N." Keep the Phase-4 regen command as
the **only** write to pipes.

---

## C4 — signal-based continuous learning

**Solution (repo captures + the on-device host pattern; DEFER the trainer):** a
**lineage-pair** signal log with **temp vs durable** scopes; a separate trainer
retrains **one additive head** (anti-forgetting), on-device or on a dev machine.

**Concrete mechanism:**
- **tianpan Feedback Surfaces**: track **lineage** — store the model input, the
  model output, **and every edit state, timestamped** → reconstruct a
  **preference pair** (original = *rejected*, final edit = *chosen*).
- **ReelBrain**: **temporary project feedback vs durable memory**; "remember
  this" = a lasting preference; inferred patterns need **repeated evidence +
  confirmation** before they stick.
- **Turn the edit into training data**: **DPO** triple
  `(x=intent/novel, y_l=original output, y_w=final edit)` or **KTO** single
  response + binary label; **DITTO** bootstraps from **fewer than 10 demos**.
- **On-device host** = **llama.cpp GGUF LoRA adapters** (ASLS: train the head,
  *hold the base* via an L2 anchor = anti-forget) — see C6.

**Lands in Rust:** `SignalRecord` → `{ input_ref, output_ref, edited_ref, ts,
scope: Temp|Durable, confidence, context_key }` (lineage pair + ReelBrain scope
+ SelectRM noise flag). The **trainer** (reads the log + a base build, retrains
one additive head, writes an updated `ModelBuildSpec`) is **out of this repo**.

---

## C5 — isolated mutation steps / bounded context

**Solution (ADOPT now):** a **versioned context envelope** per step +
**anti-corruption typed views** (each step sees only its input layer, not the
whole object) + **saved intermediates**.

**Concrete mechanism:**
- **novel-to-storyboard `--save-intermediates`**: "each call does a focused
  job; **context stays clean, doesn't drift**; hard constraints aren't
  ignored" — a *working* open-source precedent for per-step isolation.
- **AgentPatterns "Bounded Agent Step"**: a bad decision "surfaces as a **schema
  violation at a named stage**" → retry-in-place + stage-level isolation.
- **DDD Bounded Context + Anti-Corruption Layer**: each step receives a typed
  *view*; **S2S2T** a lane-based GUI makes per-step traceability visible.
- **ComfyUI topological node + input-fingerprint cache**: a "dirty"/failed
  node re-runs *only that* unit (ties C5 to C3 per-unit regen).

**Lands in Rust:** new `ContextEnvelope { input_layer, step_config,
provenance_boundary, step_version }`; each step fn's signature takes its
**view** (generalize `CriticSectionView`) not the whole `FlowDocument`; persist
intermediates (the C3 layer files *are* the saved intermediates).

---

## C6 — tiny model build spec (local weights / additive heads)

**Solution (repo owns the manifest + resolver seam; DEFER the weight runtime):**
a **`model_package`-style manifest** (base + additive-head sidecars + version +
hash); runtime = **Rust** (hot-swap without reloading the base).

**Concrete mechanism:**
- **ONNX MultiLoRA** `SetActiveAdapters(string[])`; **tinker** two build paths
  (merged-weights vs hot-swappable adapter).
- **llama.cpp GGUF LoRA sidecars** + `convert_lora_to_gguf.py` + runtime
  hot-swap (abeten/llama-cpp-python#1817: multiple adapters at once without
  base reload); **`cera` (crates.io)** = a *Rust* GGUF inference engine → the
  deferred runtime is genuinely **Rust-shippable in our process**.

**Lands in Rust:** `ModelBuildSpec` → `ModelPackageManifest { base: GGUf path,
heads: Vec<{ name, gguf_sidecar, version, sha256 }>, flow_version }`;
`ModelResolver::resolve(role, version)` reads the manifest; activation =
`SetActiveAdapters(head_names)`. The **inference runtime** (load GGUF, run
NLI/judge) is **DEFERRED** to the separate critic project; the repo stays
weight-free.

---

## C7 — "careful text-output tests + versioning covering" (the eval harness)

**Solution (ADOPT now):** generative steps are **not eyeballed** — they get a
**4-layer eval harness**: (1) a **frozen golden dataset** (human-reviewed;
*never* the model-under-test writing its own expected output), (2)
**deterministic assertions** (equals/contains/regex/JSON-Schema), (3)
**LLM-as-judge + metrics** (Ragas/DeepEval), (4) a **CI regression gate** that
blocks the merge when a quality threshold drops.

**Concrete mechanism:**
- **promptfoo / Ragas / DeepEval**: prompt regression in CI, pytest-native
  assertions next to unit tests, golden-dataset + experiment comparison.
- **Non-determinism honesty**: temperature-0+seed does *not* guarantee
  reproducibility → **sample N runs, aggregate, assert properties/thresholds on
  the golden-set average, never exact strings.** Deterministic Phase-0 steps =
  **locked seams**; the LLM step = the **float**.
- **INCONCLUSIVE-blocks**: "missing or inconclusive evidence is **never a
  pass** — no frozen golden / empty baseline / oracle-couldn't-run =
  INCONCLUSIVE, and it **blocks** exactly like a failure."
- **Layer-separated regression** (EvalFlow): check each mutation step's output
  *in isolation* so a broken upstream can't hide behind a fluent final output =
  I1 isolation as an *eval* discipline.
- **Prompt versioning** extends the version triple: the LLM expand prompt is a
  **versioned registry artifact**, so the triple becomes
  `(flow_version, step_versions, prompt_version)`.

**Lands in Rust:** a `FlowEval` harness + a `golden/` corpus (a few entry-texts
→ hand-verified expected coverage / 8n+1 frames / F2 score); the **`prompt`
version** joins the `VersionTriple`; the **INCONCLUSIVE** outcome is a named
`FlowError` that blocks regeneration (the careful text-output discipline made
load-bearing, not aspirational).

---

## The shippable spine, in one line

A **versioned, event-sourced, source-of-truth-inverted session** (C3/C5) whose
**structured layer is the canonical SoT** (pipes = a non-destructive derived
render, regenerated per-unit), fidelity is a **coverage-aware, two-scale,
HuDA-floored, rubric-locked critic** (C0/C2) exercised by a **frozen-golden,
layer-separated, INCONCLUSIVE-blocking eval harness** (C7), learning is a
**lineage-pair signal → additive-head on-device trainer** behind a **GGUF
LoRA sidecar manifest** (C4/C6), every step is a **bounded, cached node**
(C5), and the structured layer carries the **field's load-bearing layers** —
narrative arc, ordered keyframes, and a subject/asset registry (C1).

**Repo-owned (deterministic, testable this branch):** the spine, the layer
files + per-unit `RegenerationContract`, the two-scale `ScoreTree` +
`DefaultCritic` floor + checklist/rubric, the `ContextEnvelope` + typed views,
the `SignalRecord` lineage-pair + `ModelPackageManifest` + `ModelResolver`
seam, and the `FlowEval` golden harness.
**Deferred behind a seam (the separate critic project):** the trained critic
weights + the GGUF/LoRA inference runtime + the trainer.

---

# Wave 9 additions (the three under-covered phrases)

## C1-A — "the video-engine language configuration" = a VERSIONED, typed DSL (ADOPT field shape)
**We adopt:** the structured layer is a **versioned, typed video-DSL** — not ad-hoc
prose fields. The existing, machine-validated DSL space to pick/extend from:
- **video-notation-schema** (JSON-Schema, explicitly versioned v1.0.0)
- **Seedance Prompt JSON v3** (modes + tagged ref ROLES; **"JSON = storage only,
  COMPILE to platform prose before sending"** = our render hand-off boundary)
- **Baton Scene Description (BSD)** (a typed *directorial-INTENT* schema that
  complements OpenUSD's *content* layer — the **intent layer = our "user desire"**;
  the **content layer = our "viable structured" SoT**)
- **SKEL @openskeleton/spec** (flat relational YAML + JSON-Schema + TS types;
  camera/lens/motion/light/mood as *native vocabulary*)

**Lands in Rust:** plan.rs StructuredVideoPlan = **that versioned DSL** (one
schema, versioned); a compile_to_platform_prose(dsl, model) step is the **derived
render** (the Seedance storage→compile boundary); the **intent layer** (BSD) is
kept separate from the content layer (OpenUSD) = our "maintain user desire" split.

## C2-B — "numerous parameters for a better transition" = FROZEN style-contract + 7-layer knobs (ADOPT now)
**We adopt:** the per-step "transition parameters" are a **versioned, FROZEN
param bundle** (the seven layers: Subject / Action / Environment / Camera /
Lighting / Atmosphere-Style / Technicals), **frozen as a STYLE CONTRACT**
(reference image + written style descriptor) and **checked by an embedding
consistency score** (the C2 aggregate-aware root). Not re-derived per step.
**Lands in Rust:** CriticParams/StepParams bundle gains the 7-layer knobs +
a rozen_style_contract (ref + descriptor + embed-check threshold); the
style-contract is a **versioned** field on the FlowDocument (part of the
version triple's "what produced this").

## C8 — PREVENTIVE drift control / re-anchoring to the original intent (ADOPT now, deterministic)
**We adopt:** the *preventive* half of "maintain user desire" — **after EACH
mutation step, re-anchor to the original IntentSnapshot** and DIFF
(goal-probe / arXiv 2505.02709 / 2609.32520): re-derive the *effective* intent,
check "does the structured layer still cover every intent clause?" (C0 recall
**re-checked per step boundary**, not just at the end), and log a **drift
diagnostic**. If it exceeds a threshold → **halt & re-anchor** (or flag
INCONCLUSIVE, C7), *never* let the goal quietly shift (the "slow-cook" SIP).
Per-shot **continuity_in / continuity_out / void** fields (prompt-
storyboard-studio Shot) make "don't drift, don't forget the subject" a
*checkable* property.
**Lands in Rust:** StepResult.reanchored_to + drift: { coverage_delta,
semantic_dist, threshold, ok }; PlanSection/FlowElement gain
continuity_in/out + void; a eanchor() step at each boundary.

## C-table with C8 (final)
| Case | One solution we adopt | Concrete mechanism | Rust home |
|---|---|---|---|
| C0 core goal | coverage-aware faithfulness oracle (precision⊗recall vs intent-as-oracle) | TICK/DeCE/BiFact checklist + Ragas claim+NLI floor | critic.rs |
| C1 spine | keep spine; add narrative-arc/keyframe + subject-asset layers | novel-to-storyboard fields + SKEL/STAGE | plan.rs |
| **C1-A (new)** | **the structured layer = a VERSIONED typed video-DSL, compile-to-prose at render; INTENT layer (BSD) separate from CONTENT layer** | **video-notation-schema / Seedance v3 / BSD / SKEL** | plan.rs schema + compile_to_platform_prose |
| **C2-B (new)** | **transition params = a FROZEN 7-layer style-contract, embedding-checked, versioned** | **on-style-without-drift playbook + 7-layer framework** | CriticParams/StepParams + rozen_style_contract |
| C2 fidelity | two-scale FIRM-Video tree, rubric-locked, user-weighted; floor now, ceiling deferred | RubricArmor gate + Ragas NLI | ScoreNode/CriticParams |
| C3 session | source-of-truth inversion; per-unit regen never mutates N | dsh-desktop Tauri event-log + projection | decomposed layer files |
| C4 learning | lineage-pair + temp/durable signals → additive-head on-device | tianpan + ReelBrain + DITTO → DPO/KTO | SignalRecord |
| C5 isolation | versioned context envelope + typed ACL views + cached nodes | novel-to-storyboard + AgentPatterns + DDD | ContextEnvelope |
| **C8 (new)** | **PREVENTIVE drift control: re-anchor to original intent PER STEP + continuity_in/out/avoid** | **goal probe / 2505.02709 / 2609.32520 + prompt-storyboard-studio Shot** | StepResult.drift + eanchor() step |
| C6 build spec | ModelPackageManifest (GGUF base + LoRA sidecars + sha256) | llama.cpp + cera | learn.rs |
| C7 eval | 4-layer golden + deterministic + judge + CI-gate harness | promptfoo/Ragas/DeepEval + INCONCLUSIVE-blocks | FlowEval + golden/ |

The **shippable spine** now adds C8: *…and every step re-anchors to the
original intent so the "user desire" can't quietly drift (C8), the structured
layer is a versioned video-DSL with an intent/content split (C1-A), the
transition params are a frozen style-contract (C2-B)…*

## C9 — the novel-scale spine (persistent identity + multi-pipe + ambient + audio + hierarchy)
**We adopt:** at the multi-clip / "novel" scale, the structured layer gains the
five layers that only matter there, each with a named mechanism:
- **Persistent IDENTITY state, separated from evolving appearance** (EvoState /
  OneStory / Memento / SlotMemory / REEL): a subjects[] store where a
  persistent-identity slot outlives every pipe; each section's continuity_in
  references it ("the same fox across the whole novel").
- **Ambient-on-own-timeline** (#7): Ambient { description, dynamics } moves
  on its OWN timeline, decoupled from the primary subject (PreciseVideo
  element-wise background dynamics), style-anchored to the frozen style-contract.
- **Audio layer**: per-scene ambience / foreground-SFX / location (LVAS-Agent 4
  stages; SoundStager layered+contextual sound design).
- **Two-tier hierarchy**: a coarse global narrative layer DESCENDS into shot
  layers (MovieDreamer AR-global + diffusion-shot); an aggregate-aware root
  catches whole-film consistency (HoloCine shared self-attention).
- **Per-re-occurrence cross-clip recall**: every reappearing entity is checked
  against its canonical reference (GroundShot); a named-failure → **stage-
  specific repair** from the persistent state (DramaAgent), never a whole-flow
  redo.
**Lands in Rust:** plan.rs gains subjects: Vec<SubjectPlan> (persistent id),
udio: Vec<AudioLayer>, top-level 
arrative: GlobalNarrative (two-tier);
critic.rs root gains per_reoccurrence_recall (GroundShot) + ggregate_root
(HoloCine); egen.rs repair is **stage-specific** (DramaAgent) on a persistent
state. **The critic emits structured signals that refine one unit on the SAME
base (CineCrew) — no global mutation** (confirms C2/C4/C6 at scale).

---

# THE REPO-SHAPE BLUEPRINT (wave-11 synthesis — what we actually ship here)

This is the integration of all 11 waves into a concrete, buildable shape for
eature/text-video-flow. It is the answer to "find solutions of OUR cases":
each case is now *where in the repo it lives* + *the Rust idiom* + *the tool*.

## Crate layout (a pure engine + a Tauri shell, one dependency direction)
`
crates/
  flow-core/      PURE. No Tauri, no fs, no clock, no env. In-memory fixtures.
    events.rs     event log + state machine + schema (oracle.omen-core pattern)
    intent.rs     IntentSnapshot / clauses / SpanId / ClauseId
    novel.rs      layered novel (primary/secondary/ambient) + LayeredExpander seam
    plan.rs       StructuredVideoPlan = the versioned video-DSL (C1-A) + subjects[]/audio[] (C9)
    critic.rs     two-scale FIRM-Video ScoreTree + DefaultCritic floor (C0/C2) + required_elements (C0)
    regen.rs      lower_to_elements + RegenerationContract (per-unit, never-mutate-N) (C3)
    drift.rs      per-step re-anchor + DriftDiagnostic + continuity_in/out/avoid (C8)
    signals.rs    SignalRecord lineage-pair + temp/durable scope (C4)
    model.rs      ModelPackageManifest (GGUF base + LoRA sidecars + sha256) + resolver SEAM (C6)
    config.rs     FlowConfig + per-step params + frozen 7-layer style-contract (C2-B)
  flow-plan/      DSL compile + validation ONLY (oracle.omen-plan) — compiles the
                  video-DSL to the target platform prose (Seedance "storage->compile"),
                  validates against a JSON-Schema (serde_valid = SKEL schema as Rust types) (C1-A)
  flow-runtime/   THE ONLY IO edge (oracle.omen-runtime): fs (session layer files),
                  LLM provider calls, GGUF/ONNX critic cdylib via libloading (C4/C6),
                  session media writes
  flow-eval/      THE C7 HARNESS (C7): insta golden snapshots of each layer's JSON +
                  proptest invariants on pure steps + bolero fuzz on the DSL parser +
                  prompt-registry versioning + INCONCLUSIVE-blocks + CI gate
  critic-runtime/ OPTIONAL (Cargo feature learned-critic). Heavy: ONNX/GGUF/NLI.
                  cdylib loaded at runtime via libloading (zentract pattern). NOT in the
                  default/CI build; the pure core stays weight-free + fast.
src-tauri/        THE SHELL: commands/, AppState, IPC. Depends on flow-* crates only
                  (one direction, never the reverse).
`

## What this *means* for the code already on the branch
Today ideo_flow/ is a module inside src-tauri (good for Phase 0; it ran
weight-free). To ship the full design it becomes the low-core crate:
- **Move** intent/novel/plan/critic/regen/drift/signals/model/config →
  crates/flow-core (already Tauri-free; just relocate + make it a lib).
- **Split off** plan.rs DSL-compile → low-plan; **quarantine** fs/LLM/
  critic-weights → low-runtime.
- **Add** critic-runtime behind feature learned-critic (default OFF) so
  cargo test runs fast + weight-free (Picturesque ADR-0003).
- **Add** low-eval with insta (snapshots) + proptest (invariants;
  failure-persistence = the frozen-golden discipline) + olero (fuzz the
  video-DSL parser) + a golden/ corpus + prompt-registry versioning.
- **Version the data model** with serde-evolve (wire/domain split,
  compile-checked vN->vN+1) + ersion-migrate (load_forward = never-fallback
  open) + serde_valid (the SKEL schema as Rust types).

## The full case -> repo-location table (every case, one home)
| Case | What we ship | Crate | Rust idiom + tool |
|---|---|---|---|
| C0 core goal | coverage-aware faithfulness oracle (precision⊗recall vs intent) | flow-core/critic | required_elements (TICK/DeCE) + Ragas claim+NLI floor |
| C1 spine | intent->novel->structured->lower + narrative-arc/keyframe/subject layers | flow-core | pure fns, in-memory fixtures |
| C1-A video-DSL | versioned typed DSL (SKEL) + intent/content split (BSD) + compile-to-prose | flow-core/plan + flow-plan | serde_valid (JSON-Schema at type level) |
| C2 fidelity | two-scale FIRM-Video tree + rubric-bundle locking + user weights | flow-core/critic | RubricArmor gate; deterministic floor; feature-gated learned ceiling |
| C2-B transition | frozen 7-layer style-contract + embedding consistency check | flow-core/config | a versioned rozen_style_contract field |
| C3 session | source-of-truth inversion; per-unit regen never mutates N | flow-core/regen + flow-runtime | serde-evolve versioned files + dsh-desktop event-log/projection |
| C4 learning | lineage-pair + temp/durable signals -> additive head | flow-core/signals + critic-runtime | DPO/KTO pairs; libloading cdylib (zentract) |
| C5 isolation | bounded context envelope + typed ACL views + cached nodes | 3-crate boundary | flow-core/plan/runtime split (oracle.omen); insta+proptest per step |
| C6 build spec | ModelPackageManifest (GGUF base + LoRA sidecars + sha256) | flow-core/model + critic-runtime | ONNX MultiLoRA / llama.cpp / cera; feature-gated |
| C7 eval | golden + deterministic + judge + CI-gate harness | flow-eval | insta + proptest (failure-persistence) + bolero + prompt registry + INCONCLUSIVE-blocks |
| C8 drift | per-step re-anchor to IntentSnapshot + continuity_in/out/avoid | flow-core/drift | goal-probe diff; DriftDiagnostic; halt-on-exceed |
| C9 novel-scale | persistent identity + ambient + audio + two-tier + per-re-occurrence recall | flow-core/plan + critic | subjects[] store; Ambient/Audio layers; aggregate-aware root; GroundShot recall |

## The three invariants the repo shape *enforces structurally* (not by convention)
1. **Tiny + weight-free by construction:** the default/CI build excludes
   critic-runtime (feature-gated cdylib, zentract). cargo test is fast.
2. **Deterministic core:** low-core has no fs/clock/env (Yerd) — so every
   pure step is a proptest-able, insta-snapshot-able function; only
   low-runtime touches the outside world.
3. **Versioned + replayable data:** serde-evolve wire/domain split +
   ersion-migrate::load_forward = "rebuild creates N+1, never mutates N,
   never falls back" (C3/C9) made into checked code, not a doc promise.

## One-paragraph completion statement
Across 11 waves (81 evidence entries) every one of our cases — C0, C1, C1-A,
C2, C2-B, C3, C4, C5, C6, C7, C8, C9 — now has (a) a named worldwide solution,
(b) a copyable mechanism, and (c) a concrete Rust idiom + crate home in THIS
repo. The "solid independent harness feature a tiny repo can ship" is now a
**pure low-core crate** (deterministic, exhaustively testable, weight-free)
+ a **feature-gated critic-runtime cdylib** (the deferred learned ceiling) +
an **low-eval harness** (insta/proptest/bolero + prompt versioning +
INCONCLUSIVE-blocks). The exploration is complete; what remains is building
this blueprint, not researching it.
