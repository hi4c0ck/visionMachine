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
  Orientation,
  ProviderKind,
  ProviderSlot,
  ResolutionPreset,
  Settings,
} from '$types';
import { AGNES_PRESET, CUSTOM_PRESET, defaultPresetFor, getPreset, getModel, modelsFor } from './catalog';

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
    alwaysNewSeed: true,
    segmentLengthUnit: 'frames',
  },
  providers: {
    text: defaultSlot('text'),
    image: defaultSlot('image'),
    video: defaultSlot('video'),
  },
  tools: {
    // Local ffmpeg override (tiny-variant escape hatch). Empty by default:
    // the backend then resolves bundled → system $PATH.
    ffmpegPath: '',
  },
};

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Migrate a persisted model id that no longer exists in the catalog
 * (a catalog rework renamed/dropped the model) to the preset's default
 * generable model. Applied on every normalize (load AND commit) so legacy
 * blobs self-heal. Known models — including read-only (paid) and pending
 * entries, which are intentional user data — are kept as stored; the
 * generation gates keep the non-generable ones out of runs.
 */
function migrateStoredModel(preset: string, kind: ProviderKind, model: string): string {
  const p = getPreset(preset);
  if (!p) return model;
  if (getModel(p, model)) return model; // known model — keep as stored
  const fallback = modelsFor(p, kind).find((m) => !m.pending && !m.readOnly);
  return fallback?.id ?? model;
}

function normalizeSlot(kind: ProviderKind, raw: unknown): ProviderSlot {
  const def = DEFAULT_SETTINGS.providers[kind];
  const r = (raw ?? {}) as Partial<ProviderSlot>;
  const preset = typeof r.preset === 'string' && r.preset ? r.preset : def.preset;
  return {
    preset,
    baseUrl:
      typeof r.baseUrl === 'string' && r.baseUrl
        ? normalizeBaseUrl(preset, r.baseUrl)
        : def.baseUrl,
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    model: migrateStoredModel(preset, kind, typeof r.model === 'string' && r.model ? r.model : def.model),
  };
}

/**
 * Per-preset baseUrl normalization. The agnes base is the HOST ROOT — its
 * create endpoints carry the /v1 prefix themselves, so a pasted
 * ".../v1" would double the prefix and 404. Other presets keep their base
 * as-is (custom is /v1-native).
 */
export function normalizeBaseUrl(preset: string, raw: string): string {
  const u = raw.trim();
  if (preset === 'agnes') return u.replace(/\/v1\/?$/, '');
  return u;
}

/** Deep-merge a raw/unknown settings blob into a fully valid Settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>;
  const base = DEFAULT_SETTINGS;
  const p = (r.profile ?? {}) as Settings['profile'];
  const g = (r.generationDefaults ?? {}) as Settings['generationDefaults'];
  const prov = (r.providers ?? {}) as Settings['providers'];
  const t = (r.tools ?? {}) as Partial<Settings['tools']>;
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
      alwaysNewSeed: g.alwaysNewSeed !== false,
      segmentLengthUnit: g.segmentLengthUnit === 'seconds' ? 'seconds' : 'frames',
    },
    providers: {
      text: normalizeSlot('text', prov.text),
      image: normalizeSlot('image', prov.image),
      video: normalizeSlot('video', prov.video),
    },
    tools: {
      // Local tooling: free string, but a path that is not obviously a path
      // (empty/whitespace-only) is dropped so the locator can fall through.
      ffmpegPath: typeof t.ffmpegPath === 'string' ? t.ffmpegPath.trim() : '',
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
 * Per-kind provider status snapshot (P6).
 *
 * Captures the FACTS the chip needs (key presence + the generation gate +
 * which field is missing) without ever carrying the key value itself — the
 * chip reads these booleans, never `slot.apiKey`. This is the shape the
 * store recomputes on profile load and on every settings change, so the UI
 * never re-derives key presence off the raw settings object (which can be
 * mid-load / default-seeded and would report "key not set" even when the
 * persisted key exists). It is the SINGLE source of truth the chip renders
 * from — it must not mix this with the live `providers` object, which is
 * what let the "Configured" badge and the chip's "key missing" disagree.
 */
export interface ProviderStatusSnapshot {
  /** True when the slot's apiKey is non-empty (key set, regardless of validity). */
  hasKey: boolean;
  /** True when url + key + model are all present (the generation gate). */
  configured: boolean;
  /** The exact field(s) still missing — `url` / `key` / `model`. */
  gaps: ('url' | 'key' | 'model')[];
  /** The preset id, for the chip label. */
  preset: string;
  /** The model id, for the chip label. */
  model: string;
}

/** Derive a key-presence status for one slot. Pure; never returns the key. */
export function providerStatusFor(kind: ProviderKind, s: Settings): ProviderStatusSnapshot {
  const slot = s.providers[kind];
  const gaps: ('url' | 'key' | 'model')[] = [];
  if (!slot) gaps.push('url', 'key', 'model');
  else {
    if (!validateHttpUrl(slot.baseUrl)) gaps.push('url');
    if (!slot.apiKey) gaps.push('key');
    if (!slot.model) gaps.push('model');
  }
  return {
    hasKey: Boolean(slot?.apiKey),
    configured: isConfigured(slot),
    gaps,
    preset: slot?.preset ?? '',
    model: slot?.model ?? '',
  };
}

/** Derive a status snapshot for every provider kind. */
export function providerStatuses(s: Settings): Record<ProviderKind, ProviderStatusSnapshot> {
  return {
    text: providerStatusFor('text', s),
    image: providerStatusFor('image', s),
    video: providerStatusFor('video', s),
  };
}

// Settings values are free strings; coerce into the app's closed unions so
// callers (session creation, frame math) never see out-of-domain data.
const KNOWN_RESOLUTIONS: readonly string[] = ['480p', '720p', '1080p'];

/** Coerce a settings resolution string into a known ResolutionPreset. */
export function knownResolution(resolution: string): ResolutionPreset {
  return KNOWN_RESOLUTIONS.includes(resolution) ? (resolution as ResolutionPreset) : '720p';
}

/** Coerce a settings orientation string into a known Orientation. */
export function knownOrientation(orientation: string): Orientation {
  return orientation === 'vertical' ? 'vertical' : 'horizontal';
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
