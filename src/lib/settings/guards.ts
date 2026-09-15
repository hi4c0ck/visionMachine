// Settings guards (docs/settings-provider-tasks.md, Phase 0).
//
// - DEFAULT_SETTINGS: the seed every profile starts from (matches the
//   current hardcoded session defaults: 24 / 720p / horizontal / 18 / 7).
// - normalizeSettings: deep-merge ANY raw shape (legacy rows, partial saves,
//   localStorage blobs) into a valid Settings — same spirit as normalizeSession.
// - Security (P6): maskKey for UI/logs, validateHttpUrl (http/https only),
//   redactLog guarantees keys + raw local paths never sit in a log entry.

import type {
  GenerationLogEntry,
  ProviderKind,
  ProviderSlot,
  Settings,
} from '$types';
import { AGNES_PRESET, CUSTOM_PRESET, defaultPresetFor, modelsFor } from './catalog';

export const PROVIDER_KINDS: ProviderKind[] = ['text', 'image', 'video'];

function defaultSlot(kind: ProviderKind): ProviderSlot {
  const presetId = defaultPresetFor(kind);
  const preset = presetId === 'agnes' ? AGNES_PRESET : CUSTOM_PRESET;
  const models = modelsFor(preset, kind);
  // Prefer a non-pending model when one exists, otherwise the kind's first entry.
  const model = models.find((m) => !m.pending) ?? models[0];
  return {
    preset: preset.id,
    baseUrl: preset.defaultBaseUrl,
    apiKey: '',
    model: model?.id ?? '',
  };
}

export const DEFAULT_SETTINGS: Settings = {
  profile: { displayName: '', theme: '', layout: '' },
  generationDefaults: {
    fps: 24,
    resolution: '720p',
    orientation: 'horizontal',
    qValue: 18,
    cValue: 7,
    concurrency: 'sequential',
  },
  providers: {
    text: defaultSlot('text'),
    image: defaultSlot('image'),
    video: defaultSlot('video'),
  },
};

// ── Normalization ─────────────────────────────────────────────────────────────

function normalizeSlot(kind: ProviderKind, raw: unknown): ProviderSlot {
  const def = DEFAULT_SETTINGS.providers[kind];
  const r = (raw ?? {}) as Partial<ProviderSlot>;
  return {
    preset: typeof r.preset === 'string' && r.preset ? r.preset : def.preset,
    baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl : def.baseUrl,
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    model: typeof r.model === 'string' && r.model ? r.model : def.model,
  };
}

/** Deep-merge a raw/unknown settings blob into a fully valid Settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  const base = DEFAULT_SETTINGS;
  const p = (r.profile ?? {}) as Settings['profile'];
  const g = (r.generationDefaults ?? {}) as Settings['generationDefaults'];
  const prov = (r.providers ?? {}) as Settings['providers'];
  return {
    profile: {
      displayName: typeof p.displayName === 'string' ? p.displayName : base.profile.displayName,
      theme: typeof p.theme === 'string' ? p.theme : base.profile.theme,
      layout: typeof p.layout === 'string' ? p.layout : base.profile.layout,
    },
    generationDefaults: {
      fps: Number.isFinite(g.fps) && (g.fps as number) > 0 ? (g.fps as number) : base.generationDefaults.fps,
      resolution: typeof g.resolution === 'string' && g.resolution ? g.resolution : base.generationDefaults.resolution,
      orientation: typeof g.orientation === 'string' && g.orientation ? g.orientation : base.generationDefaults.orientation,
      qValue: Number.isFinite(g.qValue) ? (g.qValue as number) : base.generationDefaults.qValue,
      cValue: Number.isFinite(g.cValue) ? (g.cValue as number) : base.generationDefaults.cValue,
      concurrency: g.concurrency === 'parallel' ? 'parallel' : 'sequential',
    },
    providers: {
      text: normalizeSlot('text', prov.text),
      image: normalizeSlot('image', prov.image),
      video: normalizeSlot('video', prov.video),
    },
  };
}

// ── Security helpers (P6/P7) ──────────────────────────────────────────────────

/** http(s)-only — blocks file://, local paths, and exotic schemes. */
export function validateHttpUrl(url: string): boolean {
  const u = (url ?? '').trim();
  if (!u) return false;
  return /^https?:\/\/[^\s]+$/.test(u);
}

/** Mask a key for display: keep a short prefix, redact the rest. */
export function maskKey(key: string): string {
  const k = key ?? '';
  if (!k) return '';
  if (k.length <= 8) return '•'.repeat(k.length);
  return `${k.slice(0, 4)}${'•'.repeat(Math.min(k.length - 4, 24))}`;
}

/** A slot is "configured" when it can plausibly make a request. */
export function isConfigured(slot: ProviderSlot | null | undefined): boolean {
  if (!slot) return false;
  return Boolean(validateHttpUrl(slot.baseUrl) && slot.apiKey && slot.model);
}

/**
 * Guarantee a log entry is shareable (P5): strip any provider API key that
 * leaked into error strings, and drop raw local paths from error/outputRef.
 * outputRef stays an artifact ref; it is NEVER a filesystem path in a log.
 */
export function redactLog(entry: GenerationLogEntry, settings?: Settings): GenerationLogEntry {
  const keys = settings
    ? PROVIDER_KINDS.map((k) => settings.providers[k]?.apiKey).filter((k): k is string => Boolean(k))
    : [];

  const scrub = (s: string | undefined): string | undefined => {
    if (s === undefined) return undefined;
    let out = s;
    for (const key of keys) {
      if (key) out = out.split(key).join('***');
    }
    // Raw local paths (Windows drive or POSIX home) must not surface in logs.
    return out.replace(/[A-Za-z]:[\\/][^\s"']+/g, '<path>').replace(/\/(?:home|Users)\/[^\s"']+/g, '<path>');
  };

  return {
    ...entry,
    pieces: entry.pieces.map((p) => ({
      ...p,
      outputRef: scrub(p.outputRef),
      error: scrub(p.error),
    })),
  };
}
