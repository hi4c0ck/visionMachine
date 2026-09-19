# Provider Engine — Dynamic Request Format Per Model — Task Plan

Status: PLAN (no code until GO). Lands the "D. Deferred to the engine
phase" section of `docs/agnes-model-catalog.md`: request shapers per
`requestFormat`, poll-template substitution, clamps/mappings, seed,
media-mode mapping, and the real provider engine. The model specs are
already data in `catalog.ts` (P1/P2) — this plan wires them to the wire.

## Grounding (re-inspected 2026-09-17)
- `src/lib/settings/catalog.ts` + `src/types/settings.ts` — `ModelSpec`
  containers (endpoint / requestFormat / limits / media / supportsSeed /
  readOnly). The frontend is the single source of truth for model data.
- `src-tauri/src/generation/*` — `TaskRegistry` with an empty engine
  slot; sequential stage loop (keyframes → subjects → video); fail-fast
  with real errors when no engine is configured (D1).
- `src/components/Workspace.svelte` `confirmGenerate` — fail-fast remote-
  ref check + readOnly gate + portable log entry (P4/P5).
- `src-tauri/src/commands/settings.rs` — per-profile provider slots
  (baseUrl + apiKey) in `profile_settings`; `get_profile_settings`.
- `src/lib/promptEngine.ts` `summarizePipe` — final prompt string.
- `src-tauri/tauri.conf.json` — identifier `com.visionmachine.desktop`,
  no asset-protocol yet (media preview plumbing is still deferred).

## Locked decisions (user-confirmed 2026-09-17, "E" series)
- **E1 Model = string param.** A UI model switch is just a model id that
  references a real model in the Settings preset. Flow: resolve the model
  (this-run override, else the preset default) → run THAT model's format
  flow. The API key enters the request ONLY at final execution: Rust
  reads it from the per-profile settings blob at request time. The built
  request shape may be surfaced in the UI for debugging with sensitive
  fields masked (`[API_KEY]`).
- **E2** The frontend resolves the model spec from the catalog and passes
  it to Rust; Rust shapes the wire payload. Rust owns secrets + HTTP;
  the frontend owns spec + prompt + media refs.
- **E3 Media layout** — per `[session]/[pipe]/` with per-task folders
  (see "Media layout" below).
- **E4 Conflicts → concrete messages.** Any model/pipe conflict surfaces
  a specific, actionable message. Premium (paid) models unlock the
  advanced paths; limited models stay model-agnostic.
- **E5** Seconds-based models: duration is **1 decimal** (e.g. `"5.0"`),
  clamped to the model's `[4, 12]` range.
- **E6** Frame count (8n+1) is a pipe-level pre-check. If the pipe length
  isn't 8n+1, prevent generation and name the exact frames-count conflict.
  Frames are the source of truth; seconds are the derived value.
- **E7** cValue → `guidance_scale`: always included, but gated by a model
  spec flag so it is dev-managed per model.
- **E8** Resolution/size is inherited from the pipe/session settings, not
  re-derived; the shaper maps it to the model's tier via `limits`.

## Wire contracts

### Frontend — `src/lib/settings/resolveSpecs.ts` (new, small)
- `resolveModelSpec(kind, overrideId?) → { preset, spec } | null` —
  from `getSettings().providers[kind]` + `catalog.getPreset/getModel`;
  `overrideId` = this-run model from the generate modal (E1); `null` =
  pending/unknown → block generation with a concrete message.
- `pipePrechecks(pipe, session, imageSpec, videoSpec) → Conflict[]`
  (E4/E6) — concrete, user-fixable messages:
  - frames-based video (`requestFormat: "video-job-frames"`):
    `lengthFrames` must be 8n+1, ≤ `limits.maxFrames`, and `fps` in
    `limits.fps` → else block (E6).
  - media caps per `spec.media` + `pipe.mediaMode`: sharedArray →
    kfs+subjects ≤ 3 · keyframes mode → kfs ≤ 2 · reference →
    subjects ≤ 5 → overflow blocks (E4).
  - readOnly/pending specs → block (existing gate kept).
  - `txt2img` pieces must carry a prompt (O1); empty → block (E4).
- `secondsPreview(pipe, session, spec) → { shown, clamped }` — modal hint
  for seconds-based models: `round1(len/fps)` clamped to `limits.seconds`.
- `confirmGenerate` sends the resolved specs with `start_generation`.

### Rust — input + engine-context extensions
- `StartGenerationInput` += `profile_id: String`, `image_spec:
  Option<ModelSpecWire>`, `video_spec: Option<ModelSpecWire>`
  (serde camelCase; unknown fields skip — old callers keep working).
- `ModelSpecWire` (new `src-tauri/src/generation/specs.rs`) — serde
  mirror of the frontend `ModelSpec` subset the engine consumes: `id`,
  `kind`, `endpoint`, `sync`, `pollEndpoint?`, `requestFormat`,
  `limits { fps?, resolutions?, maxFrames?, seconds?, ratios? }`,
  `supportsSeed?`, `guidance?` (E7), `media { modes, dual?, sharedArray?,
  maxKeyframes?, maxRefs?, maxAudios?, maxVideos? }`. No secrets, ever.
- `EngineInput` += `task_id`, `profile_id`, `image_spec?`, `video_spec?`,
  `stage: EngineStage`, `upstream: Vec<UpstreamOutput>`:
  - `EngineStage` = `Keyframe { kind, prompt?, imageSrc?, referenceUrl? }`
    | `Subject { kind, prompt?, imageUrl }` | `Video` (per-stage context
    — today the registry hands the engine only task-level input).
  - `UpstreamOutput` = `{ sourceId, kind, localPath, remoteUrl? }`
    (finished image stages feeding the video stage; the registry
    accumulates it per task, keyed by `task_id`).
- `TaskRegistry` holds a pipe-media snapshot at `start()` (keyframes +
  subjects + mediaMode from the composer load it already does) and
  builds the per-stage `EngineInput` inside `run_task`.
- `ModelSpec` (frontend `src/types/settings.ts`) += `guidance?: string`
  (wire param name, e.g. `"guidance_scale"` — E7) and
  `limits.sizeMap?: Record<string, string>` / `limits.ratioMap?:
  Record<string, string>` (E8: resolution→tier, orientation→ratio as
  catalog data; absent → param omitted, provider default).

## Shapers (pure — `src-tauri/src/generation/shaper.rs`)

One payload builder per `requestFormat`: (spec, stage data,
EngineInput) → `serde_json::Value`. Pure, unit-testable, no HTTP/IO.

### `image-gen` (agnes image 2.5-flash / 2.1-flash)
- `{ model, prompt, size?, ratio?, extra_body: { image?: string[],
  response_format: "url" } }`
- `size` = `spec.limits.sizeMap[session.resolution]` (E8; map absent →
  omit the param, provider default).
- `ratio` = `spec.limits.ratioMap[session.orientation]` (same rule).
- PITFALL (catalog-locked): `response_format` lives INSIDE
  `extra_body`, never top-level (top-level → HTTP 400).
- img2img: `extra_body.image = [referenceUrl]` (public URL; Data-URI
  deferred per Q8).
- Per-piece prompt: the piece's own `prompt` ONLY — kf/subject prompts
  are independent of the video prompt (O1 resolved); no pipe-prompt
  fallback. Rule: kf/subject MAY carry no prompt; ONLY `txt2img` requires
  one — empty prompt on a txt2img piece → pre-check conflict (E4):
  "keyframe N (txt2img) needs a prompt".

  ### `video-job-frames` (agnes-video-v2.0 — fps-native)
  - `{ model, prompt, num_frames, frame_rate, mode?, image?, extra_body?,
    seed?, guidance? }`
  - `num_frames = pipe.lengthFrames` (E6: 8n+1 guaranteed by the pipe
    pre-check, never snapped here), `frame_rate = composer.fps`.
  - media — `spec.media.sharedArray`: merged = keyframe URLs (slot order)
    + subject URLs, cap 3 (overflow already blocked by pre-check):
    - 0 refs → `mode: "ti2vid"`, no image (text-only).
    - 1 ref  → `mode: "ti2vid"` + top-level `image = url`.
    - 2–3    → `mode: "keyframes"` + `extra_body: { image: [urls],
      mode: "keyframes" }` (hermes-verified shape).
  - `width`/`height` and `num_inference_steps`: OMITTED (server defaults;
    Q4 deferred; live-verify later — open item O4).

  ### `video-job-seconds` (agnes-video-2.5-flash, and 2.5 paid later)
  - `{ model, prompt, mode, seconds, size, aspect_ratio?, seed?, n: 1,
    first_frame?, last_frame?, images?, audios? }`
  - `mode` = `pipe.mediaMode` mapped per `spec.media.modes`:
    - `keyframes` → `"keyframe"`: `first_frame = kf[0]`,
      `last_frame = kf[1]` (≤ `maxKeyframes`); NO `images`/`audios`/
      `videos` fields in this mode (400 if present).
    - `reference` → `"reference"`: `images[] = subject URLs` (≤
      `maxRefs`); subject list order = Picture order (`<Picture 1>` =
      first subject). The prompt passes through UNCHANGED: `<Picture N>`
      tokens are user-authored inside tag prompts (O5 resolved); future
      UX task: suggest tokens in prompting zones. `audios`/`videos`
      unused in UI yet.
    - no media / text-only → `"text"`, no media fields.
  - `seconds` = `clamp(round1(pipe.lengthFrames / composer.fps),
    spec.limits.seconds)` as a STRING with 1 decimal (E5), e.g. `"5.0"`.
  - `size` = `spec.limits.sizeMap[session.resolution]` — for 2.5-flash the
    only valid value is `"720P"` (anything else → 400), so the catalog
    `sizeMap` must map every session resolution to `"720P"`.
  - `aspect_ratio` = `spec.limits.ratioMap[session.orientation]`.
  - `seed` only when `spec.supportsSeed` AND a value was provided (E-seed).
  - `guidance` only when `spec.guidance` is set (E7) — send `cValue` under
    that param name.

  ### `video-job` (custom OpenAI-shape) & `chat`
  - `video-job` (custom preset) — best-effort generic `{ model, prompt,
    ... }`; stays `pending` until a concrete model lands.
  - `chat` — inert (Q9): container for the future prompt-summarizer
    engine, not wired into generation.

  ### Shared shaper helpers
  - `formatSeconds(frames, fps, range) -> String` — E5/E6: 1-decimal,
    clamped to `range`.
  - `substitutePollTemplate(template, videoId, model) -> String` — replace
    `{videoId}` / `{model}` (E2/catalog URL option a).
  - `clampToRange(v, [lo, hi])`.
  - `pickImageTier(spec, resolution)` / `pickRatio(spec, orientation)` —
    read the `sizeMap` / `ratioMap`; `None` → omit.

  ## Media layout (E3)
  The media root follows the existing project-storage convention
  (O6 resolved), per session, in order:
  1. `session.directoryPath` when set (today: `<projectDir>\session_<ts>`).
  2. else `<project.directoryPath>/session_<ts>` (explicit project path).
  3. else default `<appData>/profiles/<profile name>_<creation-ts hash>/
     <project>/<session>/` (created lazily — new, reserved by this task).
  Per-pipe tree under that session root:

  ```
  <sessionRoot>/<pipe_id>/
    images/                 # generated keyframe/subject bitmaps
      <refId>.png           # latest per ref (overwritten each gen)
      log.jsonl             # append-only: {ts, refId, model, seed, remoteUrl, localPath}
    <task_id>/
      video.mp4             # this task's output (kept — previous tasks stay, so
      output.json           #   the pipe can fall back to an earlier generation)
      request.log           # redacted request/response (API key -> [API_KEY])
  ```
  - Session-level composed/full video + full resources = a later task; for
    now the `[session]/` folder simply scopes the `[pipe]/` folders.
  - Stale generated images are retained via `images/log.jsonl` (each gen
    appends a line; the latest per ref is what the video stage consumes).
  - `output.json` = `{ videoPath, videoUrl, model, seed, params, status }`.
  - `request.log` = the built request(s) + provider responses, with every
    secret masked to `[API_KEY]` (E1 debug surface).

## Engine runtime (`src-tauri/src/generation/provider.rs`)
`ProviderEngine` implements `GenerationEngine` and is wired via
`registry.set_engine(Arc::new(...))` in `lib.rs`, replacing the fail-fast
no-engine path (D1).

- **Per stage** (driven by the registry's existing loop):
  1. Load the profile settings blob → the provider slot for this stage's
     kind. The API key is read HERE, only while building the outbound
     request (E1); it is never written to `request.log` or `output.json`.
  2. Build the payload with the stage's shaper (pure).
  3. Execute — image stages are `sync` (POST, await response); video
     stages are `async` (POST create → poll `pollEndpoint`).
  4. On success, download the artifact into the media tree and append the
     redacted `request.log` line (+ `output.json` for the video stage).
  5. Return the local path (image stages) / set `output_path` (video).
- **Polling** (async video): GET the substituted `pollEndpoint` every
  ~1–2 s; `503 video_queue_full` (v2.0) backs off 30/60/120 s
  (catalog hermes note); honor the shared `cancel` flag each tick.
- **Progress**: image 0→1 on completion; video 0→0.5 on job accepted →
  1 on success. Real state only, never simulated (D1).
- **Errors** (E4): transport failure, 4xx/5xx, and validation conflicts
  all become a stage `error` string naming the concrete cause, e.g.
  `"pipe length 130 is not 8n+1; use 129 or 137"`.

## UI surface (E1/E4)
- `GenerateModal` — after a model pick, show the `secondsPreview` hint
  and run `pipePrechecks`; on conflict, list the concrete messages and
  block confirm.
- `GenerationProgressModal` — an optional **request-log** expander that
  shows the redacted `request.log` for the active task (E1 debug).
- Terminal toasts (existing): success / error / cancelled; the error text
  now carries the provider's concrete message (E4).
- Media preview: generated `video.mp4` + keyframes served to the webview
  via `read_media_file` (Phase E) against the session media roots, reusing
  the existing `toMediaUrl` / `lastGeneration` plumbing.

## Phases (checkboxes)

### Phase A — contracts + pre-checks (no HTTP yet)
- [x] Frontend `src/lib/settings/resolveSpecs.ts`: `resolveModelSpec`,
      `pipePrechecks`, `secondsPreview` (above).
      (Note: pre-checks + seconds preview live in `./prechecks.ts`, re-exported
      by the settings barrel — `resolveSpecs.ts` owns spec resolution.)
- [x] `src/types/settings.ts`: `ModelSpec.guidance?`,
      `limits.sizeMap?/ratioMap?`; `catalog.ts`: fill `sizeMap`/`ratioMap`
      for the Agnes image + video entries (E8).
- [x] `Workspace.confirmGenerate`: resolve specs, run pre-checks (concrete
      toasts, block on conflict), send `profile_id` + specs in
      `start_generation`.
- [x] Rust: `ModelSpecWire` + `StartGenerationInput` extensions
      (serde camelCase, tolerant deserialization); `EngineStage` /
      `UpstreamOutput` on `EngineInput`; registry builds per-stage input
      from the pipe-media snapshot.
- **Tests**:
  - [x] vitest — pre-check messages (8n+1 violation, cap overflow, fps
    off-grid, missing txt2img prompt), seconds clamp/1-dec
    (`tests/unit/prechecks.test.ts`, 15 tests).
  - [x] cargo — `ModelSpecWire` round-trip, `StartGenerationInput`
    tolerates missing specs/profile; legacy caller still deserializes.
  - [ ] vitest — resolve default vs override (`resolveModelSpec`).

  Note: `EngineStage`/`UpstreamOutput` are type-level additions on
  `EngineInput` (shaped in `generation/engine.rs`). The registry's
  per-stage input build from the pipe-media snapshot is deferred to
  Phase D (the HTTP engine that consumes it).

### Phase B — media layout + redaction (no HTTP yet)
- [x] `src-tauri/src/generation/media.rs`: tree under
      the session media root ("Media layout" resolution order) per E3; writers for `images/<refId>.png`
      + `log.jsonl` append, `<task>/video.mp4`, `output.json`,
      `request.log`.
- [x] Redaction helper: mask `Authorization`/`apiKey` → `[API_KEY]` in
      everything that is persisted or shown (E1, P6).
- **Tests**:
  - [x] cargo — tree creation (`pipe_media_dirs`), jsonl append semantics,
        redaction never emits a real key, `request.log` redacted, safe dir names
        strip traversal, session-media-root fallback chain.
  - [ ] unit (vitest) — redaction pure function (frontend mirror of `redact`;
        optional, the Rust side is authoritative).

### Phase C — shapers (pure)
- [x] `src-tauri/src/generation/shaper.rs`: one builder per
      `requestFormat` per the spec above + the shared helpers
      (`formatSeconds`, `substitutePollTemplate`, `clampToRange`,
      `pickImageTier`, `pickRatio`).
- **Tests**:
  - [x] cargo golden-payload tests — image-gen (response_format INSIDE
        extra_body, size/ratio maps, img2img referenceUrl, guidance gating),
        video-job-frames (0/1/2–3 media branches, 8n+1 passthrough, seed/
        guidance gating), video-job-seconds (keyframe/reference/text
        field-exclusion, 1-dec clamped seconds, 720P size, seed gating);
        helper unit tests (format/clamp/round, template substitution).
        19 tests in `shaper.rs`.

### Phase D — provider engine (HTTP)
- [x] `src-tauri/src/generation/provider.rs`: `ProviderEngine`
      (image sync POST, video create→poll w/ 503 backoff + cancel,
      artifact download, media writes, progress callbacks); wire
      `registry.set_engine(...)` in `lib.rs`.
- **Tests**: cargo with a mock/stubbed HTTP layer — success path (files
      land in the tree, `output.json` + redacted `request.log` written),
      4xx/5xx → concrete stage error, cancel mid-poll → Cancelled,
      503 backoff sequencing, no-engine-fallback fail-fast kept (D1).
      10 tests in `provider.rs` (`StubHttp` scripted transport, no network).

    ### Phase E — UI integration + media serving
    - [x] Media serving: `read_media_file { path }` blob command (Rust) —
          per-project directories can't be a static asset-protocol scope,
          so the command validates the path against a known session/project
          media root; `mediaUrl.ts` switches to it under Tauri, renders
          the generated `video.mp4` / keyframes in the existing preview
          plumbing.
    - [x] `GenerateModal`: pre-check conflict list + `secondsPreview` hint.
      (Landed with Phase A; the request-log expander stays in Phase E.)
    - [x] `GenerationProgressModal`: redacted request-log expander (E1).
    - **Tests**: svelte-check clean (0 errors); vitest for the pre-check/preview render
          logic (420 tests green); a manual desktop smoke (preview shows the real file)
          is pending — requires running the app with a real generation.

    ### Phase F — live verification (real keys, no mocks)
    One small generation per model against the real API, then record results
    back into `docs/agnes-model-catalog.md` (a "Verified" section):
    - [ ] CDN URL TTL (1 h vs 2 weeks) + the local-copy resilience path.
    - [ ] 2.x long-prompt 422 quirk (shorter-is-safer boundary).
    - [ ] Keyframe validation (min/max image counts per mode).
    - [ ] Seed reproducibility (same seed → same output).
    - [ ] 503 backoff on v2.0 in practice.
    - [ ] Does each endpoint accept `guidance_scale`? (E7 — set the spec
          flag per model on the result.)

## Open items — RESOLVED (user answers, 2026-09-17)
- **O1** Piece prompt = the piece's own prompt; no pipe-prompt fallback
  (kf/subject prompts are independent of video gen). Rule: kf/subject
  MAY have no prompt; ONLY `txt2img` requires one (pre-check enforces).
- **O2** `images/<refId>.png` = latest (overwritten); history in
  `log.jsonl`; the video stage consumes the latest line. Confirmed.
- **O3** v2.0: 0 kfs → text-only `ti2vid`; 1 kf → `ti2vid` + top-level
  `image`. Confirmed intended.
- **O4** v2.0 `width`/`height` omitted (server defaults); revisit only if
  live tests show a need.
- **O5** No engine-appended tokens: `<Picture N>` is user-authored inside
  tag prompts; `images[]` order (= subject order) defines N. UX
  suggestions in prompting zones = future task.
- **O6** Media root = the session folder per the project-storage
  convention (explicit `directoryPath` → default profile-hash tree), not
  a global app-data media dir. The profile-level `<name>_<creation-ts
  hash>` guards same-name re-create collisions (delete + restore keeps
  prior data); session level is unique via the full parent path. See
  "Media layout".

    ## Out of scope (future tasks)
    Session-level full/composed video + its resources (E3 session level);
    audio/video reference inputs (2.5 dual mode); base64/Data-URI inputs
    (Q8); parallel concurrency; the text `chat` summarizer engine (Q9).
