/**
 * Unit tests for the settings containers + guards (Phase 0).
 * Regression guard for: default seeding, normalization of raw shapes,
 * http(s)-only URLs, key masking, and the shareable-log redaction rule (P5/P6).
 */
import { describe, it, expect } from 'vitest';
import type { GenerationLogEntry, Settings } from '../../src/types';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  validateHttpUrl,
  maskKey,
  isConfigured,
  redactLog,
} from '../../src/lib/settings/guards';
import { AGNES_PRESET, CUSTOM_PRESET, getPreset, modelsFor, getModel, defaultPresetFor } from '../../src/lib/settings/catalog';

describe('normalizeSettings', () => {
  it('seeds full defaults from nothing', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values, fills missing ones', () => {
    const out = normalizeSettings({
      generationDefaults: { fps: 60, qValue: 12 },
      providers: { text: { preset: 'custom', baseUrl: 'https://x.example/v1', apiKey: 'k', model: 'custom-text' } },
    });
    expect(out.generationDefaults.fps).toBe(60);
    expect(out.generationDefaults.qValue).toBe(12);
    expect(out.generationDefaults.concurrency).toBe('sequential');
    expect(out.providers.text).toMatchObject({ preset: 'custom', model: 'custom-text' });
    // Untouched slots reseed from defaults
    expect(out.providers.video.apiKey).toBe('');
  });

  it('rejects non-finite / non-positive fps and bad concurrency', () => {
    const out = normalizeSettings({
      generationDefaults: { fps: Number.NaN, concurrency: 'sometimes' as unknown as 'parallel' },
    });
    expect(out.generationDefaults.fps).toBe(24);
    expect(out.generationDefaults.concurrency).toBe('sequential');
  });

  it('survives garbage input without throwing', () => {
    const out = normalizeSettings({ profile: null, providers: { text: null } } as unknown as Settings);
    expect(out.profile.displayName).toBe('');
    // Garbage slots reseed from the kind's default slot (Agnes seed).
    expect(out.providers.text.preset).toBe('agnes');
    expect(out.providers.text.model).toBe('agnes-text');
  });
});

describe('validateHttpUrl', () => {
  it('accepts http/https', () => {
    expect(validateHttpUrl('https://api.example.com/v1')).toBe(true);
    expect(validateHttpUrl('http://localhost:8000')).toBe(true);
  });

  it('rejects empty, local, and exotic schemes', () => {
    expect(validateHttpUrl('')).toBe(false);
    expect(validateHttpUrl('   ')).toBe(false);
    expect(validateHttpUrl('file:///etc/passwd')).toBe(false);
    expect(validateHttpUrl('localhost:8000')).toBe(false);
    expect(validateHttpUrl('gopher://x')).toBe(false);
  });
});

describe('maskKey', () => {
  it('masks long keys, keeps short ones fully redacted', () => {
    expect(maskKey('')).toBe('');
    expect(maskKey('abc')).toBe('•••');
    const masked = maskKey('sk-abcdef123456');
    expect(masked.startsWith('sk-')).toBe(true);
    expect(masked).not.toContain('abcdef123456'.slice(3));
  });
});

describe('isConfigured', () => {
  it('requires url + key + model', () => {
    expect(isConfigured({ preset: 'custom', baseUrl: 'https://api.example.com', apiKey: 'k', model: 'm' })).toBe(true);
    expect(isConfigured({ preset: 'custom', baseUrl: '', apiKey: 'k', model: 'm' })).toBe(false);
    expect(isConfigured({ preset: 'custom', baseUrl: 'https://x', apiKey: '', model: 'm' })).toBe(false);
    expect(isConfigured({ preset: 'custom', baseUrl: 'https://x', apiKey: 'k', model: '' })).toBe(false);
    expect(isConfigured(null)).toBe(false);
  });
});

describe('redactLog (P5 — shareable log)', () => {
  const entry: GenerationLogEntry = {
    taskId: 't1',
    sessionId: 's1',
    pipeId: 'p1',
    startedAt: 1,
    status: 'error',
    pieces: [
      {
        kind: 'video',
        refId: 'v',
        provider: 'agnes',
        model: 'agnes-video',
        status: 'error',
        params: { fps: 24, resolution: '720p', q: 18, c: 7 },
        error: '401 from https://api.agnes.example using sk-SUPERSECRET and C:\\Users\\me\\AppData\\vision.db',
        outputRef: 'artifacts/pipe1/video_1.mp4',
      },
    ],
  };
  // Never mutate the shared DEFAULT_SETTINGS — build a copy with a real key.
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    providers: {
      ...DEFAULT_SETTINGS.providers,
      video: { ...DEFAULT_SETTINGS.providers.video, apiKey: 'sk-SUPERSECRET' },
    },
  };

  it('strips keys and raw local paths from error strings', () => {
    const out = redactLog(entry, settings);
    const err = out.pieces[0].error!;
    expect(err).not.toContain('sk-SUPERSECRET');
    expect(err).toContain('***');
    expect(err).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(err).toContain('<path>');
  });

  it('keeps artifact refs (never raw paths) intact', () => {
    const out = redactLog(entry, settings);
    expect(out.pieces[0].outputRef).toBe('artifacts/pipe1/video_1.mp4');
  });

  it('is a no-op on clean entries', () => {
    const clean: GenerationLogEntry = {
      ...entry,
      pieces: [{ ...entry.pieces[0], status: 'done', error: undefined, outputRef: undefined }],
    };
    const out = redactLog(clean, settings);
    expect(out.pieces[0]).toEqual(clean.pieces[0]);
  });
});

describe('catalog', () => {
  it('exposes both v1 presets', () => {
    expect(getPreset('agnes')).toBe(AGNES_PRESET);
    expect(getPreset('custom')).toBe(CUSTOM_PRESET);
    expect(getPreset('nope')).toBeUndefined();
  });

  it('filters models by kind', () => {
    expect(modelsFor(AGNES_PRESET, 'video').map((m) => m.id)).toEqual(['agnes-video']);
    expect(modelsFor(CUSTOM_PRESET, 'text').map((m) => m.id)).toEqual(['custom-text']);
  });

  it('marks Agnes specs pending until concrete details land (P2)', () => {
    for (const m of AGNES_PRESET.models) expect(m.pending).toBe(true);
    const cv = getModel(CUSTOM_PRESET, 'custom-video');
    expect(cv?.pending).toBe(true); // async video job shape unknown
    expect(getModel(CUSTOM_PRESET, 'custom-text')?.pending).toBeFalsy();
  });

  it('resolves default preset per kind', () => {
    expect(defaultPresetFor('text')).toBe('agnes');
    expect(defaultPresetFor('video')).toBe('agnes');
  });
});
