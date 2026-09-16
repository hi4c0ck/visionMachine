# Settings & Provider System — Task Plan (Agnes-first, container-ready)

Context: settings modal (profile → modal), 3 provider slots (text/image/video),
per-user defaults, model-owns-request-format, portable generation log, real
ping test, "really great" UX. Agnes is the v1 vendor; concrete model details
arrive later and must land as **data only** (no UI/engine rework).

## Locked decisions (from discussion — do not re-litigate)

- P1. **Vendor: Agnes only in v1** (text + image + video via Agnes API). The
  preset/model-spec structure is extensible; NO multi-vendor UI now. More
  vendors/models only after Agnes is well-tested.
- P2. **Concrete model details come later.** This plan builds the CONTAINERS:
  types, preset catalog skeleton with placeholder model specs, request-builder
  slot. When details arrive they fill `catalog.ts` data — zero UI rework.
- P3. Settings are **per user profile** (keyed by profile id like other data),
  accessed from the **profile panel** (opens modal). Generation defaults seed
  new sessions instead of hardcoded 24/720p/horizontal/18/7.
- P4. Global provider settings = **source of truth** (change global → all new
  generations follow). Per-piece model override ONLY at the last step
  (generate-confirm modal) for partial-regen / model A-B; every override is
  recorded in the generation log.
- P5. Generation log is **portable/shareable**: never contains raw local
  paths or API keys. Artifacts stored as internal refs, rendered as URLs
  (`toMediaUrl` pattern, same as lastGeneration video preview).
- P6. Security: keys stored only in the local settings DB; masked in UI,
  logs, and error strings; URLs validated http(s)-only; parameterized SQL;
  no shell interpolation.
- P7. Ping = **real** reachability test (backend HTTP, key redacted in result).

## Containers (type shapes — Phase 0)

Frontend `src/types/settings.ts` (+ Rust serde camelCase mirrors):

```ts
type ProviderKind = 'text' | 'image' | 'video';

// One vendor template. v1: 'agnes' + 'custom' (free URL/key/model).
interface PresetSpec {
  id: 'agnes' | 'custom';
  label: string;
  kinds: ProviderKind[];
  auth: 'bearer';
  defaultBaseUrl: string;
  models: ModelSpec[];
}

// Model OWNS its request format (the "guaranteed on the flight" rule).
interface ModelSpec {
  id: string;
  kind: ProviderKind;
  endpoint: string;          // path under baseUrl
  sync: boolean;             // false → job + poll
  pollEndpoint?: string;
  requestFormat: 'chat' | 'image-gen' | 'video-job'; // payload shaper id
  limits: { fps?: number[]; resolutions?: string[]; maxFrames?: number };
  pending?: boolean;         // placeholder until concrete details land (P2)
}

interface ProviderSlot {
  preset: string;           // PresetSpec.id
  baseUrl: string;
  apiKey: string;           // local-only, masked everywhere
  model: string;            // ModelSpec.id
}

interface Settings {
  profile: { displayName: string; theme: string; layout: string };
  generationDefaults: {
    fps: number; resolution: string; orientation: string;
    qValue: number; cValue: number;
    concurrency: 'sequential' | 'parallel';   // ships 'sequential'
  };
  providers: Record<ProviderKind, ProviderSlot>;
}

// Portable log (P5): NO keys, NO raw paths.
interface GenerationLogEntry {
  taskId: string; sessionId: string; pipeId: string;
  startedAt: number; finishedAt?: number;
  status: 'done' | 'error' | 'cancelled';
  pieces: Array<{
    kind: 'keyframe' | 'subject' | 'video';
    refId: string;
    provider: string;       // preset id
    model: string;          // model id actually used (global or last-step override)
    status: 'done' | 'error' | 'cancelled';
    outputRef?: string;     // artifact ref → rendered via toMediaUrl
    params: { fps: number; resolution: string; q: number; c: number };
    error?: string;         // sanitized (key never present)
  }>;
}
```

Agnes placeholder specs: `agnes-text` / `agnes-image` / `agnes-video`,
`pending: true`, endpoints/limits TODO from the Agnes API doc.

## Phases (checkboxes)

### Phase 0 — Containers
- [ ] `src/types/settings.ts` — all types above
- [ ] `src/lib/settings/catalog.ts` — preset catalog data (Agnes placeholders +
      `custom`); pure data, swappable when details land
- [ ] `src/lib/settings/guards.ts` — `normalizeSettings`, `validateHttpUrl`,
      `maskKey`, `redactLog` (strip keys/paths), default seed
- [ ] Rust mirrors: `settings.rs` types (serde camelCase) + `normalize`

### Phase 1 — Backend persistence
- [ ] `profile_settings` table (profile_id PK, settings_json TEXT)
- [ ] `get_settings` / `save_settings` commands replace the no-op stubs
- [ ] `test_provider` command — real HTTPS ping (kind-specific light request),
      returns {ok, message} with key redacted
- [ ] `generation_logs` table + `log_generation` / `get_generation_log`
      commands (append per task; redacted shape per P5)

### Phase 2 — Frontend settings store
- [ ] `src/lib/settings/store.ts` — hydrate on login, typed updates,
      debounced save; browser-dev fallback = localStorage (composerStore pattern)

### Phase 3 — Settings modal (the UX bar)
- [ ] `SettingsModal.svelte` (shell: tabs Defaults / Providers, Save bar)
      + `SettingsDefaults.svelte` + `ProviderCard.svelte` (tiny components)
- [ ] ProviderCard ×3: preset select (model list + URL reflow on switch),
      base URL (validated), API key (masked, show/hide, paste-friendly),
      model select (constrained to preset catalog + `pending` flag disabled),
      **Test connection** button (spinner → ✓ green / ✗ with readable reason)
- [ ] Defaults: display name, fps/res/orientation, Q/C, concurrency toggle
- [ ] Explicit Save (dirty indicator) — no auto-save for keys/URLs
- [ ] ProfilePanel row "Settings" → opens modal
- [ ] svelte-check + vitest + playwright gates green

### Phase 4 — Global UI duplication (exactly three)
- [x] Provider status chip (top bar): `Agnes · model ✓` / `Not configured`,
      click → modal at Providers tab
- [x] GenerateModal: per-piece model override selects (image stage + video
      stage), constrained to preset catalog; default = global setting;
      override recorded into the log entry
- [x] New sessions inherit `generationDefaults` (replace hardcoded
      24/720p/horizontal/18/7 in createSession paths)

### Phase 5 — Wire-through
- [ ] `resolutionPresets.ts` placeholder retired: model-spec `limits` drive
      fps/res options in GenerateModal when a provider is configured
      (fallback = current presets until Agnes specs land) — BLOCKED on
      Agnes specs (`pending: true`); fallback in place
- [x] Progress modal shows model + taskId per stage (from log entry)
- [x] Regression: gates green (svelte-check / vitest / playwright)
      — 0 errors / 398 vitest / 34 cargo / 64 playwright (f09f1b9)

### Phase 6 — Real engine slot (data-only handoff)
- [ ] Request builder consumes `ModelSpec.requestFormat` → payload; stages
      fail fast with "Engine not configured" until Agnes specs are filled
      (NO mocks, per D1)
- [ ] When concrete Agnes details arrive: fill `catalog.ts` specs only,
      flip `pending: false`, run real ping + one small generation end-to-end

## Tests
- [ ] vitest: normalize/validate/maskKey/redactLog/catalog lookups
      (model by preset+kind, pending flag, limits filter)
- [ ] cargo: settings round-trip + defaults; log redaction (key absent);
      test_provider result shape
- [ ] playwright: modal opens from profile panel; save defaults → new
      session inherits; key masked + show/hide; status chip reflects state;
      GenerateModal override constrained by preset
- [ ] manual (post-details): real ping, one small generation, verify log
      entries + model-switch override + shareable export (no paths/keys)

## Out of scope (now)
- Multi-vendor catalog UI (post-Agnes), key encryption at rest (desktop-only),
  per-pipe provider persistence (last-step override is per-task, logged),
  account-scoped settings sync

## Open items
- [ ] Agnes API doc → fill `catalog.ts` model specs (endpoint/payload/limits/poll)
