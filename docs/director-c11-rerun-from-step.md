# C11 — Per-step re-run (`from_step`)

Spec for the only Rust change in the Director/Extract density effort. View-layer
batches A (extract) and B (director) are already committed; this doc pins the
contract both implementation lanes (Rust + UI) build against.

## Goal

The ⑤ step chain currently offers only the full S0→S5 run. C11 adds a
per-step re-run affordance: "↻ re-run from here" on each of the four step rows
(`expand · structure · critic · lower`). Upstream steps stay locked; the named
step and everything downstream re-derives with the current G0 params; S5 verify
always re-runs. The re-run persists as the NEXT versioned doc (`flow.v{K+1}`) —
coexisting versions, never overwrite (the I5 append-only contract).

## Pinned contract

### Step names (exactly these four, this order)

```
'expand' | 'structure' | 'critic' | 'lower'
```

### Rust command (src-tauri/src/commands/director.rs)

```rust
#[tauri::command]
pub async fn director_run_flow(
    session_id: String,
    text: String,
    entry: Option<String>,
    from_step: Option<String>,   // NEW — None/"" = full run (today's behavior)
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String>
```

- `from_step: None` or an unrecognized value → **full run, byte-identical to
  today's path** (backward compatible; existing callers never break).
- `from_step: Some(s)` → load the newest persisted `flow.v{K}.json` in the
  session flow dir, guard it, re-execute `s..end`, persist `flow.v{K+1}.json`.

Tauri maps the JS camelCase arg `fromStep` onto the Rust `from_step` param.

### Re-run semantics

| from_step | kept from last doc (locked) | re-executed |
|---|---|---|
| `expand` | intent only | expand (novel — LLM Node A re-writes when a provider is configured) → structure → critic → lower → regen → engine + S5 verify |
| `structure` | intent + novel | structure → critic → lower → regen → engine (re-derived around the locked novel with current params) + S5 verify |
| `critic` | intent + novel + plan | critic → lower → regen → engine + S5 verify |
| `lower` | intent + novel + plan + scoretree | lower → regen → engine + S5 verify |

S5 verify is ALWAYS re-executed — a re-run must never ship unverified.

### The guard (C11 hardening) — named `FlowError`, never a silent fallback

Re-run from a step is only valid when a compatible last doc exists. Otherwise
fail with a named `FlowError` (new variant, e.g. `RerunIncompatible(String)`),
displayed verbatim:

```
re-run from {step} needs a compatible last doc — {why} · run the full S0→S5 first
```

`{why}` is one of:
- `no persisted flow doc in this session yet` (K == 0)
- `the last doc (v{K}) predates the engine` (doc.engine is None)
- `the last doc (v{K}) is flow version {n}, this engine runs {m}` (mismatch)

No silent fallback to a full run. The UI shows this text under the step rows
(the existing `runError` → `.flow-error` path), not a toast.

### TS surface (src/lib/directorStore)

```ts
export type FromStep = 'expand' | 'structure' | 'critic' | 'lower';

export async function runFlow(
  sessionId: string,
  text: string,
  entry?: EngineEntryInput | null,
  fromStep?: FromStep | null,   // NEW
): Promise<FlowDocument>
```

invoke args: `{ sessionId, text, entry: entry ? JSON.stringify(entry) : null, fromStep: fromStep ?? null }`.

### UI affordance (DirectorHotPath.svelte, full-mode step rows)

- Each of the 4 `.step` rows gains a quiet square `↻` icon button at the row's
  right edge (≈24px, elev bg, hairline border; hover → accent).
- Per-row tooltip: `re-run from {name} — upstream stays locked · S5 verify always re-runs`.
- One shared explainer line under the step rows:
  `↻ = re-run from here · upstream stays locked · S5 verify always re-runs · the triple records which versions executed`.
- Buttons disabled while `running` or when there is no `doc`/`engine` yet.
- Compact-mode step rail (pips) is UNCHANGED (status view, no affordances).
- New callback prop `onRerunStep(fromStep: FromStep)` on DirectorHotPath;
  DirectorPanel wires it to `handleRun(fromStep)` → `runFlow(sid, text, entry, fromStep)`.
- The destructive `regenerate` (pipes) stays exactly where B6 put it — C11 does
  not move annotation/seed/regenerate chips.

## Tests

- Rust (cargo): guard cases (no doc / pre-engine doc / version-mismatch doc →
  exact named error text), happy paths (`run_from_step` structure keeps the
  novel byte-stable; `lower` keeps novel+plan+scoretree; VersionTriple stamped;
  new doc carries a fresh regen contract), backward-compat (`from_step=None`
  path unchanged).
- TS/vitest: `runFlow` forwards `fromStep` (and omits null); `FromStep` type
  exports; DirectorHotPath renders 4 `↻` buttons wired to `onRerunStep` with
  the right step names (jsdom, following the extractTab.test.ts pattern).

## Landing

One commit for C11 (Rust + TS + Svelte + tests together). Gates: `cargo test`,
`npm test`, `npx svelte-check`, `npm run build`. No incidental refactors
beyond the stated files.
