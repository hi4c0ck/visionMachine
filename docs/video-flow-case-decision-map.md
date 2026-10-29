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
- **dsh-desktop** (a Tauri *wrapper* of DeepSeek Harness; **Wave-13: directional
  desktop precedent — its event-log + projection-cache passage is a
  proposed-architecture note, not a shipped system**) describes our model: an
  **event log holds events only; state is a per-session watermark + a persisted
  projection cache `(sessionId, key, ver, seq, val)`** — event-sourcing/CQRS
  **expressible in a local desktop shell** (proves it's not cloud-only; the
  pattern itself is *ours to ship*).
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

**Local model target catalog + license constraint (Wave-17):** the "local
weights or additionability" side names the **5 open-weights video families
our spec should accommodate** — `Lightricks/LTX-Video` (13B, distilled, up to
60s, IC-LoRA), `Wan-Video/Wan2.2` (TI2V-5B runs on 8GB VRAM via Q8-GGUF +
offload; S2V-14B audio-driven; ComfyUI-integrated), `zai-org`/`THUDM
CogVideo` (Apache-2.0; official LoRA rank-128 DDP/fp16 finetune path),
Tencent `HunyuanVideo` (open-source systematic framework), and `MiniMax H3`
(33B FL2VA + Ref2VA on HuggingFace; 4–15s 2K with native stereo audio).
Two consequences for the build spec:
- **VRAM shape drives the "tiny" framing:** base weights stay **external**
  (user-provided or first-run download); the **in-repo artifact is the
  `ModelBuildSpec` + additive-adapter manifest only**. This matches the
  `ModelBuildSpec { LocalWeightsOnly{file} | Additive{base, heads} }` already
  in `learn.rs` — the spec points at a base file, it does not ship one.
- **LICENSE CONSTRAINT — `MiniMax H3` weights are under a Community License
  whose EXCLUDED TERRITORIES are the EU, UK, Korea, and US.** Therefore a
  "tiny build spec" that *bundles* H3 weights in-repo would violate that
  license in those geos. The manifest must carry a **license +
  excluded-territories field per base model** so the resolver can
  reject/flag an incompatible base at `resolve()` time. (Other 4 families
  are permissive/Apache-2.0 and can be bundled; H3 cannot, given the
  territory clause.)

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
- **MSML — Movie Script Markup Language (ACM DocEng 2009, DOI
  10.1145/1600193.1600231; Wave-18)** = the *published, peer-reviewed*
  precedent that a STRUCTURED, MARKUP-BASED film description language is a
  first-class artifact (a document specification for screenplay narrative
  structure). This is why our structured layer is a **versioned typed DSL**
  rather than ad-hoc prose — there is a 2009 academic primary for the
  markup-language shape, not just the 2026 generative systems above.

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
**Academic grounding (Wave-18):** the "on-style-without-drift" idea is no
longer a commercial playbook flag — **EvoState 2606.16184** makes continuity
*state-anchored*: an entity-centric evolving visual state that separates
persistent identity anchors from evolved states, so style/subject persist
across shots; **PermaVid 2606.16449** keeps consistency *across edits* by
disentangling appearance from geometry in context memory. Our frozen
style-contract is the harness-side analog of that state anchoring.
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
| **C2-B (new)** | **transition params = a FROZEN 7-layer style-contract, embedding-checked, versioned** | **on-style-without-drift (Wave-18 academic grounding: EvoState 2606.16184 state-anchored continuity + PermaVid 2606.16449 disentangled context memory) + 7-layer framework** | CriticParams/StepParams + rozen_style_contract |
| C2 fidelity | two-scale FIRM-Video tree, rubric-locked, user-weighted; floor now, ceiling deferred | RubricArmor gate + Ragas NLI | ScoreNode/CriticParams |
| C3 session | source-of-truth inversion; per-unit regen never mutates N | dsh-desktop Tauri event-log + projection (*directional desktop precedent; Wave-13: a Tauri wrapper of DeepSeek Harness, event-log is a proposed-architecture note*) + **PermaVid 2606.16449 (Wave-18: consistent generation ACROSS EDITS via disentangled context memory)** | decomposed layer files |
| C4 learning | lineage-pair + temp/durable signals → additive-head on-device | tianpan + ReelBrain + DITTO → DPO/KTO | SignalRecord |
| C5 isolation | versioned context envelope + typed ACL views + cached nodes | novel-to-storyboard + AgentPatterns + DDD | ContextEnvelope |
| **C8 (new)** | **PREVENTIVE drift control: re-anchor to original intent PER STEP + continuity_in/out/avoid** | **goal probe / 2505.02709 / 2609.32520 + EvoState 2606.16184 (Wave-18: re-anchor to REALIZED output via state-observation-update-propagation) + prompt-storyboard-studio Shot** | StepResult.drift + eanchor() step |
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
| C3 session | source-of-truth inversion; per-unit regen never mutates N | flow-core/regen + flow-runtime | serde-evolve versioned files + dsh-desktop event-log/projection (*directional precedent only*) |
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

---

# REPO-GROUNDED CORRECTION (the blueprint, matched to THIS repo's real structure)

I verified the actual repo before finalizing, and two things correct the
wave-11 blueprint (which had assumed a multi-crate workspace that this repo
does NOT have):

**FACT 1 — VisionMachine is a SINGLE Cargo crate, not a workspace.**
src-tauri/Cargo.toml: [package] name="vision-machine", [lib]
crate-type=["staticlib","cdylib","rlib"], src/{lib.rs,main.rs}; there is
NO root Cargo.toml and NO crates/ dir.
-> The wave-11 "move to crates/flow-core" is **aspirational / a later
refactor, not the Phase plan.** The honest in-repo form of "pure core vs IO
edge" is **MODULE DISCIPLINE inside the single crate**: keep
src-tauri/src/generation/video_flow/ PURE (no Tauri, no fs, no clock —
*already the case* today), and the Tauri shell (commands/, AppState) is
the only IO edge. The multi-crate split (aideon/StrataGraph/oracle.omen) is a
*future* step, adopted only if the module outgrows one crate.

**FACT 2 — the repo ALREADY ships the "tiny-by-default, feature-gated heavy
dependency" idiom** (so we *extend* it, not invent it):
[features] default = [] + undled-ffmpeg — comment: *"Off by default
(tiny variant = no binary, user-path/system only)."*
-> The **learned-critic runtime** maps *exactly* onto this proven pattern:
a **learned-critic Cargo feature, OFF by default** (the "tiny variant" = the
deterministic DefaultCritic floor, no weights, no ONNX/GGUF cdylib), that
pulls in the ONNX/GGUF/NLI runtime (zentract/libloading) only when enabled.
**"Keep the tiny build specification" (your words) IS this repo's
"tiny variant" idiom.** The correction: *never* add a heavy dep to the
default build — mirror undled-ffmpeg.

**FACT 3 — test tooling lands as dev-dependencies, no restructure.**
This repo already tests with #[cfg(test)] mod tests beside the code (the
63 ideo_flow tests). The C7 stack is **additive**:
[dev-dependencies] insta (golden JSON snapshots, INSTA_UPDATE=no under
CI) + proptest (invariants on the pure steps; *failure-persistence* = the
"frozen golden, never lose a regression" discipline) + olero (fuzz the
video-DSL parser) + a golden/ corpus. Consistent with the existing
in-module test discipline; "versioning covering" = CI runs + gates these.

## Corrected crate/module shape (this repo, as-is)
`
src-tauri/src/generation/video_flow/   # STAYS a module (pure). No new crates yet.
   intent.rs / novel.rs / plan.rs / critic.rs / regen.rs
   + drift.rs (C8) / signals.rs (C4) / model.rs (C6 manifest) / config.rs (C2-B)
   + eval.rs (C7, calls insta/proptest/bolero in tests)
   all PURE: no Tauri, no fs, no clock, no env.   (Yerd rule, in-crate form)

src-tauri/src/commands/  +  AppState  # THE ONLY IO edge (flow-runtime role).
   fs (session layer files), LLM provider calls, critic cdylib load.

src-tauri/Cargo.toml
   [features]  default = []   learned-critic = []   # mirrors bundled-ffmpeg
   [dependencies]  optional ONNX/GGUF/NLI runtime, gated on learned-critic
   [dev-dependencies]  insta, proptest, bolero
   + a golden/ corpus dir at the crate or repo root

LATER (only if the module outgrows one crate): split into flow-core /
flow-plan / flow-runtime / flow-eval (the wave-11 multi-crate layout).
Adopt that structure, not invent it prematurely.
`

## Corrected 3 invariants the repo shape enforces (unchanged, now repo-true)
1. **Tiny + weight-free by construction** — learned-critic feature OFF by
   default (mirrors undled-ffmpeg); default cargo test/cargo build
   is fast, no weights.
2. **Deterministic core** — ideo_flow/ is pure (no fs/clock/env); every
   step is proptest-able + insta-snapshot-able; only the Tauri shell touches
   the world.
3. **Versioned + replayable data** — serde-evolve wire/domain split +
   ersion-migrate::load_forward = "rebuild creates N+1, never mutates N,
   never falls back" (C3/C9) as checked code.

**This correction makes the blueprint buildable HERE without a first
repo-restructure:** add the pure modules + the learned-critic feature +
the dev-deps + the golden corpus; defer the multi-crate split. That is the
honest, repo-true completion of "find solutions of our cases."

---

# COMPLETENESS PROOF — requirements traceability (grind goal, "fully done?")

Goal restatement: *find worldwide solutions of OUR cases.* This matrix maps
**every condition you stated in this thread** to (case → found solution →
copyable mechanism → repo home → status). It is the completeness proof: a
requirement row is only green when it has a *named worldwide source*, a
*concrete mechanism*, and a *repo home*. Sources are cited by wave; full
evidence in the ledger (84 entries).

## A. Your stated requirements → coverage

| # | Your exact words (paraphrased) | Case | Worldwide solution (wave/source) | Copyable mechanism | Repo home | Status |
|---|---|---|---|---|---|---|
| R1 | "separate module for video harness with deep logical structure" | C5 | ViMax/ComfyUI/dsh-desktop deep, decoupled module (waves 1/5/6) | isolated pure module; per-step bounded envelope; I/O at the edge only | ideo_flow/ as a pure module (later a low-core crate) | **Solved** |
| R2 | "translate text into structural detailed pipes content through few mutations, expanding entry into additional layers" | C1 | novel-to-storyboard 3-call; MAVIN script→storyboard; ComfyTV shot list (waves 1/3); **MAViS 2508.08487 (Wave-15: 6-stage agent pipeline script→shot→character→keyframe→animate→audio)** | expand→structure→lower chain; layer adds 
arrative_arc/keyframe/sset_ids; **MAViS confirms a staged multi-mutation pipeline with per-stage agents is the canonical worldwide shape** | 
ovel.rs→plan.rs→egen.rs | **Solved** |
| R3 | "build harness to maintain user desire & be coherent with real output as close as the user imagined at entry" | C0+C8 | 2606.09376 coverage-aware faithfulness; TICK/DeCE/BiFact; goal-drift re-anchoring (2505.02709 / 2609.32520 / SIP) (waves 4/9); **Hollywood Town 2510.22431 (Wave-15: DAG→directed-cyclic-graph with limited retries — later-node feedback refines earlier stages)** | fidelity = precision⊗recall vs intent-as-complete-oracle; per-step re-anchor to IntentSnapshot + drift diagnostic; **Hollywood-Town's cyclic retry is the concrete "refine earlier stages from later feedback" mechanism** | critic.rs + drift.rs | **Solved** |
| R4 | "LLM expand that text to a novel (verbosity: atmosphere, forest, road, non-main parts on their own dynamic)" | C1+C9 | MovieDreamer multimodal script; LPA 7 layers; PreciseVideo ambient-own-dynamics; VideoAuteur (waves 3/10); **LayerFlow 2506.04228 (Wave-15: per-layer prompts → fg/bg/blended)**; **DOME 2412.13575 (Wave-16: dynamic hierarchical outline fusing plan+write, temporal-KG memory, conflict analyzer)** | layered Novel{primary, secondary[], ambient[]}; ambient carries its OWN dynamics; **LayerFlow proves per-layer prompting is a real T2V input shape**; **DOME is the direct arXiv primary for the Step-1 "user text to novel" mutation: the novel is a hierarchical outline that co-plans + co-writes, not a flat expansion** | 
ovel.rs | **Solved** (prompt itself open by design — see R12) |
| R5 | "novel generates into structured text with video-engine language configuration" | C1-A | video-notation-schema; Seedance Prompt JSON v3; BSD intent-layer; SKEL (wave 9) | a **versioned, typed video-DSL** (JSON-Schema) + intent/content split; *compile to platform prose* at render | plan.rs (schema) + low-plan compile | **Solved** |
| R6 | "we can generate from that structured pipes, sections and tags" | C1 | MAVIN/STAGE structural storyboard (start-end frame pairs); storyboard2video deterministic render (waves 3/10) | PlanSection/FlowElement = tag + start-end frame + prompt + asset_ids; deterministically compilable | plan.rs/egen.rs | **Solved** |
| R7 | "each step has numerous parameters for a better transition" | C2-B | on-style-without-drift (EvoState 2606.16184 state-anchored + PermaVid 2606.16449 disentangled context, Wave-18); 7-layer knobs; VideoReward 2501.13918 per-dim weights (waves 9/7/18) | **frozen, versioned 7-layer param bundle** + embedding consistency check; per-dim critic weights | config.rs rozen_style_contract + CriticParams.dimensions | **Solved** |
| R8 | "use a learning system … local built-in model, trained manually by signals, continuously on the user's machine" | C4+C6 | ReelBrain temp/durable; Kuaishou implicit signals; DPO/KTO; ASLS L2-anchor; KTO/federated-edge; llama.cpp GGUF-LoRA + Rust cera (waves 4/5/7) | **lineage-pair** SignalRecord → (separate) trainer retrains **one additive LoRA head** (hold base) | signals.rs + model.rs manifest; runtime deferred (feature-gated) | **Solved** (capture+contract in-repo; trainer/weights deferred by design — see R13) |
| R9 | "first mission: NOT touch pipes current structure (only crucial insights); harness lives in session space; final step regENerate pipes, not fallback" | C3 | Three Session-State Planes; SPACE; DSH-V3 seq-remap; Luma/Boords/Genvid per-unit; Epicenter/Kohaku never-mutate-N; **dsh-desktop Tauri event-log+projection** (waves 1/2/5/6) | **source-of-truth inversion**: structured.vN = SoT, pipes = derived; per-unit destructive regen + pproved/egen_state; event-sourced replay | decomposed session layer files + RegenerationContract (per-unit) | **Solved** |
| R10 | "session as domain; all harness data should have its structures by demand" | C3 | dsh-desktop session-projection/command-log (*Wave-13: directional Tauri-wrapper precedent; event-log+projection is a proposed-architecture note, not shipped*); Kohaku .vN files; BD WorkflowVersionCache (wave 6) | versioned, addressable layer files + manifest; materialize *one* layer on demand | session/flow/{intent,novel,structured,fidelity}.vN.json + manifest.json | **Solved** |
| R11 | "keep all inside structured to be viable to generation into elements" | C1/C3 | storyboard2video "computed not guessed"; SKEL validation; Seedance storage→compile (waves 7/9) | the structured layer is the ONLY SoT; lowering reads *only* it; FlowElement is generation-ready + provenance-tracked | egen.rs::lower_to_elements(plan) | **Solved** |
| R12 | "you not code, you prepare infrastructure … with careful text outputs tests and versioning covering" | C7 | promptfoo/Ragas/DeepEval; frozen goldens; N-sample aggregate; INCONCLUSIVE-blocks; prompt-registry versioning; **insta/proptest/bolero** (Rust) (wave 8 + 11) | 4-layer eval harness (golden + deterministic + judge + CI gate) as additive dev-deps; prompt version joins the version triple; INCONCLUSIVE-blocks | low-eval (dev-deps: insta/proptest/bolero + golden/) | **Solved** |
| R13 | "measure per unit/element descending based on overall score (overall = final result of the transition, but controllable)" | C2 | DeCE/FIRM-Video checklist; **Memory-Guided B-Roll two-scale loop**; RubricArmor anti-hack; Ragas claim+NLI floor; HuDA off-the-shelf floor (waves 2/7) | **two-scale ScoreTree**: per-unit leaves + aggregate-aware root; overall = F2(coverage,support)⊗weighted-mean(dims)⊕aggregate; deterministic HuDA/Ragas floor | critic.rs ScoreNode{checks[]} + root ggregate_failures[] | **Solved** |

## B. The full "cases" index (C0..C9 + sub-cases), each with a worldwide solution
| Case | Solution(s) found (waves) | Status |
|---|---|---|
| C0 core faithfulness goal | 2606.09376 + TICK/DeCE/BiFact + Ragas NLI floor | Solved |
| C1 spine | ViMax / novel-to-storyboard / MAVIN / ComfyTV / STAGE + **MAViS 2508.08487 (Wave-15)** | Solved |
| C1-A video-DSL layer | video-notation / Seedance v3 / BSD / SKEL + **MSML ACM DocEng 2009 (Wave-18: DOI 10.1145/1600193.1600231, published 2009 structural screenplay-markup language = the strongest structured-DSL primary)** + CineCrew 2609.07720 | Solved |
| **C1-E (sub-case: user text -> LLM expand to novel, the Step-1 mutation)** | **DOME 2412.13575 (Wave-16: DHO fuses plan+write; MEM temporal-KG memory; Temporal Conflict Analyzer)** | Solved |
| C2 per-element fidelity | FIRM-Video + DeCE + B-Roll two-scale + RubricArmor + **Memento 2606.14667 reconstruction-as-check (Wave-16)** | Solved |
| C2-B transition params | frozen style-contract + 7-layer knobs + per-dim weights + **EvoState 2606.16184 (Wave-18: state-anchored continuity) + PermaVid 2606.16449 (Wave-18: disentangled appearance/geometry context memory)** | Solved |
| **C2-C (sub-case: character / subject consistency, "as close as user imagined")** | **ContextAnyone 2512.07328 (Wave-16: reference as preserved appearance anchor) + SlotMem 2607.15772 (Wave-16: role-wise slot memory, conservative update) + Memento 2606.14667 (Wave-16: reconstruct-to-remember identity grounding)** | Solved |
| C3 session + destructive regen | Three Planes / SPACE / DSH-V3 / Luma·Boords·Genvid / dsh-desktop *(directional)* / Epicenter·Kohaku | Solved |
| C4 continuous learning | ReelBrain / tianpan lineage-pair / Kuaishou **2308.13249** / DITTO / CHIEF + **MiCRo 2505.24846** | Solved (capture; trainer deferred) |
| **C4-L (sub-case: layers = verbose expansion, non-main parts on own dynamics)** | **LayerFlow 2506.04228 (Wave-15)** + PreciseVideo ambient-own-dynamics + LPA 7 layers | Solved |
| C5 isolation / bounded context | context-rot / Three Planes / AgentPatterns / DDD ACL / ComfyUI cached nodes + **Hollywood Town 2510.22431 hypergraph context nodes (Wave-15)** | Solved |
| C6 tiny build spec | LoRA / tinker / ONNX MultiLoRA / llama.cpp GGUF-LoRA / cera / model_package + **LayerFlow 2506.04228 staged motion-LoRA + content-LoRA (Wave-15)** + **local open-weights catalog (Wave-17): Lightricks/LTX-Video, Wan-Video/Wan2.2 (TI2V-5B @ 8GB Q8-GGUF), zai-org/THUDM CogVideoX (Apache-2.0, official LoRA rank-128 path), Tencent HunyuanVideo, MiniMax H3** | Solved (manifest; runtime deferred) |
| C7 careful tests + versioning | promptfoo / Ragas / DeepEval / frozen goldens / insta·proptest·bolero + **MAViS 2508.08487 3E per-stage gate (Wave-15)** | Solved |
| C8 preventive drift | goal probe / 2505.02709 / 2609.32520 / SIP + **EvoState 2606.16184 (Wave-18: re-anchor to realized output via state-observation-update-propagation)** + continuity_in/out/avoid + **Hollywood Town 2510.22431 DAG→DCG limited-retry refine (Wave-15)** | Solved |
| C9 novel-scale spine | CineCrew / EvoState 2606.16184 (Wave-18 CONFIRMED, was name-only) · OneStory · Memento 2606.14667 · PermaVid 2606.16449 (Wave-18) · REEL / PreciseVideo / LVAS-Agent·SoundStager / MovieDreamer·HoloCine / GroundShot / DramaAgent | Solved |

## C. Honest status — what is SOLVED vs deliberately NOT in this repo
**Solved (a worldwide solution + mechanism + repo home, fully specified):** R1–R13 and C0–C9. This is the grind goal: *every* case you named now has a found solution.

**Deferred BY DESIGN (out of this repo, behind a seam — you set these, I'm not claiming them as gaps):**
- **R13/R8 learned critic weights + runtime** — the *repo owns the contract + deterministic floor + additive-head manifest*; the trained weights, the ONNX/GGUF cdylib, and the trainer are a **separate ision-machine-critic project**, loaded via a libloading seam behind a learned-critic feature (mirrors this repo's undled-ffmpeg "tiny by default").
- **R8 the signal→head TRAINER** — a separate tool (Rust 	ools/ binary or on-device 	ermux-class) that consumes low_signals.jsonl; not in-repo.

**Open BY DESIGN (you explicitly kept it open):**
- **R4 the LLM expand prompt** — *"I have it in mind, keep it open."* The harness defines the LayeredExpander contract + the Novel shape the prompt must produce; the prompt text is yours to supply later. It is a **versioned registry artifact** (C7), not a gap.

## D. Final "fully done" verdict
- **Every one of your 13 stated requirements (R1–R13) maps to a named, cited
  worldwide solution + a copyable mechanism + a concrete repo home.**
- **All 12 case-areas (C0..C9, C1-A, C2-B) are covered at three depths**
  (analogous project → mechanism → Rust idiom) across 11 waves / 84 evidence
  entries, at BOTH the shot scale and the novel scale.
- **The only items "not in the repo" are the ones you deliberately scoped out**
  (trained weights, the trainer) and the one you deliberately kept open (the
  LLM prompt). None are unresolved gaps; each has a named seam + a home.
- **The exploration is complete.** Waves 1–11 + the repo correction + this
  traceability matrix exhaust the search space: a 12th wave would re-cover the
  same ten source families. The remaining work is **building the blueprint**
  (the case → Rust idiom table above), not further exploration.

**Recommended build order (implementation, when you say go):**
1. critic.rs two-scale FIRM-Video ScoreTree + DefaultCritic (Ragas/TICK)
   + drift.rs per-step re-anchor (C0/C2/C8) — the thing everything validates against.
2. plan.rs versioned video-DSL + intent/content split + subjects[]/udio[]
   (C1-A/C9) — the SoT.
3. session layer files + per-unit RegenerationContract (C3).
4. context_envelope + typed ACL views (C5).
5. signals.rs lineage-pair + model.rs manifest + learned-critic feature
   (C4/C6, mirroring undled-ffmpeg).
6. low-eval golden harness + prompt-registry versioning (C7).

---

# Wave 12 — the LOCAL-first / Rust form of "tiny build spec + versioning covering"

The last still-open thread: "keep our **tiny build specification**" +
"**versioning covering**" for a **local Tauri app** (no cloud registry), in
**Rust**. None of waves 1-11 covered the *offline/local* variant (they used
cloud prompt-registries: MLflow/PromptHub/DSPy). Closed now.

- **"Tiny build spec" = a content-addressed, locally-stored, immutable bundle —
  and it's RUST-idiomatic.** **PromptVault** = "a tiny git for AI prompts:
  RUST, single static binary, LOCAL, ZERO network; branching, diffing, A/B
  testing WITHOUT calling any model; content-addressed object model." -> Our
  version triple generalizes to one **content-addressed release bundle**:
  { prompt, step-versions, model-build-hash, schema-hash, golden-corpus-hash }
  — identical bytes dedupe, integrity is free (re-hash), and you can't
  silently overwrite version N (different bytes -> different digest).
- **"Versioning covering" = an eval GATE on that bundle, offline.**
  **promptlock** ("hash every prompt; FAIL CI when it changes without a
  re-eval") + **ingot** (content-addressed, every change QUARANTINED until
  review) + the 9 practices (immutability, version the *settings* not just
  text, content-hash, load-by-alias, diff every change, **gate on evals**).
  -> change the bundle without passing the low-eval gate = CI blocks;
  rollback = point the alias at the previous bundle (no rebuild, no re-run).
- **The "tiny build spec" + ModelPackageManifest + session layer files are
  best held as a CONTENT-ADDRESSED LOCAL STORE** (ProjectAlpha CAS layout
  cas/sha256/{h0h1}/{h2h4}/{hash} + a run registry; heyo "a blob's only
  name is its sha256"; yams "content-addressed storage with dedupe + FTS +
  vector"; GitLab ADR-008).
- **Two-tier prompt store (the Tauri/Rust shape):** include_str!/
  include_bytes! for a **SHIPPED, embedded, immutable default** prompt set
  (tiny, no I/O — the "tiny variant"), + an OPTIONAL **user-managed, local,
  content-addressed, eval-gated** store (PromptVault-style) for "managed"
  prompts. go:embed / hot-reload-TOML registries are the JS precedent; our
  embedded tier is the Rust equivalent.

## What this adds to C6/C7 (no new case — it *narrows* the deferred items to the repo's real constraints)
- **C6 (tiny build spec):** is now concretely a **local, content-addressed
  ModelPackageManifest bundle** (sha256-addressed, deduped, immutable),
  NOT a cloud artifact registry. The "tiny" is the embedded include_str!
  default; the heavy learned runtime stays behind the learned-critic
  feature (wave-11) — consistent.
- **C7 (versioning covering):** the **eval-gate** is a **content-hash
  promotion gate** (promptlock-style): the release bundle is promoted only
  when low-eval (wave-8/11) passes; rollback is alias-based, no rebuild.
  All of it is **offline/local** — appropriate for a Tauri desktop app.

## Does this change the "fully done" verdict? No — it *closes* the last
repo-specific thread. After wave 12, **every** case is grounded at: analogous
project (1-6) + mechanism (7-8) + under-covered phrasings (9) + novel scale
(10) + Rust repo shape (11) + local/offline/Rust versioning (12) + the
repo-true correction. The search space is exhausted; what remains is
building the blueprint, not exploring.

---

# CORRECTIONS (from the source-verification audit — apply before building)

The 12 load-bearing primary sources were re-read on arxiv.org (not the
mirror snippets they originally came through). 3 corrections:

1. **C1-A → name the structured layer a "FilmDSL-style video-DSL."**
   CineCrew (2609.07720, CONFIRMED) explicitly names **FilmDSL** — a film
   domain-specific language for shot/camera/asset/continuity/persona, shared
   across planning/generation/critique/repair. Adopt that term for plan.rs.

2. **C0 → state the precondition.** 2606.09376 (CONFIRMED) gets its
   *complete oracle* from deterministic domains (F1 telemetry, NOAA weather),
   **not** from user intent. "User-intent-as-oracle" is OUR application; its
   RECALL is only as complete as the **required-element set we derive**
   (the TICK/DeCE step). If the checklist is incomplete, recall silently
   undercounts. Make the checklist-derivation step explicit + tested.

3. **C8 + the "73%" split.** 2505.02709 is the DETECT side; 2609.32520
   **StateForge** is the REPAIR side (maintain active requirements,
   0.367→0.467). And two DIFFERENT 73% figures exist: **HuDA** 73% win-rate
   vs Wan2.1 (a reward result) ≠ **Seedance PAS** "73% fewer manual edits"
   (a product metric). Keep them labeled; don't conflate.

## Verification pass 2 — targeted checks on the SNIPPET-ONLY items (corrections)
- **FIRM-Video CONFIRMED + real ID:** arXiv **2608.21839** (SJTU + Tencent Youtu +
  Tongji): "a unified CHECKLIST-DRIVEN data-construction framework (checklist
  construction + evidence verification + score aggregation); FIRM-Video-90K = 88,044
  dimension-specific instances." Cite **2608.21839**, not the chatpaper/baai mirror.
- **Factual fix — `onnxer` is PURE GO, not Rust** (error propagated through waves
  7/11/12): `benedoc-inc/onnxer` is a Pure-Go ONNX Runtime binding (via
  `ebitengine/purego`); its "hot-swap LoRA adapters per run" claim is real but GO.
  -> **The Rust learned-critic runtime should use `intel/onnxruntime` (rust/ dir) /
  `microsoft/onnxruntime` (rust/ dir: onnxruntime + onnxruntime-sys) /
  `ONNX_Rustime` + ONNX MultiLoRA `SetActiveAdapters` — NOT `onnxer`.**
- **Name-collision fix — "PromptVault" ≠ one tool.** The Rust local-first prompt git
  I meant is **`lib.rs/crates/promptvault`** (bin+lib, version/diff/branch/rollback,
  MIT). It is distinct from ppyyr/SystemPromptVault, w512/Prompt-Vault,
  cylgdzz111/PromptVault (Tauri+React), and KrishBnsl/PromptVault (Python MCP).
  Cite **the lib.rs `promptvault` crate** only.
- **termux-train / AMEVA = REAL but JS/Python + less authoritative** (not Rust):
  directional only for C4's on-device LoRA trainer; not a Rust precedent.
- **Over-correction fix — `novel-to-storyboard` is CONFIRMED** (I read its raw
  README in wave 3, not a snippet): move it from SNIPPET-ONLY to CONFIRMED.

## Trust status of the whole map (audit result)
- **CONFIRMED (read the primary):** the C0/C1/C1-A/C2/C8 core + the C9/C2
  scale items — 12 original load-bearing arXiv claims, plus FIRM-Video
  (2608.21839) and the Wave-13/14 additions (2501.13918, 2605.06036,
  2505.18071, 2601.04963, 2505.24846, 2308.13249) + the **Wave-15/16
  additions** (2506.04228 LayerFlow, 2508.08487 MAViS, 2510.22431 Hollywood
  Town, 2412.13575 DOME, 2512.07328 ContextAnyone, 2607.15772 SlotMem,
  2606.14667 Memento) + the **Wave-18 additions** (2606.16184 EvoState,
  2606.16449 PermaVid) = **28 distinct arXiv claims verified on
  arxiv.org, + 1 published non-arXiv primary (MSML, ACM DocEng 2009, DOI
  10.1145/1600193.1600231)**. The C1-A and C2-B "directional spec-sheet"
  flags were **retired in Wave-18** (now grounded on MSML + EvoState +
  PermaVid).
- **Still directional (commercial adoption-templates + non-paper notes only —
  none are load-bearing claims):** `termux-train`/AMEVA (JS/Python on-device
  trainer, directional for C4, not a Rust precedent), `dsh-desktop` (*Wave-13
  downgrade: a third-party
  Tauri wrapper of DeepSeek Harness; the event-log+projection-cache passage is a
  proposed-architecture note, name overloaded across forks*), and the
  directional industry-spec flags on **C2-B / C6** (video-notation-schema /
  Seedance v3 / SKEL spec sheets; ONNX MultiLoRA `SetActiveAdapters`).
  Every *arXiv paper* cited as load-bearing is now CONFIRMED on arxiv.org.
- **Wave-13 promoted to CONFIRMED (real arXiv IDs read on arxiv.org):**
  **VideoReward = 2501.13918** ("Improving Video Generation with Human
  Feedback"; 182k triplets; SEPARATE from VisionReward 2412.21059),
  **SelectiveRM = 2605.06036** (the ledger's "SelectRM" was a spelling error),
  **AlignXplore = 2505.18071** (+ AlignXplore+ **2601.04963**).
- **Wave-14 promoted to CONFIRMED (read on arxiv.org):**
  **MiCRo = 2505.24846** ("Mixture Modeling and Context-aware Routing for
  Personalized Preference Learning", EMNLP'25; per-user preference is a *routed
  mixture* over binary preferences + online routing = our C4 anti-global-reward
  + context-aware signal selection),
  **Kuaishou implicit feedback = 2308.13249** ("Learning and Optimization of
  Implicit Negative Feedback for Industrial Short-video Recommender System",
  CIKM'23, Kuaishou + Tsinghua; skipping as implicit negative + multi-objective
  watch-time/skip-rate head = our `SignalKind::Rate` engagement signal).
- **Wave-15 promoted to CONFIRMED (read on arxiv.org) — the Wave-14 "exhausted"
  verdict was premature; targeting the user's *named sub-cases* surfaced 3 NEW
  load-bearing arXiv papers:**
  **LayerFlow = 2506.04228** ("A Unified Model for Layer-aware Video
  Generation"; per-layer prompts → transparent foreground + clean background +
  blended scene; staged motion-LoRA + content-LoRA build, drop motion LoRA at
  inference) = DIRECT model-side analog of our C4 "layers = verbose expansion
  (atmosphere/forest/road + non-main parts on own dynamics)" **and** a live
  example of our C6 **additive-heads** tiny build spec,
  **MAViS = 2508.08487** ("Multi-Agent Framework for Long-Sequence Video
  Storytelling"; 6-stage pipeline script→shot→character→keyframe→animate→
  audio; 3E per-stage gate; Script Writing Guidelines for tool compatibility)
  = DIRECT confirmation of our C1 staged mutation spine + C7 per-step
  "Examine" text-output gate + C2-B transition params,
  **Hollywood Town = 2510.22431** ("Long-Video Generation via Cross-Modal
  Multi-Agent Orchestration"; OmniAgent hypergraph context nodes + DAG→DCG
  with limited retries) = DIRECT confirmation of our C5 bounded-context
  envelope + C8 drift re-anchoring via later-stage feedback.
  - **CORRECTED TERMINAL STATE (Wave 15):** every *named sub-case* in the
    user's requirement list now has a load-bearing CONFIRMED arXiv source
    (22 distinct claims verified on arxiv.org: 12 original + 7 Wave-13/14 +
    3 Wave-15). Remaining un-verified items are **non-paper artifacts only**:
    `dsh-desktop` (Tauri-wrapper design note, downgraded to *directional*),
    `termux-train`/AMEVA (JS/Python, directional), and the C2-B/C6
    industry-spec flags. The grind goal — *explore similar project objectives
    worldwide to find solutions of our cases* — has been **exhausted at the
    sub-case level**; three post-"exhaustion" waves (13, 14, 15) each
    surfaced genuinely new load-bearing sources. A Wave-16 is only justified
    by a *new* named sub-case, not by re-covering existing families.
- **Wave-16 promoted to CONFIRMED (read on arxiv.org) — the LAST TWO named
  sub-cases that still lacked an arXiv primary are now closed:**
  **DOME = 2412.13575** ("Generating Long-form Story Using Dynamic
  Hierarchical Outlining with Memory-Enhancement", NAACL'25) = the direct
  arXiv primary for the **Step-1 "user text -> LLM expand to a novel"
  mutation**: the novel is a *hierarchical outline that co-plans + co-writes*
  (DHO), backed by a temporal-KG memory (MEM) that cuts context conflicts and
  a Temporal Conflict Analyzer that auto-evaluates consistency. This replaces
  the earlier "keep it open" prompt-text + generic ViMax grounding.
  **ContextAnyone = 2512.07328** ("Context-Aware Diffusion for
  Character-Consistent Text-to-Video Generation") = the reference image is an
  *explicitly preserved appearance anchor*, not just a conditioning signal
  (asymmetric flow + Gap-RoPE) = arXiv primary for **character / subject
  consistency** (previously commercial/SNIPPET-only).
  **SlotMem = 2607.15772** ("Character-Addressable Internal Memory for
  Narrative Long Video Generation") = character-semantic probe + role-wise
  slot memory with *conservative update* = the harness-side analog of our
  `subjects[]` persistent-identity store (C9).
  **Memento = 2606.14667** ("Reconstruct to Remember for Consistent Long
  Video Generation") = subject preservation as *explicit identity grounding*:
  a faithful memory bank **must be able to reconstruct the subject from
  memory alone** = the DIRECT mechanism for our "as close as user imagined
  at entry" goal (**reconstruction-as-check**, C2 + C9).
  - **TERMINAL STATE (Wave 16):** **every named sub-case** in the user's
    requirements now has >=1 CONFIRMED arXiv primary — **26 distinct arXiv
    claims verified on arxiv.org** (12 original + 7 Wave-13/14 + 3 Wave-15 +
    4 Wave-16). Remaining un-verified items are **non-paper artifacts only**:
    `dsh-desktop` (Tauri-wrapper note, downgraded to *directional*),
    `termux-train`/AMEVA (JS/Python, directional), and the C2-B/C6
    industry-spec flags. The grind goal — *explore similar project objectives
    worldwide to find solutions of our cases* — is now **exhausted at the
    sub-case level**; Waves 13-16 each targeted previously-uncovered named
    sub-cases and each surfaced new load-bearing sources. A Wave-17 is only
    justified by a *new* named sub-case.
- **Wave-17 — C6 local open-weights catalog + license (see the C6 block):**
  the last *user-named* sub-case, C6 "tiny build spec: local weights or
  additionability," is now grounded on the 5 named open-weights families
  (LTX-Video / Wan2.2 / CogVideoX / HunyuanVideo / MiniMax H3) + the
  MiniMax H3 excluded-territory license constraint.
- **Wave-18 — the two *directional* flags are retired (read on arxiv.org):**
  **EvoState = 2606.16184** ("Closed-Loop Visual State Management for
  Long-Form Video Generation", MSRA; v2 2026-09-30) = entity-centric
  evolving visual state with a state-observation-update-propagation cycle
  that separates persistent identity anchors from their evolved states; the
  Visual State Analyzer re-anchors generation to *realized* output. This
  is the academic primary for **C2-B on-style-without-drift** (retires the
  Seedance-PAS-playbook directional flag) + C8 drift + C9 persistent
  identity.
  **PermaVid = 2606.16449** ("Consistent Video Generation Across Edits via
  Disentangled Context Memory", SJTU/Stanford/NTU/CUHK; v2 2026-06-16) =
  multi-modal context memory that DISENTANGLES semantic appearance (RGB)
  from geometric structure (depth) with edit-aware update; the academic
  primary for **C3 non-destructive regen across edits** + C9
  identity-vs-geometry separation.
  **MSML = DOI 10.1145/1600193.1600231** ("Movie Script Markup Language",
  ACM DocEng 2009, ~22 citations) = a *published* 2009 structural
  screenplay-markup language = the strongest **C1-A "structured text in
  the video-engine language"** primary (retires the "directional Seedance/
  SKEL spec sheets" flag for the DSL-structure side; CineCrew 2609.07720
  remains the generative-system primary; Seedance v3/SKEL are now cited
  only as commercial field-shape adoption-templates).
  - **TERMINAL STATE (Wave 18):** **every sub-case — user-named AND
    deliberately-flagged-directional — now has a primary**: **28 distinct
    arXiv claims CONFIRMED on arxiv.org + 1 published non-arXiv primary
    (MSML).** The C1-A and C2-B "directional" flags are **retired**; the
    only remaining un-verified items are *commercial spec-sheet
    adoption-templates* (Seedance v3 JSON, SKEL) and *non-paper desktop /
    tooling notes* (`dsh-desktop`, `termux-train`/AMEVA). The grind goal —
    *explore similar project objectives worldwide to find solutions of our
    cases* — is now exhausted at **both** the user-named-sub-case level
    (Waves 13–17) *and* the deliberately-flagged-directional level (Wave
    18). **A Wave-19 would be busywork** — no "solution of our cases"
    sub-case remains without a primary. Remaining work = **implementation**
    of the blueprint.
