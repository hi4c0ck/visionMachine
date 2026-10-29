# Video-Flow Harness — Worldwide Solutions Map (research)

> Purpose: for each of our **6 cases**, find how similar projects worldwide solved
> the same problem, and record a concrete **adopt / adapt / defer** verdict for the
> harness. Evidence ledger: `.agnes/work/research/20261029_1/wide_research/repo/evidence.jsonl`.

## The six cases we need solved

| # | Case (our words) | Our current shape |
|---|---|---|
| C1 | text → structured → generation, with *mutation layers* | `intent → novel → structured → lower` |
| C2 | learned **per-element fidelity**, *descending from overall* | `ScoreTree` (overall = combinator(leaves)) |
| C3 | **session-space layered content** + **destructive regeneration** (version triple) | `FlowDocument` blob + `RegenerationContract` |
| C4 | **signal-based continuous learning** (append-only → trainer) | `SignalLog` + `ModelBuildSpec` |
| C5 | **isolated mutation steps** (bounded context, no misleading) | pure step fns; **no versioned context envelope** |
| C6 | **tiny model build spec** (local weights / additive heads) | `LocalWeightsOnly \| Additive(heads)` + `StubModelResolver` |

---

## C1 — text → structured → generation with mutation layers

**Found (worldwide):**
- **ViMax (HKUDS)** — *two-stage production model*: stage 1 emits **all structured text
  artifacts** (characters, storyboard, shot descriptions, a **camera tree**); stage 2
  *renders* them. Human review sits *between* the two stages. LLM narrative planning
  is fully decoupled from external-API rendering.
- **"Lights, Camera, Consistency" (BITS Pilani)** — *structured deterministic control via
  JSON blueprints* (explicitly chosen over probabilistic multi-agent sims). Pipeline:
  LLM script → **asset-first** character images → **temporal bridge** (last frame of
  scene N conditions scene N+1) → merge. Removing the visual anchor collapses character
  consistency 7.99 → 0.55 → **a "layer" can be load-bearing; don't flatten it.**
- **ComfyTV Storyboard node** — LLM expands a premise into a **structured 16-field shot
  list** (duration, scene_purpose, shot_size, character, lighting, sfx, `image_prompt`,
  `motion_prompt`). *"Output is structured text, not images; edit it, then wire to
  Shot Images / Video stages. Shot list first, then keyframes."* — exactly our #8
  "keep all inside structured so it's viable to generation."
- **LPA Creative Studio** — **7-layer prompt architecture** (Identity / Spatial /
  Environment / …); you override *a layer per scene* while *shared layers stay pinned
  across the sequence*. Layer = the unit of mutation + regeneration.
- **code2mp4** — "multi-layer pipeline: natural-language brief → editable motion source
  → deterministic MP4." The **editable structured source** is the SoT.

**Verdict → adopt:** our spine (`intent/novel/structured`) already mirrors this, but
the *corrections the field proves* are:
1. **Two-stage, human review between structured-text and render** (ViMax) — our
   `FlowDocument` + destructive regen is the "between" point; make the *review gate*
   explicit.
2. **Layers are load-bearing, not decorative** (Camera-Consistency's temporal bridge,
   LPA's 7 pinned layers) — confirms your "atmosphere/forest/road + ambient on own
   dynamic" *are* first-class layers the structure step must consume (fixes my #7 bug
   where I re-derived from intent, not the novel).
3. **Deterministic structured control, not probabilistic agents** (JSON blueprints) —
   matches our fail-fast "careful text output" discipline; keep it.

---

## C2 — learned per-element fidelity, descending from overall

**Found:**
- **DeCE (Thomson Reuters Labs)** — *decompositional* evaluation. Splits **precision**
  (are claims supported?) from **recall** (are required concepts covered?), auto-
  extracts *instance-specific criteria*, combines via **F2**. r=0.78 with experts vs
  0.48 GPTScore / 0.42 G-Eval. *"A single undifferentiated score hides which failure
  mode occurred"* — the exact flaw of my flat `0.5` tree.
- **Google LLM-as-judge guidance** — *don't* ask "rate good/bad"; ask a set of
  **clear, independent, observable TRUE/FALSE atomic conditions** (checklist style).
- **AIAssess multi-dimensional scoring** — auditable, per-dimension scores beat naive
  single-number aggregation.

**Verdict → adopt (this is the "solid independent harness feature"):**
The **descent structure** is ours (I2: overall = combinator(leaves)). What the field
gives us is the *content* of the leaves — make them **named dimensions + atomic
TRUE/FALSE checks**, not a flat score:
- **Coverage** (DeCE recall): leaf traces to ≥1 intent clause via `from` (empty ⇒ low).
- **Support** (DeCE precision): leaf's concrete claims are *supportable* from its input
  layer (not invented).
- **Specificity**: leaf prompt non-trivial (has a concrete noun/verb, >N words).
- **Coherence**: sibling leaves don't contradict (two sections can't claim different
  time-of-day).
- **Ambient-coverage**: if the novel has ambient layers, the structured plan reflects
  them (your "non-main parts on their own dynamic").

`overall = F2(coverage, support) ⊗ Mean(leaf)` — **descendable** (open any node) AND
**diagnostic** (tells you *which* dimension failed, DeCE-style). This is fully
deterministic (no model) = the **independent floor**. A trained model later *re-scores
the same leaves* (learned ceiling) — same tree, same I2 invariant. **That split —
structure ⇒ explainability (repo-owned, always), model ⇒ accuracy (improves) — is the
independent feature you asked for.**

---

## C3 — session-space layered content + destructive regeneration

**Found:**
- **Three Session-State Planes** — coordinate *narrative / mechanical business values /
  task scheduling* **without mixing write ownership.** Validates per-layer ownership.
- **Perplexity SPACE** — sandbox *ephemerality as a control primitive*: the work-space
  "stops existing" when the task ends; the *judgment survives* ("The Session Died. The
  Judgment Didn't.").
- **Context rot** — stale/superseded text accumulates → session "sediment."
- **DeepSeek-Harness Session V3** — versioned `session.v3.jsonl` + **seq re-mapping**:
  a version upgrade re-points old event refs; references must be re-mapped, not just
  data converted.

**Verdict → adopt:**
1. **Session is the domain; layers are separate, addressable, versioned files** (not
   my single `FlowDocument` blob) → `session/flow/{intent,novel,structured,fidelity}.vN.json`
   + `manifest.json` indexing them. "By demand" = regeneration reads **only**
   `structured.vN.json` at the current lowering version (your #8 SoT), never re-runs
   expand/structure.
2. **Destructive + versioned, not fallback** (your #6, "that's why I mentioned
   versioning on early start") → keep `RegenerationContract { version: VersionTriple,
   fallback: None }`. The **seq re-mapping** (DSH V3) is the concrete trick: when a
   layer's version bumps, *references to it must be re-pointed*, not silently converted.
3. **Write-ownership planes** (Three Planes) → the *only* write to pipes is the Phase-4
   regen command, sourced from `FlowElement`s; the harness never writes pipes (I9).
4. **Ephemerality** (SPACE) → the session flow-dir *can* be discarded after regen; the
   `fidelity.vN.json` (the "judgment") persists as the audit artifact.

---

## C4 — signal-based continuous learning

**Found:**
- **AlignXplore (Ant)** — RL infers a user's preference **from behavior**, updates as
  behavior changes, transfers the inferred preference *description* to a downstream
  alignment model.
- **MiCRo (UIUC/Columbia/Rice)** — **mixture modeling + context-aware routing** for
  *personalized* preference learning (one user, many sub-preferences).
- **SelectRM (ICML'26)** — reward models should **ignore noisy preferences** (optimal
  transport), not fit them pointwise. Your `flow_signals.jsonl` *will* be noisy.
- **termux-train (AMEVA)** — a self-contained on-device autograd engine for *continual
  learning under resource constraints* (the "on the user's machine" path).
- **EWC (Elastic Weight Consolidation)** — continual learning *without catastrophic
  forgetting* — the risk when you keep re-training the same critic head.

**Verdict → adopt / defer:**
- **In-repo (the harness's half):** *capture* `SignalRecord` (EditDiff / Accept /
  Reject / Rate) into `flow_signals.jsonl` (I7) — **done**. The signal is the *training
  triple* `(intent, structured-layer, signal)`.
- **Key design import:** tag each `SignalRecord` with its **context key** (MiCRo's
  routing key: e.g. which content *category* the edit was in) so a trainer can learn
  *per-category* heads instead of one blurred head.
- **Defer (out of this repo):** the *trainer* (reads the log + a base build, retrains
  **one additive head**, writes weights + an updated `ModelBuildSpec`). It's a separate
  tool (Rust `tools/train-critic` or Python, or an on-device `termux`-class engine).
  **Repo contract:** `SignalRecord` schema + `ModelBuildSpec` + `ModelResolver`. The repo
  *captures*, the trainer *consumes*. Add a **noise guard** to the signal schema (a
  `confidence`/`selectable` flag, SelectRM-style) so noisy events can be down-weighted.
- **Continual-learning guard:** the additive-head design (C6) *is* the anti-forgetting
  mechanism — a new signal retrains *one head*, base + other heads untouched. (EWC
  would be a further refinement, not now.)

---

## C5 — isolated mutation steps / bounded context

**Found:**
- **Context rot / session sediment** — stale context accumulates and "nothing breaks at
  one step." The antidote is **bounded context per step**, not one growing window.
- **Three Session-State Planes** — *separate write ownership* per plane; each concern
  only sees/owns its plane.
- **ViMax** — narrative-planning stage and rendering stage *share artifacts but not
  context*: a rendering step never re-reads the raw novel, only the structured shot
  list.

**Verdict → adopt (this is my current gap — I used *purity*, not *bounded context*):**
Introduce a **versioned context envelope** per mutation + per scoring leaf:
```
Envelope(step) = { input_layer, step_config, provenance_up_to_boundary, step_version }
```
- `expand` env = intent only.
- `structure` env = **novel only** (never raw intent) → kills my #7 bug.
- a *leaf-scoring* pass env = **that node + its provenance + its siblings' tags only** —
  never downstream elements/pipes, never the final overall.
The envelope is *itself versioned + logged* into the fidelity layer, so a replay knows
*exactly what context produced a score* (this is the real "not mislead context"
guarantee, and it's testable: assert each step's output is a pure function of its
envelope). **This is the single most important structural gap in my current code.**

---

## C6 — tiny model build spec (local weights / additive heads)

**Found:**
- **LoRA** — base frozen; the delta is a thin low-rank overlay `ΔW = B·A` (2–300×
  smaller than the base; 50–200MB vs 4–16GB). Multiple adapters **attach / hot-swap**
  on one base. "Lightweight LoRA Module" targets aggressive memory / on-device.
- **thinking-machines `tinker`** — two build paths: `build_hf_model` (**merge** into
  full weights) vs `build_lora_adapter` (**PEFT adapter**, lightweight, hot-swappable).
  → **Directly maps to our `LocalWeightsOnly` (merged) vs `Additive` (adapter).**
- **Modular MAX / TensorRT-Edge-LLM / vLLM** — standard *resolver* patterns: load base
  from a path, enable adapters, select which adapter(s) at runtime.

**Verdict → adopt:**
My `ModelBuildSpec { LocalWeightsOnly | Additive{base, heads} }` is *exactly* the
industry shape (merged-weights vs hot-swappable-adapter). Concretize it:
- `Additive.heads: Vec<AdditiveHead>` = the **hot-swappable LoRA adapters** (tinker's
  `build_lora_adapter`). One head per preference *category* (from C4's context key).
- `ModelResolver` = the *load-base + select-adapters* seam (Modular/vLLM pattern); the
  repo keeps `StubModelResolver` (no weights) and **defers** the real loader + inference
  runtime (that's the separate critic project, C4).
- **The repo's contract (I6) is the tinker boundary:** name the base + enumerate the
  additive heads + a version. The repo *never loads weights* (that's the deferred
  runtime). This keeps it "tiny" — you were right that a full model runtime is out of
  scope for this repo.

---

## Consolidated: what changes in our architecture (research-informed)

| Change | Case | Source(s) |
|---|---|---|
| **Two-stage: all structured text → human review gate → render**; make the gate explicit | C1/C3 | ViMax |
| **Layers are load-bearing** (temporal bridge, 7 pinned layers); structure consumes the *novel*, not intent | C1 | Camera-Consistency, LPA |
| **Replace flat `0.5` critic with DeCE-style named dimensions + atomic TRUE/FALSE checks**; `overall = F2(coverage,support)⊗Mean(leaf)`; **this is the independent floor**, model re-scores the same tree later | C2 | DeCE, Google-judge, AIAssess |
| **Session flow = separate versioned layer files + manifest**; regen reads only `structured.vN`; **seq re-mapping on version bump** | C3 | Three Planes, SPACE, DSH-V3, context-rot |
| **Versioned context envelope per step + per leaf** (the #1 structural gap); logged into fidelity layer | C5 | context-rot, Three Planes, ViMax |
| **SignalRecord gains a context key** (MiCRo routing) + a noise `confidence` flag (SelectRM) | C4 | MiCRo, SelectRM |
| **`Additive.heads` = hot-swappable LoRA adapters** (one per preference category); `ModelResolver` = load-base+select-adapters seam; **defer the weight runtime to a separate critic project** | C4/C6 | tinker, LoRA, Modular/vLLM |

### Out of scope (separate project, per your "honest inspection")
- The **trained critic runtime** (weights + inference) — `vision-machine-critic`.
- The **trainer** (log → additive head; on-device `termux`-class or dev-machine).
The repo owns the *contracts*: `SignalRecord`, `ModelBuildSpec`, `ModelResolver`,
`ScoreTree` (invariant-checked), and the DeCE-style *dimension definitions*.

---

# Round 2 — video-native + runtime grounding (deepens C2–C6)

## C2 (video-native) — "check before you score" is the field's consensus

The round-1 DeCE result (decompositional, instance-specific criteria) is confirmed
by *video-specific* reward literature:

- **FIRM-Video** (T2V reward modeling): **"check before you score."** Build a
  *per-dimension checklist*, verify each criterion against **temporal visual
  evidence**, aggregate **only verified** judgments. Instruction-following =
  *weighted atomic requirements*; world-consistency = entity/action check items;
  perceptual quality = a **visual-defect taxonomy**. Verified criteria+scores become
  *natural-language rationales* for the reward. → **This is the exact leaf shape for
  our `ScoreTree`: atomic TRUE/FALSE checks per dimension, aggregated into the
  descendable overall, with a stored per-leaf rationale.**
- **Diffusion-DRF**: a **frozen off-the-shelf VLM as critic**; decompose the prompt
  into multi-dimensional VQA questions → *dense rich feedback*, not one scalar
  (avoids reward-hacking + unstable optimization). → confirms our "named dimensions
  + atomic checks" floor beats a single number.
- **VideoReward** (CUHK/THU/Kuaishou): 182k human pairs over **3 dims**
  (visual quality / motion quality / text alignment); its inference-time **Flow-NRG
  supports user-customizable per-dimension weights.** → our `ScoreCombinator` weights
  + per-dimension `CriticParams` should be **user-tunable** (the "numerous
  parameters for a better transition" you named).
- **HuDA**: a *simple off-the-shelf* reward (detector confidence + temporal
  prompt-alignment), **no training**, beats fine-tuned reward models for human
  motion. → **a deterministic heuristic fidelity floor is genuinely useful, not a
  placeholder** — validates our in-repo "reference critic" as the first-class
  independent feature.

**Verdict (C2, upgraded):** the leaf of our `ScoreTree` becomes a **FIRM-Video-style
checklist node**: `{ dimension, atomic_check, verified: bool, evidence_ref, score,
rationale }`. `overall = F2(coverage, support) ⊗ weighted-mean(dimensions)`, where
the per-dimension weights are **user-tunable** (VideoReward Flow-NRG). A leaf
*collapses if any atomic check fails* (FIRM "only verified judgments count"). The
deterministic reference critic is the **HuDA-class floor**; a frozen VLM/LLM critic
(Diffusion-DRF-class) or a trained RM (VideoReward-class) is the **learned ceiling**,
both implementing the *same* checklist node + the *same* I2 descent invariant.

## C3 (video-native) — per-unit regeneration is the standard, ties C2↔C3

- **Luma Scenes**: "regenerate Frame 4, keep Frames 1–3 & 5–8 — approved frames stay
  unchanged." **Boords**: "mark the part of a panel to change; the rest stays as the
  client approved." **storyboard-agent-skill-opt**: feedback is applied as a
  **surgical edit** to the prompt before re-generating. → **The industry does NOT
  regenerate the whole storyboard when one unit is bad; it regenerates the unit and
  preserves the approved ones.**
- **Implication for our `RegenerationContract`:** "destructive" is **per-unit, not
  whole-flow.** A low `ScoreTree` leaf ⇒ regenerate *that* `FlowElement` (re-run the
  lower step for just that unit on the structured SoT); approved units carry a
  `version` and are **preserved**. Our `VersionTriple` + per-element stable `id`
  already support this — add an **`approved: bool` / `regen_state`** per element so
  the contract is "regenerate the failed units, keep the approved ones" rather than
  "nuke everything." (Your #6 "destructive" still holds *for the failing unit*.)
- **LangGraph 1.2 interrupt/checkpoint** = the concrete "human review gate between
  the two stages" (C1/ViMax): the structured layer is a checkpoint; the user reviews;
  resume-from-checkpoint on approval.

## C4 (video-native) — durable vs. temporary taste (memory poisoning)

- **ReelBrain** ("learning taste without memory poisoning"): **temporary project
  feedback vs. durable memory**. An explicit *"remember this"* → lasting preference;
  **inferred patterns need repeated evidence + user confirmation** before they stick.
  → Refines our `SignalRecord` into **two scopes**: `temp` (Accept/Reject/EditDiff,
  project-scoped, feeds the *current* run's refinement) vs `durable` (a `Remember`
  signal, gated on *repeated evidence*, feeds the *additive head*).
- **tianpan.co "Feedback Surfaces"**: the *implementation requirement* is to **track
  lineage** — store the model input, the model output, **and every subsequent edit
  state, timestamped**; from that log you reconstruct **preference pairs**
  (original output = "rejected", final edited version = "chosen"). → **The concrete
  shape of our `SignalRecord`: `{ input_ref, output_ref, edited_ref, ts }` — an
  edit-diff pair, not a bare rating.** This is what the trainer actually learns from.

## C5 (concrete precedent) — bounded context has a name

- **AgentPatterns "Bounded Agent Steps Inside a Deterministic Workflow"**: the typed
  fence *buys localization* — a bad decision "surfaces as a **schema violation at a
  named stage** → retry-in-place + stage-level isolation." → **This is the direct
  precedent for our versioned context envelope:** each step's *envelope is a typed
  schema*; a violation is a **named `FlowError` at a named stage**, not an
  incoherent end-of-run result.
- **DDD Bounded Context + Anti-Corruption Layer** (Fowler / flowzap): each context has
  its own model; the ACL **translates at the boundary and carries only the data the
  consumer needs.** → **The concrete I1 mechanism:** each flow step receives a typed
  **view/adapter** of the previous step's layer (`CriticSectionView` is already this —
  generalize it), *never the whole object*.

## C6 (runtime grounding) — the build spec is real, and there's a Rust runtime

- **ONNX Runtime GenAI MultiLoRA**: `SetActiveAdapters(string[])` runtime API —
  activate/deactivate adapters; empty = reset to base; multi-adapter.
- **onnxer** (`benedoc-inc`, a **Rust** ONNX binding): *"LoRA adapters — hot-swap
  fine-tuned adapters per inference run WITHOUT reloading the base model"* + a
  goroutine-safe session pool. → **Our `Additive` build maps to a Rust-usable,
  hot-swappable adapter; the repo can stay weight-free while the deferred runtime is
  a Rust binding (not Python-only).**
- **ONNX `model_package`**: required **`manifest.json` + per-component variant
  directories (cpu/cuda) + `ort_info.json` + sha256 shared assets.** **ModelSharp**:
  "a small manifest describes how to feed and decode the model" across
  ONNX/GGUF/safetensors. → **Our `ModelBuildSpec` should mirror a `model_package`
  manifest: name the base, enumerate the additive-head variants, pin a version +
  a content hash.** That's the "tiny build specification" made concrete.

## Round-2 consolidation (deltas from round 1)

| Case | Round-1 shape | **Round-2 refinement** |
|---|---|---|
| C2 | DeCE dimensions + F2 | **FIRM-Video checklist leaf** (`{dimension, atomic_check, verified, evidence, rationale}`), *verified-only* aggregation, **user-tunable weights** (VideoReward), **HuDA-class deterministic floor** |
| C3 | separate layer files + destructive whole-flow | **per-unit** destructive regen (Luma/Boords): add `approved`/`regen_state` + stable `id`; **LangGraph interrupt** = the review gate/checkpoint |
| C4 | SignalRecord + context key + confidence | **lineage-pair** shape (input/output/edited, tianpan) + **temp vs durable** scopes (ReelBrain: `Remember` gated on repeated evidence) |
| C5 | versioned context envelope | named precedent: **bounded agent step** (schema violation at named stage) + **DDD anti-corruption view** per step |
| C6 | LocalWeightsOnly \| Additive | concrete **`model_package` manifest** (base + head variants + version + sha256); runtime = **Rust `onnxer`/ONNX MultiLoRA** (hot-swap, no base reload) — deferrable, not Python-only |

---

## Conflicts & open questions (resolved, disclosed for audit)

- **Whole-flow vs. per-unit destructive regeneration (C3).** Round-1 locked a
  *destructive whole-flow* replace (original I5, `fallback: None`). Round-2 found
  the field does **per-unit** regen (Luma: `fix Frame 4, keep 1-3 & 5-8`; Boords:
  `the rest stays as the client approved`). **Resolution:** adopt *per-unit* —
  `RegenerationContract` gains a per-element `approved` / `regen_state`; a
  whole-flow replace becomes the special case where *every* unit is unapproved. The
  "no fallback" guarantee is preserved; it now means "the failing unit is replaced,
  the approved units are not re-run."
- **Critic leaf shape (C2).** Three candidate shapes: a flat `0.5` (Phase-0),
  DeCE's decompositional precision/recall, or FIRM-Video's *per-dimension checklist,
  verified-only aggregation, with natural-language rationales*. **Resolution:**
  adopt FIRM-Video as the leaf (`{dimension, atomic_check, verified, evidence_ref,
  score, rationale}`) on top of the DeCE-style `F2(coverage, support)` combination,
  with user-tunable per-dimension weights (VideoReward). The deterministic HuDA-class
  reference critic fills in the atomic checks *now*; a learned critic re-scores the
  *same* tree later. The I2 descent invariant (`overall == combinator(leaves)`)
  holds under both.
- **Ongoing open question (deferred, not a defect):** the *trained critic runtime*
  (weights + inference) and the *trainer* (`flow_signals.jsonl` -> one additive
  head) are **out of scope for this repo** — the repo owns the contracts + the
  deterministic floor; the ML work is a separate project that plugs in via
  `ModelResolver`.

---

# Round 3 — the closest open-source analogs (deep-read, GitHub-challenge avoided via raw host)

Wave 2 read the *field consensus*. Wave 3 read the **projects most like ours**, now fully:

ovel-to-storyboard (Python/MIT), VideoAuteur, Scene-Level Planning, S2S2T, MAVIN.

## C1 + C5 — 
ovel-to-storyboard is basically our architecture, open-sourced

A **3-call LLM pipeline where each call does ONE thing** (`--save-intermediates` keeps
the per-call output). Their stated *why*:

> each call does a focused job, **context stays clean, doesn't drift**; hard
> constraints (4-15s, merge-first, cross-shot wrap) are **not ignored** when calls are
> split.

That is the **open-source precedent for our C5 versioned context envelope** — not just
context-rot, but a *working* artifact that already does it. Our expand → structure →
lower chain is the same shape; their 3 calls map to (1) scene-split + prose→script
(
arrative_arc: trigger/rising/climax/falling/resolution), (2) shot-split under
"merge-if-possible", (3) visual detail + camera language + **asset binding**.

**Adopt their output field-list as our "viable structured layer" spec (#8):**
scene_code, narrative_arc, shot_code, emotion, estimated_duration (4-15s, forced),
content_lines (character/narration/background_sound), scene_blocking (top-down spatial
snapshot), visual_description '[shot_size·composition·camera·motion·secs]',
persona/scene/prop_asset_ids. Their *own roadmap* says "give intermediate output
**JSON Schema validation**" — confirming our fail-fast text-output discipline.

**C5 provenance / subject-continuity shape (our #7/I3):** pre-declare
characters / scenes / props (sset_id + name + appearance); the structured layer
**binds by asset_id, not by re-describing** ("asset IDs bind correctly so downstream
references them directly"). That's the concrete subjects[] layer we haven't modeled.

## C2 — a ready VLM-judge dimension list (Scene-Level Planning)

Scene-Level Planning (IMNS 2026): an **explicit scene-planning layer beats
direct-prompt and naive-decomposition**. It emits a lightweight structured
representation with **(1) global subject info, (2) visual style constraints,
(3) scene-level descriptions**, then compiles to scene-conditioned prompts; a
**reference-guided continuation** conditions scene N+1 on scene N's final frame
(cross-scene identity + continuity — our C3 per-unit continuity). Its VLM judge scores
**prompt relevance / temporal continuity / aesthetic quality / narrative clarity** —
a **ready 4-dimension list** for our FIRM-Video checklist leaves (join with VideoReward
VQ/MQ/TA + DeCE coverage/support).

## C1 + C5 — narrative state & traceability (VideoAuteur + S2S2T + MAVIN)

- **VideoAuteur**: a "Long Narrative Video Director" (interleaved auto-regressive)
  sequentially generates **actions, captions, keyframes** (the ordered narrative state)
  that condition the video-gen model. → Our structured layer should carry a **first-class
  ordered keyframe / narrative-state sequence**, not just tagged frame ranges.
- **S2S2T**: a **screenplay-centric IR** that models scene structure + environment +
  dialogue flow; the LLM does explicit **anaphora resolution** (unambiguous entity
  refs across scenes = the "same fox across scenes" problem = our subject layer); a
  **sliding contextual window** per visual prompt (a concrete C5 bounded context); a
  **lane-based GUI** where each lane = a pipeline stage = **per-step traceability made
  visible** (our I3 provenance as UI).
- **MAVIN** (ECCV'26 Oral): intent → script → storyboard → shoot each shot → edit
  together; the hard part is **cross-shot consistency** (subject, narrative logic,
  visual information flow) — *not* single-shot render. Confirms the *continuity layers*
  are the real structural work, matching our #7.

## Round-3 deltas (add to the C-table)

| Case | Refinement | Source |
|---|---|---|
| C1 | structured layer gains an **ordered keyframe / narrative-state sequence** | VideoAuteur |
| C1 | the *hard part* is cross-unit **continuity layers** (subjects/style/flow), not per-shot render | MAVIN |
| C2 | concrete 4-dim VLM judge list (relevance/continuity/aesthetics/narrative) joins FIRM-Video leaves | Scene-Level Planning |
| C3 | **reference-guided continuation**: unit N+1 conditions on unit N's last frame | Scene-Level Planning |
| C5 | open-source *working* precedent for per-step bounded context + saved intermediates; **lane-based traceability UI** | novel-to-storyboard, S2S2T |
| I3 | **pre-declared asset registry (chars/scenes/props) bound by id**, not re-described | novel-to-storyboard, S2S2T anaphora |

**Net:** our intent → novel → structured → lower spine is not exotic — it's the
*standard* shape of every credible text→storyboard→video system we found. The
differentiators we must add for *our* conditions are: the **layer store + destructive
per-unit regen** (C3), the **descendable checklist critic + additive-head build spec**
(C2/C6), and the **context envelope + asset-registry provenance** (C5/I3). Everything
else is already industry norm.

---

# Wave 4 — the CORE goal has a precise name: *coverage-aware faithfulness to intent*

Your aim: ""maintain user desire, keep the real output as close as the user
imagined it at entry."" That is NOT "is this video good" (general quality) — it is
""is this structure a *faithful projection* of the entry intent."" The field has an
exact, citable target for it:

## C0 (the core goal) — fidelity-to-intent is a coverage-aware faithfulness problem

- **Precision Is Not Faithfulness** (arXiv 2606.09376): reference-free faithfulness
  decomposes a generation into **atomic claims** and verifies each (our FIRM-Video
  leaf shape), reporting **precision** (of what it *said*, how much is
  supported). The paper's core claim: **""this is only half the story""** — you
  also need **recall** (coverage: did it address *everything* the user intended).
  → **Our oracle = faithfulness to the USER'S INTENT as the *complete oracle*:
  atomic-claim PRECISION (no invented content) + RECALL (no dropped intent).**
  This *is* ""as close as the user imagined at entry.""
- **Faithfulness vs. factuality** (RAG-eval consensus): *factual* = true wrt the
  real world; *faithful* = true wrt the **provided context** (here the intent/novel).
  → The harness checks the structured layer is **faithful to the entry**, not
  "factually correct about the world." A different, narrower job.
- **Intent Hallucination** (ACL 2025): on multi-condition queries, models **omit**
  (neglect) some conditions. That names our *recall-loss* failure mode exactly: a
  structured plan that drops a user-stated element = intent-hallucination (omission).
  → The critic's **recall dimension must catch omissions**, not just check what is
  present.
- **Dimension-Level Intent Fidelity** (arXiv 2605.14517): a *holistic* score does
  **not** separate "reproduced the structural form" from "preserved the specific
  intent." → **Score per-dimension** (structure / intent / coverage), never one
  number — confirms our C2 design.

**Net for C0:** the "close to the image they imagined" property is **decomposed, not
mysterious**: overall = F2(coverage=RECALL, support=PRECISION) ⊗ weighted-mean(named
dimensions) over a FIRM-Video-style checklist, judged **against the intent as the
complete oracle**. The deterministic reference critic *is* the HuDA-class floor
(arXiv 2601.14037: a simple off-the-shelf reward **beats** a fine-tuned one), so the
harness has a *working, testable* fidelity signal with **zero** trained weights — and
a trained critic later re-scores the **same** tree.

## C0/C3 — the strongest *structural* match: a two-scale iterative loop

**Memory-Guided B-Roll Generation** (arXiv 2610.01884) is, of everything we found,
the closest structural twin to our *combined* design: a **"multi-scale iterative
refinement loop: per-shot judges that verify identity and setting fidelity, AND a
sequence-level critic that detects failures only visible in aggregate (repetitive
shots, character drift) and drives targeted regeneration."**
→ This **validates our two-scale ScoreTree**: leaves = per-unit; the **root must be
aggregate-aware** (catch character-drift / repetition that no single leaf shows); and
regeneration is **per-unit, targeted**, not whole-flow. That refines I2: the root is
*not* just Mean(leaves) — it is comb(leaves) ⊕ aggregate_failures, where the
aggregate layer catches *only-visible-in-total* defects. (The combinator becomes a
two-part descent: descend through units *and* through aggregate checks.)

## C1 (MAVIN now fully read) — the render-side continuity mechanism is named

**MAVIN** (ECCV'26 Oral, Kuaishou/PKU, arXiv 2606.29473): a **multi-agent scripting
pipeline** turns a free-form description into a *structured, machine-readable
script* (hierarchical captions); **boundary-aware attention** aligns shot transitions
/ dialogue intervals / narrative events precisely; **ID-aware propagation** (identity
embeddings + an identity-aware mask) binds user-supplied subjects (reference images +
audio) to *consistent* appearances across shots. Sibling **STAGE**: "STEP 2 predicts a
**structural storyboard of start-end frame pairs** for each shot" = our "viable
structured layer."
→ **Deferred to our Phase 4** (the renderer side, not the harness): the *continuity
layers* (subjects/style/flow) are enforced by these mechanisms at render time. The
harness's job is to *produce the structured input they consume*; MAVIN confirms that
structured input is exactly the right hand-off.

## C4 — two more concrete mechanisms

- **CHIEF** (arXiv 2606.18591): generate video → **multimodal LLM agents *simulate*
  user feedback** → creator revises. → A *user-simulation* variant of our signal
  loop: when the user isn't present, LLM agents play "the user" to produce
  (intent, candidate, signal) triples — a **bootstrapping** path for the critic's
  training data that doesn't wait for real edits.
- **Luma "approve-before-render" + Genvid Diff View + Popcorn/Ozu/Genflick/TeamDay**:
  the dominant industry loop = **storyboard → review/regen individual keyframes →
  APPROVE → render only then**; a single shot change is resolved by **Approve/Reject
  in a diff view**, not by redoing the board. → C3 gate made concrete: structured
  layer = checkpoint; per-unit approve = the unit; render is gated on approval.

## C2 (commercial proof it matters)
**Seedance 2.5 "Prompt-Adherence Score" (PAS, 0-100)** — a shipping product's
*quantified* text-side faithfulness (semantic alignment ~35% / visual fidelity ~25%
/ ...); "PAS > 80 correlates with **73% fewer manual edits**." → a *measured*
faithfulness-to-intent score has real cost/value, and its per-dimension weights are
the VideoReward "user-tunable weights" idea in a shipping tool.

---

# Net verdict — what is industry norm vs. our differentiators

Read all four waves against our six cases + the C0 core goal:

| Area | Verdict | Note |
|---|---|---|
| intent → novel → structured → lower spine | **industry norm** | novel-to-storyboard / MAVIN / ViMax / ComfyTV all do this shape; keep it |
| "viable structured layer" fields (arc/duration/shot/camera/asset_ids) | **industry norm** | adopt novel-to-storyboard's field list + STAGE start-end frame pairs |
| two-stage gate (structured → *review* → render) | **industry norm** | Luma "approve before render", LangGraph interrupt/checkpoint |
| per-unit destructive regen + preserve approved units | **industry norm** | Luma/Boords/Genvid diff-approve; adopt pproved/egen_state per element |
| **context envelope / bounded step + saved intermediates** | **industry norm, we lack it** | novel-to-storyboard --save-intermediates + AgentPatterns bounded step + DDD ACL view; **add it** |
| subject/asset registry bound by id | **industry norm, we lack it** | novel-to-storyboard asset_ids + S2S2T anaphora + MAVIN ID-aware propagation; **add a subjects[]/asset layer** |
| **coverage-aware faithfulness oracle (C0)** | **our framing, field-grounded** | precision (no invented) + recall (no dropped) vs intent-as-complete-oracle; per-dimension |
| **two-scale descendable ScoreTree** (units + aggregate-aware root) | **our design, field-validated** | B-Roll multi-scale loop; root catches aggregate-only defects |
| **deterministic HuDA-class reference critic (floor)** | **our independent feature** | off-the-shelf beats fine-tuned; repo-owned, zero weights, invariant-checked |
| **tiny build spec = model_package manifest (base + additive LoRA heads)** | **our contract, runtime-grounded** | ONNX MultiLoRA / Rust onnxer / model_package; the *runtime* is deferred to a separate project |
| **lineage-pair + temp/durable signals** (trainer out-of-repo) | **our contract, field-grounded** | tianpan lineage-pair + ReelBrain temp/durable; trainer is a separate tool |

**Bottom line:** our *spine* and *gate* are the standard shape of every credible
text→storyboard→video system we found (ViMax, novel-to-storyboard, MAVIN, ComfyTV,
Luma). What is *ours* — and what the research **validates rather than invents** — is
the **learned-fidelity front**: a **coverage-aware, two-scale, descendable critic**
with a **deterministic floor** + an **additive-head build spec** + a **lineage
signal log**, all as *contracts* the repo owns, with the *weights/trainer* deferred
to a separate project. That is precisely "a solid, *independent* harness feature
that a tiny repo can ship, with the heavy ML sitting behind a seam."

---

# Wave 5 — the harness-architecture backbone (the non-video side that is load-bearing)

The first four waves covered the *video/ML* side. This wave closes the
**harness-architecture** side — the thing that makes it a *solid, independent*
harness rather than just "a pipeline of prompts."

## C3 + C5 — "session as domain, versioned, replayable" has a named mechanism

- **Temporal / durable execution + event sourcing**: the **event history is the
  source of truth** (not the code); **deterministic replay** re-runs from the
  start but does **NOT re-invoke external calls** (their results are journaled);
  "same events in → same commands out"; **exactly-once** side effects; a
  **Replay test** checks the current code still lines up with older event
  histories. → This is *exactly* our "the version triple makes a destructive
  regeneration replayable + auditable" requirement: **the flow event log is the
  SoT; the version triple pins determinism; regen re-derives from the log
  without re-running side effects.**
- **Event Sourcing + CQRS**: keep the **full immutable history** (an audit log,
  replayable), separate **write (Command)** from **read (Query/SoT)**. → Our
  layer files + low_signals.jsonl are a CQRS *write model*; "regenerate pipes"
  is a **Command that replays from the structured layer (the SoT)** — it never
  mutates the layers in place. That's the clean reading of our "regenerate, not
  fallback."

## C5 + C3 — ComfyUI is an *in-box* harness precedent (each step a node)

- **ComfyUI's node-graph executor** (comfy_execution/graph.py, PR #2666
  "Execution Model Inversion"): execution is a **topological sort** (not a
  recursive call), so the graph can be *modified during a run*; node outputs are
  **cached by an input-signature fingerprint**, so re-submitting the graph re-runs
  **only the invalidated ("dirty") nodes**; "Force Rerun" invalidates everything
  downstream of a trigger. → **Directly our C5 (each step = an isolated node) +
  C3 per-unit regen (re-run only the failed node; keep the approved ones cached).**
  A "dirty node" is precisely a "low ScoreTree leaf ⇒ regenerate that unit."
- **Content-aware versioning**: a ComfyUI workflow has **two JSON shapes** — the
  *editor* graph (positions/widgets, human editing) and the .api.json
  (the execution payload); and **Git "won't work"** for versioning it (a node move
  churns the JSON; a seed change looks trivially small). BD WorkflowVersionCache
  *hashes* the JSON and snapshots on change. → Precedent for our "session layer
  files + manifest": **keep the machine IR separate from the human view, and
  version by content/semantics, not raw diff.**

## C4 — "trained continuously on the user's machine" is a real, concrete field

- **ASLS on-device personalization**: loss from user **feedback as pseudo-labels**,
  with an **L2 stability term that anchors the personalized params to the base
  model** — that *is* our **additive head** (train the head, *hold the base* =
  anti-forgetting), and it runs on-device.
- **KTO-based federated/personal-KG** + **Energy-Efficient Federated Continual on
  Edge**: *lightweight on-device fine-tune from real interactions*; train only
  *part* of the model; data-free parameter selection to retain old knowledge.
- **Kuaishou "Implicit Negative Feedback"** (arXiv 2308.13249, deployed): an
  industrial short-video recommender that **categorizes raw watch-time / skip into
  signals** and learns from *implicit negatives* (+0.16% play-duration). → A
  **concrete shape for our SignalRecord (implicit watch/skip/edit)** that feeds
  the on-device trainer.

## What this wave changes in our design (add to the C-table)

| Case | Wave-5 refinement |
|---|---|
| C3+C5 | the flow is **event-sourced + deterministic-replay**: the **event log is the SoT**, the version triple pins determinism, regen is a **Command that replays from the structured SoT** (CQRS), not a mutation |
| C5 | **each step = a topological node, cached by input-fingerprint** (ComfyUI): a "dirty"/failed node re-runs *only that* unit; approved nodes stay cached = per-unit regen as *invalidation* |
| C3 | **content-aware versioning**: machine IR (.api.json) vs human view (editor), snapshot on hash-change — not raw Git diff |
| C4 | the on-device trainer is *grounded*: **ASLS L2-anchored additive head** (train the head, hold the base) + **implicit watch/skip/edit signals** (Kuaishou) + **KTO/federated-continual** for the "on the user's machine" path |

**Net for the backbone:** an "independent harness" is, concretely, a
**versioned, event-sourced, topological node-graph** (ComfyUI-style) whose
**structured layer is the deterministic SoT** (CQRS) and whose **per-unit
regeneration is a cache invalidation** of a failed node — with a **content-hashed
manifest** instead of raw Git diffs. That's the scaffolding the *video/ML*
findings (C0–C2, C4, C6) plug into. It is all *deterministic and repo-owned*;
only the critic's leaves and the additive-head weights cross the seam into the
deferred ML project.

---

# Wave 6 — the shippable-in-repo desktop session-space precedents

The last gap: is this actually *buildable in a tiny local Tauri repo*? Yes — and
there are named desktop precedents, including a Tauri "harness" that already does
our model.

## Direct Tauri precedent: dsh-desktop "harness" = our session-space model
dsh-desktop (tsdaer, a Tauri-shell *harness*) implements **exactly** our
session-as-domain design:
> "State is always computed, **never logged**. The log holds **events only**;
> the unit's state lives in a per-session **watermark cache** {state,
> observedSeq} and a persisted **PROJECTION cache** on the domain-KV seam:
> rows of (sessionId, key, ver, seq, val)."

That is the CQRS/event-sourcing pattern from wave 5 **shipped inside a Tauri
app** — the concrete, repo-shippable shape of our session flow layers +
destructive regen. It proves the pattern is not cloud-only (Temporal); it runs in
a local desktop shell.

## "Source-of-truth inversion" names our structured-SoT / derived-pipes split
PointSav: *"exactly one layer is declared canonical; every other layer is either
a **derived view** (rebuilt on demand) or a **session-ephemeral buffer** (discarded
when the session ends)."* → maps **1:1**: our structured.vN = the canonical
layer; the rendered **pipes = a derived view** rebuilt on demand; working buffers
= ephemeral. polaris-local-first adds the integrity rule: *"derived data must
never block source backup; only source data is user truth."* → **we back up the
structured layer, never the (rebuildable) pipes.**

## Concrete "destructive regenerate-from-SoT" desktop patterns
- **luthier** commit: "session regenerate **carve-out with a destructive confirm**
  dialog" — our I5 "destructive, no fallback," but UX-confirmed.
- **KohakuTerrarium v1.2**: "sessions are replayable, branchable, migratable —
  an **event-log-first** model with **format versioning**: .kohakutr.vN + a
  *non-destructive* v1→v2 migration." = our versioned layer files + a migration
  path (the "on early start versioning" payoff).
- **Epicenter ADR**: "opening is non-destructive and **never falls back**; a
  monotonically increasing integer names the current artifact (.v.db);
  **rebuilds create a NEW artifact — the old one is not mutated**." = our
  "regenerate creates version N+1, never mutates N."
- **Creative-app norm** (Figma/Blender/Photoshop): edit a *versioned document*;
  the render is **regenerated from the document**, never hand-edited ("non-
  destructive"). → The harness is a **non-destructive document editor** for the
  structured layer; the pipes are its derived render. That's the long-standing
  human pattern behind "mutate the text, regenerate the pipes."

## What this wave adds to the C-table

| Case | Wave-6 refinement |
|---|---|
| C3 | the session model is **shippable in Tauri** (dsh-desktop event-log + projection cache); **source-of-truth inversion** makes structured.vN canonical, pipes a derived view |
| C3 | "destructive regen" = **version N+1 created, N never mutated** (Epicenter/Kohaku) + a **destructive-confirm** UX gate (luthier); back up the source, not the derived pipes (polaris) |
| C5 | the harness = a **non-destructive document editor** over the structured layer (Figma/Blender norm); derived pipes re-derive from it |
| C4 | the on-device trainer's *hosting* pattern is a desktop domain-KV / projection cache (dsh-desktop), not a server |

## Exhaustion check — every case now has a worldwide solution

| Case | Solution(s) found | Waves |
|---|---|---|
| **C0 core goal** (faithfulness-to-intent) | coverage-aware faithfulness oracle (precision+recall vs intent-as-complete-oracle); per-dimension; faithfulness≠factuality; intent-hallucination = omission | 4 |
| **C1** text→structured→generation layers | ViMax two-stage; JSON blueprints; ComfyTV shot list; LPA 7 layers; MAVIN/STAGE structural storyboard; novel-to-storyboard 3-call + asset_ids | 1,3 |
| **C2** learned per-element fidelity, descending | DeCE / FIRM-Video checklist / VideoReward weights / Diffusion-DRF frozen-VLM / HuDA deterministic floor; **two-scale tree** (B-Roll per-unit + aggregate-aware root) | 2,4 |
| **C3** session-space layers + destructive regen | Three Planes / SPACE / DSH-V3 seq-remap / **Luma·Boords·Genvid per-unit** / **event-sourcing+CQRS (Temporal)** / **dsh-desktop Tauri projection** / **source-of-truth inversion** / luthier·Kohaku·Epicenter regen-from-SoT | 1,2,5,6 |
| **C4** signal-based continuous learning | AlignXplore / MiCRo / SelectRM / **ReelBrain temp·durable** / **tianpan lineage-pair** / **CHIEF user-simulation** / **Kuaishou implicit watch-skip-edit** / **ASLS L2-anchored additive head** / termux-train on-device | 1,2,4,5 |
| **C5** isolated steps / bounded context | context-rot / Three Planes / **AgentPatterns bounded step** / **DDD ACL view** / **novel-to-storyboard save-intermediates** / **ComfyUI topological node + input-fingerprint cache** | 1,3,5 |
| **C6** tiny build spec (local weights / additive heads) | LoRA / tinker / **ONNX MultiLoRA + Rust onnxer** / **ONNX model_package manifest** / ModelSharp | 1,2,5 |

Every case + the core goal is now grounded in a named, cited worldwide solution.
The exploration is exhausted: further searching would re-cover the same sources.
The shippable spine is: a **versioned, event-sourced, source-of-truth-inverted,
topological session** (C3/C5) whose **structured layer is the canonical SoT**,
pipes are a **non-destructive derived render** (C3), fidelity is a **coverage-
aware, two-scale, HuDA-floored critic** (C0/C2), learning is a **lineage-pair
signal → additive-head on-device trainer** behind a **model_package manifest**
(C4/C6), and each step is a **bounded, cached node** (C5) — all repo-owned and
deterministic, with only the critic leaves + head weights crossing into the
deferred ML project.

---

# Wave 7 — implementation-grade mechanisms (from "analogous project" to "we can adopt THIS")

Waves 1-6 found *projects that do something similar*. This wave finds the
**concrete mechanism** for each of our open sub-cases, so each answer is
copyable, not just "someone does it."

- **C0/C1 — deriving a required-elements checklist from a SHORT intent, no golden:**
  the field auto-extracts it — **TICK** (arXiv 2410.03608) has the judge LLM
  *decompose the instruction into a YES/NO checklist*, then score against it;
  **DeCE's recall** extracts "criteria from the answer's Required Information"
  (the user's own intent IS the reference); **BiFact** decomposes both sides into
  atomic facts and scores P/R/F1; **Arize checklist-rubric**: "completeness only
  works when *required is written down* — enumerate the elements a good answer
  must contain." -> Our C0 oracle is concrete: **decompose the intent into
  atomic required-elements (TICK/DeCE); structured-layer RECALL = fraction
  covered; PRECISION = fraction of produced elements supported (no invention).**
- **C2 — the concrete two-scale aggregation that is reproducible (not vibes):**
  **From Rubrics to Reliable Scores** (arXiv 2601.08654) *locks* a **rubric
  bundle** (traits, operational checklist, scoring, rubric, hash) so runtime
  reinterpretation is frozen; **RubricArmor** (arXiv 2610.05308) is the
  anti-reward-hacking check — *test whether a low-quality output can still pass
  every checklist item*; if yes, the checklist is too weak. -> Our FIRM-Video
  leaf = a **versioned rubric bundle** that must pass a RubricArmor-style
  "can a bad plan trivially check every box?" gate before it's trusted as a floor.
- **C4 — the concrete signal→training-pair objective:** a single user edit is a
  **medley of SFT labels + preference pairs + RL rewards** ("Principled
  Fine-tuning from User-Edits"); the DPO triple is (x, y_w=chosen, y_l=rejected),
  and from our lineage-pair: x=intent/novel, y_l=model's original output,
  y_w=user's final edit. **KTO** is the cheap variant — *single response + a
  binary label* (no paired rejection needed). -> our SignalRecord maps
  directly onto a KTO positive or a DPO pair.
- **C6 — the real copyable additive-head manifest + runtime format:** the
  on-device format is **llama.cpp GGUF LoRA adapters** (PEFT→GGUF via
  convert_lora_to_gguf.py; hot-swap at runtime; abeten/llama-cpp-python#1817
  "LoRA hotswapping and MULTIPLE LoRAs at a time" without reloading the base) +
  **cera (crates.io)** = a *Rust* GGUF inference engine. -> the "tiny build
  spec" = { GGUF base path + a list of GGUF LoRA adapter sidecars + version },
  activation = SetActiveAdapters(names[]); the deferred runtime is genuinely
  Rust-shippable in our process.
- **C1 — an open-schema + deterministic-render anchor to build against:**
  **SKEL / @openskeleton/spec** = an *open* storyboard data format (JSON Schemas
  + TS types + tooling) to validate our structured layer against;
  **storyboard2video** = "structured storyboard JSON → a video with
  DETERMINISTIC rendering, no generative model — one wrong number is an
  accident, so the picture must be *computed, not guessed*."

# Wave 8 — the "careful text-output tests + versioning covering" space

Your own phrasing named a case I'd only covered implicitly: **the eval/
regression-test harness** a generative pipeline lives in. This is where the
fidelity critic *operates and is tested*.

- **The 4-layer harness (the "covering" discipline):** (1) a **frozen GOLDEN
  dataset** (approved inputs + outputs/criteria, human-reviewed; *never* let the
  model-under-test write its own expected output), (2) **deterministic
  assertions** (equals/contains/regex/JSON-Schema), (3) **LLM-as-judge +
  metrics**, (4) a **CI regression gate** that blocks the merge when a quality
  threshold drops. Tools: **promptfoo** (multi-provider prompt regression +
  CI), **Ragas**, **DeepEval** (pytest-native, assertions next to unit tests),
  Braintrust/LangSmith. *"Evals as tests: score output against checked-in
  golden datasets, detect regressions in tiers, fail the build past a critical
  line."*
- **The exact C0/C2 reference-critic algorithm (Ragas faithfulness):**
  decompose → **atomic claims**; **NLI-verify** each claim against the context
  (a DeBERTa cross-encoder = a *cheap deterministic backend*, or an LLM
  judge); aithfulness = supported / total claims — **reference-free**
  (the *retrieved context* is the reference; ours = the user's intent/novel).
  That is the deterministic HuDA-class floor made *algorithmic*.
- **The non-determinism honesty invariant (test design):** temperature-0 + seed
  does **not** guarantee reproducibility (near-tie flips + provider variance
  remain; "correct ≠ reproducible"). -> **Sample N runs, aggregate, assert on
  properties/thresholds on the golden-set AVERAGE, never exact strings.**
  Deterministic Phase-0 steps = the **locked seams**; the LLM step = the
  **float**, covered by N-sample aggregate + property assertions.
- **The load-bearing fail-fast rule:** "missing or inconclusive evidence is
  **never a pass** — a case with no frozen golden, an empty baseline, or an
  oracle that could not run is **INCONCLUSIVE and blocks promotion** exactly
  like a failure." -> our careful text-output discipline: no golden / can't
  run the critic / no baseline = **INCONCLUSIVE, block the regen**, never a
  silent pass.
- **Layer-separated regression (EvalFlow):** run the golden set enough times to
  *separate real regressions from sampling noise*; **check the retrieval layer
  and the generation layer SEPARATELY so a broken upstream can't hide behind a
  fluent output** = our I1 isolation as an *eval* discipline: score each
  mutation step's output in isolation, not just the final video.
- **Prompt versioning completes the version triple:** "treat prompts as
  configuration in a registry (semantic versioning, diffs, commit messages) +
  an evaluation gate that blocks changes that degrade quality." -> OC-1 (the
  LLM expand prompt) is not "open"; it is a **versioned, gated registry
  artifact**, and **the version triple extends to include the prompt version**.

## Refreshed exhaustion check

Every sub-case now has BOTH an analogous project AND a concrete mechanism:

| Sub-case | Analogous project (waves 1-6) | Concrete mechanism (waves 7-8) |
|---|---|---|
| C0 required-elements recall, no golden | 2606.09376 / Intent-Hallucination | **TICK/DeCE/BiFact checklist auto-extraction**; intent-as-reference |
| C2 two-scale aggregation | B-Roll per-unit + sequence critic | **rubric-bundle locking (2601.08654) + RubricArmor anti-hack**; **Ragas claim-decomposition + NLI** floor |
| C4 signal→training pair | ReelBrain / tianpan lineage-pair | **DPO (x, original, edited) / KTO single-label** from the edit; **DITTO few-demo bootstrap** |
| C6 additive-head runtime | ONNX MultiLoRA / tinker | **llama.cpp GGUF LoRA sidecars + Rust cera**; manifest = base + adapter sidecars + version |
| C1 viable structured layer | novel-to-storyboard / STAGE | **SKEL @openskeleton/spec** (open JSON-Schema) + **storyboard2video** deterministic render |
| "careful text-output tests + versioning" | (implicit) | **4-layer eval harness (golden + deterministic + judge + CI gate)**; promptfoo/Ragas/DeepEval; frozen goldens; N-sample aggregate; **INCONCLUSIVE-blocks**; prompt-registry versioning |

**The exploration is now complete at the mechanism level**: every one of our
cases — and the "tests + versioning covering" you named — has a named worldwide
solution *and* a concrete, adoptable mechanism. The ledger holds 57 evidence
entries across 8 waves.
