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
| **How to talk to it** | the API family + auth: a config-driven adapter (most video vendors) or a code shaper (Agnes, text), Bearer key / `Key *** / no key | fal needs `Key <k>`; Ollama needs no key at all |

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
| Live retrieval | OpenRouter `/models`, fal `/v1/models/pricing`, Replicate model object | fetched this session, still valid |
| Static researched | Luma $0.09/s, Kling $0.14/unit, MiniMax Hailuo $0.28/clip | dated, vendor-published |
| Last actual | Runway `cost.credits`, Kling `final_unit_deduction` | last run of *this* model |
| Unknown | everything else | shown as "unknown + reason" |

Provider-reported units (credits, units) are stored **raw**; the USD
conversion is a researched anchor (e.g. 1 Runway credit = $0.01) and is
always labelled as such.

## 6. What is deliberately parked

- **Pending models** — every `pending` entry ships as data and flips
  generable only after one recorded real run (`docs/provider-catalogs/`
  convention). Your vendor keys decide the verification order; aggregators
  first (one key, many models).
- **Live price refresh in the UI** — backend retrieval exists; the
  settings-UI consumption pass wires the refresh button + cost hints.
- **ComfyUI local image/video** — the only local diffusion path; upload →
  workflow graph → history → view. A code shaper, not config.
- **MCP / special-API local transport** — reserved marker, no implementation.
- **H4 (or whatever ships next)** — a catalog row when it exists; the
  architecture already assumes this.

---

### Deep dives (only when you need more)
- `docs/pricing-usage-design.md` — cost signals, collection endpoints, the
  retrieval matrix (the *design* record; this doc is the human surface).
- `.hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md` — the
  original architecture plan (two-tier shaping rule, adapter schema, phases).
- Vendor contracts + traps (verified against live docs): the
  `visionmachine-provider-system` skill reference
  `references/vendor-contracts.md`.
