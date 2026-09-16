# Agnes Model Catalog — Research & Spec (data-only, no mocks)

Status: researched + user-confirmed (2026-09-16). No code until the final
"open items" below get a GO. Everything here is DATA — filling `catalog.ts`
and extending the type containers per the P1/P2 rule (specs ride with the
model, zero UI/engine rework).

## Sources
- Official docs (agnes-ai.com, fetched 2026-09-16): Agnes 2.5 Flash (text),
  Agnes Image 2.5 Flash, Agnes Image 2.1 Flash, Agnes Video V2.0,
  Agnes Video 2.5, Agnes Video 2.5 Flash.
- hermes skills notes (`C:\Users\user\AppData\Local\hermes\skills`):
  `creative/agnes-video-keyframes-workflow` (V2.0 legacy payload, size
  normalization, polling reliability, 503 backoff),
  `hermes-toolset-config` (size mapping table, content filters, latency),
  `creative/image-gen-api-providers` (img2img quirks, 422 long-prompt quirk),
  `ironmate-backend|domain-model` (chat completions, `reasoning_content`).

## Locked decisions (user-confirmed, 2026-09-16)
- Q1. Frames stay the primary timeline logic. Where the API needs seconds,
  we pass the value from the existing seconds computation
  (`seconds = lengthFrames / fps`, PipeLengthModal pattern), clamped to the
  model's allowed range. Revisit after production tests.
- Q2. Image/video resolution differences are accepted for now; the mapping
  rules get hardened later. Provisional mappings are listed per model below.
- Q3. Paid `agnes-video-2.5` ships as a **read-only** catalog entry:
  visible and selectable in Settings so its parameters can be inspected,
  but NOT confirmable for generation.
- Q4. Q/C (quality/creativity) stay as-is; user will configure better later.
  FACT FLAG: the V2.5 family REJECTS `num_inference_steps`, `quality`,
  `fps`, `width`, `height` (HTTP 400) — its only knobs are
  model/prompt/mode/seconds/size/aspect_ratio/seed/n. V2.0 HAS
  `num_inference_steps`. No Agnes video model has a CFG/creativity-strength
  parameter at all. → Q/C are recorded in the log but engine-omitted for
  Agnes video models.
- Q5. Confirmed: image default = `agnes-image-2.5-flash` (2.1-flash =
  fallback); video default = `agnes-video-2.5-flash` (v2.0 = active
  alternate, free, fps-native); text `agnes-2.5-flash` is cataloged but
  inert for now.
- Q6. Single unified URL configuration — host-root `baseUrl`, all endpoints
  relative paths, poll template with `{videoId}`/`{model}` placeholders
  (deep-dive in "URL composition" section below).
- Q7. UI offers ONE media mode per run: **keyframes OR reference** (switch,
  not both). Common logic kept so the paid 2.5 can use both later.
  Keyframes ≤3: V2.0 passes them as the `image` array (2–3, mode
  "keyframes"); V2.5 uses `first_frame`/`last_frame` (2 named slots), and
  anything beyond/other goes to reference-mode `images[]`.
- Q8. txt2img/img2img results are public URLs (user: ~2 weeks lifetime;
  hermes observed 1h cache-control — VERIFY in Phase 6) + we keep a local
  copy. The scheme stores the URL and checks accessibility at generation
  start (existing fail-fast: red-out the ref, red toast naming the URL,
  no task created). Base64 inputs = future feature, not now.
- Q9. Text model (`agnes-2.5-flash`) has no current use case ("why not") —
  it is the container for the future prompt-summarizer engine, not wired
  into generation now.
- NEW (seed). `seed` is a first-class generation parameter, editable in the
  pipeline; Settings gets a checkbox "Always use a new seed" (default ON).
  The seed actually used is written to the portable generation log
  (reproducible regeneration).

## Model inventory

| kind  | model id                | create endpoint       | mode    | price (list → current) | catalog status      |
|-------|-------------------------|-----------------------|---------|------------------------|---------------------|
| text  | `agnes-2.5-flash`       | `POST /v1/chat/completions` | sync    | $0.05/M in, $0.15/M out → **$0** | active (inert) |
| image | `agnes-image-2.5-flash` | `POST /v1/images/generations` | sync  | $0.010–0.024/img by tier → **$0** | active, DEFAULT |
| image | `agnes-image-2.1-flash` | `POST /v1/images/generations` | sync  | same as 2.5 → **$0**     | active (fallback) |
| video | `agnes-video-v2.0`      | `POST /v1/videos`     | async   | $0.005/s → **$0**        | active (fps-native) |
| video | `agnes-video-2.5-flash` | `POST /v1/videos`     | async   | $0.025/s → **$0**        | active, DEFAULT |
| video | `agnes-video-2.5`       | `POST /v1/videos`     | async   | $0.025–0.055/s (paid)   | **READ-ONLY**       |

Base URL (all creates): `https://apihub.agnes-ai.com/v1` · auth: `Bearer sk-…`
Video polling lives at HOST ROOT: `GET https://apihub.agnes-ai.com/agnesapi` — see URL composition below.

## Per-model contracts (verbatim-precision)

### text — `agnes-2.5-flash` (inert container for now)
- OpenAI-compatible `POST /v1/chat/completions`; also `/v1/responses` +
  `/v1/messages` (Anthropic-compatible).
- 512K context, 65.5K max output. Params: model, messages, temperature,
  top_p, max_tokens, stream, tools/tool_choice; `image_url` input supported.
- QUIRK (hermes): output may arrive in `reasoning_content` while `content`
  is empty → engine reads both: `content ?: reasoning_content`.
- ~2–5 s latency. Supersedes deprecated `agnes-2.0-flash` (not cataloged).
- Our use: future prompt-summarizer engine only (Q9).

### image — `agnes-image-2.5-flash` (DEFAULT) / `agnes-image-2.1-flash` (fallback)
- Sync. Client timeout 60–360 s recommended; typical ~15–18 s (hermes).
- Request: `model`, `prompt`, `size` (REQUIRED — tiers `"1K"`/`"2K"`/
  `"3K"`/`"4K"`; legacy exact pixels accepted but may be normalized),
  `ratio` (`1:1` `3:4` `4:3` `16:9` `9:16` `2:3` `3:2` `21:9`, default `1:1`),
  `return_base64` (top-level, t2i), `extra_body.image[]` (public URLs or
  Data-URI; img2img / multi-image; NO `tags` needed),
  `extra_body.response_format` (`"url"` | `"b64_json"`).
- PITFALL: top-level `response_format` → HTTP 400.
- Response: `{created, data: [{url, b64_json, revised_prompt}]}`. PNG out.
- 16:9 output dims: 1K `1312x736` · 2K `2624x1472` · 3K `3936x2208` ·
  4K `5248x2944`; 1:1 → 1024²/2048²/3072²/4096².
- Pricing: 1K $0.010 · 2K $0.018 · 3K $0.021 · 4K $0.024; 4th+ input
  image $0.003 → all $0 now.
- NO seed param documented → `supportsSeed: false`.
- 2.1-flash: identical contract (docs state params/sizes/pricing are
  the same); hermes: stricter content filter, slightly faster.
- QUIRK (hermes): 2.x long prompts with hex colors / dense constraints →
  HTTP 422 (shorter is safer — VERIFY in Phase 6).
- Provisional res mapping (Q2, harden later): 480p/720p → `"1K"`,
  1080p → `"2K"`; orientation → ratio (horizontal `16:9`, vertical `9:16`).

### video — `agnes-video-v2.0` (active alternate, fps-native, free)
- Create `POST /v1/videos`. Poll `GET /agnesapi?video_id={videoId}`
  (model_name optional); legacy `GET /v1/videos/{taskId}` — hermes: most
  reliable; on 503 `video_queue_full` back off 30/60/120 s.
- Params: `model`, `prompt`, `image` (string, img2vid),
  `extra_body.image` (2–3 URLs) + `extra_body.mode: "keyframes"`
  (hermes-verified: "keyframes mode requires 2 to 3 images"),
  `mode` (`"ti2vid"` | `"keyframes"`; `"img2vid"` is INVALID),
  `width` (def 1152), `height` (def 768), `num_frames` (≤441, 8n+1 —
  matches our SLA grid), `frame_rate` (1–60), `num_inference_steps`
  (hermes: def 8; 12–14 for keyframes), `seed` (≥0), `negative_prompt`.
- Res: `480p`/`720p`/`1080p` tiers (normalized — `metadata.size_mapping`
  is source of truth); ratios `16:9` `9:16` `1:1` `4:3` `3:4`.
- Duration = num_frames / frame_rate (81@24 ≈ 3.4 s · 121@24 ≈ 5 s ·
  241 ≈ 10 s · 441 ≈ 18.4 s).
- Pricing $0.005/s → **$0 now**. No reference mode (subjects join the
  keyframes image array, cap 3).
- Behavior (hermes): first keyframe static hold ~0.5–2 s; visual-only
  output (no audio track).

### video — `agnes-video-2.5-flash` (DEFAULT, free)
- Create `POST /v1/videos`. Poll
  `GET /agnesapi?video_id={videoId}&model_name=agnes-video-2.5-flash`
  (model_name REQUIRED for keyframe/reference modes; bare video_id valid
  only for text mode); poll every 1–2 s.
- Params: `model`, `prompt` (`<Picture N>` / `<Audio N>` tokens in
  reference mode), `mode` (`text` | `keyframe` | `reference`, required),
  `seconds` (STRING `"4"`–`"12"`, def `"5"`), `size` (`"720P"` ONLY —
  else 400), `aspect_ratio` (`21:9` `16:9` `4:3` `1:1` `3:4` `9:16`,
  def `16:9`; measured 16:9 → `1280x704`), `seed`, `n` (=1).
- Mode rules: `keyframe` → `first_frame`/`last_frame` (≥1; no
  images/audios/videos); `reference` → `images[]` ≤5 + `audios[]` ≤3,
  `videos` FORBIDDEN (400); `text` → no media fields.
- Pricing $0.025/s → **$0 now**. Hermes: `images[]` accepts Data-URI
  base64 — deferred (Q8).
- fps (Q1): session frames → seconds via existing computation, clamped
  [4,12]. Res: any session res → `"720P"`; orientation → aspect_ratio.

### video — `agnes-video-2.5` (PAID — read-only entry, Q3)
- Same create/poll shape; `model_name=agnes-video-2.5`.
- `size`: `"720P"`/`"1080P"`/`"1K"` (1024²)/`"2K"` (2× 720P dims).
- Reference caps: images ≤8 (<15 MB each, <50 MB request, 256–5760 px
  per dim) · videos ≤1 (2–12 s, <50 MB, 24–60 FPS; `{url, start_seconds,
  require_audio}` — vid2vid) · audios ≤3 (2–12 s total) · ≤12 media files
  total per request.
- 400 on: `width`/`height`/`fps`/`num_frames`/`quality`/
  `num_inference_steps`; pixel `size`; `aspect_ratio: "auto"`; `n` ≠ 1.
- Billing: 720P $0.025/s · 1080P/1K $0.040/s · 2K $0.055/s; 6th+ input
  image $0.005; input video seconds billed at the output rate.
- Catalog: `readOnly: true` — Settings can select + inspect its params;
  generation confirm is gated off.

## Container changes (data-only, per P1/P2 rule)

`ModelSpec` (`src/types/settings.ts`):
- `readOnly?: boolean` — viewable in Settings, not confirmable for
  generation (picker shows a "paid · locked" badge; confirm gated).
- `limits` gains: `seconds?: [number, number]` (V2.5 family: `[4, 12]`),
  `ratios?: string[]`, `supportsSeed?: boolean`.
- `RequestFormat` union gains two video-job shaper ids (the wire shapes
  differ): `"video-job-frames"` (V2.0: num_frames/frame_rate/image) and
  `"video-job-seconds"` (V2.5: seconds/size/mode/first_frame/last_frame).

`GenerationDefaults` gains: `alwaysNewSeed: boolean` (default `true`).

Rust mirrors: `StartGenerationInput` += `seed: Option<i64>`; `EngineInput`
+= `seed: Option<i64>`; generation-log piece `params` += `seed?: number`
(P5-portable: the seed actually used is logged).

## URL composition (Q6 deep-dive)

Fact: creates live under `/v1` (`https://apihub.agnes-ai.com/v1/videos`),
but polling lives at HOST ROOT (`https://apihub.agnes-ai.com/agnesapi`).
Our container has ONE `baseUrl` per provider slot, so the composition
rule matters:

- (a) **host-root baseUrl** (`https://apihub.agnes-ai.com`); create
  endpoints carry the `/v1` prefix ("/v1/videos"); pollEndpoint is a
  root-relative template `"/agnesapi?video_id={videoId}&model_name={model}"`
  with `{videoId}`/`{model}` placeholders the engine substitutes (video_id
  comes from the create response). One base, everything relative, model is
  a parameter — the "configurable + common" state the user wants. CUSTOM
  preset keeps its own `/v1`-style base; baseUrl is per-preset data, so no
  conflict. Guard: normalize a user-pasted agnes baseUrl (strip trailing
  "/v1"), else requests double the prefix.
- (b) two bases: `baseUrl` (/v1) + `pollBaseUrl` (root) — more fields,
  easy to misconfigure, splits the state.
- (c) keep baseUrl=/v1, allow pollEndpoint to be absolute or
  "//host-root-relative" — hacky convention, breaks "path under base".

**Recommendation: (a)** — matches the user's lean, single source of
truth, template keeps `model_name` per-model. `pollEndpoint` is already a
string; placeholders are a documented data convention, no type change.

## Seed design (NEW requirement)

- Settings → Defaults tab: checkbox **"Always use a new seed"** (default ON).
- GenerateModal (video stage area, only when the chosen video model has
  `supportsSeed`): numeric seed input.
  - ON  → auto-randomized on every open (0–99999), user may still pin it;
  - OFF → holds the last fixed value, user-editable.
- Wire: `onConfirm` carries `seed` → `start_generation` input →
  `EngineInput.seed` → request builder sends it ONLY for
  `supportsSeed: true` models (all three Agnes video models; image models
  have no seed param → omitted).
- Log: `params.seed` = the value actually sent (reproducible re-gen, P4).

## Media mode — pipe UI rules (Q7, user-confirmed 2026-09-16)

The mode is PIPE-LEVEL UI (composer/pipe chrome), NOT a per-run choice in
the generate modal. Row visibility is driven by the configured video
model's capabilities (P2: the spec carries the rules):

| model        | pipe UI behavior                                                    |
|--------------|---------------------------------------------------------------------|
| v2.0         | both rows visible; subjects merge into the keyframes image array (cap 3, `extra_body.image` + mode "keyframes") — no toggle (single mode) |
| 2.5-flash    | pipe-level toggle **[Keyframes \| Reference]**: keyframes mode → SUBJECTS ROW HIDDEN; reference mode → KEYFRAMES ROW HIDDEN (`first_frame`/`last_frame` ≤2 ↔ `images[]` ≤5 + `audios[]` ≤3) |
| 2.5 (paid)   | BOTH rows visible (dual mode: first/last_frame + images/audios/videos) — toggle irrelevant while read-only |

Data + wiring:
- `PipeRow.mediaMode: 'keyframes' | 'reference'` (default `'keyframes'`),
  persisted per pipe (composer JSON); rides the pipe snapshot to the
  engine later (Phase 6) — `StartGenerationInput` unchanged.
- `ModelSpec.media` carries the per-model rules (modes / maxKeyframes /
  maxRefs / maxAudios / maxVideos / sharedArray) — UI is model-driven;
  unknown models keep today's behavior (both rows, no toggle).
- Toggle placement: compact segmented control in the pipe header area
  (`PipeHeader` / `ComposerPanel` chrome).
- Engine mapping (Phase 6, model-agnostic): (anchors[], refs[]) →
  per-`requestFormat` wire fields; paid dual mode = the extension point.

## Public URLs + fail-fast (Q8)

- txt2img/img2img → result is a public Agnes CDN URL; scheme stores the
  URL as the keyframe/subject ref AND keeps the local copy (existing).
- Generation start: existing `collectRemoteUrls` / `checkRemoteUrls`
  reachability check already covers these URLs → unreachable ref =
  red-out + red toast naming the URL + NO task created (D5 rule).
- TTL: user says ~2 weeks, hermes saw 1 h cache-control → VERIFY in
  Phase 6; the local copy is the resilience path (re-host later).
- Base64 inputs (V2.5 accepts Data-URIs) = explicitly FUTURE.

## Q4 fact flag (keep as-is, configure later)

Q/C have NO wire mapping on the V2.5 family (sending
`num_inference_steps`/`quality` → 400). V2.0 exposes `num_inference_steps`
(default 8; 12–14 for keyframes per hermes) — a future `qValue → steps`
map is optional and deferred per user.
USER MAPPING (2026-09-16): **`cValue` → `guidance_scale`** — the engine
sends cValue as `guidance_scale` where the model/endpoint accepts it;
verify per-endpoint in Phase 6 live tests. Until then both Q/C stay in
the portable log unchanged.

## Proposed catalog data (paste target, `src/lib/settings/catalog.ts`)

```ts
export const AGNES_PRESET: PresetSpec = {
  id: 'agnes',
  label: 'Agnes',
  kinds: ['text', 'image', 'video'],
  auth: 'bearer',
  defaultBaseUrl: 'https://apihub.agnes-ai.com', // host root — option (a)
  models: [
    // TEXT — inert container (Q9). Supersedes agnes-2.0-flash.
    { id: 'agnes-2.5-flash', kind: 'text', label: 'Agnes 2.5 Flash (text)',
      endpoint: '/v1/chat/completions', sync: true, requestFormat: 'chat',
      limits: {}, supportsSeed: false },
    // IMAGE — 2.5-flash first = default (guards pick first non-pending).
    { id: 'agnes-image-2.5-flash', kind: 'image', label: 'Agnes Image 2.5 Flash',
      endpoint: '/v1/images/generations', sync: true, requestFormat: 'image-gen',
      limits: { resolutions: ['1K', '2K', '3K', '4K'],
                 ratios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] },
      supportsSeed: false },
    { id: 'agnes-image-2.1-flash', kind: 'image', label: 'Agnes Image 2.1 Flash (fallback)',
      endpoint: '/v1/images/generations', sync: true, requestFormat: 'image-gen',
      limits: { /* identical tiers/ratios as 2.5 */ }, supportsSeed: false },
    // VIDEO — 2.5-flash first = default; v2.0 = fps-native alternate.
    { id: 'agnes-video-2.5-flash', kind: 'video', label: 'Agnes Video 2.5 Flash',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-seconds',
      limits: { seconds: [4, 12], resolutions: ['720P'],
                 ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
      supportsSeed: true },
    { id: 'agnes-video-v2.0', kind: 'video', label: 'Agnes Video V2.0 (fps-native)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-frames',
      limits: { fps: [18, 24, 30, 48, 60], // API range 1–60
                 resolutions: ['480p', '720p', '1080p'],
                 ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
                 maxFrames: 441 }, // 8n+1 rule = our SLA grid
      supportsSeed: true },
    // VIDEO — paid, READ-ONLY (Q3): inspect in Settings, never generable.
    { id: 'agnes-video-2.5', kind: 'video', label: 'Agnes Video 2.5 (paid · read-only)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-seconds',
      limits: { seconds: [4, 12],
                 resolutions: ['720P', '1080P', '1K', '2K'],
                 ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
      supportsSeed: true, readOnly: true },
  ],
};
```

Convention: FIRST non-`pending` model per kind in `models` = the default
(guards already pick `models.find(m => !m.pending)`). All `pending: true`
placeholders are replaced by the above.

## Implementation checklist (no code until GO)

**A. Containers + data — DONE**
- [x] `types/settings.ts`: `ModelSpec.readOnly`, `ModelSpec.supportsSeed`,
      `ModelSpec.media`, `limits.seconds`, `limits.ratios`;
      `RequestFormat` += `'video-job-frames' | 'video-job-seconds'`;
      `GenerationDefaults` += `alwaysNewSeed: boolean`; `PipeRow` +=
      `mediaMode: 'keyframes' | 'reference'` (default `'keyframes'`,
      composer-JSON mirror in Rust)
- [x] `catalog.ts`: paste the data above (Agnes fills, `pending` gone)
- [x] `guards.ts`: `DEFAULT_SETTINGS` += `alwaysNewSeed: true`;
      normalize new fields; agnes baseUrl normalization (strip trailing
      `/v1`) — CUSTOM preset keeps its `/v1` base untouched
- [x] Rust: `StartGenerationInput.seed: Option<i64>`,
      `EngineInput.seed: Option<i64>`, settings serde mirror of
      `always_new_seed`, log piece `params.seed`

**B. Settings UI — DONE**
- [x] `SettingsDefaults.svelte`: "Always use a new seed" checkbox
- [x] `ProviderCard.svelte`: readOnly model → "paid · read-only" badge,
      browsable limits panel, still savable (it's data)
- [x] `GenerateModal.svelte`: per-run model selects EXCLUDE readOnly
      models; seed input (visible when `supportsSeed`)
- [x] Pipe UI (`PipeHeader`/`ComposerPanel`): media-mode segmented
      control + conditional keyframes/subjects row visibility (see
      “Media mode” section)

**C. Tests — DONE**
- [x] vitest: normalize (new fields), catalog defaults/filter helpers,
      baseUrl normalization, media-mode persistence
- [x] cargo: seed optional-field round-trip, settings normalization
- [x] playwright: seed checkbox persists; read-only badge + limits
      visible in ProviderCard; media-mode toggle hides/shows the
      keyframes⇄subjects rows (new `media-mode.spec.ts`).
      NOTE: “readOnly excluded from GenerateModal” is verified at unit
      level (catalog `readOnly` flag + the per-run `.filter`); no
      dedicated e2e yet — add with the first real-engine run.

**D. Deferred to the engine phase (no mocks — Phase 6)**
- [ ] request shapers per `requestFormat` (chat / image-gen /
      video-job-frames / video-job-seconds)
- [ ] poll template substitution (`{videoId}`/`{model}`), seconds clamp,
      res+orientation → tier/ratio mapping
- [ ] real pings + one small generation per model; VERIFY: CDN URL TTL
      (1 h vs 2 weeks), 422 long-image-prompt quirk, keyframe validation,
      seed reproducibility, 503 backoff on v2.0

## Open items — RESOLVED (GO, 2026-09-16)
1. **Q6 option (a)** — GO (host-root base + relative endpoints +
   `{videoId}`/`{model}` poll template).
2. **Seed design** — GO (settings checkbox default ON + per-run input +
   logged seed).
3. **Media mode** — GO: pipe UI (kf mode hides subjects; paid model
   shows both — see “Media mode” section).
4. **Badges** — included now (labels carry free / “paid · read-only”).
5. **v2.0 poll** — GO: uniform `/agnesapi` template with `model_name`;
   legacy `/v1/videos/{taskId}` kept as a test-fallback constant.

All items confirmed → implementation proceeds on a new branch.
