# Provider System — Plain-English Guide

**Who this is for:** anyone building on top of the provider subsystem
(Settings UI, Director, video pipeline, generation log, future ComfyUI/MCP
slices). Read this first; the deep-dive docs live at the bottom.

One paragraph version: **the catalog is the single source of truth for what
models exist and how each one behaves.** When a user confirms a model, three
things happen: their choices get cleaned up against the model's limits, the
run gets priced from the best available source, and the engine runs it with
the right transport. Nothing else in the app may keep a second copy of model
data — that is how drift breaks everything silently.

---

## 1. What we know about each model — three facts

Every model in the catalog (one file: `src/lib/settings/catalog.ts`) carries
three fact groups. Everything else in this doc is about how those facts get
used.

| Fact | What it means in plain words | Example |
|---|---|---|
| **What it accepts** | resolutions, clip lengths, aspect ratios, seed, media (keyframes / refs) — the model's physical limits | H3 Lite: 480P/768P only; MiniMax Hailuo: 6s or 10s, 1080P is 6s-only |
| **What it costs** | a pricing fact: a rate (per-second / per-clip / per-credit / per-unit / per-token) or "free (your own hardware)" | Kling: provider reports the exact charge; Luma: $0.09/s 720p researched |
| **How to talk to it** | the API family + auth: a config-driven adapter (most video vendors) or a code shaper (Agnes, text), Bearer key / `Key <k>` / no key | fal needs `Key <k>`; Ollama needs no key at all |

**Model status is the fourth fact:** `generable` (works, verified),
`pending` (shipped as data, must prove itself with one real run before the
UI shows it as usable), `readOnly` (inspect-only, never runs).

## 2. When a model is confirmed — three steps

This is the "switch" logic, in plain words:

**Step 1 — Clean up the choice.** The user's session settings (resolution,
seconds, orientation) are snapped to what the model actually accepts, using
its limits. Anything unsupported is *dropped*, never sent — a model that
rejects a tier would 400, so we never let that reach the wire.

**Step 2 — Price the run, best source first.** Exactly one of:
1. **Live** — a rate we fetched this session from the vendor
   (OpenRouter's model list, fal's pricing API, Replicate's model object).
2. **Static** — a researched rate in the catalog, stamped with the day we
   checked (`verifiedAt`).
3. **Last actual** — what the vendor *reported* from the previous run of
   this model (stored in the run's cost block). Vendors bill differently
   than their list price; the last actual is the closest thing to truth.
4. **Unknown.** Honest "we don't know, here's why" — **never** a made-up
   number. This is a standing rule, not a style choice.

**Step 3 — Run it.** The engine creates the job, polls it (throttled = wait
longer, not fail), downloads the artifact, and records what it actually
cost. That recorded cost feeds Step 2 of the *next* run of the same model.
The loop closes here — no price table in this app is ever the last word.

## 3. How each subsystem plugs in

One rule per subsystem; keep it that way.

| Subsystem | Its one rule |
|---|---|
| **Settings / provider cards** | Show presets + models from the catalog. "Configured?" = key present (or keyless local) + base URL. `pending` models stay visible but marked; don't invent a second picker. |
| **Director (text)** | Reads the text provider slot, sends the request with *capability-gated* params (structured-output flag per model; thinking toggles only where the model has them). The fallback retry already survives a model that lacks a capability — keep it as the safety net. |
| **Video pipeline** | Hands the engine the *resolved* model spec (catalog + user overrides, merged in one place). The engine interprets the config-driven adapter; code shapers only for models with real logic (Agnes). Never interpret a payload outside the engine. |
| **Generation log / history** | Redacted entries + per-run cost block. This is where "last actual" prices come from — keep costs out of secrets: cost is data, the key is not. |
| **Pre-checks** | The only place a run is refused before spend: unsupported media contract (url-only route + local-only media) or a pending model the user forced. Refuse early, say why. |
| **Future slices (ComfyUI, MCP, H4)** | Land as catalog rows + reserved markers; the config slot (`customTransport`) is already there. If a new model needs *logic* (workflow graphs, signed tokens), it gets its own code shaper — do not widen the config to absorb it. |

## 4. Local + keyless, in one paragraph

Local = no key. Three known servers (Ollama, LM Studio, llama.cpp) are
presets; `local-custom` matches *any* OpenAI-compatible server by URL + model
id, so a new local server is two typed fields, not a catalog entry. All local
models are $0 marginal (your electricity, not us). Keyless relaxes three
gates at once — the engine's key check, the "is this configured?" guard, and
the UI chip — so the app, the guards, and the user always agree.

## 5. Pricing in one screen

| Layer | Example | When it wins |
|---|---|---|
| Live retrieval | OpenRouter `/models`, fal public model pages, Replicate model object | fetched 2026-11-22, still valid |
| Static researched | Luma $0.09/s, Kling $0.14/unit, MiniMax Hailuo $0.28/clip | dated, vendor-published |
| Last actual | Runway `cost.credits`, Kling `final_unit_deduction` | last run of *this* model |
| Unknown | everything else | shown as "unknown + reason" |

Provider-reported units (credits, units) are stored **raw**; the USD
conversion is a researched anchor (e.g. 1 Runway credit = $0.01) and is
always labelled as such.

## 6. What is deliberately parked

- **Pending models** — every `pending` entry ships as data and flips
  generable only after one recorded real run (the `pending → generable`
  convention from the video-adapter plan acceptance,
  `.hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md`;
  §7 closing protocol). Your vendor keys decide the verification order;
  aggregators first (one key, many models).
- **Live price refresh in the UI** — backend retrieval exists; the
  settings-UI consumption pass wires the refresh button + cost hints.
- **ComfyUI local image/video** — the only local diffusion path; upload →
  workflow graph → history → view. A code shaper, not config.
- **MCP / special-API local transport** — reserved marker, no implementation.
- **H4 (or whatever ships next)** — a catalog row when it exists; the
  architecture already assumes this.

## 7. Verification matrix (live-verify + release-readiness checklist)

**Rules.** Catalog + adapter code remain authoritative — this section records
verification *state* only, never model data. Never promote an assumption to a
verified value. Statuses: **verified** = a live run was recorded ·
**code-verified** = engine code/tests prove the path, vendor-side unconfirmed ·
**unverified** = researched data, no live confirmation · **unsupported** = the
capability is absent from the vendor contract (sourced).
Closing an item: one live run with your vendor key → record `verifiedAt` + the
vendor-reported cost in `request.log` → flip the cell and (for pending models)
`pending → generable` per the video-adapter plan's acceptance criterion
(`.hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md`).
G-ids refer to the gap list from the 2026-11-21 h3-max flow emulation:
G1 = `limits: {}` rows whose caps are unverified (no speculative limits) —
partially closed 2026-11-22 by the keyless emulation: h3-max (fal) 5–15s +
480P/768P/1080P caps and the replicate wan-2.2-i2v-a14b 480P/720P caps are
now DOC-SOURCED from public pages and encoded (unverified-live); open G1
rows: fal wan-2.2-a14b, h3-max-turbo, veo3.1, wan/v2.2-5b, kling v2.5,
minimax/video-01 ·
G2 = Tier-A media inlining / url-only pre-check (**closed this batch** —
regression tests) · G3 = artifact response paths unverified ·
G4 = vendor-reported-cost support per adapter (only runway + kling) ·
G5 = `Key <k>` header-form redaction (**closed this batch** — tests).

Keyless emulation state (2026-11-22): doc-sourced caps/prices captured from
public pages (fal API reference, fal model pages, HF model cards, replicate
model pages) — no vendor key needed, recorded above. Pricing API probes
without a key: GET queue.fal.run/v1/models/pricing → 405; POST → 404;
rest.fal.ai equivalents → 404 — the pricing API is not public, only the
public web pages are. Still key-gated: recorded live runs, artifact paths,
in-band cost fields, and the pending → generable flips.

### 7.1 Adapter layer (shared by all models of the preset)

| Adapter | Auth (header form; redaction) | Submission / polling | Vendor cost support |
|---|---|---|---|
| `RUNWAY_ADAPTER` | bearer · value-based redaction **code-verified** (both header forms, media.rs tests) | full status map incl. THROTTLED; `failure` errorPath · **code-verified** | `cost.credits` · **code-verified** (test writes the cost block) · values unverified-live |
| `FAL_ADAPTER` | key-header `Key <k>` · redaction **code-verified** (G5 test) | `COMPLETED` includes FAILED jobs — result-fetch `detail` decides · **code-verified** | **none configured — unverified** (response schema unconfirmed; do NOT claim "vendor doesn't report") |
| `REPLICATE_ADAPTER` | bearer | 5-state map; `error` · **code-verified** | **none configured — unverified** |
| `LUMA_ADAPTER` | bearer | 4-state map; `failure_reason` · **code-verified** | **unsupported — vendor does not report** (openapi 1.1.0: no cost field in responses; ladder source ③ never exists for luma by design) |
| `KLING_ADAPTER` | bearer (new console keys; legacy AK/SK JWT hard-rejected code 1002 — docs 2026-11-21) | legacy `succeed` + new `succeeded` both mapped; envelope `code=0` · **code-verified** | `data.final_unit_deduction` · **code-verified** |
| `MINIMAX_ADAPTER` | bearer | 5-state map; `base_resp` envelope; retrieve-step artifact (file_id string↔int cast) · **code-verified** | **none configured — unverified** |

Media inlining (all adapter presets `url-or-data`): **code-verified** — the
Tier-A inliner covers media-hint keys recursively; G2 regression tests pin
both the inlining and the url-only counter-contract (never inline, never burn
a render). Local files → `data:` URI ≤32MB; remote URLs pass through.

### 7.2 Model open items (rows with ≥1 unverified/unsupported field)

Group header = the shared fields; row = the exact catalog model id
(`src/lib/settings/catalog.ts` → `<preset>.models['<id>']` + the adapter above).

**fal** (8 rows) — auth key-header code-verified · inliner code-verified · `COMPLETED` trap code-verified:

| Model | Input media | Duration / resolution (source → status) | Pricing (estimate source → status) | Submission / polling | Artifact (path → status) |
|---|---|---|---|---|---|
| `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | local ✓ (inliner) / remote ✓ | docs 2026-11-21 draft: 5–10s, 3 ratios → **unverified** | `verifiedAt: null` → **unverified** | FAL_ADAPTER | `video.url` → **unverified** |
| `fal-ai/wan/v2.2-5b/image-to-video` | local ✓ / remote ✓ | `limits: {}` — caps **unverified** (G1, no speculative caps) | rates → **unverified** | FAL_ADAPTER | `video.url` → **unverified** |
| `fal-ai/wan/v2.2-a14b/{text-to-video, image-to-video}` (new 2026-11-22) | t2v: none / local ✓ + remote ✓ (i2v) | `limits: {}` — caps **unverified** (G1; fal pages list 480p/580p/720p tiers — param names live-verify) | per-s tiers $0.04/$0.06/$0.08 @16fps, fal public pages 2026-11-22 → **unverified-live** | FAL_ADAPTER | `video.url` default → **unverified** (G3) |
| `fal-ai/veo3.1/fast/image-to-video` | local ✓ / remote ✓ | `limits: {}` — caps **unverified** (G1) | rates → **unverified** | FAL_ADAPTER | `video.url` → **unverified** |
| `minimax/h3-max/{text-to-video, image-to-video}` | local ✓ / remote ✓ (i2v rows) | caps **doc-sourced** (fal API reference 2026-11-22: 5–15 s, 480P/768P/1080P with 1080P = latent refinement, 24 fps) → **unverified-live** | static $0.05/s, fal.ai/pricing 2026-11-21 → **unverified-live** | FAL_ADAPTER | `video.url` default → **unverified** (G3) |
| `minimax/h3-max-turbo/image-to-video` | local ✓ / remote ✓ | `limits: {}` — caps **unverified** (G1, no doc capture yet) | static $0.025/s → **unverified-live** | FAL_ADAPTER | `video.url` default → **unverified** (G3) |

**runway** (5 rows, all `pending`) — auth bearer · inliner code-verified (`promptImage` key) · THROTTLED + failure code-verified · cost `cost.credits` code-verified:

| Model | Input media | Duration / resolution (source → status) | Pricing (estimate source → status) | Artifact (path → status) |
|---|---|---|---|---|
| `gen4.5`, `gen4.5-t2v` (create-override), `seedance2_5` | local ✓ / remote ✓ (i2v) | docs 2026-11-21 draft: 2–10s + ratio lists → **unverified** | per-credit $0.01/credit, docs → **unverified-live** | `output[]` → **unverified** |
| `hailuo3`, `h3_max` | local ✓ / remote ✓ | 2–10s **unverified** + resolution-dependent clip constraint (1080P = 6s-only per docs) **not expressible in flat limits — structural, §7.4** | per-second derived from the credit table (10/15 · 5/8 cr-s × $0.01) — **derived, unverified-live**; in-band `cost.credits` authoritative | `output[]` → **unverified** |

**replicate** (2 rows) — auth bearer · inliner code-verified · envelope code-verified:

| Model | Input media | Duration / resolution | Pricing | Artifact |
|---|---|---|---|---|
| `minimax/video-01` (minimal input) | t2v: none | `limits: {}` — caps **unverified** (G1) | **unverified** | `output` (string\|array\|object) → **unverified** |
| `wan-video/wan-2.2-i2v-a14b` | local ✓ / remote ✓ | resolutions **doc-sourced** (HF Wan2.2 model card 2026-11-22: 480P/720P; seconds frame-driven ≈5s @16fps, **unverified**) | **unverified** | `output` → **unverified** |

**luma** (1 row) — auth bearer · inliner code-verified (`keyframes.*.url` pruning rule):

| Model | Input media | Duration / resolution | Pricing | Artifact | Vendor cost |
|---|---|---|---|---|---|
| `ray-2` | local ✓ / remote ✓ (2 keyframes) | docs openapi: 5/9s, 720p/1080p, 7 ratios → **unverified-live** | `verifiedAt: null` → **unverified** | `assets.video` → **unverified-live** | **unsupported** (openapi 1.1.0 — no cost field; source ③ never exists) |

**kling** (2 rows) — auth bearer · inliner code-verified (docs: base64 or public URL) · envelope + both status casings code-verified:

| Model | Input media | Duration / resolution | Pricing | Vendor cost |
|---|---|---|---|---|
| `kling-v2-6` (i2v), `kling-v2-6-t2v` (poll-override) | local ✓ / remote ✓ (2 keyframes i2v) | docs draft: 5/10s, 3 ratios → **unverified-live** | $0.14/unit LIST (pack discounts account-specific) → **unverified** | `final_unit_deduction` · **code-verified** |

**minimax platform** (8 rows) — auth bearer · inliner code-verified · `base_resp` envelope + retrieve-step code-verified:

| Model | Input media | Duration / resolution | Pricing | Artifact |
|---|---|---|---|---|
| `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-02`, `MiniMax-Hailuo-2.3-i2v` | local ✓ / remote ✓ (i2v) | per-clip tiers; 1080P = 6s-only (docs 2026-11-21) → **unverified-live + combo constraint not expressible (§7.4)**; i2v `first_frame_image` param name **unverified** | per-clip static → **unverified-live** | retrieve `file.download_url` (1h expiry) → **unverified-live** |
| `MiniMax-H3` series ×5 (t2v/i2v/Highspeed/Lite/Max, all `pending`) | local ✓ / remote ✓ (i2v) | per-second generation; 480P–2K per tier → **unverified-live** (docs platform.minimax.io 2026-11-21) | per-second static + input-media surcharges → **unverified-live** | retrieve mode → **unverified-live** |

### 7.3 Closed / no open items

- `agnes-video-2.5-flash` — **verified** (live runs, previous releases; free).
- `agnes-video-2.5` — read-only by design, no open items.
- Text presets (openai, openrouter, custom, local ×4) — **code-verified**
  engine paths; local: auth `none` + $0 marginal **code-verified by design**;
  media N/A.
- Redaction — **code-verified** for Bearer and `Key <k>` forms (value-based;
  secrets never land in `request.log`).

### 7.4 Structural gaps (a live run cannot close these)

1. **Resolution-dependent duration caps** (1080P = 6s-only class) — the flat
   `limits` schema cannot express the combo; needs a `secondsBySize` extension
   or a pre-check. Parked until a vendor actually rejects on it.
2. **Vendor-reported cost exists for exactly two adapters** (runway, kling —
   code-verified). Every other vendor prices via source ②/④ by design, not
   by bug.
3. **MCP / special-API local transport** — reserved `customTransport` marker,
   no implementation; ComfyUI slice carries its own pre-check (upload).

---

### Deep dives (only when you need more)
- `docs/pricing-usage-design.md` — cost signals, collection endpoints, the
  retrieval matrix (the *design* record; this doc is the human surface).
- `.hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md` — the
  original architecture plan (two-tier shaping rule, adapter schema, phases).
- Vendor contracts + traps (verified against live docs): the
  `visionmachine-provider-system` skill reference
  `references/vendor-contracts.md`.
