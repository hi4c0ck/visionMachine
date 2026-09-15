// Provider preset catalog (docs/settings-provider-tasks.md, Phase 0).
//
// PURE DATA. In v1 the only vendor is Agnes — its concrete model details
// (endpoints, payload shapes, limits, polling) are filled HERE when the
// Agnes API doc lands, then `pending` flips to false. No UI or engine
// code changes with that: specs ride with the model (P1/P2).
//
// 'custom' is the free-URL escape hatch: any OpenAI-shaped endpoint.

import type { ModelSpec, PresetId, PresetSpec, ProviderKind } from '$types';

export const AGNES_PRESET: PresetSpec = {
  id: 'agnes',
  label: 'Agnes',
  kinds: ['text', 'image', 'video'],
  auth: 'bearer',
  // TODO(agnes-doc): fill base URL + concrete model specs, flip pending: false
  defaultBaseUrl: '',
  models: [
    {
      id: 'agnes-text',
      kind: 'text',
      label: 'Agnes text (summarizer)',
      endpoint: '',
      sync: true,
      requestFormat: 'chat',
      limits: {},
      pending: true,
    },
    {
      id: 'agnes-image',
      kind: 'image',
      label: 'Agnes image',
      endpoint: '',
      sync: true,
      requestFormat: 'image-gen',
      limits: {},
      pending: true,
    },
    {
      id: 'agnes-video',
      kind: 'video',
      label: 'Agnes video',
      endpoint: '',
      sync: false,
      pollEndpoint: '',
      requestFormat: 'video-job',
      limits: {},
      pending: true,
    },
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
