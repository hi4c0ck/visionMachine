# Agnes AI Film-Maker — Video Harness Reference

> Durable notes extracted from `laurentvoanhofficiel-jpg`'s
> `Voanh-Agnes-film-maker` / `Agnes-ai-film-maker-Universal-one-page-HTML-4-all`
> (byte-identical single-file app). Saved 2026-10-29 for the next video-harness
> generation from text steps.

## 0. What it is

A single `index.html` (no backend, IndexedDB + localStorage persistence) that
turns **text → full short film**: synopsis → characters → scenes → shots (plans)
→ per-shot generated image → per-shot generated video clip → sequential player.
The whole idea is "tiroirs imbriqués" (nested drawers): each element knows its
parents so consistency is preserved.

```
PROJET(film: genre, ratio, synopsis)
  ├─ Personnages   (name, role, desc[EN physical], outfit[EN], img)
  └─ Scènes        (title, summary[FR], decor[EN], mood[EN], chars[], dialogue[])
       └─ Plans   (size, camera, action[EN], chars[], who, line[FR], img, video, vst)
```

A **video belongs to a plan, a plan to a scene, both to the film.**

---

## 1. Text → video development chain (the 4 LLM stages)

Every stage is a JSON extractor (`llmJSON`, 2 retries). Language split is
**deliberate**: user-facing fields in French, technical fields in English
(image/video prompts always English). `CTX()` prefixes every prompt:
`"Genre : <name> (<style>)."`.

| Stage | Role / temp | Prompt core | Output schema |
|---|---|---|---|
| `aiSyn` | script-doctor / 0.8 | rewrite author synopsis + give 10 stronger alternatives | `{title, base, suggestions[10]}` |
| `aiMerge` | screenwriter / 0.6 | fuse base + selected suggestions into one coherent story | `{final}` (8–12 sentences) |
| `aiChars` | casting dir / 0.7 | 3–6 main characters | `characters[{name, role(FR), desc(EN), outfit(EN)}]` |
| `aiScenes(n)` | screenwriter / 0.75 | exactly `n` scenes telling the whole film | `scenes[{title, summary, decor, mood, chars[], dialogue[{who,line}]}]` |
| `aiShots(s)` | DOP / 0.7 | **"3 à 5 plans de 8 à 10 secondes. Répartis les répliques."** | `shots[{size, camera, action, chars[], who, line}]` |

`nsc` default = **5 scenes**. The shot-cutter is the primary *per-clip* and
*total-length* control (see §2).

### Forward insight
The pipeline is just a **deterministic DAG of structured-prompt → JSON** steps.
For a next-gen harness, keep: (a) strict JSON-only LLM outputs, (b) FR/EN field
split, (c) genre context injected at every node, (d) temperature tuned per node
(higher for creative "generate", lower for "fuse"). Each node is independently
re-runnable ("refaire cette étape") — that idempotency is the whole UX.

---

## 2. Clip length (the crucial moments)

Length is emergent from **three coupled knobs**, not one global value:

1. **Shot-cutter prompt** → 3–5 clips/scene, 8–10 s each, dialogue distributed.
2. **Generation mode** (`KEYS.plan`):
   - `free` → `agnes-video-v2.0`, `num_frames:97, frame_rate:12` ⇒ **≈8.08 s/clip**
   - `plan` → `agnes-video-2.5-flash`, `seconds:'10', mode:'keyframe', size:'720P'` ⇒ **10 s/clip**
3. **Aspect ratio** sets resolution: `16:9 → 854×480`, `9:16 → 480×854`,
   `1:1 → 640×640` (free); `720P` (plan). Character portraits force `9:16`.

**Total runtime** ≈ `nsc × (3–5 shots) × (8–10 s)` = ~40 s to ~250 s.
The player sums clips sequentially; a clip with no video degrades to
**still image + TTS (fr-FR)**, held `max(3500ms, line.length × 75ms)`.

### Forward insight
- `num_frames` and `frame_rate` are the two raw dials for free-mode clip length
  (97/12 ≈ 8 s). Bumping to e.g. 121/12 = 10.08 s.
- Plan mode takes a human `seconds` string instead — keep a unified "target clip
  seconds" abstraction and translate per-model.
- Keep **subtitle/TTS fallback** for failed clips so the film is always playable.

---

## 3. Exact API payloads

```
API   = https://apihub.agnes-ai.com/v1
POLL  = https://apihub.agnes-ai.com/agnesapi
TEXT  = [agnes-3.0-flash, agnes-2.5-flash]
IMG   = agnes-image-2.5-flash
VIDEO = { free: agnes-video-v2.0, plan: agnes-video-2.5-flash }
RPM   = { free:{img:10,vid:1,txt:10}, plan:{img:100,vid:5,txt:600} }
```

- **text** `POST /chat/completions`:
  `{model, messages:[system, user], temperature, max_tokens,
    chat_template_kwargs:{enable_thinking:false}, extra_body.image:[refs]}`
- **image** `POST /images/generations`:
  `{model:IMG, prompt, n:1, size:'1K', ratio,
    extra_body:{response_format:'url', image:[≤4 ref data-URIs]}}`
- **video** `POST /videos`:
  - free : `{model, prompt, num_frames:97, frame_rate:12, width, height, image:fr}`
  - plan : `{model, prompt, seconds:'10', mode:'keyframe', size:'720P', aspect_ratio, first_frame:fr}`
  - `fr` = the shot's generated image URL/data-URI.
- **poll** `GET /agnesapi?video_id=…&model_name=…` every **8 s (plan) / 30 s
  (free)**, **30-min** per-video timeout.

### Forward insight (gotchas worth reusing)
- **base64-wrapped video_id**: if `id` starts with `video_`, strip it, pad to
  `%4`, `atob()`, then regex `video_id:([^;]+)` to get the *inner* id. Poll with
  **both** ids until one returns a status.
- **503 = queue saturated** (not a hard error): use exponential backoff ladder
  `BACK=[3,6,12,24,48,96]` minutes, no requests sent while saturated.
- **429** on poll: sleep 8 s and continue, not fail.
- **401/402/403** twice on one key → mark key `off`.

---

## 4. Rate & queue math (multi-key planner)

`slot(kind)` picks the key with the earliest available slot:
`interval = 60000 / RPM[plan][kind] * 1.15 * F`.

- `F` = adaptive multiplier: start 1.0, **×1.5 on 429 (cap 4)**, **×0.97 on
  success (floor 1)** → self-throttling.
- Video queue: a `setInterval(…, 1000)` launches the next `wait`-shot only when
  concurrent in-flight `run < max(2, liveKeys * 3)`.
- **More keys ≈ linear video throughput.** This is the main scaling lever.

### Forward insight
The concurrency cap `max(2, liveKeys*3)` is deliberately conservative for the
free video queue (1 RPM/key). For a paid harness, raise this; for a home
harness, keep it and rely on the backoff ladder. Model `RPM` + `F` as the
single source of truth and re-derive everything else.

---

## 5. Consistency engine ("climb the drawers")

Each shot's **image becomes that clip's `first_frame`**, and the video prompt
hard-codes *"Keep the identity, outfit and visual style of the first frame
identical throughout."* Reference selection by entity type:

| Entity | refs | ratio |
|---|---|---|
| character | `[]` (fresh portrait) | `9:16` |
| scene | `cImgs(chars present)` ≤ 3 | project ratio |
| shot | `cImgs(chars).concat(scene.img)` ≤ 4 | project ratio |

`cImgs(n)` = characters whose name appears in `n` and that already have an
`img`, sliced to 3. `st()` injects the genre style string.

### Forward insight
This is the core **identity-preservation** mechanism. Generalize it: any shot
prompt auto-gathers the "drawer path" (film → scene → chars present) as
references. That's what keeps the same face/costume across all clips — the
single biggest quality factor for a text-to-film harness.

---

## 6. Non-blocking + resumable design

- `mkImg` returns `{u, d}` immediately; `d` (the ref-ready data-URI) is produced
  **in the background** by `toData()` (canvas downscale to max 1024, JPEG 0.86)
  and only awaited via `ensureRef()` when later used as a reference. Generation
  never stalls the queue.
- `save()` debounced 350 ms → IndexedDB `cinegenesis_v1` (stores `sessions`,
  `config`), with localStorage + in-memory fallback.
- Per-shot state machine `vst`: `wait → run → ok | er`. On load, `resume()`
  re-attaches `poll()` to any `run` shot whose key still exists; `run` without
  a live task is coerced back to `wait`.

### Forward insight
The **crash-safe resume** (debounced persistence + re-poll on load) is what lets
a multi-hour free-tier run survive tab reloads. Replicate: persist the DAG
state machine, and re-attach long-running polls on boot.

---

## 7. How to configure a proper pipeline from entry data

The operator sets **4 knobs**; everything else auto-derives:

1. **Key tier** (`free`|`plan`) — master switch: model, clip length (8.08 s vs
   10 s), resolution (auto vs 720P), RPM ceiling (vid 1 vs 5), poll cadence.
   Use `plan` keys for smooth high-throughput runs.
2. **Aspect ratio** — set early; fixes resolution for every image + clip.
3. **`nsc` + shots/scene rule** — the total-length lever. ~2 min film →
   `nsc=5`; 30-s teaser → `nsc=1–2` and tighten the cutter prompt to
   "2–3 plans de 8 s".
4. **Number of keys** — widens the queue; concurrency ≈ `liveKeys×3`.

Always run **images before video** (the queue only launches shots that have an
`img`); a failed image → still+TTS, not video.

### Reuse rule for the next harness
> Entry surface = `{ key tier, ratio, nsc, shots-per-scene }`. Everything else
> (rate, backoff, concurrency, consistency, clip length) is a pure function of
> these four. Design the config API so that is the only surface.

---

## 8. Visual-specification layer — expand entry text → saturated scene spec

Goal for the next harness: take **plain entry text** and emit a **full scene
specification** with saturated details across camera / zoom / transitions /
effects and other tags — not just the repo's thin `{size, camera, action}`.

### 8.1 What the repo already has (the seed)
- `G` = ~43 `Label|EN-style` genre strings; `st()` = `P.genre.style` injected
  into every image/scene/shot prompt.
- Shot: `size` (wide|medium|close-up|over-the-shoulder), `camera` (free text,
  default `static`), `action` (EN, 1–2 sentences).
- Scene: `decor` (EN place), `mood` (EN mood + lighting).
- Character: `desc` (EN physical), `outfit` (EN colors).
- Video prompt `vp()` appends style, setting, ambient-sound-only, and the
  **identity-lock** line on the first frame.

### 8.2 Gaps to close (the dimensions to saturate)
| Dimension | Today | Target tag set |
|---|---|---|
| **Transitions / cuts** | none (repo has no assembly) | `cut_type ∈ {hard_cut, crossfade, dissolve, wipe, match_cut, jump_cut, whip_pan, l_cut, j_cut, cut_on_action}` (in-clip motion + assembly metadata) |
| **Effects / VFX** | implicit via style | `effects[] ∈ {fog, rain, smoke, lens_flare, bokeh, sparks, dust, snow, fire, magic_glow, glitch, ...}` |
| **Color grade** | implicit | `grade {palette, saturation, contrast, film_stock}` (e.g. `teal_orange, desaturated, kodak_250d`) |
| **Zoom / lens** | one free-text `camera` | `zoom ∈ {static, in, out, crash, rack_focus, push, pull}` + `lens.focal_mm ∈ {14,24,35,50,85,135}` |
| **Angle / framing** | `size` only | `angle ∈ {eye, low, high, dutch, overhead, worm, bird}` + `framing ∈ {rule_of_thirds, centered, symmetrical, fill_frame, headroom, negative_space}` |
| **Depth of field** | none | `dof ∈ {shallow, medium, deep}` |
| **Lighting** | inside `mood` | `light {key, contrast, color_temp_K, pattern}` (e.g. `key=hard, contrast=high, 5600K, backlit`) |
| **Camera move / motion** | free text | `move ∈ {static, pan, tilt, track, dolly, crane, handheld, steadicam, orbit, drone, zoom}` + `speed ∈ {slow, normal, fast, speed_ramp}` |
| **Audio design** | "ambient, no music" | `audio {ambience, foley, sfx, music_cue, silence}` (record now, apply at assembly) |
| **Pacing / tempo** | none | `tempo ∈ {slow, medium, fast, staccato, sustained}` |

### 8.3 Expanded `shotSpec` schema (superset of the repo's shot)
```
shotSpec = {
  /* existing (keep) */
  size, camera, action, decor, mood, chars[], who, line, img, video, vst,
  /* NEW visual saturation */
  angle, framing, dof,
  lens: { focal_mm, distortion },
  zoom, move, speed,
  light: { key, contrast, color_temp_K, pattern },
  grade: { palette, saturation, contrast, film_stock },
  effects: [ ... ],
  audio: { ambience, foley, sfx, music_cue, silence },
  tempo,
  /* transition = between-clip, drives assembly, NOT a single clip model */
  transition_in, transition_out
}
```

### 8.4 Prompt templates (inject the tags into the two generations)

**Shot image (film still)** — append the saturated block after the existing
identity/refs clause:
```
"Cinematic film still, {size} shot, {angle} angle, {framing} framing. {style}.
Setting: {decor}. Mood: {mood}. Lighting: {light.key}, {light.contrast}
contrast, {light.color_temp_K}K, {light.pattern}. Lens {lens.focal_mm}mm,
{dof} depth of field. Action: {action}. Camera: {move}, {zoom} zoom,
{speed} speed. Effects: {effects.join(', ')}. Color grade: {grade.palette},
{grade.saturation}, {grade.film_stock}. No text, no watermark. Keep identity
identical to references."
```

**Shot video (clip)** — the per-clip motion/zoom/effects live here; keep the
repo's identity-lock and ambient-sound rules:
```
"{style}. {action}. Camera: {move} with {zoom} zoom, {speed} speed,
{dof} DoF, {lens.focal_mm}mm. Lighting {light.pattern}, {light.color_temp_K}K.
Effects: {effects}. Grade: {grade.palette}. Transition-in: {transition_in}.
Realistic ambient sound only, no music, no subtitles, no on-screen text.
Keep the identity, outfit and visual style of the first frame identical."
```

**Director pass (new step between `aiScenes` and `aiShots`)**: one LLM node
that assigns, per scene, the shared `grade`, `light`, `tempo`, and an
ordered `effects` palette, then per-shot `angle/framing/dof/zoom/move/speed`
and the `transition_*` at shot boundaries. This is where "saturated detail"
is produced deterministically from the plain entry text.

### 8.5 Critical nuance for the next harness
- **In-clip motion** (zoom, speed-ramp, whip-pan, match-cut-in, effects,
  grade, DoF) → bake into the **per-clip prompt** above; the image/video model
  will honor it.
- **Between-clip transitions** (crossfade, dissolve, l/j-cut) → the model can't
  produce these. Record them as `transition_*` metadata and add a **final
  assembly stage** (`ffmpeg` `concat` / `xfade` + audio mix + optional TTS/
  subtitle burn) that the repo currently **lacks**. The repo's player just
  sequences clips; an assembly pass is the forward upgrade.
- Keep the **4-ref consistency engine** (film→scene→chars) feeding each shot's
  `first_frame`; the new visual tags must not disturb it — append, don't
  replace, the identity clause.
- Text/subtitles are **explicitly forbidden** by the repo's prompts; if a future
  version wants on-screen text, do it in the assembly/grade stage, not the
  clip model.

### 8.6 Forward rule for the visual layer
> Plain entry text → **director LLM node** → saturated `shotSpec` (camera,
> zoom, lens, angle, framing, DoF, light, grade, effects, audio, tempo,
> transitions). In-clip visual tags go into the per-clip image+video prompt;
> between-clip transitions + audio + any text go into a new **assembly
> stage**. The consistency reference engine stays untouched.

---

## 9. Two-node visual pipeline with generation profiles

Solid architecture: split the visual layer into **two nodes**, each carrying its
own **profile** (the configuration you "sit" the node on for a generation run).
Preset profiles are learned from this repo's own evidence (§9.4).

### 9.1 The two nodes

```
plain entry text
   │
   ▼
[ NODE A — VISUAL NOVEL ]        (creative / expansive, profile: CreativeProfile)
   │  emits: a rich, human-readable "visual language novel"
   ▼
VisualNovel (structured prose: film → scenes → shots, saturated sensory detail)
   │
   ▼
[ NODE B — MECHANICAL WRAP ]     (deterministic / strict, profile: SpecProfile)
   │  emits: structured mechanical wrapped text (shotSpec JSON + prompt strings)
   ▼
generation-ready spec  →  image/video payloads (§3) + assembly metadata (§8.5)
```

- **Node A (text → visual-language novel).** Takes sparse entry text and expands
  it into a *prose* visual document: the film's world/palette, then each scene
  and shot written in saturated visual language (light, texture, sound, motion,
  color, weather, time). Output is **human-reviewable and editable** — that's the
  value of a "novel" intermediate.
- **Node B (novel → mechanical wrapped text).** Consumes the novel and produces
  the **deterministic, schema-valid** `shotSpec` (§8.3) plus the exact image/video
  prompt strings (§8.4) the models eat. Output is **machine-validatable**.

Split rationale (why two, not one):
1. Node A is where **creativity + detail saturation** live (high temp, free
   prose). Node B is where **determinism + correctness** live (low temp,
   JSON-only, constraint enforcement). Mixing them degrades both.
2. A stable novel can be **re-wrapped** with different SpecProfiles (platform,
   aspect ratio, model tier) without re-running creative expansion → cheap,
   cacheable, and re-runnable per target.
3. Each node is independently **profileable** because its failure modes differ:
   A = "not vivid / not saturated", B = "invalid / inconsistent / wrong payload".

### 9.2 VisualNovel intermediate shape (Node A output = Node B input)
```
VisualNovel = {
  film:  { title, logline, style, world, palette, time_of_day, weather },
  scenes:[ {
      title,
      prose,                       // rich visual-language description
      shots:[ { prose, beats[] } ] // per-shot saturated prose + beat list
  } ]
}
```
`prose` is the saturated visual language. Node B maps `prose` → `shotSpec` tags
deterministically. This is the single hand-off document between the two nodes.

### 9.3 Profile schema (what a profile configures)

**Common profile fields**
```
Profile {
  id, name,
  role,                // system-prompt persona
  temperature,
  languageSplit:{ user, technical },   // repo: user=FR, technical=EN
  stylePreset,          // one G tag string (§8.1) or override
  constraints[],        // hard rules
  consistency:{ refDepth, maxRefs },    // drawer policy (repo: max 4 refs)
  seed
}
```

**CreativeProfile (Node A)** — adds:
```
expansion:{ sceneCount, shotsPerScene, minClipS, maxClipS,
            detailLevel, sensoryAxes[] }   // which senses to saturate
```

**SpecProfile (Node B)** — adds:
```
outputContract,          // strict shotSpec JSON schema (§8.3)
tagVocabulary,           // which saturated dims to emit (camera/zoom/lens/
                         // angle/framing/dof/light/grade/effects/audio/
                         // tempo/transitions)
promptTemplates:{ image, video },   // §8.4
payloadTarget           // free | plan → drives clip length + resolution (§2)
```

### 9.4 Preset profiles — learned from this repo

The repo supplies every anchor a preset needs:
- **stylePreset** ← `G` (43 genre style strings, §8.1).
- **temperature anchors** ← the repo's per-stage temps: aiSyn 0.8, aiMerge 0.6,
  aiChars 0.7, aiScenes 0.75, aiShots 0.7 (Node A ≈ 0.7, Node B ≈ 0.3).
- **tagVocabulary / field sets** ← entity fields (character/scene/shot, §8.2).
- **constraints** ← "JSON-only", "No text, no watermark", "ambient sound only",
  identity-lock, `extra_body.image ≤ 4` refs.
- **payloadTarget** ← `KEYS.plan` free/plan split (§2, §4).

A **film preset** = a `{ CreativeProfile, SpecProfile }` pair:

| Preset | Node A (CreativeProfile) | Node B (SpecProfile) |
|---|---|---|
| **Cinema** (repo default) | temp 0.7 · nsc 5 · 3–5 shots · 8–10 s · style auto-from-genre · detail medium · payload plan | temp 0.3 · full tag vocab · `payloadTarget=plan` (720P, 10 s) · `maxRefs=4` |
| **Trailer / Short-form** | temp 0.8 · nsc 1–2 · 2–3 shots · 8 s · style `Bande-annonce\|epic cuts` · sensoryAxes = impact/motion · detail high | temp 0.3 · tagVocab += transitions {crossfade, match_cut, whip_pan} · grade high-contrast · payload plan |
| **Documentary** | temp 0.5 · nsc 5 · long-take · style `Documentaire\|natural light, real locations` · sensoryAxes = available light/sound · detail medium | temp 0.2 · grade film_stock neutral · effects minimal · move {static, handheld} · payload plan |
| **Anime / Animation** | temp 0.7 · style `Anime\|cinematic` or `Style Moebius` · sensoryAxes = stylized color · detail high | temp 0.3 · grade flat palette · effects stylized · `payloadTarget=free` · nsc 5 |
| **Action** | temp 0.75 · style `Action\|high contrast, motion energy` · sensoryAxes = energy/motion · tempo fast · detail high | temp 0.3 · grade high-contrast · speed {speed_ramp} · transitions {jump_cut, whip_pan} · payload plan |

Mapping of repo functions to the two nodes (for porting):
- **Node A** ≈ `aiSyn`/`aiMerge` (story) + `aiChars` + `aiScenes` + the *prose*
  fields of `aiShots` (summary, decor, mood, action, dialogue).
- **Node B** ≈ `promptFor` (ref selection + prose→prompt), `vp` (video prompt),
  `dims`/`launch` (payload), `cImgs`/`st`/`sheet` (consistency), `J`/`llmJSON`
  (strict JSON extraction).

### 9.5 Forward rule for the two-node pipeline
> Split creative expansion from mechanical wrapping. Node A (CreativeProfile)
> writes the saturated **VisualNovel**; Node B (SpecProfile) wraps it into a
> schema-valid `shotSpec` + prompt strings. Both are profiled independently;
> preset film profiles = `{Creative, Spec}` pairs learned from the repo's genre
> tags, per-stage temperatures, entity field sets, and constraints. A stable
> novel is re-wrap-able across targets without re-generating the creative layer.

---

## 10. Input/output config models + first small test

Goal: **declare the I/O config models so the LLM output is constrained to
deliver exactly the wanted shape** (not free prose that drifts), then run the
cheapest end-to-end test with a tiny entry config.

### 10.1 The three data models (the only shapes that flow)
Everything is a constrained JSON object. A node = `input model + profile +
output model`.

**`FilmSeed`** — the minimal entry config (input to Node A).
```
FilmSeed {
  title      : string,
  idea       : string,            // 1–3 sentences of plain text
  genre      : { name, style },   // one G tag (§8.1)
  ratio      : "16:9"|"9:16"|"1:1",
  scale      : { scenes:int, shotsPerScene:int, clipS:[int,int] }
}
```

**`VisualNovel`** — Node A output = Node B input (§9.2).

**`ShotSpec`** — Node B output (§8.3) + the two prompt strings (§8.4).

### 10.2 The contracts
| Node | input | profile | output | how output is pinned |
|---|---|---|---|---|
| **A** | `FilmSeed` | CreativeProfile | `VisualNovel` | `response_format=json_schema` = VisualNovel schema · `expansion` caps scene/shot counts · `detailLevel` sets prose length |
| **B** | `VisualNovel` (one shot) | SpecProfile | `ShotSpec` | `response_format=json_schema` = ShotSpec schema · **enum `tagVocabulary`** on every tag field · `payloadTarget` fixes clip seconds + resolution |

The key engineering rule: **Node B must be called with `response_format` =
json_schema and every tag field set to an `enum` from `tagVocabulary`.** That
is what makes the LLM "deliver exactly our reasonable desires" — it cannot
emit a value outside the declared vocabulary or a field outside the schema.

### 10.3 Golden test vector (the small first test)
Tiny entry — **1 scene, 2 shots** — so the run is cheap and the shapes are
easy to verify by hand. This is a *golden vector*: the harness asserts each
stage's output against these exact shapes.

**Input — `FilmSeed`:**
```json
{
  "title": "The Last Ferry",
  "idea": "A lone ferryman waits for a boat that never comes in a foggy harbor.",
  "genre": { "name": "Thriller", "style": "tense thriller, low-key lighting, cold teal tones" },
  "ratio": "16:9",
  "scale": { "scenes": 1, "shotsPerScene": 2, "clipS": [8, 10] }
}
```

**Node A → `VisualNovel` (expected, constrained):**
```json
{
  "film": {
    "title": "The Last Ferry",
    "logline": "A ferryman waits for a boat that never comes in a cold foggy harbor.",
    "style": "tense thriller, low-key lighting, cold teal tones",
    "world": "an isolated stone harbor at night, endless water, a single lamplight",
    "palette": "desaturated teal, black, faint amber",
    "time_of_day": "night",
    "weather": "dense fog"
  },
  "scenes": [
    {
      "title": "The Harbor",
      "prose": "A lone ferryman stands at the edge of a fog-drowned harbor; low-key light carves his face, cold teal air, a single amber lamp the only warm point in the frame.",
      "shots": [
        { "prose": "wide, slow dolly-in through fog toward the still ferry; the man small against the black water; faint lighthouse sweep in the far distance", "beats": ["establish fog", "reveal ferry", "hold on man"] },
        { "prose": "close-up on the man's face, shallow focus, breath fogging; he leans forward listening; a distant horn barely cuts the silence", "beats": ["lean in", "listen", "horn"] }
      ]
    }
  ]
}
```
Check: `scenes.length == 1`, `shots.length == 2` (matches `scale`); `palette`,
`time_of_day`, `weather` filled (saturated detail); FR-free EN technical fields.

**Node B → `ShotSpec[0]` (expected, enum-pinned):**
```json
{
  "size": "wide", "camera": "slow dolly-in",
  "angle": "eye", "framing": "rule_of_thirds", "dof": "deep",
  "lens": { "focal_mm": 35 },
  "zoom": "in", "move": "dolly", "speed": "slow",
  "light": { "key": "low-key", "contrast": "high", "color_temp_K": 5600, "pattern": "fog diffused" },
  "grade": { "palette": "teal_black_amber", "saturation": "desaturated", "contrast": "high", "film_stock": "kodak_5219" },
  "effects": ["fog"],
  "audio": { "ambience": "water, wind, distant horn", "foley": "rope creak", "sfx": "horn", "music_cue": "low sustained drone", "silence": false },
  "tempo": "sustained",
  "transition_in": "hard_cut", "transition_out": "crossfade",
  "clip_s": 10,
  "prompts": {
    "image": "Cinematic film still, wide shot, eye angle, rule of thirds. tense thriller, low-key lighting, cold teal tones. Setting: isolated stone harbor at night, dense fog. Action: slow dolly-in through fog toward a still ferry, lone ferryman small against black water. Lens 35mm, deep DoF. Effects: fog. Grade: desaturated teal/black/amber, high contrast, kodak_5219. No text, no watermark.",
    "video": "tense thriller, low-key lighting, cold teal tones. Slow dolly-in toward the still ferry, cold fog, 35mm deep DoF, low-key diffused light. Effects: fog. Grade: desaturated, high contrast. Transition-in: hard_cut. Realistic ambient sound only, no music, no subtitles, no on-screen text. Keep the identity and visual style of the first frame identical."
  }
}
```
Check: every tag ∈ declared `enum` (`size`,`angle`,`framing`,`dof`,`zoom`,`move`,`speed`,`tempo`,`transition_*`); `clip_s` ∈ `scale.clipS`; `ratio` → `prompts` use 16:9-safe framing; `effects` ⊆ vocabulary; the identity-lock line is present (consistency preserved).

### 10.4 How to enforce "exactly our desires"
1. **Schema** — `response_format = json_schema` on Node B with the `ShotSpec`
   schema; Node A with the `VisualNovel` schema. The model must conform.
2. **Enums** — set each tag field to an `enum` built from the active
   `SpecProfile.tagVocabulary`; out-of-vocabulary values become impossible.
3. **Cap counts** — Node A `expansion` fixes `scenes.length` and
   `shotsPerScene`; assert post-hoc (`length == cap`), re-run on violation.
4. **Post-validate + repair** — run a JSON schema validator; on failure, retry
   Node B with the error in the system prompt (max 2, mirroring the repo's
   `llmJSON` 2-retry, `J` repair parser, lines ~231 and 584).
5. **Clamp physics** — clamp `clip_s` into `scale.clipS`, `focal_mm` into the
   lens list, `color_temp_K` to a sane 2500–10000K.

### 10.5 Forward rule for the I/O models
> A node is exactly `{ input model, profile, output model }`. Pin the LLM with
> `response_format=json_schema` + per-field `enum` from the active
> `tagVocabulary`, cap counts from the `FilmSeed.scale`, and post-validate with
> a 2-retry repair loop. The golden test vector (§10.3) — 1 scene, 2 shots — is
> the first regression to assert both nodes end-to-end.

### 10.6 Executable config fixture (copy-paste ready)

**`VisualNovelSchema` (Node A `response_format`).** Enforces the shape; `scale`
caps counts.
```json
{ "type":"object", "additionalProperties": false,
  "required":["film","scenes"],
  "properties": {
    "film": { "type":"object","additionalProperties":false,
      "required":["title","logline","style","world","palette","time_of_day","weather"],
      "properties":{ "title":{"type":"string"},"logline":{"type":"string"},
        "style":{"type":"string"},"world":{"type":"string"},"palette":{"type":"string"},
        "time_of_day":{"enum":["dawn","morning","midday","afternoon","evening","night"]},
        "weather":{"type":"string"} } },
    "scenes": { "type":"array","minItems":1,"items":{
      "type":"object","additionalProperties":false,
      "required":["title","prose","shots"],
      "properties":{ "title":{"type":"string"},"prose":{"type":"string"},
        "shots":{ "type":"array","minItems":1,"maxItems":5,
          "items":{ "type":"object","additionalProperties":false,
            "required":["prose","beats"],
            "properties":{ "prose":{"type":"string"},
              "beats":{"type":"array","items":{"type":"string"}} } } } } } } } }
```

**`ShotSpecSchema` (Node B `response_format`).** Every visual tag is an `enum`
from the active `tagVocabulary` → the model **cannot emit out-of-vocabulary
values**. `additionalProperties:false` blocks drift.
```json
{ "type":"object","additionalProperties":false,
  "required":["size","camera","angle","framing","dof","lens","zoom","move","speed","light","grade","effects","audio","tempo","transition_in","transition_out","clip_s","prompts"],
  "properties":{
    "size":{"enum":["wide","medium","close-up","over-the-shoulder"]},
    "camera":{"type":"string"},
    "angle":{"enum":["eye","low","high","dutch","overhead","worm","bird"]},
    "framing":{"enum":["rule_of_thirds","centered","symmetrical","fill_frame","negative_space"]},
    "dof":{"enum":["shallow","medium","deep"]},
    "lens":{"type":"object","additionalProperties":false,
      "required":["focal_mm"],
      "properties":{"focal_mm":{"enum":[14,24,35,50,85,135]},
                    "distortion":{"type":"string"}}},
    "zoom":{"enum":["static","in","out","crash","rack_focus","push","pull"]},
    "move":{"enum":["static","pan","tilt","track","dolly","crane","handheld","steadicam","orbit","drone","zoom"]},
    "speed":{"enum":["slow","normal","fast","speed_ramp"]},
    "light":{"type":"object","additionalProperties":false,
      "required":["key","contrast","color_temp_K","pattern"],
      "properties":{"key":{"enum":["soft","hard","low-key","high-key","backlit"]},
                    "contrast":{"enum":["low","medium","high"]},
                    "color_temp_K":{"type":"integer","minimum":2500,"maximum":10000},
                    "pattern":{"type":"string"}}},
    "grade":{"type":"object","additionalProperties":false,
      "required":["palette","saturation","contrast","film_stock"],
      "properties":{"palette":{"type":"string"},"saturation":{"enum":["saturated","desaturated","neutral"]},
                    "contrast":{"enum":["low","medium","high"]},"film_stock":{"type":"string"}}},
    "effects":{"type":"array","items":{"enum":["fog","rain","smoke","lens_flare","bokeh","sparks","dust","snow","fire","magic_glow","glitch","none"]}},
    "audio":{"type":"object","additionalProperties":false,
      "required":["ambience","foley","sfx","music_cue","silence"],
      "properties":{"ambience":{"type":"string"},"foley":{"type":"string"},
                    "sfx":{"type":"string"},"music_cue":{"type":"string"},
                    "silence":{"type":"boolean"}}},
    "tempo":{"enum":["slow","medium","fast","staccato","sustained"]},
    "transition_in":{"enum":["hard_cut","crossfade","dissolve","wipe","match_cut","jump_cut","whip_pan","l_cut","j_cut","cut_on_action"]},
    "transition_out":{"enum":["hard_cut","crossfade","dissolve","wipe","match_cut","jump_cut","whip_pan","l_cut","j_cut","cut_on_action"]},
    "clip_s":{"type":"integer","minimum":4,"maximum":12},
    "prompts":{"type":"object","additionalProperties":false,"required":["image","video"],
      "properties":{"image":{"type":"string"},"video":{"type":"string"}}} } }
```

**Node A prompt** (system) — `response_format = json_schema(VisualNovelSchema)`:
```
You are the film director. From the FilmSeed, write a saturated VISUAL NOVEL
in vivid English prose: the film's world/palette/time/weather, then each scene
and shot as dense visual language (light, texture, sound, motion, color,
weather). Follow the exact JSON schema; do NOT add fields.
User: {FilmSeed JSON} · genre style: "{genre.style}"
```

**Node B prompt** (system) — `response_format = json_schema(ShotSpecSchema)`:
```
You are the DOP/mechanical writer. Convert ONE novel shot into a strict
ShotSpec. Use ONLY values from the allowed enums. "image" and "video" prompt
strings must bake in-clip tags (lens, zoom, move, DoF, light, grade, effects,
transition_in) and end the video prompt with: "Keep the identity and visual
style of the first frame identical." Never put on-screen text into prompts.
User: novel film context {film} · scene prose {scene.prose} · shot {prose, beats}
      ratio={ratio} · clip_s within [{clipS[0]},{clipS[1]}] · grade/light/
      effects palette inherited from film world
```

**Golden run (the easy first test).** Feed the §10.3 `FilmSeed` (1 scene,
2 shots) → Node A → assert `VisualNovelSchema` + `scenes[0].shots.length == 2`
→ Node B per shot → assert `ShotSpecSchema` + every enum ∈ vocabulary +
`clip_s ∈ [8,10]` + identity-lock line present. That's the whole first test.

### 10.7 Runnable first test
`harness/video-harness.test.js` (dependency-free, plain `node`) already:
- embeds both `response_schema` objects above,
- validates the golden `VisualNovel` and `ShotSpec` vectors against them,
- asserts the structural invariants (counts == `scale`, enums in vocabulary,
  `clip_s` within `scale.clipS`, identity-lock line present, no on-screen text).

Verified in this environment with
`C:\Program Files\nodejs\node.exe harness\video-harness.test.js` →
**ALL PASS, exit 0** (8/8 checks). The two real LLM steps are stubbed as
`callNodeA` / `callNodeB` (one call each, `response_format=json_schema`); wire
those to your endpoint and the same file drives the live two-node test.

---

## 11. Structural configuration layout (standalone, no code)

The pipeline is configured as **data files**, not code. Each node reads its
declarations from the files below; nothing here is executable.

```
harness/
├─ config/
│   ├─ nodes.yaml            ← node_a + node_b + assembly: role, in/out models,
│   │                          profile binding, prompt, hard constraints
│   ├─ tag_vocabulary.yaml   ← CLOSED enum sets (tags), numeric bounds,
│   │                          style_presets (learned from the repo's G table)
│   └─ profiles.yaml         ← 5 preset {creative, spec} pairs (cinema,
│                              trailer, documentary, animation, action)
├─ schemas/
│   ├─ film_seed.schema.json       ← input to Node A
│   ├─ visual_novel.schema.json    ← Node A output = Node B input
│   └─ shot_spec.schema.json       ← Node B output (every tag = closed enum)
├─ golden/
│   ├─ film_seed.json              ← tiny entry (1 scene, 2 shots)
│   ├─ visual_novel.json           ← expected Node A output
│   └─ shot_spec.json             ← expected Node B output
└─ video-harness.check.js  ← read-only structural check (no LLM):
                             schemas well-formed, golden vectors conform,
                             counts == scale, shot enums ⊆ tag_vocabulary
```

### 11.1 Data-flow (which file feeds which node)
```
golden/film_seed.json ──► Node A ──► schemas/visual_novel.schema.json
profiles.yaml.creative ─┘            golden/visual_novel.json (expected)

golden/visual_novel.json ──► Node B ──► schemas/shot_spec.schema.json
profiles.yaml.spec ────────┘          golden/shot_spec.json (expected)
tag_vocabulary.yaml ────┘  (every enum is sourced here, 1 source of truth)

golden/shot_spec.json[] ──► Assembly (ffmpeg) ──► final film + sidecar
```

### 11.2 What is data vs code
- **Data (the configuration you asked for):** `nodes.yaml`, `profiles.yaml`,
  `tag_vocabulary.yaml`, the three `schemas/*.json`, and the three `golden/*.json`.
  These fully declare input/output models, per-node profiles, preset film
  profiles, the closed tag vocabulary, and the tiny test vectors.
- **Code (executable, run via real Windows `node.exe` on `.js` only):**
  `video-harness.check.js` (structural check) and `video-harness.test.js`
  (golden test). They *consume* the config; they are not the config.

### 11.3 Verification status
`"C:\Program Files\nodejs\node.exe" harness\video-harness.check.js`
→ **ALL PASS (19/19)**: the three schemas are well-formed, the golden vectors
conform, counts equal `scale`, and every `ShotSpec` tag enum is a subset of
`tag_vocabulary.yaml`. The config is structurally self-consistent and ready to
drive real Node A / Node B generation calls.

---

## 12. LLM request/response contract + how to test it

§11 declared *what* flows; this section declares *exactly how the LLM call is
configured* (the wire request), *what the response looks like* (the wire
response), and *how to test it* — mock (no key, green now) and live.

### 12.1 Transport config — `config/llm.json`
| field | value |
|---|---|
| `provider.type` | `openai-compatible` (same wire as the repo's `/v1/chat/completions`) |
| `provider.base_url` | `https://apihub.agnes-ai.com/v1` |
| `provider.chat_path` | `/chat/completions` |
| `provider.auth` | `Authorization: Bearer ${AGNES_API_KEY}` · `key_source: settings` (no embedded secret — see §13) |
| `models.node_a` / `models.node_b` | `agnes-3.0-flash` / `agnes-2.5-flash` |
| `generation.temperature` | node_a **0.5**, node_b **0.3** |
| `generation.max_tokens` | node_a 4500, node_b 2000 |
| `chat_template_kwargs` | `{ enable_thinking: false }` (repo convention) |
| `structured_output.mode` | `response_format_json_schema`, `strict: true`, `fallback json_object` |
| `retry` | `attempts: 2`, `append_validation_errors_to_system_prompt`, `sleep_ms: 1500` |

### 12.2 The Node A wire request (`fixtures/node_a.request.json`)
```
POST {base_url}/chat/completions
{
  "model": "agnes-3.0-flash",
  "temperature": 0.7,
  "max_tokens": 4500,
  "chat_template_kwargs": { "enable_thinking": false },
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "VisualNovel", "strict": true,
      "schema": <schemas/visual_novel.schema.json> }
  },
  "messages": [
    { "role": "system", "content": "You are the film director…" },
    { "role": "user",   "content": "FilmSeed: {…} · genre style: … ·
                                    creative profile: cinema · Hard counts: …" }
  ]
}
```
The `response_format.json_schema.schema` is the **standalone file**
`schemas/visual_novel.schema.json` — the test asserts they are byte-identical
after meta-stripping, so the request can never drift from the declared model.

### 12.3 The Node A wire response (`fixtures/node_a.response.json`)
```
{
  "model": "agnes-3.0-flash",
  "data": { "choices": [ {
      "finish_reason": "stop",
      "message": { "role": "assistant",
        "content": "<JSON string that parses to VisualNovel>" } } ] }
}
```
`content` is a JSON *string* (OpenAI-compatible convention); the harness does
`JSON.parse(message.content)` → validates against `VisualNovel` → compares to
`golden/visual_novel.json`.

### 12.4 The Node B wire request (`fixtures/node_b.request.json`)
Same envelope as 12.2, but:
- `model: agnes-2.5-flash`, `temperature: 0.3`, `max_tokens: 2000`
- `response_format.json_schema.name = "ShotSpec"`,
  `schema = schemas/shot_spec.schema.json` (every tag = closed enum)
- `messages[0]` (system) pins the hard rules: *only allowed enums, bake
  in-clip tags into both prompt strings, end video prompt with the identity-lock
  line, no on-screen text, `clip_s` within `seed.scale.clipS`*
- `messages[1]` (user) injects the **single-shot context**: `film` block,
  `scene.title`, `scene.prose`, `shot.prose`, `shot.beats`, `ratio`,
  `clip_s` bounds, active SpecProfile, and the allowed tag sets.

### 12.5 The Node B wire response (`fixtures/node_b.response.json`)
Same envelope as 12.3; `content` parses to `ShotSpec` and deep-equals
`golden/shot_spec.json`.

### 12.6 Test runner — `harness/run-llm.test.js`

**MOCK mode (default; no API key; green in CI now):**
1. **Config integrity** — each fixture `request.body.response_format.json_schema.schema`
   is deep-equal to the standalone `schemas/*.json`; `model` / `temperature`
   equal `config/llm.json`; user content carries the golden `FilmSeed`
   (Node A) and the shot context (Node B).
2. **Response contract** — `data.choices[0].message.content` parses to JSON;
   validates against the corresponding response schema; **deep-equals the
   golden vector**.
3. **Tag-vocabulary closure** — every `ShotSpec` tag enum in the Node B fixture
   schema is a subset of `tag_vocabulary.yaml`'s closed sets.
4. **Cross-file invariants** — `scenes`/`shots` counts == `FilmSeed.scale`;
   `clip_s` within `clipS`; video prompt carries the identity-lock line.

**LIVE mode (`--live`, requires `AGNES_API_KEY`):**
POST each fixture `body` to `provider.base_url + chat_path`, parse `content`,
validate against the schema; on failure **append the validation errors into
the system prompt and retry up to `llm.json retry.attempts (2)`** — the same
2-retry repair pattern as the source repo's `llmJSON` (lines ~584).

### 12.7 Status
`"C:\Program Files\nodejs\node.exe" harness\run-llm.test.js` → **30/30 PASS**
in mock mode (schema integrity, response contract, tag-vocabulary closure,
invariants). Live mode appends real LLM calls only when a key is available and
reaches the endpoint:
`& 'C:\Program Files\nodejs\node.exe' harness\run-llm.test.js --live`

---

## 13. Credential policy + live test status

**Rule (your requirement):** the committed harness carries **provider
*references*, not secrets**. Real keys stay local for dev tests only, and the
production path gathers providers from app Settings — so CI/CD needs no key
and nothing can leak.

- **Committed (safe):** `config/llm.json` sets `auth.key_source: "settings"`
  and names `auth.key_env: "AGNES_API_KEY"` — it points to *where* a key comes
  from, but embeds **no key value**. Fixtures use a `${AGNES_API_KEY}`
  placeholder.
- **Local only (gitignored):** `harness/.env` holds the dev key
  (`AGNES_API_KEY`, `AGNES_BASE_URL`, model overrides). `harness/.gitignore`
  + the root `.gitignore` (`.env`) both exclude it; `git check-ignore
  harness/.env` confirms it is ignored.
- **Real source of truth (production):** the app's **Settings → providers**,
  persisted in `com.visionmachine.desktop\visionmachine.db` →
  `profile_settings.providers.{text,image,video}` (`baseUrl` + `apiKey` +
  `model`). Production reads the active profile's `providers.text` here; the
  dev test mirrors the same values into `.env` so both agree.
- **Dev key origin:** profile **`hi4`** (`profile_45ffb6991a3f614d`) —
  `baseUrl=https://apihub.agnes-ai.com`, one key shared across
  text/image/video, models `agnes-2.5-flash` / `agnes-image-2.5-flash` /
  `agnes-video-2.5-flash`, `generationDefaults`: 24 fps, 720p, horizontal,
  sequential, alwaysNewSeed.

### Live test status (2026-10-29)
- **Mock:** 30/30 PASS — the request/response contract is sound and locally
  verified end-to-end.
- **Live:** the real LLM POST now works. **32/32 PASS** with the `hi4` key.
- **Root cause of the earlier "403" (corrected):** it was **NOT** an egress-IP
  ban. The runner built the URL with `new URL('/chat/completions', base)`,
  which treated the leading `/` as root-absolute and **silently dropped `/v1`**,
  so the request went to `https://apihub.agnes-ai.com/chat/completions` — a
  path Cloudflare's WAF rejects with 403. The correct
  `…/v1/chat/completions` returns **200** (verified directly with `curl`
  against the `hi4` key).
- **Fix:** `run-llm.test.js` now concatenates `${base}${chat_path}` (no `new URL`
  root-absolute trick), and `harness/.env` sets
  `AGNES_BASE_URL=https://apihub.agnes-ai.com/v1`. The WAF 403 diagnostic was
  retained but is no longer the blocking cause on this host.
- **Smoke signal confirmed:** the live run prints the LLM's actual output for
  both nodes, showing it read our `response_format=json_schema` request model
  correctly (counts, enums, identity-lock line all present) and stayed within
  the declared `ShotSpec`/`VisualNovel` shapes.

---

## 14. Live smoke test with user entry text + scoring (2026-10-29)

**Goal:** feed a plain text script through Node A → Node B, inspect how the LLM
interpreted our request model, and read off the config nudge points. No media
generation — text-only, two LLM calls.

### 14.1 Entry text (user's)
> "Naive girl walking through forest inspired by animals, birds outside, then
> the grizzy nightwhack starts down with brief clouds but at the end she obtain
> keep him calm and friendly"

Saved verbatim as `harness/golden/film_seed.json` → `idea` field, genre
`Documentary`, `scale { scenes:1, shotsPerScene:2, clipS:[8,10] }`.

### 14.2 Tool used
`harness/show-live-outputs.js` — two `fetch` POSTs to
`{base}/chat/completions`, one per node, with the exact wire body from
`fixtures/node_{a,b}.request.json`. Prints:
- **full raw LLM JSON** (capped only when a repetition loop is detected),
- **per-field scorecard** (expectations declared by our config),
- **deviations** (config nudge points the run surfaced).

### 14.3 Result (this run)
| Node | Score | Details |
|---|---|---|
| A (text → VisualNovel) | **8/10** | A6 palette rubric missed literal keyword; A9 "calming beat" phrased behaviorally, not lexically |
| B (VisualNovel → ShotSpec) | **18/18** | every tag ∈ vocabulary, clip_s=8, identity-lock line present |
| **Total** | **26/28 (93%)** | 2 misses are rubric-literalism, 1 nudge is real |

### 14.4 Config nudge points (act on these)
1. **`music_cue`** — Node B filled `audio.music_cue = "harp + soft strings"`
   even though the spec profile says "ambient-only." Make it a **hard enum
   constraint** (`music_cue ∈ {silent, ambient, underscore, none}`) in
   `shot_spec.schema.json`, not just a prose line.
2. **Rubric too literal on palette** — Node A returned `amber, emerald, umber,
   twilight violet`; the rubric looked for `dusk/evening/night` words. Accept
   the LLM's own palette; don't enforce a keyword match on creative fields.
3. **Rubric too literal on "calming"** — Node A wrote "the beast sniffs, then
   lowers its head, sharing the cooling dusk." Behaviorally correct, lexically
   absent of "calm/friend." Relax A9 to accept **behavioral markers**
   (`lowers head`, `settles`, `shares`, `soothes`) in addition to literal words.

### 14.5 Node A repetition-loop defect — root cause + fix
First live run (temp 0.7, old system prompt ending with *"Do NOT add fields
outside the schema"*) produced ~500× repetition of
`no AI-generated ratio, no AI-generated scale, …`, hit `max_tokens=4500`
mid-loop, and returned **truncated, unparseable JSON**.

Fix (applied to `llm.json` + regenerated fixtures):
- `generation.temperature.node_a`: **0.7 → 0.5**
- system prompt reworded to:
  > "Keep every string under 300 characters. No repeated phrases. Do not list
  > exclusions or negations — just describe what IS present."

Post-fix run: both nodes produce clean JSON in ~5 s, ~1300 output tokens each.

### 14.6 Re-run command (text-only, no media)
```
"C:\Program Files\nodejs\node.exe" harness/show-live-outputs.js
```
That single command is the smoke test. Re-run it after any config change
(profile, schema, tag_vocabulary, temperature) to see how the LLM re-interprets
our request model.

---

## 15. Human-readable output layer (user-facing) vs JSON (machine)

The JSON contracts (§10–§12) are for **the machine** — transitions, assembly,
the image/video model requests. The **user** should see how their plain text
turns into a *nature novel* and then into *structured shot sheets*. That is a
separate, deterministic render pass with **no extra LLM calls**.

```
plain text (FilmSeed.input_text)
   │
   ├─► JSON  (VisualNovel, ShotSpec)   → machine: requests, assembly, transitions
   │
   └─► human report (lib/render-human.js) → user: readable doc
        §1  Your text            (verbatim input)
        §2  The Visual Novel     (world + scenes + shots + beats, prose)
        §3  Structured Shot Sheets (spec table + image/video prompt strings)
```

- **`harness/lib/render-human.js`** — pure formatters:
  - `renderNovelDocument(novel)` → the novel as a readable markdown doc
  - `renderShotSheet(ctx, spec)` → one shot as a compact spec table + prompt strings
  - `renderHumanReport({...})` → the whole thing in order
  - No LLM, no randomness: same JSON → same report.
- **`FilmSeed` now carries `input_text`** (optional, display-only) so the
  report can show the user's *actual* wording, not a paraphrase.
- **`show-live-outputs.js`** prints the raw JSON **and** the human report, and
  writes it to `harness/out/human-report.md`.
- **Per-shot Node B:** the runner now wraps **each** novel shot into a
  `ShotSpec` (not just shot[0]), so every shot gets its own structured sheet.

### 15.1 Design rule
> Two outputs from the same JSON: **machine JSON** stays in
> `schemas/`/`ShotSpec` (drives transitions, assembly, media-model requests);
> **human report** is a read-only render of that JSON for the operator. Never
> mix them — the human layer formats, it does not invent.

### 15.2 Open items (deferred, deliberately not over-engineered)
- `scale.scenes` was 1 but the LLM returned 2 scenes — pin the count in the
  Node A prompt or accept the LLM's own split.
- Node B `max_tokens=2000` truncated a verbose shot (S2.2) — raise when needed.
- `audio.music_cue` kept leaking through the "ambient-only" rule — promote to
  a hard enum if music must be blocked.

---

## 16. User-confirmation gate layer

The pipeline is **conversational**, not batch. Every step is gated: the
runner stops, shows the user the intermediate output (human report),
lets them acquire/adjust parameters, gets explicit confirmation, then
the next step fires. Any gate can backtrack (re-run an upstream step
with modified params).

Declarative config: `harness/config/gates.yaml` (5 gates).

### 16.1 Pipeline with gates

```
[G0] Entry params
   │  user sets: input_text, genre, ratio, scale, profiles
   ▼
Node A (text → VisualNovel)
   │
   ▼
[G1] Novel review
   │  user sees: readable novel (world, scenes, shots, beats)
   │  user can edit: any prose field, scale, palette, weather
   │  confirm: "Does this novel match your vision?"
   │  backtrack: re-run Node A with edits
   ▼
Node B (per-shot → ShotSpec)
   │
   ▼
[G2] Spec review
   │  user sees: structured shot sheets (spec table + prompts)
   │  user can edit: any tag enum, prompt strings, clip_s
   │  confirm: "Proceed to media generation?"
   │  backtrack: re-run Node B (single shot), or Node A (whole novel)
   ▼
Media generation (image + video per shot)   [future]
   │
   ▼
[G3] Clip review
   │  user sees: generated stills + clips
   │  user can re-roll: any clip with same or edited prompt
   │  confirm: "All clips acceptable?"
   │  backtrack: re-run Node B, or media for one shot
   ▼
Assembly (ffmpeg concat + xfade + audio mix)  [future]
   │
   ▼
[G4] Final review
   │  user sees: assembled film playback
   │  user can adjust: transitions, audio mix, subtitles, output codec
   │  confirm: "Export?"
   │  backtrack: re-run assembly, or media, or any upstream gate
   ▼
Done
```

### 16.2 Gate schema (from `gates.yaml`)

Each gate declares:

| field | meaning |
|---|---|
| `position` | `before: <step>` or `after: <step>` — where the gate sits |
| `show` | what human-readable output the user sees |
| `acquirable` | parameters the user can set/adjust (field paths into the JSON) |
| `confirm` | the question the runner asks before proceeding |
| `backtrack` | which upstream step(s) can be re-run from this gate, and under what trigger |
| `auto` | whether the gate auto-confirms in batch/CI mode (`true` = skip prompt) |

### 16.3 Batch / CI mode

`gates.yaml` → `batch_mode`:
- `auto_confirm: true` — every gate with `auto: true` is skipped.
- Gates with `auto: false` (G0, G1, G2) use the current parameter values
  without prompting, and log the decision.
- `skip_gates: []` — optionally skip specific gate IDs entirely.
- `log_decisions: true` — all auto-confirmed decisions written to a log.

This is how the harness runs headless: same gate structure, no human in the loop.

### 16.4 Design rules
- **Gates are structural data** (YAML), not code. The runner reads
  `gates.yaml` and implements the gate positions; the gate config is
  what the user interacts with, not the code.
- **Backtrack is explicit**: each gate lists which upstream step it can
  re-run and under what trigger. No implicit state.
- **`acquirable` uses field paths** into the JSON (`shots[].size`,
  `film.palette`) so the same gate config works for any number of
  scenes/shots — it's not tied to a fixed shot count.
- **Human report (the §15 renderer) is the gate display**: the gate
  shows the user the human-readable output, not the JSON. The JSON is
  what the user's edits are written back into.

### 16.5 Validation (before building the gate loop)
`harness/gates.check.js` (read-only, no LLM) asserts the gate config is
structurally sound — **85/85 PASS**:
- all 5 gates have `position/show/acquirable/confirm/backtrack/auto`;
- `position` + every `backtrack.re_run` reference a known step;
- **every `acquirable` path resolves in the matching schema** (G0→FilmSeed,
  G1→VisualNovel incl. `scenes[].shots[].beats` + `scale.*`, G2→ShotSpec),
  with `creative_profile`/`spec_profile` checked against `profiles.yaml`;
- `batch_mode` present.

The gate loop (`run-gate.js`) is built only on a green gate check —
validate the config first, then wire the orchestrator.

---

## 17. Molecular split + text-only verified terminal

### 17.1 Divide by molecules, by every meaningful change
The flat `ShotSpec` (all look fields on one object) is replaced by two
molecules with a **derive** step between them:

```
SCENE molecule (SceneSpec)      stable LOOK, generated ONCE per scene
  time_of_day · weather · light{key,contrast,color_temp_K,pattern}
  · grade{palette,saturation,contrast,film_stock} · ambience · tempo · effects_base

SHOT molecule (ShotMolecule)    only the MEANINGFUL CHANGE, generated per shot
  inherit: <scene_id>           the link to its scene base
  subject · composition{size,angle,framing,dof} · lens · motion{zoom,move,speed,camera}
  · effects_delta · audio{foley,sfx,music_cue,silence} · transition_in/out · clip_s

derive(scene, shot)             DETERMINISTIC (lib/derive.js, no LLM)
  base = scene look; delta = shot change
  → prompts.image / prompts.video  (composed, NOT LLM-guessed)
  → timeline (accumulated timecodes) + frames (= clip_s × 24 fps)
```

Rule: a shot **never restates** what its scene already carries — only the
change is explicit; the rest is inherited. The LLM emits the delta; the
machine composes the prompts.

### 17.2 Live nodes for the molecular split
- **Node A′** (`run-gate.js run scene_a`): novel scene → `SceneSpec` (base look),
  `response_format=json_schema(SceneSpec)`, one call per scene.
- **Node B molecular** (`run-gate.js run node_b`): (SceneSpec + novel shot) →
  `ShotMolecule` (delta only, `inherit` + empty `prompts`), then `derive()` fills
  prompts + frames + timeline. The LLM is told: *inherit the scene base, emit
  only the change, leave prompts empty.*

### 17.3 Timeline, ahead, step by step + frame floor
`lib/derive.js` → `renderTimeline()`: each composition is a step with
`[t → t+clip_s] · size/angle · focal · motion · frames`. Frame goal
(**soft**, not a hard block): `MIN_FRAMES=24`, `TARGET_FRAMES=40` @ `24 fps`.
Any composition under the minimum is flagged `⚠ UNDER MINIMUM`.

### 17.4 Text-only verified terminal (the pipeline STOPS here)
`harness/pipeline.js` lays the text path out as stages and terminates at a
**VERIFY** stage — **no media, no ffmpeg, no delivery** (explicitly out of
scope):

```
S0 entry → S1 novel(Node A) → S2 scene(Node A′) → S3 shot(Node B) → S4 derive → S5 VERIFY
```

S5 VERIFY uses `lib/validator` + `lib/tagsets` to confirm the text is clean:
- **V1 schema** — VisualNovel / SceneSpec / ShotMolecule validate
  (computed `effects`+`frames` from S4 are stripped; only LLM-authored text is checked)
- **V2 tag-closure** — every tag value ∈ closed vocabulary
- **V3 counts** — scenes & shots match `FilmSeed.scale`
- **V4 frame floor** — each clip ≥ 24f min / 40f target @ 24 fps
- **V5 invariants** — identity-lock line present; no on-screen text

Verified state (green, exit 0) is the harness output. `out/pipeline.json`
stores `{ verified, errors, frames, total_frames }` — a pure text-state manifest.

### 17.5 Forward rule
> Split the look into a **scene molecule** (base, once) and a **shot molecule**
> (delta, per shot); `derive()` composes the prompts deterministically. The
> pipeline is **text-only** and terminates at a **verified text state**
> (schema + tag-closure + counts + frame floor + invariants). Media/ffmpeg/
> delivery are out of scope for this harness.

