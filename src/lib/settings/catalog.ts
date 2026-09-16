// Provider preset catalog (docs/settings-provider-tasks.md, Phase 0/6).
//
// PURE DATA. In v1 the only vendor is Agnes — concrete model specs below
// are researched from the official API docs + hermes session notes
// (docs/agnes-model-catalog.md). New models fill in HERE as data — no UI
// or engine rework (P1/P2). 'custom' stays the OpenAI-shape escape hatch.

import type { ModelSpec, PresetId, PresetSpec, ProviderKind } from '$types';

// Host-root base URL: creates carry the /v1 prefix in their endpoint path,
// polling lives at the host root (/agnesapi) — one base for everything
// (docs/agnes-model-catalog.md, URL composition option a).
const AGNES_BASE = 'https://apihub.agnes-ai.com';

export const AGNES_PRESET: PresetSpec = {
  id: 'agnes',
  label: 'Agnes',
  kinds: ['text', 'image', 'video'],
  auth: 'bearer',
  defaultBaseUrl: AGNES_BASE,
  models: [
    // TEXT — inert container (Q9): future prompt-summarizer engine.
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
      limits: { resolutions: ['1K', '2K', '3K', '4K'],
                ratios: ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] },
      supportsSeed: false },
    // VIDEO — 2.5-flash first = default (free tier, 720P only, seconds 4–12).
    { id: 'agnes-video-2.5-flash', kind: 'video', label: 'Agnes Video 2.5 Flash (free)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-seconds',
      limits: { seconds: [4, 12], resolutions: ['720P'],
                ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
      supportsSeed: true,
      media: { modes: ['keyframes', 'reference'],
               maxKeyframes: 2, maxRefs: 5, maxAudios: 3 } },
    // V2.0 — fps-native alternate (free): num_frames 8n+1 ≤ 441 = our SLA
    // grid; subjects merge into the keyframes image array (shared cap 3).
    { id: 'agnes-video-v2.0', kind: 'video', label: 'Agnes Video V2.0 (fps-native)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-frames',
      limits: { fps: [18, 24, 30, 48, 60],
                resolutions: ['480p', '720p', '1080p'],
                ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
                maxFrames: 441 },
      supportsSeed: true,
      media: { modes: ['keyframes'], sharedArray: true, maxKeyframes: 3, maxRefs: 3 } },
    // 2.5 PAID — READ-ONLY entry (Q3): inspect in Settings, never generable.
    // Dual media mode (first/last_frame + images/audios/videos) is the
    // future extension point (Q7).
    { id: 'agnes-video-2.5', kind: 'video', label: 'Agnes Video 2.5 (paid · read-only)',
      endpoint: '/v1/videos', sync: false,
      pollEndpoint: '/agnesapi?video_id={videoId}&model_name={model}',
      requestFormat: 'video-job-seconds',
      limits: { seconds: [4, 12],
                resolutions: ['720P', '1080P', '1K', '2K'],
                ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] },
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
  defaultBaseUrl: 'https://api.openai.com/v1',
  models: [
    {
      id: 'custom-text',
      kind: 'text',
      label: 'Custom chat model',
      endpoint: '/chat/completions',
      sync: true,
      requestFormat: 'chat',
      limits: {},
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

export const PRESETS: PresetSpec[] = [AGNES_PRESET, CUSTOM_PRESET];

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
