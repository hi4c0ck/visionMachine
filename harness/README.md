# Video Harness — Reproducible Flow

Text-only pipeline: plain entry text → Visual Novel → Scene Division → Shot Specs (concern groups + sub-timeline). No media generation. No ffmpeg. No video model calls. Pure text mutation, structurally verified.

## Prerequisites

| requirement | check |
|---|---|
| Windows `node.exe` | `& 'C:\Program Files\nodejs\node.exe' --version` |
| API key (dev only) | `harness/.env` exists with `AGNES_API_KEY=...` (gitignored, never committed) |
| Base URL | `AGNES_BASE_URL=https://apihub.agnes-ai.com/v1` in `.env` |
| Text model | `AGNES_TEXT_MODEL=agnes-2.5-flash` in `.env` (or defaults to `config/llm.json`) |

> **NEVER run `*.node` binaries directly.** The path `D:\work\agnes\AgnesCode\resources\bin\node` is a Linux bash wrapper — it does nothing useful on Windows. Always use `C:\Program Files\nodejs\node.exe` on `.js` files.

## File Layout

```
harness/
├─ config/
│  ├─ llm.json               # transport, models, temps, retry, response_format
│  ├─ tag_vocabulary.yaml    # CLOSED enum sets + numeric bounds + style presets
│  ├─ profiles.yaml          # 5 preset {creative, spec} pairs
│  ├─ nodes.yaml             # declarative node/step definitions
│  └─ gates.yaml             # G0–G4 user-confirmation gate positions
├─ schemas/
│  ├─ film_seed.schema.json      # S0 input
│  ├─ visual_novel.schema.json   # S1 output
│  ├─ scene_timeline.schema.json # S2 output (division + timeline)
│  └─ shot_spec.schema.json      # S3 output (concern groups + sub_timeline)
├─ golden/
│  ├─ film_seed.json         # entry: "The Grizzly's Forest"
│  ├─ visual_novel.json      # golden S1
│  └─ shot_spec.json         # golden S3
├─ fixtures/
│  ├─ node_a.request.json    # exact wire request (S1)
│  ├─ node_a.response.json   # exact wire response (S1, golden)
│  ├─ node_b.request.json    # exact wire request (S3)
│  └─ node_b.response.json   # exact wire response (S3, golden)
├─ lib/
│  ├─ concern-axes.js        # vector substrate: encode/decode/fold/diff
│  ├─ derive.js              # deterministic prompt composition + timeline
│  ├─ render-human.js        # JSON → human-readable markdown
│  ├─ tagsets.js             # YAML tag reader
│  └─ validator.js           # minimal JSON-schema validator + deepEqual
├─ out/                       # session state + variant results (gitignored)
│  ├─ session.json           # current gate-runner session
│  ├─ variants/              # per-variant pipeline results
│  └─ variants-report.html   # self-contained comparison page
├─ run-gate.js               # conversational gate runner (S1→S2→S3 interactive)
├─ batch-variants.js         # batch: N ideas × full pipeline, save JSON
├─ render-variants-html.js   # generate self-contained comparison HTML
├─ pipeline.js               # S0→S5 text-only verified terminal (manifest)
├─ video-harness.check.js    # structural check (schemas + golden + tags)
├─ gates.check.js            # gate config check (gates.yaml + field paths)
├─ run-llm.test.js           # mock (33 checks) + live (2-retry repair)
├─ gen-fixtures.js          # regenerate fixtures from golden + schemas
├─ demo-molecule.js         # one-shot demo: session → molecule → timeline
├─ show-live-outputs.js     # raw LLM output + scorecard (diagnostic)
└─ .gitignore               # .env, out/, scratch scripts
```

## The Pipeline (S0 → S5)

```
S0  Entry         FilmSeed JSON (your text + genre + ratio + scale)
  │
  ▼
S1  Visual Novel  Node A (LLM): text → saturated visual language novel
  │               schema: visual_novel.schema.json
  ▼
S2  Division      scene_divide (LLM): novel → SceneTimeline
  │               (scene parts at transition points, novel_ref, clip_s,
  │                transition_in/out + notes; NO camera/lens here)
  │               schema: scene_timeline.schema.json
  ▼
S3  Spec          spec (LLM × N shots): each timeline shot → ShotSpec
  │               (concern groups: camera/lens/motion/lighting/grade/effects/audio
  │                + sub_timeline slices with concern states
  │                + content carried from novel)
  │               schema: shot_spec.schema.json
  │               deltas COMPUTED by foldStates + diffStates (concern-axes.js)
  ▼
S4  Derive        deterministic: prompts + timeline + frames (no LLM)
  │               lib/derive.js
  ▼
S5  VERIFY        text-only check: schema + tag-closure + counts
                  + frame floor (24f min / 40f target @ 24fps)
                  + invariants → "clean verified text state"
```

**Frame cap (engine 720P preset):** max `clip_s = 10` → 240 frames @ 24 fps, under the ~241-frame ceiling. The schema enforces `clip_s: {min: 4, max: 10}`.

## Running the Flow (Interactive, via Gates)

All commands use the real Windows node. From the project root (`D:\work\horizonsMachine\VisionMachine`):

```powershell
N = 'C:\Program Files\nodejs\node.exe'
```

### 1. Start a new session

```powershell
& $N harness\run-gate.js new
```

Creates `harness/out/session.json` from `golden/film_seed.json`.

### 2. G0 — Entry

```powershell
& $N harness\run-gate.js gate G0
& $N harness\run-gate.js confirm G0
```

Shows your text, genre, ratio, scale. Confirm to proceed.

### 3. S1 — Visual Novel (live LLM)

```powershell
& $N harness\run-gate.js run node_a
& $N harness\run-gate.js gate G1
& $N harness\run-gate.js confirm G1
```

Node A expands your text into a full visual novel (logline, world, palette, scenes, shots with cinematic beats). G1 shows the human-readable novel. Confirm.

### 4. S2 — Scene Division (live LLM)

```powershell
& $N harness\run-gate.js run scene_divide
& $N harness\run-gate.js run timeline
```

One LLM call divides the novel into scene parts at transition points. Each shot references the novel via `novel_ref` (1-to-1, no invented shots). The timeline prints timecodes, frame counts, transition notes. **No camera/lens/zoom here** — structure + content only.

### 5. S3 — Shot Specs (live LLM × N)

```powershell
& $N harness\run-gate.js run spec
& $N harness\run-gate.js gate G2
```

One LLM call per timeline shot. Each spec has:
- **content** (WHAT): novel prose + beats, carried in
- **concerns** (HOW): camera / lens / motion / lighting / grade / effects / audio — each group holds only its own tags
- **sub_timeline**: up to 4 slices tracking dynamic changes, each with a concern state + computed deltas

Sub-timeline deltas are **computed** by `foldStates()` + `diffStates()` in `lib/concern-axes.js`, not written by the LLM. The vector substrate snaps out-of-vocab values to the nearest clean enum.

### 6. G2 — Spec Review

```powershell
& $N harness\run-gate.js gate G2
& $N harness\run-gate.js confirm G2
```

Shows the full timeline + all concern-grouped specs + sub-timelines. Confirm to seal.

### 7. Verify (text-only terminal)

```powershell
& $N harness\pipeline.js
```

Runs S0→S5, validates schema + tag-closure + counts + frame floor + invariants. Prints `ALL PASS` or lists failures. Saves `out/pipeline.json`.

## Running the Checkers (No LLM, No Network)

```powershell
& $N harness\video-harness.check.js   # 25/25 — schemas + golden + tag closure
& $N harness\gates.check.js            # 83/83 — gates.yaml + field paths
& $N harness\run-llm.test.js           # 33/33 — LLM request/response contract (mock)
```

All three run offline. `run-llm.test.js` also supports live mode:

```powershell
& $N harness\run-llm.test.js --live    # real LLM calls, 2-retry repair
```

## Running the Variant Batch (Strategic Compare)

Five structurally different plain-text ideas through the full S1→S2→S3 pipeline:

```powershell
& $N harness\batch-variants.js          # all 5 (or: batch-variants.js v1_lighthouse_doc v3_rainy_chase)
& $N harness\render-variants-html.js    # → out/variants-report.html
```

Results saved to `out/variants/<id>.json`. The HTML is self-contained (no network), openable directly in a browser.

### The 5 variants

| id | genre | ratio | shots | runtime |
|---|---|---|---|---|
| `v1_lighthouse_doc` | Documentary | 16:9 | 4 | 37s |
| `v2_astronaut_signal` | Sci-Fi | 2.39:1 | 4 | 40s |
| `v3_rainy_chase` | Action | 2.39:1 | 6 | 50s |
| `v4_house_horror` | Horror | 4:3 | 4 | 43s |
| `v5_cat_office` | Comedy | 1:1 | 4 | 26s |

## Rebuilding After Config Changes

After editing any schema, tag vocabulary, or golden file:

```powershell
& $N harness\gen-fixtures.js       # regenerate wire fixtures from golden + schemas
& $N harness\video-harness.check.js  # verify structural consistency
& $N harness\gates.check.js           # verify gate field paths
& $N harness\run-llm.test.js         # verify LLM contract (mock)
```

All four must be green before running live.

## Key Invariants

| invariant | where enforced |
|---|---|
| `clip_s` ∈ [4, 10] (240f max @ 24fps, under 720P ~241f engine cap) | `scene_timeline.schema.json` + `shot_spec.schema.json` + `tag_vocabulary.yaml` bounds |
| Every tag ∈ closed vocabulary | `tag_vocabulary.yaml` → schema enums → `video-harness.check.js` V2 |
| 1-to-1 novel shot → timeline shot | `run-gate.js` structure check in `run timeline` |
| Sub-timeline deltas computed, not written | `concern-axes.js` `foldStates` + `diffStates` |
| Out-of-vocab values snap to nearest clean enum | `concern-axes.js` `decodeVector` (clamped) |
| Novel content (prose + beats) carried into spec | `run-gate.js` S3 step fills `spec.content` from `novel_ref` |
| Concern groups hold only their own tags | `shot_spec.schema.json` `concerns` structure |
| No on-screen text in prompts | `pipeline.js` V5 invariant |

## The Vector Substrate (for learning)

`lib/concern-axes.js` defines the axes table. Every concern state can be:

- **encoded** to a flat vector (`encodeVector`) — positions in a fixed axis space
- **decoded** back to clean enums (`decodeVector`) — clamped to valid range
- **folded** across sub-timeline slices (`foldStates`) — carry-forward + normalize
- **diffed** between states (`diffStates`) — computed concern-notation deltas

This is the learning substrate. The actual learner (centroids, interpolation, anomaly detection) is intentionally **not built here** — that's your part, fed by the persisted `effective_states` vectors in `out/variants/*.json`.

## Credential Policy

| layer | location | committed? |
|---|---|---|
| Committed config | `config/llm.json` → `auth.key_source: "settings"`, fixture uses `${AGNES_API_KEY}` placeholder | ✅ |
| Local dev secret | `harness/.env` (key from VisionMachine app profile `hi4`) | ❌ gitignored |
| Production source | app Settings → `visionmachine.db` → `profile_settings.providers.*` | n/a |

CI/CD never needs a key. Mock mode runs without any key. Live mode SKIPs cleanly when `AGNES_API_KEY` is absent.

## Troubleshooting

| symptom | cause | fix |
|---|---|---|
| `HTTP 403` on live calls | Cloudflare WAF on the `/` path (no `/v1`) | ensure `AGNES_BASE_URL=https://apihub.agnes-ai.com/v1` in `.env` |
| `HTTP 429` during batch | free-tier rate limit | the runner has built-in exponential backoff (4s, 8s, 16s…); just wait |
| `Unterminated string in JSON` | LLM truncated the response | `call()` auto-retries with a repair prompt (up to 3 attempts) |
| Checker says `outside: 135` | YAML comment glued to last enum value | `lib/tagsets.js` + `video-harness.check.js` strip `#` comments (fixed) |
| `enter: undefined` in timeline | scene `transition_in` not carried to shot | fixed: S3 uses `prevOut ?? sc.transition_in` |

## Quick Reference — All Commands

```powershell
$N = 'C:\Program Files\nodejs\node.exe'

# checkers (offline, no key needed)
& $N harness\video-harness.check.js
& $N harness\gates.check.js
& $N harness\run-llm.test.js

# interactive gate flow
& $N harness\run-gate.js new
& $N harness\run-gate.js gate G0
& $N harness\run-gate.js confirm G0
& $N harness\run-gate.js run node_a
& $N harness\run-gate.js gate G1
& $N harness\run-gate.js confirm G1
& $N harness\run-gate.js run scene_divide
& $N harness\run-gate.js run timeline
& $N harness\run-gate.js run spec
& $N harness\run-gate.js gate G2
& $N harness\run-gate.js confirm G2
& $N harness\pipeline.js

# batch + compare
& $N harness\batch-variants.js
& $N harness\render-variants-html.js

# diagnostic
& $N harness\show-live-outputs.js
& $N harness\demo-molecule.js

# rebuild after config changes
& $N harness\gen-fixtures.js
```
