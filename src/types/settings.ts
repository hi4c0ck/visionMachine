// Settings & provider containers (docs/settings-provider-tasks.md, Phase 0).
//
// One vendor in v1: Agnes (text + image + video). Concrete model details
// arrive later and land as DATA in src/lib/settings/catalog.ts — these
// types are the stable containers, the UI and engine must not re-shape
// when specs are filled.

export type ProviderKind = 'text' | 'image' | 'video';

/** Widened for the expanded provider system (docs ROADMAP v0.7.12 lead):
 *  preset ids are catalog data, not a closed union. Known ids stay constants
 *  in catalog.ts; stored slots keep self-healing via normalizeSettings. */
export type PresetId = string;

/** How a provider authenticates requests. 'none' = keyless local servers
 *  (Ollama / LM Studio / llama.cpp class) — the key gates relax for them. */
export type AuthScheme = 'bearer' | 'key-header' | 'x-api-key' | 'query-key' | 'none';

/** Base-URL convention: 'host-root' bases carry the version prefix in their
 *  endpoint paths (Agnes, Runway, Kling…); 'v1-native' bases already include
 *  /v1 (OpenAI-compatible). Drives normalizeBaseUrl — replaces the old
 *  agnes-only special case. */
export type UrlStyle = 'host-root' | 'v1-native';

/** How a model's API wants its request payload (request-builder shaper id).
 *  `video-job` is the generic OpenAI-shape async job (custom preset). The
 *  Agnes video engine is seconds-based (V2.5 family); the legacy
 *  frames-based V2.0 route (`video-job-frames`) was removed with the
 *  V2.0 model (P1-7, 2026-11-11). `video-adapter` = the configurable
 *  Tier-A adapter (spec.adapter data interpreted by the Rust engine).
 *  `mcp` = stateless JSON-RPC MCP tool call (spec.mcp config interpreted by
 *  generation/mcp.rs); used by keyless local MCP engines (Wan2GP). */
export type RequestFormat =
  | 'chat'
  | 'image-gen'
  | 'video-job'
  | 'video-job-seconds'
  | 'video-adapter'
  | 'mcp';

/** Pipe-level media mode (docs/agnes-model-catalog.md, Q7). Default is
 *  'keyframes'. Drives keyframes/subject-refs row visibility per model.
 *  'text' marks a model that offers no media (wire-level fallback only —
 *  never a user-selectable lock; a stored pipe never carries it). */
export type MediaMode = 'keyframes' | 'reference' | 'text';

/** Declared generation modes a model supports. 't2v'/'i2v'/'v2v' are video
 *  (text / image / video conditioned); 't2i'/'i2i' are image. 'v2v' is a
 *  RESERVED slot — no catalog row declares it until an engine ships (Tier-B,
 *  see the LOCAL_VIDEO_MODEL reservation in catalog.ts). Surfaced as the
 *  leading segment of capabilityNote(). */
export type CapabilityMode = 't2v' | 'i2v' | 'v2v' | 't2i' | 'i2i';

/** Per-model media-mode rules — the pipe UI shows/hides the keyframes and
 *  subject-refs rows based on these (docs/agnes-model-catalog.md, Q7).
 *  Absent = unknown model → keep today's behavior (both rows, no toggle). */
export interface ModelMedia {
  /** Modes the model offers. A single entry = no toggle. */
  modes: MediaMode[];
  /** true = keyframes AND reference media allowed simultaneously (paid 2.5). */
  dual?: boolean;
  /** true = subjects merge into the keyframes image array (V2.0, shared cap). */
  sharedArray?: boolean;
  maxKeyframes?: number;
  maxRefs?: number;
  maxAudios?: number;
  maxVideos?: number;
  /**
   * Wire value of the `mode` param per logical media mode (key = frontend
   * mode name). Declared when the model is served through a provider route
   * with a different mode-name family (V2.0 legacy route:
   * ti2vid/keyframes/multi_reference vs the 2.5 route's
   * text/keyframe/reference). Absent → the shaper sends the logical name.
   */
  wireModes?: Partial<Record<MediaMode, string>>;
  /**
   * Reference-image floor for the reference (multi_reference) wire mode
   * (V2.0 legacy route: 2 — live 400 2026-10-04: multi_reference requires
   * ≥2 images). Below it the shaper falls back to the text-mode wire value;
   * a single image (if any) rides the top-level `image` field.
   */
  minRefs?: number;
  /**
   * Keyframe-image floor for the keyframes wire mode (V2.0 legacy route:
   * 2 — live 400 2026-10-04: "mode=keyframes requires image as a list of
   * at least 2 items"). Below it the shaper falls back to the text-mode
   * wire value; a single keyframe (if any) rides the top-level `image`
   * field.
   */
  minKeyframes?: number;
  /**
   * Wire field name for the reference image list. 2.5 route: `images`
   * (array). V2.0 legacy route: `image` — a single URL string for one
   * reference, an array for multiple (live probes 2026-10-04: the legacy
   * validator ignores `images[]` and rejects with 400 "param: image").
   */
  imageField?: 'images' | 'image';
}

// ── Configurable video adapter (Tier A, expanded provider system) ──────────
// Declarative create→poll→artifact job mapping. Vendor transport + response
// interpretation live on the PRESET (PresetSpec.adapter); the per-model
// payload template + deltas live on the MODEL (adapterPayload /
// adapterOverrides). resolveSpecs merges them onto the wire spec; the Rust
// engine interprets (generation/video_adapter.rs). Logic-heavy uniques
// (Agnes mode-fallback, ComfyUI workflow graphs) stay Tier-B code shapers —
// never force-folded into this config (owner scope decision 2026-11-21).

/** Canonical job states the adapter statusMap translates vendor vocab into. */
export type AdapterJobState =
  | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'throttled';

export interface AdapterArtifactSpec {
  /** 'url' = dot-path to a URL (string or array[0]) in the final body;
   *  'retrieve' = secondary GET (fileId) that yields the URL (MiniMax);
   *  'content' = the endpoint itself streams the artifact bytes (reserved). */
  mode: 'url' | 'content' | 'retrieve';
  /** url mode: dot path into the poll/result body ("output", "assets.video",
   *  "data.task_result.videos"). Numeric segments index arrays. */
  path?: string;
  /** content/retrieve: GET template with {jobId} / {fileId} / {model}. */
  endpoint?: string;
  /** retrieve: dot path to the file id in the poll body ("file_id"). */
  fileIdPath?: string;
  /** retrieve: dot path to the URL in the retrieve response ("file.download_url"). */
  artifactPath?: string;
}

export interface AdapterEnvelopeSpec {
  /** Business-error check on HTTP-200 bodies (Kling {code}, MiniMax
   *  {base_resp:{status_code}}): codePath != okValue → concrete failure. */
  codePath: string;
  okValue: number | string;
  messagePath: string;
}

export interface AdapterResponseSpec {
  /** Dot path to the job id in the CREATE response. */
  jobIdPath: string;
  /** Dot path to the raw status in the POLL response. */
  statusPath: string;
  /** Raw vendor status → canonical state. List EVERY spelling (Kling
   *  'succeed' AND 'succeeded'; case-sensitive keys). */
  statusMap: Record<string, AdapterJobState>;
  progressPath?: string;
  /** Scale of the provider progress number: Runway 0-1, most 0-100. */
  progressScale?: 1 | 100;
  /** fal queue_position → "queue position N" live event line. */
  queuePositionPath?: string;
  artifact: AdapterArtifactSpec;
  /** Failure message dot path (poll or result body). */
  errorPath?: string;
  envelope?: AdapterEnvelopeSpec;
  /** Provider-reported actual cost (Runway cost.credits, Kling
   *  data.final_unit_deduction) → captured into output.json `cost`. */
  reportedCost?: { path: string; unit: string };
  /** Compute-time usage signal (Replicate metrics.predict_time, fal
   *  metrics.inference_time) → output.json `cost.usage`. */
  predictTimePath?: string;
}

export interface VideoAdapterSpec {
  /** Static headers sent on every request (e.g. X-Runway-Version). */
  headers?: Record<string, string>;
  /** POST JSON create; endpoint may contain {model} (fal/Replicate/Kling-new). */
  create: { endpoint: string };
  poll: {
    /** GET template with {jobId} (+ {model} where the vendor needs it). */
    endpoint: string;
    /** fal two-stage: COMPLETED includes failed jobs — GET the result to
     *  decide success and extract the artifact. */
    resultEndpoint?: string;
    /** Poll cadence floor (Runway recommends ≥5s); default = engine 10s. */
    intervalSecs?: number;
  };
  /** Best-effort remote cancel on user cancel (stops abandoned-render billing). */
  cancel?: { endpoint: string; method: 'DELETE' | 'POST' | 'PUT' };
  /** Per-model JSON payload template. Tokens: {{model}} {{prompt}}
   *  {{seconds}} (1-dec string) {{seconds:int}} {{seconds:str}}
   *  {{seconds:enum}} (snapped to limits.secondsEnum, number)
   *  {{seconds:enumstr}} (snapped, string) {{ratio}} {{size}}
   *  {{seed}} {{media:first}} {{media:last}} {{media:refs}}.
   *  A WHOLE-STRING token substitutes as its typed JSON value; an embedded
   *  token interpolates into the string ("{{seconds:int}}s" → "5s").
   *  Unresolved optional tokens PRUNE the field (objects whose leaves all
   *  pruned vanish — Luma keyframes on a text-only run). */
  payload: Record<string, unknown>;
  response: AdapterResponseSpec;
  media?: {
    /** 'url-or-data' = local media inlined as data: URIs (existing ≤32MB
     *  path); 'url-only' = local-only media is a concrete precheck failure.
     *  'upload' = local media is multipart-POSTed to the engine's upload
     *  route before create; the payload reference becomes the engine-side
     *  name (ComfyUI: /upload/image → response.name — graph nodes take
     *  the uploaded filename, not a URL). */
    input: 'url-or-data' | 'url-only' | 'upload';
    /** 'upload' only: the engine upload route. ComfyUI-class defaults:
     *  endpoint '/upload/image', multipart field 'image', response
     *  reference at 'name'. Unverified-live until an engine is probed. */
    upload?: {
      endpoint: string;
      field?: string;
      namePath?: string;
    };
  };
}

/**
 * Media-transfer action descriptor for the MCP `wangp_session` tool. Models
 * the locked WanGP v2.1 chunked-upload handshake: `create_file_upload` takes
 * a bare filename + byte size, returns a one-time token, then `chunkAction` /
 * `finishAction` complete the transfer; `refPaths` locates the resulting
 * media reference in the response. Mirrors the Rust `McpActionWire` fields.
 * All keys are wire data — no paths or owner-machine values belong here
 * (P5 portable catalog).
 */
export interface McpUploadSlot {
  /** wangp_session action name (e.g. 'create_file_upload'). */
  action: string;
  /** Argument key carrying the bare sanitized filename on create. */
  filenameArg: string;
  /** Argument key carrying the decoded byte size on create. */
  sizeArg: string;
  /** Dot-path keys for the one-time upload token in the create response. */
  tokenPaths: string[];
  /** wangp_session action uploading one base64 chunk. */
  chunkAction: string;
  /** wangp_session action finalizing the upload. */
  finishAction: string;
  /** Dot-path keys accepted when reading the returned media reference. */
  refPaths: string[];
  /** Legacy path-based argument key (old upload / download configs). */
  pathArg?: string;
}

/** Stateless JSON-RPC MCP transport (Tier-B code shaper, generation/mcp.rs).
 *  Declarative like the Tier-A adapter: transport + tool names + defaults on
 *  the PRESET (PresetSpec.mcp), resolved onto the wire spec as `spec.mcp`.
 *  No SDK crate, no session header — initialize then tools/call per request.
 *  All strings are protocol data; NEVER put owner-machine paths/checkpoints
 *  or Wan2GP config values here (P5: portable catalog). */

export interface McpSpec {
  /** JSON-RPC endpoint under the provider base URL (e.g. '/mcp'). */
  endpoint: string;
  /** JSON-RPC protocol version advertised at initialize. */
  protocolVersion: string;
  /** Exposed tool names (WanGP: wangp_generate / wangp_session). */
  tools: { generate: string; session: string };
  /** Generation tool call options. wait=true -> the server blocks until the
   *  job finishes; no client-side polling is needed for this transport. */
  generate?: { wait?: boolean; timeout_s?: number | null };
  /** Generic generation settings merged UNDER the per-run prompt/seed/
   *  resolution. Only portable wire values — no `config`, `overrides`,
   *  output filename, LoRA or filesystem paths (owner local config). */
  settingsDefaults?: Record<string, unknown>;
  /** wangp_session actions used to transfer authorized media. The exact
   *  action names/argument keys are server data; the engine fails with an
   *  actionable error if an upload/download cannot be completed safely. */
  actions?: {
    upload?: McpUploadSlot;
    download?: { action: string; pathArg: string; refPaths: string[] };
  };
}

/** Static per-model pricing data (researched, date-stamped — same convention
 *  as limits). rates absent / verifiedAt null = NOT yet researched: the
 *  estimate endpoint reports 'unknown' honestly, never a fabricated number.
 *  Live retrieval (OpenRouter /models pricing) and provider-reported cost
 *  (adapter reportedCost) supersede static rates when present. */
export interface PriceSpec {
  unit: 'per-video-second' | 'per-video' | 'per-image' | 'per-token' | 'per-credit' | 'per-unit' | 'free-local';
  currency: 'USD' | 'credits' | 'units';
  /** Unit rate. Key conventions: per-video-second → session resolution
   *  ('720p','1080p') or 'base'; per-video → '<resolution>-<seconds>'
   *  ('768P-6') or 'base'; per-token → promptPer1M/completionPer1M/
   *  cachedInputPer1M (USD per 1M tokens, post-run); per-credit/per-unit →
   *  usdPerCredit/usdPerUnit conversion anchor (post-run reported units). */
  rates?: Record<string, number>;
  source?: string;
  verifiedAt?: string | null;
  note?: string;
}

/** Portable per-run cost snapshot (P5-safe: costs are not secrets). Captured
 *  into output.json by the adapter engine; rides the generation log piece. */
export interface RunCostSnapshot {
  reported?: { value: number; unit: string };
  usage?: { predictTimeSecs?: number; inferenceTimeSecs?: number };
  estimatedUsd?: number;
  basis?: string;
}

/**
 * A model owns its request format (the "guaranteed on the flight" rule):
 * endpoint + payload shaper + limits travel WITH the model, so switching
 * models within a configured provider can never break the wire format.
 */
export interface ModelSpec {
  id: string;
  kind: ProviderKind;
  /** Path under the provider base URL (e.g. "/chat/completions"). */
  endpoint: string;
  /** false → async job: create, then poll `pollEndpoint`. */
  sync: boolean;
  pollEndpoint?: string;
  requestFormat: RequestFormat;
  limits: {
    fps?: number[];
    resolutions?: string[];
    maxFrames?: number;
    /** Seconds range for seconds-based video models (V2.5: [4, 12]). */
    seconds?: [number, number];
    /** Discrete allowed durations (MiniMax 6|10, Kling 5|10, Luma 5|9):
     *  the {{seconds:enum}} / {{seconds:enumstr}} adapter tokens snap the
     *  clamped seconds to the nearest entry. Absent = continuous range. */
    secondsEnum?: number[];
    /** Supported aspect ratios (model-driven, P2). */
    ratios?: string[];
    /**
     * Resolution tier map (E8): session resolution → model size tier
     * (e.g. "720p" → "1K" for Agnes image, "720p" → "720P" for 2.5-flash).
     * Absent → the size param is omitted and the provider default applies.
     */
    sizeMap?: Record<string, string>;
    /**
     * Orientation ratio map (E8): session orientation → model aspect-ratio
     * value (e.g. "horizontal" → "16:9"). Absent → param omitted.
     */
    ratioMap?: Record<string, string>;
  };
  /**
   * Per-model pipe-length grid: valid lengths are `offset + k*step` (k ≥ 0),
   * floored at `min`. Absent = the app's legacy 41 / 8n+1 grid
   * ({ min: 41, step: 8, offset: 1 }); every existing model keeps that path
   * byte-for-byte. Declared on the MODEL (not the preset) so a local engine
   * with a native non-8n+1 cadence (Wan2GP H3: 5 + 17k, min 107) can be
   * refitted without touching other vendors. Rust's ModelSpecWire ignores
   * this frontend-only field (no deny_unknown_fields) — do NOT add it to
   * Rust unless the engine actually consumes it.
   */
  frameGrid?: { min: number; step: number; offset: number };
  /** Placeholder until concrete vendor details land — picker disables it. */
  pending?: boolean;
  /** Resolved-only stamp (set by resolveModelSpec, never a catalog value):
   *  true when the owner's verified tick lifted this pending catalog id, or
   *  when a typed free-form id rode the preset's base spec. Lets downstream
   *  gates/logging tell an owner-unlocked spec from a generable default. */
  ownerVerified?: boolean;
  label?: string;
  /** Read-only entry: viewable/inspectable in Settings, never generatable. */
  readOnly?: boolean;
  /** Model capabilities beyond the default media mode — surfaced as
   *  chips/notes in the model pickers; limitations ride WITH the
   *  capability (never free-floating). No engine ships vid2vid yet —
   *  the slot is reserved so a Tier-B entry just fills it in. */
  capabilities?: {
    /** Declared generation modes (t2v/i2v/v2v/t2i/i2i). v2v stays reserved —
     *  no catalog row declares it. Rendered first by capabilityNote(). */
    modes?: CapabilityMode[];
    /** Video-to-video: accepts a source video clip (restyle/extend/deform). */
    vid2vid?: boolean;
    /** vid2vid source-media limitations (declared alongside the capability). */
    vid2vidLimits?: {
      /** Source clip length ceiling (seconds). */
      maxSeconds?: number;
      /** Source file size ceiling (MB). */
      maxMB?: number;
      /** Accepted containers, e.g. ['mp4', 'mov']. */
      formats?: string[];
    };
  };
  /** Obsolete (< 2.5) model: kept in the catalog so stored sessions still
   *  resolve, but hidden from every new-model picker in the UI. */
  obsolete?: boolean;
  /** Model accepts a `seed` parameter (reproducible runs). */
  supportsSeed?: boolean;
  /**
   * Wire param name the engine sends cValue under when it accepts a
   * guidance/creativity scale (E7, e.g. "guidance_scale"). Absent → the
   * value is logged only, never sent (dev-managed per model, verified in
   * the live-verification pass).
   */
  guidance?: string;
  /** Wire param name the engine sends qValue (inference steps) under.
   *  Same gating as guidance; absent → logged only. (Item 8, live-probed
   *  2026-11-19: Agnes img2img accepts num_inference_steps.) */
  steps?: string;
  /** Product-unit range for the guidance INVERSION at the wire chokepoint:
   *  wire = (min + max) − cValue. Product semantics: higher C = more
   *  dreaming; provider CFG semantics: higher guidance = stronger prompt
   *  adherence = less dreaming. Absent → cValue sent verbatim (a provider
   *  whose semantics already match the product). */
  guidanceRange?: [number, number];
  /** When true, guidance/steps ride ONLY img2img requests (a reference
   *  image is present); txt2img requests omit them — the Agnes text-image
   *  queue rejects both knobs there (live 400 probes 2026-11-19), while
   *  the img2img queue accepts them. */
  img2imgOnly?: boolean;
  /** Media-mode capabilities driving pipe-UI row visibility. */
  media?: ModelMedia;
  // ── Expanded provider system (2026-11-21) ──
  /** Resolved auth scheme (attached by resolveSpecs from the preset; the
   *  wire mirror carries it so Rust can build headers + relax key gates). */
  auth?: AuthScheme;
  /** Tier-A video adapter: per-model payload template (requestFormat
   *  'video-adapter'). Merged with the preset adapter by resolveSpecs. */
  adapterPayload?: Record<string, unknown>;
  /** Per-model deltas over the preset adapter (Runway t2v vs i2v endpoint,
   *  Kling legacy vs new response paths, Replicate output object shape). */
  adapterOverrides?: Partial<VideoAdapterSpec>;
  /** Merged adapter attached by resolveSpecs (preset ⊕ overrides ⊕ payload). */
  adapter?: VideoAdapterSpec;
  /** Per-model MCP DEFAULTS/overrides (requestFormat 'mcp'). Transport + tool
   *  names come from the preset and are deep-merged by `mergeMcp`; the model
   *  may legally declare only `settingsDefaults`, so this is Partial, not a
   *  full McpSpec. Resolved specs carry the merged complete config. */
  mcp?: Partial<McpSpec>;
  /**
   * Model-specific wire prompt shaping, applied ONLY to the named model's
   * outbound request prompt (never to other models' request bytes).
   * 'plain-timed' = strip XML tags/descriptive colons, insert cumulative
   * [mm:ss - mm:ss] timecodes per segment and drop oral narration markers;
   * implemented in the Rust generation/mcp.rs prompt transformer. Absent =
   * the compiled prompt is sent verbatim (every other model's byte-identical
   * path).
   */
  promptStyle?: 'plain-timed';
  /** Text models: structured-output capability for the Director Node A call.
   *  json_schema (OpenAI/Agnes), json_object (most local servers),
   *  prompt-only (fallback instruction; the retry net still applies). */
  structuredOutput?: 'json_schema' | 'json_object' | 'prompt-only';
  /** Send chat_template_kwargs.enable_thinking (Agnes/vLLM only — OpenAI
   *  400s on unknown params). Absent/false = omitted. */
  thinkingToggle?: boolean;
  /** Video media input contract: 'url-only' routes reject local-only media
   *  with a concrete precheck error instead of a burned render; 'upload'
   *  routes (local engines) multipart-POST local media to the engine. */
  mediaInput?: 'url-or-data' | 'url-only' | 'upload';
  /** Static pricing data (researched, date-stamped; absent = unknown). */
  pricing?: PriceSpec;
}

/** One vendor template: auth scheme + default URL + its model catalog. */
export interface PresetSpec {
  id: PresetId;
  label: string;
  kinds: ProviderKind[];
  auth: AuthScheme;
  /** Base-URL convention (absent = 'v1-native'). 'host-root' strips a pasted
   *  /v1 suffix in normalizeBaseUrl (the Agnes convention, generalized). */
  urlStyle?: UrlStyle;
  defaultBaseUrl: string;
  models: ModelSpec[];
  /** User-typed model ids (custom / local / aggregator presets): the picker
   *  becomes a free-text input + datalist (UI lands with the settings pass);
   *  migrateStoredModel keeps typed ids as-is. */
  freeFormModel?: boolean;
  /** Kind-aware real ping path (P7); absent = GET the base URL (today). */
  pingPath?: Partial<Record<ProviderKind, string>>;
  /** Dynamic model listing (Ollama /api/tags, OpenAI-shape /v1/models —
   *  OpenRouter's listing carries per-token pricing). */
  modelList?: { endpoint: string; shape: 'openai' | 'ollama' };
  /** Non-OpenAI local transport marker: 'mcp' = stateless JSON-RPC tool
   *  transport (implemented for Wan2GP in generation/mcp.rs, requestFormat
   *  'mcp'); 'special' = vendor-specific local APIs (ComfyUI-class, reserved
   *  Tier-B). 'openai-compat' = normal OpenAI-shaped local server. */
  customTransport?: 'openai-compat' | 'mcp' | 'special';
  /** Vendor-level Tier-A video adapter defaults (transport + response). */
  adapter?: VideoAdapterSpec;
  /** Vendor-level MCP transport defaults (requestFormat 'mcp'). Mirrors the
   *  adapter pattern: transport config on the preset, resolved onto the wire
   *  spec by resolveSpecs; no per-model payload template needed. */
  mcp?: McpSpec;
  /** UI grouping + honest-expectations hint (a local 7B ≠ a cloud engine). */
  tag?: 'cloud' | 'local';
}

/** A configured provider slot (one per kind, per user profile). */
export interface ProviderSlot {
  /** PresetSpec.id */
  preset: string;
  baseUrl: string;
  /** Local-only. Never appears in logs, error strings, or UI text. */
  apiKey: string;
  /** ModelSpec.id */
  model: string;
  /** ModelSpec.id the owner live-verified on this machine: lifts the
   *  catalog `pending` gate for that model (selectable + prechecks pass).
   *  Absent = every reserved model stays blocked (E1). */
  verified?: string[];
}

export interface GenerationDefaults {
  fps: number;
  resolution: string;
  orientation: string;
  /** Inference steps (quality) */
  qValue: number;
  /** CFG / guidance scale (creativity) */
  cValue: number;
  /** Ships 'sequential' (MAX_CONCURRENT = 1); 'parallel' opts in later. */
  concurrency: 'sequential' | 'parallel';
  /** When true, each run auto-rolls a fresh seed; the seed field then holds
   *  the last used value but is regenerated on each open. Default true. */
  alwaysNewSeed: boolean;
  /**
   * Units for the `length="…"` attribute on compiled `<segments>` blocks.
   * 'frames' → `121f` (frame-exact, default); 'seconds' → `5s` (human
   * time hint, fps-converted in the engine). Heuristic for the descriptor
   * inner lines reads this setting at compile time.
   */
  segmentLengthUnit: 'frames' | 'seconds';
}

export interface Settings {
  profile: {
    displayName: string;
    theme: string;
    layout: string;
  };
  generationDefaults: GenerationDefaults;
  providers: Record<ProviderKind, ProviderSlot>;
  /** Local tooling (Phase: ffmpeg locator). Never in logs (P6). */
  tools: ToolsBlock;
  /** Top-panel carousel treatment (profile-preset bound). */
  carousel: CarouselBlock;
  /** Experimental / opt-in feature gates. */
  experimental: ExperimentalBlock;
}

/** Local tooling overrides. `ffmpegPath` is the tiny-variant escape hatch:
 *  when set, the backend probes it (with `-version` only) ahead of the
 *  system $PATH. Absent/empty = not used. */
export interface ToolsBlock {
  ffmpegPath: string;
}

/**
 * Top-panel frame-carousel block. Persisted under the PROFILE PRESET: the
 * carousel's [i] toggle and [>]/[>>] auto-scroll radios mirror these values
 * (and Settings → Tools edits the same copy), so the profile preset is the
 * single source of truth — switching profiles switches the carousel
 * treatment with it.
 */
export type AutoScrollMode = 'off' | 'steady' | 'fast';

export interface CarouselBlock {
  /**
   * "Immersive Snaps": the receding-front dissolve treatment (media reveal +
   * accent wave). Off = plain strip, no dissolve effect.
   */
  immersiveSnaps: boolean;
  /**
   * Automatic frame scrolling: 'steady' = consistent slow pace; 'fast' =
   * fast snaps between stops with a 0.8s idle at each snap.
   */
  autoScroll: AutoScrollMode;
}

/**
 * Experimental / opt-in features, off by default. Each master gate controls
 * whether the corresponding per-pipe / per-run toggles are even offered in the
 * UI — when the gate is OFF the classic behavior runs and the toggles are
 * hidden, so the feature is a deliberate opt-in, not a silent default.
 */
export interface ExperimentalBlock {
  /**
   * "Experimental compose pipes": when ON, the session-video Compose button
   * and the session-generation auto-compose may drop one 8n+1 keyframe
   * interval (the model's first-frame settle) off each INTERIOR pipe's clip
   * head, so the splice lands in stable content instead of a visible cut.
   * OFF (default) = the classic lossless back-to-back splice (no frames
   * dropped). Pipe 0 is never trimmed either way (nothing precedes it).
   */
  composePipes: boolean;
}

// ── Generation log (portable: NO keys, NO raw local paths — P5) ────────────

export type LogPieceKind = 'keyframe' | 'subject' | 'video';
// 'pending' = piece not started yet; 'running' = task in flight. Entries are
// written at task start (status 'running', pieces 'pending') and upserted at
// terminal (done / error / cancelled).
export type LogStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface GenerationLogPiece {
  kind: LogPieceKind;
  refId: string;
  /** PresetSpec.id actually used for this piece */
  provider: string;
  /** ModelSpec.id actually used (global setting or last-step override) */
  model: string;
  status: LogStatus;
  /** Artifact ref (internal) → rendered as a URL via toMediaUrl. Never a raw path. */
  outputRef?: string;
  /** Snapshot of the params that produced this piece. `seed` present when
   *  a concrete value was sent (reproducible re-gen; P4). */
  params: { fps: number; resolution: string; q: number; c: number; seed?: number };
  /** Per-run cost snapshot (expanded provider system): provider-reported
   *  units/credits, compute-time usage, static estimate. Portable (P5) —
   *  costs are not secrets. Absent on legacy entries / unknown pricing. */
  cost?: RunCostSnapshot;
  /** Sanitized — guaranteed key-free (redactLog). */
  error?: string;
}

export interface GenerationLogEntry {
  taskId: string;
  sessionId: string;
  pipeId: string;
  /** Session generation run that started this pipe, when not a manual run. */
  groupId?: string;
  startedAt: number;
  finishedAt?: number;
  status: LogStatus;
  pieces: GenerationLogPiece[];
}
