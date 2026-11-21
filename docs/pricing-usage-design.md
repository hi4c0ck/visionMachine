# Pricing & Usage — Design (expanded provider system)

Status: DESIGN + collection endpoints landed on `feat/expanded-provider-system`
(2026-11-21). Companion to
`.hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md`.
Owner scope: third-party paid = **BYO-key** (no VM billing); Agnes-paid
entitlement stays the separate ROADMAP v0.7.12 owner decision.

## 1. The three cost signals

Every provider answers "what did this cost?" through one of three channels.
The design treats them as layers, strongest first:

| Layer | What | Where it lands |
|---|---|---|
| **Provider-reported (in-band)** | The API itself returns the actual charge: Runway `cost.credits`, Kling `data.final_unit_deduction`, Replicate `metrics.predict_time`, fal `metrics.inference_time` | `output.json → cost` block, captured automatically by the adapter engine (`video_adapter::cost_snapshot`) |
| **Live retrieval** | The vendor publishes machine-readable prices: OpenRouter `GET /api/v1/models` carries per-token `pricing` per model | `list_provider_models` command returns `{id, pricing?}` listings |
| **Static catalog rates** | Researched, date-stamped `PriceSpec` data on the model (same convention as `limits`) | `estimate_generation_cost` command — pre-run estimate, **honest unknown** when unverified |

Rule (D1, no mocks): an estimate is `known: true` ONLY from verified static
rates or the free-local fact ($0 marginal). Unverified/absent pricing reports
`known: false` with the reason — never a fabricated number. Provider-reported
units (credits/units) are stored RAW; USD conversion waits for the researched
pack rate (`rates.usdPerCredit` / `usdPerUnit`).

## 2. Data model (landed)

```ts
// src/types/settings.ts
PriceSpec {
  unit: 'per-video-second'|'per-image'|'per-token'|'per-credit'|'per-unit'|'free-local',
  currency: 'USD'|'credits'|'units',
  rates?: Record<string, number>,   // tier-keyed ('720p','1080p') or 'base';
                                    // usdPerCredit/usdPerUnit for conversions
  source?: string,                  // provenance URL
  verifiedAt?: string | null,       // null = research pending → estimate unknown
  note?: string
}
RunCostSnapshot {                   // portable (P5): costs are not secrets
  reported?: { value: number, unit: string },
  usage?: { predictTimeSecs?, inferenceTimeSecs? },
  estimatedUsd?: number, basis?: string
}
GenerationLogPiece.cost?: RunCostSnapshot   // type ready; wiring rides the UI pass
```

`output.json` (adapter runs) now carries:
```json
{ "videoPath": "...", "videoUrl": "...", "model": "...", "seed": 42,
  "params": {...}, "status": "done", "providerTaskId": "...",
  "cost": { "reported": { "value": 120, "unit": "credits" },
            "usage": { "predictTimeSecs": 31.5 } } }
```
The redacted `request.log` already persists the FULL provider response — the
raw pay data is collectable retroactively even before a cost path is declared.

## 3. Endpoints (landed, backend-only — UI consumption deferred)

| Command | Shape | Behavior |
|---|---|---|
| `estimate_generation_cost(spec, seconds, resolution)` | `{known, estimatedUsd?, basis, unit?, currency?, source?}` | Pure. free-local → $0 known; verified per-second/per-image rates → computed (4-decimal rounding); per-token → post-run (needs usage counts); per-credit/unit → post-run + conversion when researched; everything else honest unknown |
| `list_provider_models(baseUrl, apiKey, auth?, endpoint, shape)` | `[{id, pricing?}]` | openai shape `{data:[{id,pricing?}]}` (OpenRouter pricing rides along), ollama shape `{models:[{name}]}`. Keyless supported; errors redacted |
| `test_provider(baseUrl, apiKey, pingPath?, auth?)` | unchanged result | Kind-aware ping path + auth scheme (legacy callers byte-stable) |
| adapter engine cost capture | `output.json.cost` | Automatic from `adapter.response.reportedCost` / `predictTimePath` |

Frontend wrappers: `store.ts → estimateGenerationCost / listProviderModels /
testProvider(opts)` — ready for the settings/generate-modal UI pass.

## 4. Retrieval matrix (verified 2026-11-21; research lane pending items marked)

| Provider | In-band cost | Live price surface | Static rates needed |
|---|---|---|---|
| Runway | `cost.credits` + `estimatedCost.credits` per task; `X-Runway-Tags` + `POST /v1/organization/usage` for attribution | org usage API (shape research-pending) | credit-pack → USD rate |
| Kling | `data.final_unit_deduction` (decimal units) | — | unit-package → USD rate |
| Replicate | `metrics.predict_time` (GPU-seconds) | model page pricing (no public price API found yet) | hardware $/sec tiers |
| fal | `metrics.inference_time` | per-model pricing sections; billing API research-pending | $/video-sec or $/MP per model |
| MiniMax | `base_resp` 1008 = insufficient balance (concrete error already surfaced) | balance endpoint research-pending | per model/res/duration table |
| Luma | none found | — | per model/res/duration table |
| OpenRouter | response `usage` tokens; `/api/v1/generation?id=` accounting (research-pending) | **`GET /api/v1/models` pricing — LIVE, landed** | none (live) |
| OpenAI | response `usage` tokens | — | per-token table (official pricing page) |
| Ollama / LM Studio / llama.cpp | — | — | **free-local $0** (landed, verified fact) |
| Agnes | free tier today; paid 2.5 = entitlement decision | balance/usage undocumented — research-pending | owner billing decision |

## 5. Collection flow (per generation run)

1. **Pre-run**: `estimate_generation_cost` from the resolved spec (UI: generate
   modal cost hint — deferred). Unknown is displayed as unknown, not $0.
2. **In-run**: adapter create/poll responses carry cost signals; the engine
   snapshots them into `output.json.cost` at finalize (done AND download_failed
   paths — a gated download still bills).
3. **Post-run**: the generation log piece carries `cost` (type landed; the
   piece-generation wiring rides the UI pass). Aggregation = existing
   `list_generation_logs(sessionId)` — NO new ledger table yet (DRY; revisit
   when cross-session usage summaries become a product surface).
4. **Text runs (Director Node A)**: OpenAI-shape responses carry `usage`
   tokens; cost = tokens × live OpenRouter pricing (or static table). Capture
   point: `expand_node_a` response parse — deferred with the text-usage slice
   (the response body is already logged).

## 6. Quota / balance surface

- MiniMax 1008 / Kling 1002 already surface as concrete stage errors (E4).
- Balance endpoints (MiniMax, Runway org, OpenRouter `/api/v1/credits`) are
  research-pending; the chip/Settings quota display rides the UI pass.
- Local runs: $0 marginal + compute-time metering (`predictTimeSecs`) — honest
  "free on your hardware" framing, never a cloud-style price.

## 7. Entitlement hook (Agnes paid — separate owner decision)

The `readOnly` gate on `agnes-video-2.5` stays. When the billing model is
picked (credit/subscription/pay-per-gen), the entitlement check lands in the
generation-start path (Workspace confirmGenerate + registry start) and the
usage metering above becomes its ledger. Nothing in this design presumes VM
billing for third-party vendors — BYO-key means the vendor bills the user
directly, and VM only REPORTS cost.

## 8. Next steps

1. Research lane (dispatched): fill the pending matrix cells with sources →
   date-stamp `PriceSpec.rates` + `verifiedAt` per model.
2. UI pass (deferred by owner scope): free-text model picker + refresh list,
   keyless card states, cost hint in GenerateModal, quota chip.
3. Text-usage capture slice (Director token cost).
4. Live-verification pass per video vendor (owner keys) → flip `pending`.
