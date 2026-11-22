// Provider preset catalog (docs/settings-provider-tasks.md, Phase 0/6).
//
// PURE DATA. Agnes is the production vendor — its specs are researched from
// the official API docs + hermes session notes (docs/agnes-model-catalog.md)
// and stay BYTE-STABLE (expanded provider system, owner scope 2026-11-21:
// text/image stay on the current OpenAI-compatible route; video gains the
// configurable Tier-A adapter). New models fill in HERE as data. 'custom'
// stays the OpenAI-shape escape hatch (now free-form model ids).
//
// Expanded presets (ROADMAP v0.7.12 lead, plan
// .hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md):
// - TEXT (OpenAI route only): openai / openrouter / ollama / lmstudio /
//   llamacpp. Claude/Gemini ride OpenRouter's OpenAI-compatible route —
//   no native adapters (owner: don't fold uniques like Claude).
// - VIDEO (Tier-A adapter): runway / fal / replicate / luma / kling /
//   minimax. Contracts researched 2026-11-21 (official docs); every model
//   ships pending:true until the live-verification pass (Phase F protocol:
//   one real clip, record into docs/provider-catalogs/<vendor>.md, flip).
//   Sora EXCLUDED — OpenAI shut the Videos API down 2026-09-24.
// - LOCAL image/video (ComfyUI class) is a deferred slice; the adapter
//   schema reserves its shapes (keyless auth, upload media, content mode).

import type { ModelSpec, PresetId, PresetSpec, ProviderKind, VideoAdapterSpec } from '$types';

// Host-root base URL: creates carry the /v1 prefix in their endpoint path,
// polling lives at the host root (/agnesapi) — one base for everything
// (docs/agnes-model-catalog.md, URL composition option a).
const AGNES_BASE = 'https://apihub.agnes-ai.com';

export const AGNES_PRESET: PresetSpec = {
  id: 'agnes',
  label: 'Agnes',
  kinds: ['text', 'image', 'video'],
  auth: 'bearer',
  urlStyle: 'host-root',
  defaultBaseUrl: AGNES_BASE,
  models: [
    // TEXT — inert container (Q9): future prompt-summarizer engine.
    { id: 'agnes-2.5-flash', kind: 'text', label: 'Agnes 2.5 Flash (text)',
      endpoint: '/v1/chat/completions', sync: true, requestFormat: 'chat',
      limits: {}, supportsSeed: false,
      structuredOutput: 'json_schema', thinkingToggle: true },
    // IMAGE — 2.5-flash first = default (guards pick first non-pending).
    { id: 'agnes-image-2.5-flash', kind: 'image', label: 'Agnes Image 2.5 Flash',
      endpoint: '/v1/images/generations', sync: true, requestFormat: 'image-gen',
      limits: { resolutions: ['1K', '2K', '3K', '4K'],
                ratios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'],
                // Provisional tier mapping (Q2): session res → tier, orientation → ratio.
                sizeMap: { '480p': '1K', '720p': '1K', '1080p': '2K' },
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      // Item 8 (live-probed 2026-11-19, 22 requests): the Agnes TEXT-image
      // queue rejects guidance_scale/num_inference_steps (400 "not supported
      // by text image queue"), but the IMG2IMG queue ACCEPTS both —
      // guidance_scale verified at 0/0.5/15/20/30, steps at 18. So the knobs
      // are real wires on reference-based keyframes, gated img2img-only.
      // guidanceRange [0.5,15] = the product C range; the shaper INVERTS at
      // the wire (product higher C = more dreaming → lower CFG guidance).
      // Video routes (flash + paid, text + keyframe) reject every name tried
      // (guidance_scale/guidance/creativity/cfg/cfg_scale/steps/quality).
      guidance: 'guidance_scale',
      steps: 'num_inference_steps',
      guidanceRange: [0.5, 15],
      img2imgOnly: true,
      supportsSeed: false },
    { id: 'agnes-image-2.1-flash', kind: 'image', label: 'Agnes Image 2.1 Flash',
      endpoint: '/v1/images/generations', sync: true, requestFormat: 'image-gen',
      limits: { resolutions: ['1K', '2K', '3K', '4K'],
                ratios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'],
                sizeMap: { '480p': '1K', '720p': '1K', '1080p': '2K' },
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      supportsSeed: false,
      obsolete: true },
    // VIDEO — 2.5-flash first = default (free tier, 720P only, seconds 4–12).
    { id: 'agnes-video-2.5-flash', kind: 'video', label: 'Agnes Video 2.5 Flash (free)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-seconds',
      limits: { seconds: [4, 12], resolutions: ['720P'],
                ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
                // 720P is the ONLY valid size for 2.5-flash (anything else → 400);
                // every session resolution maps to it.
                sizeMap: { '480p': '720P', '720p': '720P', '1080p': '720P' },
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      // LIVE REJECT (2026-11-06): the video route 400s on
      // "guidance_scale is not an allowed request field" — the param is
      // image-route only; video stays guidance-less (server defaults).
      supportsSeed: true,
      media: { modes: ['keyframes', 'reference'],
               maxKeyframes: 2, maxRefs: 5, maxAudios: 3 } },
    // Legacy V2.0 video model REMOVED (P1-7, 2026-11-11): the provider
    // retired agnes-video-v2.0 (2026-09-25) and the catalog now ships the
    // 2.5-series as the only video engine. Saved settings that still name
    // the model id self-heal on load: normalizeSettings migrates any model
    // id missing from the catalog to the preset's default generable model
    // (agnes-video-2.5-flash), so the removal is transparent to users.
    // 2.5 PAID — READ-ONLY entry (Q3): inspect in Settings, never generable.
    // Dual media mode (first/last_frame + images/audios/videos) is the
    // future extension point (Q7).
    { id: 'agnes-video-2.5', kind: 'video', label: 'Agnes Video 2.5 (paid · read-only)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-seconds',
      limits: { seconds: [4, 12],
                resolutions: ['720P', '1080P', '1K', '2K'],
                ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
                sizeMap: { '480p': '720P', '720p': '720P', '1080p': '1080P' },
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      supportsSeed: true, readOnly: true,
      media: { modes: ['keyframes', 'reference'], dual: true,
               maxKeyframes: 2, maxRefs: 8, maxAudios: 3, maxVideos: 1 } },
  ],
};

export const CUSTOM_PRESET: PresetSpec = {
  id: 'custom',
  label: 'Custom (OpenAI-compatible)',
  kinds: ['text', 'image', 'video'],
  auth: 'bearer',
  urlStyle: 'v1-native',
  defaultBaseUrl: 'https://api.openai.com/v1',
  // Free-form model ids: the placeholder ids below are sent literally on the
  // wire, so a real server needs the user's actual model name. The free-text
  // picker UI lands with the settings pass; until then the catalog ids keep
  // the skeleton honest (and migrateStoredModel no longer "heals" typed ids).
  freeFormModel: true,
  models: [
    {
      id: 'custom-text',
      kind: 'text',
      label: 'Custom chat model',
      endpoint: '/chat/completions',
      sync: true,
      requestFormat: 'chat',
      limits: {},
      structuredOutput: 'json_schema',
    },
    {
      id: 'custom-image',
      kind: 'image',
      label: 'Custom image model',
      endpoint: '/images/generations',
      sync: true,
      requestFormat: 'image-gen',
      limits: {},
    },
    {
      id: 'custom-video',
      kind: 'video',
      label: 'Custom video model (async job)',
      endpoint: '/videos',
      sync: false,
      pollEndpoint: '/videos/{jobId}',
      requestFormat: 'video-job',
      limits: {},
      pending: true,
    },
  ],
};

// ── TEXT presets — OpenAI-compatible route only (owner scope S1) ───────────

export const OPENAI_PRESET: PresetSpec = {
  id: 'openai',
  label: 'OpenAI',
  kinds: ['text'],
  auth: 'bearer',
  urlStyle: 'v1-native',
  defaultBaseUrl: 'https://api.openai.com/v1',
  freeFormModel: true,
  pingPath: { text: '/models' },
  modelList: { endpoint: '/models', shape: 'openai' },
  tag: 'cloud',
  models: [
    // Model names live-verify at the P1 smoke; free-form ids make the exact
    // catalog entries non-load-bearing. NO chat_template_kwargs (OpenAI 400s
    // on unknown params) — thinkingToggle stays unset.
    { id: 'gpt-4.1', kind: 'text', label: 'GPT-4.1',
      endpoint: '/chat/completions', sync: true, requestFormat: 'chat',
      limits: {}, structuredOutput: 'json_schema',
      pricing: { unit: 'per-token', currency: 'USD', source: 'https://openai.com/api/pricing/',
                 verifiedAt: null, note: 'rates pending research — estimate reports unknown' } },
    { id: 'gpt-4.1-mini', kind: 'text', label: 'GPT-4.1 mini',
      endpoint: '/chat/completions', sync: true, requestFormat: 'chat',
      limits: {}, structuredOutput: 'json_schema',
      pricing: { unit: 'per-token', currency: 'USD', source: 'https://openai.com/api/pricing/',
                 verifiedAt: null, note: 'rates pending research' } },
  ],
};

export const OPENROUTER_PRESET: PresetSpec = {
  id: 'openrouter',
  label: 'OpenRouter (universal aggregator)',
  kinds: ['text'],
  auth: 'bearer',
  urlStyle: 'v1-native',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  freeFormModel: true,
  pingPath: { text: '/models' },
  // The listing carries per-token pricing (prompt/completion/image/request)
  // — the live pricing-retrieval surface (list_provider_models endpoint).
  modelList: { endpoint: '/models', shape: 'openai' },
  tag: 'cloud',
  models: [
    // One key → Claude / Gemini / Llama / … via the OpenAI route. Type any
    // vendor/model id (free-form); 'openrouter/auto' is the router default.
    { id: 'openrouter/auto', kind: 'text', label: 'Auto (router picks)',
      endpoint: '/chat/completions', sync: true, requestFormat: 'chat',
      limits: {}, structuredOutput: 'json_schema',
      pricing: { unit: 'per-token', currency: 'USD', source: 'https://openrouter.ai/api/v1/models',
                 verifiedAt: null, note: 'LIVE retrieval via modelList — per-model pricing in the listing' } },
  ],
};

// Local OpenAI-compatible servers — KEYLESS (auth 'none'). Text only:
// Ollama/LM Studio/llama.cpp do not run diffusion image/video engines; the
// local image+video path is the deferred ComfyUI slice. The placeholder
// model entry is pending (the closed picker can't send a garbage id); the
// free-text + refresh-list UI lands with the settings pass. Director Node A
// rides the json_object capability + the existing prompt-only fallback retry.
const LOCAL_TEXT_MODEL = (endpoint: string): ModelSpec => ({
  id: 'local-model', kind: 'text', label: 'Local model (type the id / refresh list)',
  endpoint, sync: true, requestFormat: 'chat', limits: {},
  pending: true, structuredOutput: 'json_object',
  pricing: { unit: 'free-local', currency: 'USD', rates: { base: 0 },
             verifiedAt: '2026-11-21', note: '$0 marginal — own hardware; compute time metered separately' },
});

// Generic local endpoint — matches ANY local OpenAI-compatible server: the
// user types the base URL (include /v1 if the server routes it there, e.g.
// http://localhost:8080/v1; Ollama's host-root base keeps /v1 in the URL) and
// the model id. Keyless, free-form ids, optional /v1/models refresh. This is
// the "random local model" surface — a new server is a base URL + an id, no
// catalog entry. customTransport: 'mcp' | 'special' = reserved Tier-B marker
// for non-OpenAI local protocols (MCP servers, vendor-specific APIs); the
// config slot lands now, the code shaper with the ComfyUI-class slice.
export const LOCAL_CUSTOM_PRESET: PresetSpec = {
  id: 'local-custom',
  label: 'Local endpoint (any OpenAI-compatible)',
  kinds: ['text'],
  auth: 'none',
  urlStyle: 'v1-native',
  defaultBaseUrl: '',
  freeFormModel: true,
  modelList: { endpoint: '/v1/models', shape: 'openai' },
  tag: 'local',
  customTransport: 'openai-compat',
  models: [LOCAL_TEXT_MODEL('/chat/completions')],
};

export const OLLAMA_PRESET: PresetSpec = {
  id: 'ollama',
  label: 'Ollama (local)',
  kinds: ['text'],
  auth: 'none',
  // Host-root base: the OpenAI-compat surface lives under /v1, the native
  // model listing at /api/tags — one base, endpoints carry their prefixes.
  urlStyle: 'host-root',
  defaultBaseUrl: 'http://localhost:11434',
  freeFormModel: true,
  pingPath: { text: '/api/tags' },
  modelList: { endpoint: '/api/tags', shape: 'ollama' },
  tag: 'local',
  models: [LOCAL_TEXT_MODEL('/v1/chat/completions')],
};

export const LMSTUDIO_PRESET: PresetSpec = {
  id: 'lmstudio',
  label: 'LM Studio (local)',
  kinds: ['text'],
  auth: 'none',
  urlStyle: 'v1-native',
  defaultBaseUrl: 'http://localhost:1234/v1',
  freeFormModel: true,
  pingPath: { text: '/models' },
  modelList: { endpoint: '/models', shape: 'openai' },
  tag: 'local',
  models: [LOCAL_TEXT_MODEL('/chat/completions')],
};

export const LLAMACPP_PRESET: PresetSpec = {
  id: 'llamacpp',
  label: 'llama.cpp server (local)',
  kinds: ['text'],
  auth: 'none',
  urlStyle: 'v1-native',
  defaultBaseUrl: 'http://localhost:8080/v1',
  freeFormModel: true,
  pingPath: { text: '/models' },
  modelList: { endpoint: '/models', shape: 'openai' },
  tag: 'local',
  models: [LOCAL_TEXT_MODEL('/chat/completions')],
};

// ── VIDEO presets — Tier-A configurable adapter (owner scope S2) ───────────
// Contracts researched 2026-11-21 against official docs (sources in each
// comment). ALL models pending:true until live-verified with the owner's
// keys — no mocks ship (D1). Vendor transport+response on the preset;
// per-model payload template + deltas on the model.

const RUNWAY_ADAPTER: VideoAdapterSpec = {
  // docs.dev.runwayml.com: X-Runway-Version REQUIRED on every request;
  // async tasks; THROTTLED = queued behind rate limit (NOT an error);
  // progress is a 0-1 float; output URLs expire 24-48h (download promptly).
  headers: { 'X-Runway-Version': '2024-11-06' },
  create: { endpoint: '/v1/image_to_video' },
  poll: { endpoint: '/v1/tasks/{jobId}', intervalSecs: 10 },
  cancel: { endpoint: '/v1/tasks/{jobId}', method: 'DELETE' },
  payload: {}, // per-model template required (adapterPayload)
  response: {
    jobIdPath: 'id',
    statusPath: 'status',
    statusMap: {
      PENDING: 'pending', THROTTLED: 'throttled', RUNNING: 'running',
      SUCCEEDED: 'succeeded', FAILED: 'failed', CANCELLED: 'cancelled',
    },
    progressPath: 'progress',
    progressScale: 1,
    artifact: { mode: 'url', path: 'output' }, // array of URLs → first
    errorPath: 'failure',
    reportedCost: { path: 'cost.credits', unit: 'credits' },
  },
  media: { input: 'url-or-data' }, // promptImage accepts HTTPS or data URI
};

export const RUNWAY_PRESET: PresetSpec = {
  id: 'runway',
  label: 'Runway',
  kinds: ['video'],
  auth: 'bearer',
  urlStyle: 'host-root',
  defaultBaseUrl: 'https://api.dev.runwayml.com',
  tag: 'cloud',
  adapter: RUNWAY_ADAPTER,
  models: [
    { id: 'gen4.5', kind: 'video', label: 'Gen-4.5 (image-to-video)',
      endpoint: '/v1/image_to_video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [2, 10],
                ratios: ['1280:720', '720:1280', '960:960', '1104:832', '832:1104', '1584:672'],
                ratioMap: { horizontal: '1280:720', vertical: '720:1280', square: '960:960' } },
      supportsSeed: true, pending: true,
      media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: {
        model: '{{model}}', promptText: '{{prompt}}',
        promptImage: '{{media:first}}', ratio: '{{ratio}}',
        duration: '{{seconds:int}}', seed: '{{seed}}',
      },
      pricing: { unit: 'per-credit', currency: 'credits', source: 'https://docs.dev.runwayml.com/guides/pricing',
                 rates: { usdPerCredit: 0.01 }, verifiedAt: '2026-11-21',
                 note: 'provider reports cost.credits per task (estimatedCost.credits on create); 1 credit = $0.01 (min $10 top-up); per-second credit rate for gen4.5 pending research' } },
    { id: 'gen4.5-t2v', kind: 'video', label: 'Gen-4.5 (text-to-video)',
      endpoint: '/v1/text_to_video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [2, 10],
                ratios: ['1280:720', '720:1280', '960:960', '1104:832', '832:1104', '1584:672'],
                ratioMap: { horizontal: '1280:720', vertical: '720:1280', square: '960:960' } },
      supportsSeed: true, pending: true,
      adapterOverrides: { create: { endpoint: '/v1/text_to_video' } },
      adapterPayload: {
        model: 'gen4.5', promptText: '{{prompt}}', ratio: '{{ratio}}',
        duration: '{{seconds:int}}', seed: '{{seed}}',
      },
      pricing: { unit: 'per-credit', currency: 'credits', source: 'https://docs.dev.runwayml.com/guides/pricing',
                 rates: { usdPerCredit: 0.01 }, verifiedAt: '2026-11-21',
                 note: 'provider reports cost.credits per task; 1 credit = $0.01' } },
    { id: 'seedance2_5', kind: 'video', label: 'Seedance 2.5 (Runway-hosted)',
      endpoint: '/v1/image_to_video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [2, 10],
                ratios: ['1280:720', '720:1280', '960:960'],
                ratioMap: { horizontal: '1280:720', vertical: '720:1280', square: '960:960' } },
      supportsSeed: true, pending: true,
      media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: {
        model: '{{model}}', promptText: '{{prompt}}',
        promptImage: '{{media:first}}', ratio: '{{ratio}}',
        duration: '{{seconds:int}}', seed: '{{seed}}',
      },
      pricing: { unit: 'per-credit', currency: 'credits', source: 'https://docs.dev.runwayml.com/guides/pricing',
                 rates: { usdPerCredit: 0.01 }, verifiedAt: '2026-11-21',
                 note: 'provider reports cost.credits per task; 1 credit = $0.01' } },
    { id: 'hailuo3', kind: 'video', label: 'Hailuo 3 (H3, Runway-hosted)',
      endpoint: '/v1/image_to_video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [2, 10],
                ratios: ['1280:720', '720:1280', '960:960'],
                ratioMap: { horizontal: '1280:720', vertical: '720:1280', square: '960:960' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: {
        model: 'hailuo3', promptText: '{{prompt}}',
        promptImage: '{{media:first}}', ratio: '{{ratio}}',
        duration: '{{seconds:int}}',
      },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://docs.dev.runwayml.com/guides/pricing',
                 rates: { '720p': 0.10, '1080p': 0.15, base: 0.10 }, verifiedAt: '2026-11-21',
                 note: '10/15 cr-s at 768P/2K × $0.01/credit; ref image/keyframe +2 credits; in-band cost.credits is authoritative' } },
    { id: 'h3_max', kind: 'video', label: 'H3 Max (Runway-hosted)',
      endpoint: '/v1/image_to_video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [2, 10],
                ratios: ['1280:720', '720:1280', '960:960'],
                ratioMap: { horizontal: '1280:720', vertical: '720:1280', square: '960:960' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: {
        model: 'h3_max', promptText: '{{prompt}}',
        promptImage: '{{media:first}}', ratio: '{{ratio}}',
        duration: '{{seconds:int}}',
      },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://docs.dev.runwayml.com/guides/pricing',
                 rates: { '480p': 0.05, '720p': 0.08, base: 0.08 }, verifiedAt: '2026-11-21',
                 note: '5/8 cr-s at 480p/768p × $0.01/credit; in-band cost.credits is authoritative' } },
  ],
};

const FAL_ADAPTER: VideoAdapterSpec = {
  // fal.ai queue API: Authorization: Key <k> (NOT Bearer); model id in the
  // path; HTTP 202 while queued; COMPLETED INCLUDES FAILED/CANCELLED jobs —
  // the resultEndpoint fetch decides success (errorPath) and carries the
  // artifact. queue_position drives the live "queue position N" line.
  create: { endpoint: '/{model}' },
  poll: {
    endpoint: '/{model}/requests/{jobId}/status',
    resultEndpoint: '/{model}/requests/{jobId}',
    intervalSecs: 10,
  },
  cancel: { endpoint: '/{model}/requests/{jobId}/cancel', method: 'PUT' },
  payload: {},
  response: {
    jobIdPath: 'request_id',
    statusPath: 'status',
    statusMap: { IN_QUEUE: 'pending', IN_PROGRESS: 'running', COMPLETED: 'succeeded' },
    queuePositionPath: 'queue_position',
    artifact: { mode: 'url', path: 'video.url' }, // per-model output schema — override where needed
    errorPath: 'detail',
    predictTimePath: 'metrics.inference_time',
  },
  media: { input: 'url-or-data' },
};

export const FAL_PRESET: PresetSpec = {
  id: 'fal',
  label: 'fal.ai (queue aggregator)',
  kinds: ['video'],
  auth: 'key-header',
  urlStyle: 'host-root',
  defaultBaseUrl: 'https://queue.fal.run',
  tag: 'cloud',
  adapter: FAL_ADAPTER,
  models: [
    // Model ids + input schemas live-verify (fal.ai/models/<id> API tab).
    // One adapter unlocks the aggregator catalog as DATA.
    { id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', kind: 'video',
      label: 'Kling 2.5 Turbo Pro (i2v, via fal)',
      endpoint: '/fal-ai/kling-video/v2.5-turbo/pro/image-to-video', sync: false,
      requestFormat: 'video-adapter',
      limits: { seconds: [5, 10], secondsEnum: [5, 10],
                ratios: ['16:9', '9:16', '1:1'],
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: {
        prompt: '{{prompt}}', image_url: '{{media:first}}',
        duration: '{{seconds:enumstr}}', aspect_ratio: '{{ratio}}',
      },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
                 verifiedAt: null, note: 'rates pending research; inference_time metered in-band' } },
    { id: 'fal-ai/wan/v2.2-5b/image-to-video', kind: 'video',
      label: 'Wan 2.2 5B (i2v, via fal)',
      endpoint: '/fal-ai/wan/v2.2-5b/image-to-video', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: { prompt: '{{prompt}}', image_url: '{{media:first}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://fal.ai/models',
                 verifiedAt: null, note: 'id + schema + rates live-verify' } },
    { id: 'fal-ai/veo3.1/fast/image-to-video', kind: 'video',
      label: 'Veo 3.1 Fast (i2v, via fal)',
      endpoint: '/fal-ai/veo3.1/fast/image-to-video', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: { prompt: '{{prompt}}', image_url: '{{media:first}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://fal.ai/models',
                 verifiedAt: null, note: 'id + schema + rates live-verify' } },
    // fal hosts MiniMax H3 Max (fal.ai/pricing 2026-11-21: $0.05/s; turbo $0.025/s).
    // Live per-model schema + price: fal.ai/models/<id>/llms.txt (no auth) or the
    // authenticated /v1/models/pricing API. Draft payloads — input schemas
    // live-verify per model. Duration/resolution caps are deliberately
    // UNVERIFIED: limits stay {} — no speculative caps. The guard cannot
    // snap these rows until the live check encodes the real limits; a session
    // length beyond the vendor cap is a vendor-side reject, documented in
    // docs/provider-system.md §7 (G1).
    { id: 'minimax/h3-max/text-to-video', kind: 'video', label: 'H3 Max (t2v, via fal)',
      endpoint: '/minimax/h3-max/text-to-video', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true,
      adapterPayload: { prompt: '{{prompt}}', duration: '{{seconds:int}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://fal.ai/pricing',
                 rates: { base: 0.05 }, verifiedAt: '2026-11-21',
                 note: 'live check: GET /v1/models/pricing?endpoint_id=minimax/h3-max/text-to-video' } },
    { id: 'minimax/h3-max/image-to-video', kind: 'video', label: 'H3 Max (i2v, via fal)',
      endpoint: '/minimax/h3-max/image-to-video', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: { prompt: '{{prompt}}', image_url: '{{media:first}}', duration: '{{seconds:int}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://fal.ai/pricing',
                 rates: { base: 0.05 }, verifiedAt: '2026-11-21',
                 note: 'live check: GET /v1/models/pricing?endpoint_id=minimax/h3-max/image-to-video' } },
    { id: 'minimax/h3-max-turbo/image-to-video', kind: 'video', label: 'H3 Max Turbo (i2v, via fal)',
      endpoint: '/minimax/h3-max-turbo/image-to-video', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: { prompt: '{{prompt}}', image_url: '{{media:first}}', duration: '{{seconds:int}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://fal.ai/pricing',
                 rates: { base: 0.025 }, verifiedAt: '2026-11-21',
                 note: 'live check: GET /v1/models/pricing?endpoint_id=minimax/h3-max-turbo/image-to-video' } },
  ],
};

const REPLICATE_ADAPTER: VideoAdapterSpec = {
  // replicate.com/docs/reference/http: Bearer; official models create at
  // /v1/models/{owner}/{name}/predictions with the per-model `input` object;
  // poll /v1/predictions/{id}; output files are auth-gated URLs (the
  // engine's plain-first/bearer-fallback download covers them); input/output
  // data removed after ~1h — download promptly.
  create: { endpoint: '/v1/models/{model}/predictions' },
  poll: { endpoint: '/v1/predictions/{jobId}', intervalSecs: 10 },
  cancel: { endpoint: '/v1/predictions/{jobId}/cancel', method: 'POST' },
  payload: {},
  response: {
    jobIdPath: 'id',
    statusPath: 'status',
    statusMap: {
      starting: 'pending', processing: 'running', succeeded: 'succeeded',
      failed: 'failed', canceled: 'cancelled',
    },
    artifact: { mode: 'url', path: 'output' }, // string | array | object — per-model override
    errorPath: 'error',
    predictTimePath: 'metrics.predict_time',
  },
  media: { input: 'url-or-data' }, // HTTP URL or data URL (≤256kb recommended)
};

export const REPLICATE_PRESET: PresetSpec = {
  id: 'replicate',
  label: 'Replicate (aggregator)',
  kinds: ['video'],
  auth: 'bearer',
  urlStyle: 'host-root',
  defaultBaseUrl: 'https://api.replicate.com',
  tag: 'cloud',
  adapter: REPLICATE_ADAPTER,
  models: [
    { id: 'minimax/video-01', kind: 'video', label: 'MiniMax Video-01 (via Replicate)',
      endpoint: '/v1/models/minimax/video-01/predictions', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true,
      // Minimal input — the full schema (duration/resolution/first frame)
      // live-verifies against the model's API tab before flipping pending.
      adapterPayload: { input: { prompt: '{{prompt}}' } },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://replicate.com/minimax/video-01',
                 verifiedAt: null, note: 'predict_time metered in-band; hardware rate pending research' } },
    { id: 'wan-video/wan-2.2-i2v-a14b', kind: 'video', label: 'Wan 2.2 I2V A14B (via Replicate)',
      endpoint: '/v1/models/wan-video/wan-2.2-i2v-a14b/predictions', sync: false,
      requestFormat: 'video-adapter',
      limits: {}, pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: { input: { prompt: '{{prompt}}', image: '{{media:first}}' } },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://replicate.com/wan-video',
                 verifiedAt: null, note: 'id + schema + rates live-verify' } },
  ],
};

const LUMA_ADAPTER: VideoAdapterSpec = {
  // docs.lumalabs.ai (openapi 1.1.0): Bearer; POST /generations/video → 201
  // {id, state}; poll GET /generations/{id}; state queued/dreaming/completed/
  // failed; artifact assets.video; failure_reason on failed. Keyframes are
  // {type:'image', url} objects — the token pruning rule drops the whole
  // keyframes object on a text-only run.
  create: { endpoint: '/generations/video' },
  poll: { endpoint: '/generations/{jobId}', intervalSecs: 5 },
  payload: {},
  response: {
    jobIdPath: 'id',
    statusPath: 'state',
    statusMap: { queued: 'pending', dreaming: 'running', completed: 'succeeded', failed: 'failed' },
    artifact: { mode: 'url', path: 'assets.video' },
    errorPath: 'failure_reason',
  },
  media: { input: 'url-or-data' },
};

export const LUMA_PRESET: PresetSpec = {
  id: 'luma',
  label: 'Luma Dream Machine',
  kinds: ['video'],
  auth: 'bearer',
  urlStyle: 'v1-native',
  defaultBaseUrl: 'https://api.lumalabs.ai/dream-machine/v1',
  tag: 'cloud',
  adapter: LUMA_ADAPTER,
  models: [
    { id: 'ray-2', kind: 'video', label: 'Ray 2',
      endpoint: '/generations/video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [5, 9], secondsEnum: [5, 9],
                ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' },
                resolutions: ['720p', '1080p'],
                sizeMap: { '480p': '720p', '720p': '720p', '1080p': '1080p' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 2 },
      adapterPayload: {
        model: '{{model}}', prompt: '{{prompt}}', aspect_ratio: '{{ratio}}',
        resolution: '{{size}}', duration: '{{seconds:enum}}s',
        keyframes: {
          frame0: { type: 'image', url: '{{media:first}}' },
          frame1: { type: 'image', url: '{{media:last}}' },
        },
      },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://lumalabs.ai/dream-machine/api/pricing',
                 verifiedAt: null, note: 'rates pending research; no in-band cost field' } },
  ],
};

const KLING_ADAPTER: VideoAdapterSpec = {
  // kling.ai/document-api (researched 2026-11-21): the NEW standard is a
  // plain Bearer API key (console-issued); legacy AK/SK JWT is hard-rejected
  // on new endpoints (code 1002) — JWT stays a deferred Tier-B unique.
  // Legacy /v1/videos/{kind} family works through v3-omni; envelope
  // {code,message,data}; task_status 'succeed' (legacy) vs 'succeeded'
  // (new /tasks) — map BOTH. final_unit_deduction = provider-reported units.
  create: { endpoint: '/v1/videos/image2video' },
  poll: { endpoint: '/v1/videos/image2video/{jobId}', intervalSecs: 10 },
  payload: {},
  response: {
    jobIdPath: 'data.task_id',
    statusPath: 'data.task_status',
    statusMap: {
      submitted: 'pending', processing: 'running',
      succeed: 'succeeded', succeeded: 'succeeded', failed: 'failed',
    },
    artifact: { mode: 'url', path: 'data.task_result.videos' }, // [{url}] → first
    errorPath: 'data.task_status_msg',
    envelope: { codePath: 'code', okValue: 0, messagePath: 'message' },
    reportedCost: { path: 'data.final_unit_deduction', unit: 'units' },
  },
  media: { input: 'url-or-data' }, // image accepts base64 or public URL
};

export const KLING_PRESET: PresetSpec = {
  id: 'kling',
  label: 'Kling AI',
  kinds: ['video'],
  auth: 'bearer',
  urlStyle: 'host-root',
  defaultBaseUrl: 'https://api-singapore.klingai.com',
  tag: 'cloud',
  adapter: KLING_ADAPTER,
  models: [
    { id: 'kling-v2-6', kind: 'video', label: 'Kling v2.6 (image-to-video)',
      endpoint: '/v1/videos/image2video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [5, 10], secondsEnum: [5, 10],
                ratios: ['16:9', '9:16', '1:1'],
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 2 },
      adapterPayload: {
        model_name: '{{model}}', prompt: '{{prompt}}',
        duration: '{{seconds:enumstr}}', mode: 'pro', aspect_ratio: '{{ratio}}',
        image: '{{media:first}}', image_tail: '{{media:last}}',
      },
      pricing: { unit: 'per-unit', currency: 'units', source: 'https://kling.ai/dev/pricing',
                 rates: { usdPerUnit: 0.14 }, verifiedAt: '2026-11-21',
                 note: 'provider reports final_unit_deduction; video 1 Unit = $0.14 LIST (pack discounts account-specific, unverified)' } },
    { id: 'kling-v2-6-t2v', kind: 'video', label: 'Kling v2.6 (text-to-video)',
      endpoint: '/v1/videos/text2video', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [5, 10], secondsEnum: [5, 10],
                ratios: ['16:9', '9:16', '1:1'],
                ratioMap: { horizontal: '16:9', vertical: '9:16', square: '1:1' } },
      pending: true,
      adapterOverrides: {
        create: { endpoint: '/v1/videos/text2video' },
        poll: { endpoint: '/v1/videos/text2video/{jobId}' },
      },
      adapterPayload: {
        model_name: 'kling-v2-6', prompt: '{{prompt}}',
        duration: '{{seconds:enumstr}}', mode: 'pro', aspect_ratio: '{{ratio}}',
      },
      pricing: { unit: 'per-unit', currency: 'units', source: 'https://kling.ai/dev/pricing',
                 rates: { usdPerUnit: 0.14 }, verifiedAt: '2026-11-21',
                 note: 'provider reports final_unit_deduction; video 1 Unit = $0.14 LIST' } },
  ],
};

const MINIMAX_ADAPTER: VideoAdapterSpec = {
  // platform.minimax.io: Bearer; POST /v1/video_generation → {task_id,
  // base_resp}; poll GET /v1/query/video_generation?task_id= → status
  // Preparing/Queueing/Processing/Success/Fail + file_id (STRING here,
  // INTEGER at retrieve — the engine casts); artifact via the RETRIEVE step
  // GET /v1/files/retrieve?file_id= → file.download_url (1h expiry).
  // base_resp.status_code != 0 = business error (1008 balance, 1002 RPM).
  create: { endpoint: '/v1/video_generation' },
  poll: { endpoint: '/v1/query/video_generation?task_id={jobId}', intervalSecs: 10 },
  payload: {},
  response: {
    jobIdPath: 'task_id',
    statusPath: 'status',
    statusMap: {
      Preparing: 'pending', Queueing: 'pending', Processing: 'running',
      Success: 'succeeded', Fail: 'failed',
    },
    artifact: {
      mode: 'retrieve',
      endpoint: '/v1/files/retrieve?file_id={fileId}',
      fileIdPath: 'file_id',
      artifactPath: 'file.download_url',
    },
    errorPath: 'base_resp.status_msg',
    envelope: { codePath: 'base_resp.status_code', okValue: 0, messagePath: 'base_resp.status_msg' },
  },
  media: { input: 'url-or-data' },
};

export const MINIMAX_PRESET: PresetSpec = {
  id: 'minimax',
  label: 'MiniMax Hailuo',
  kinds: ['video'],
  auth: 'bearer',
  urlStyle: 'host-root',
  defaultBaseUrl: 'https://api.minimax.io',
  tag: 'cloud',
  adapter: MINIMAX_ADAPTER,
  models: [
    // 1080P supports 6s only; 10s is 768P-only (docs 2026-11-21). The flat
    // limits can't express the combo constraint — live-verify + a precheck
    // note ride the verification pass; prompt ≤ 2000 chars.
    { id: 'MiniMax-Hailuo-2.3', kind: 'video', label: 'Hailuo 2.3',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [6, 10], secondsEnum: [6, 10],
                resolutions: ['768P', '1080P'],
                sizeMap: { '480p': '768P', '720p': '768P', '1080p': '1080P' } },
      pending: true,
      adapterPayload: {
        model: '{{model}}', prompt: '{{prompt}}',
        duration: '{{seconds:enum}}', resolution: '{{size}}', prompt_optimizer: true,
      },
      pricing: { unit: 'per-video', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '768P-6': 0.28, '768P-10': 0.56, '1080P-6': 0.49 }, verifiedAt: '2026-11-21',
                 note: 'legacy Hailuo bills per clip; 1080P-10s unsupported → estimate unknown; balance via base_resp 1008' } },
    { id: 'MiniMax-Hailuo-02', kind: 'video', label: 'Hailuo 02',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [6, 10], secondsEnum: [6, 10],
                resolutions: ['768P', '1080P'],
                sizeMap: { '480p': '768P', '720p': '768P', '1080p': '1080P' } },
      pending: true,
      adapterPayload: {
        model: '{{model}}', prompt: '{{prompt}}',
        duration: '{{seconds:enum}}', resolution: '{{size}}', prompt_optimizer: true,
      },
      pricing: { unit: 'per-video', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '768P-6': 0.28, '768P-10': 0.56, '1080P-6': 0.49 }, verifiedAt: '2026-11-21',
                 note: 'legacy Hailuo bills per clip; 512P i2v-only tier ($0.10/6s, $0.15/10s) not in this model\'s limits' } },
    { id: 'MiniMax-Hailuo-2.3-i2v', kind: 'video', label: 'Hailuo 2.3 (image-to-video)',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { seconds: [6, 10], secondsEnum: [6, 10],
                resolutions: ['768P', '1080P'],
                sizeMap: { '480p': '768P', '720p': '768P', '1080p': '1080P' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: {
        model: 'MiniMax-Hailuo-2.3', prompt: '{{prompt}}',
        duration: '{{seconds:enum}}', resolution: '{{size}}', prompt_optimizer: true,
        first_frame_image: '{{media:first}}',
      },
      pricing: { unit: 'per-video', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '768P-6': 0.28, '768P-10': 0.56, '1080P-6': 0.49 }, verifiedAt: '2026-11-21',
                 note: 'per-clip; 512P tier is Hailuo-02 i2v-only, not in this model\'s limits; first_frame_image param name live-verify' } },
    // H3 series (current flagship generation, platform docs 2026-11-21): billed
    // PER-SECOND (unlike legacy Hailuo per-clip); task types t2v/i2v/fl2v/ref;
    // input media billed separately. Request params (duration options, res
    // vocab, i2v field name) live-verify — drafts below. H4: no public model
    // as of 2026-11-21; when it ships it is a catalog row, not a schema change.
    { id: 'MiniMax-H3', kind: 'video', label: 'H3 (t2v)',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { resolutions: ['768P', '2K'],
                sizeMap: { '480p': '768P', '720p': '768P', '1080p': '2K' } },
      pending: true,
      adapterPayload: { model: '{{model}}', prompt: '{{prompt}}',
                        duration: '{{seconds:int}}', resolution: '{{size}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '720p': 0.08, '1080p': 0.13, base: 0.08 }, verifiedAt: '2026-11-21',
                 note: '768P $0.08/s, 2K $0.13/s; ref image/keyframe +$0.04 (first 5 free); input video billed by duration' } },
    { id: 'MiniMax-H3-i2v', kind: 'video', label: 'H3 (i2v)',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { resolutions: ['768P', '2K'],
                sizeMap: { '480p': '768P', '720p': '768P', '1080p': '2K' } },
      pending: true, media: { modes: ['keyframes'], maxKeyframes: 1 },
      adapterPayload: { model: '{{model}}', prompt: '{{prompt}}',
                        duration: '{{seconds:int}}', resolution: '{{size}}',
                        first_frame_image: '{{media:first}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '720p': 0.08, '1080p': 0.13, base: 0.08 }, verifiedAt: '2026-11-21',
                 note: 'as H3 t2v + input-image surcharge; i2v param name live-verify' } },
    { id: 'MiniMax-H3-Highspeed', kind: 'video', label: 'H3 Highspeed (t2v)',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { resolutions: ['480P', '768P'],
                sizeMap: { '480p': '480P', '720p': '768P' } },
      pending: true,
      adapterPayload: { model: '{{model}}', prompt: '{{prompt}}',
                        duration: '{{seconds:int}}', resolution: '{{size}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '480p': 0.04, '720p': 0.06, base: 0.04 }, verifiedAt: '2026-11-21',
                 note: '480P $0.04/s, 768P $0.06/s — everyday-creation tier' } },
    { id: 'MiniMax-H3-Lite', kind: 'video', label: 'H3 Lite (t2v)',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { resolutions: ['480P', '768P'],
                sizeMap: { '480p': '480P', '720p': '768P' } },
      pending: true,
      adapterPayload: { model: '{{model}}', prompt: '{{prompt}}',
                        duration: '{{seconds:int}}', resolution: '{{size}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '480p': 0.025, '720p': 0.04, base: 0.025 }, verifiedAt: '2026-11-21',
                 note: '480P $0.025/s, 768P $0.04/s — low-cost batch tier' } },
    { id: 'MiniMax-H3-Max', kind: 'video', label: 'H3 Max (t2v, multi-asset)',
      endpoint: '/v1/video_generation', sync: false, requestFormat: 'video-adapter',
      limits: { resolutions: ['480P', '768P'],
                sizeMap: { '480p': '480P', '720p': '768P' } },
      pending: true,
      adapterPayload: { model: '{{model}}', prompt: '{{prompt}}',
                        duration: '{{seconds:int}}', resolution: '{{size}}' },
      pricing: { unit: 'per-video-second', currency: 'USD', source: 'https://platform.minimax.io/docs/pricing/overview',
                 rates: { '480p': 0.05, '720p': 0.08, base: 0.05 }, verifiedAt: '2026-11-21',
                 note: '768P $0.08/s, 480P $0.05/s; video input +$0.143/s, image +$0.074 (first 2 free)' } },
  ],
};

export const PRESETS: PresetSpec[] = [
  AGNES_PRESET, CUSTOM_PRESET,
  // text — OpenAI route
  OPENAI_PRESET, OPENROUTER_PRESET, OLLAMA_PRESET, LMSTUDIO_PRESET, LLAMACPP_PRESET, LOCAL_CUSTOM_PRESET,
  // video — Tier-A adapter
  RUNWAY_PRESET, FAL_PRESET, REPLICATE_PRESET, LUMA_PRESET, KLING_PRESET, MINIMAX_PRESET,
];

export function getPreset(id: string): PresetSpec | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Models of a preset for one kind. */
export function modelsFor(preset: PresetSpec, kind: ProviderKind): ModelSpec[] {
  return preset.models.filter((m) => m.kind === kind);
}

export function getModel(preset: PresetSpec, modelId: string): ModelSpec | undefined {
  return preset.models.find((m) => m.id === modelId);
}

/** The preset id a slot should default to for a kind (first vendor that supports it). */
export function defaultPresetFor(kind: ProviderKind, presetIds: PresetId[] = ['agnes', 'custom']): PresetId {
  for (const id of presetIds) {
    const p = getPreset(id);
    if (p && p.kinds.includes(kind)) return id;
  }
  return presetIds[0];
}
