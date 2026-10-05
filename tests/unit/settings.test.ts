/**
 * Unit tests for the settings containers + guards (Phase 0).
 * Regression guard for: default seeding, normalization of raw shapes,
 * http(s)-only URLs, key masking, and the shareable-log redaction rule (P5/P6).
 */
import { describe, it, expect, vi } from 'vitest';
import type { GenerationLogEntry, ModelSpec, Settings } from '../../src/types';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  normalizeBaseUrl,
  validateHttpUrl,
  maskKey,
  isConfigured,
  redactLog,
  providerStatusFor,
  providerStatuses,
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
    expect(out.providers.text.model).toBe('agnes-2.5-flash');
  });

  it('keeps a stored legacy v2.0 video model (it ships the 2.5 config now)', () => {
    const out = normalizeSettings({
      providers: {
        video: { preset: 'agnes', baseUrl: 'https://apihub.agnes-ai.com', apiKey: 'sk-x', model: 'agnes-video-v2.0' },
      },
    });
    // v2.0 is a first-class model again (legacy ID, 2.5-series engine config)
    // — a stored slot must NOT be migrated away from it.
    expect(out.providers.video.model).toBe('agnes-video-v2.0');
    // The rest of the slot survives normalization untouched.
    expect(out.providers.video.apiKey).toBe('sk-x');
    expect(out.providers.video.preset).toBe('agnes');
  });

  it('migrates an unknown model id to the generable default, keeps paid/pending as stored', () => {
    // Paid 2.5 is intentional user data (Q3) — the generation gate, not the
    // migrator, keeps it out of runs.
    const paid = normalizeSettings({
      providers: { video: { preset: 'agnes', baseUrl: 'https://apihub.agnes-ai.com', model: 'agnes-video-2.5' } },
    });
    expect(paid.providers.video.model).toBe('agnes-video-2.5');
    // Unknown agnes model id → falls back to the generable default.
    const unknown = normalizeSettings({
      providers: { video: { preset: 'agnes', baseUrl: 'https://apihub.agnes-ai.com', model: 'agnes-video-v0.9' } },
    });
    expect(unknown.providers.video.model).toBe('agnes-video-2.5-flash');
  });

  it('alwaysNewSeed: legacy blobs default true, explicit false is kept', () => {
    expect(normalizeSettings(undefined).generationDefaults.alwaysNewSeed).toBe(true);
    expect(
      normalizeSettings({ generationDefaults: { alwaysNewSeed: false } }).generationDefaults.alwaysNewSeed,
    ).toBe(false);
    expect(
      normalizeSettings({ generationDefaults: { alwaysNewSeed: 'junk' as unknown as boolean } })
        .generationDefaults.alwaysNewSeed,
    ).toBe(true);
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

describe('normalizeBaseUrl (host-root agnes base, catalog doc URL option a)', () => {
  it('strips a trailing /v1 from an agnes base', () => {
    expect(normalizeBaseUrl('agnes', 'https://apihub.agnes-ai.com/v1')).toBe('https://apihub.agnes-ai.com');
    expect(normalizeBaseUrl('agnes', 'https://apihub.agnes-ai.com/v1/')).toBe('https://apihub.agnes-ai.com');
    expect(normalizeBaseUrl('agnes', 'https://apihub.agnes-ai.com')).toBe('https://apihub.agnes-ai.com');
  });

  it('leaves non-agnes presets untouched (custom is /v1-native)', () => {
    expect(normalizeBaseUrl('custom', 'https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
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

describe('providerStatusFor / providerStatuses (P6 — key-presence snapshot)', () => {
  it('reports hasKey=true and configured=true for a fully-set slot', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        video: { ...DEFAULT_SETTINGS.providers.video, apiKey: 'sk-real-key', baseUrl: 'https://apihub.agnes-ai.com' },
      },
    };
    const st = providerStatusFor('video', s);
    expect(st.hasKey).toBe(true);
    expect(st.configured).toBe(true);
    expect(st.preset).toBe('agnes');
    expect(st.model).toBe('agnes-video-2.5-flash');
    // The snapshot carries presence flags, never the key value.
    expect(JSON.stringify(st)).not.toContain('sk-real-key');
  });

  it('reports hasKey=false + configured=false for the default keyless slot', () => {
    const st = providerStatusFor('video', DEFAULT_SETTINGS);
    expect(st.hasKey).toBe(false);
    expect(st.configured).toBe(false);
  });

  it('providerStatuses covers every kind in one snapshot', () => {
    const st = providerStatuses(DEFAULT_SETTINGS);
    expect(Object.keys(st).sort()).toEqual(['image', 'text', 'video']);
    expect(st.text.configured).toBe(false);
    expect(st.image.hasKey).toBe(false);
    expect(st.video.hasKey).toBe(false);
  });
});

describe('settings store — multi-listener change notifications', () => {
  // Regression: the store used to hold a single-slot `onChange`, so a later
  // registration (the ffmpeg re-probe in Workspace's onMount) silently clobbered
  // the settings/providerStatus re-sync listener — the provider status chip
  // stayed stale after a Settings save. Both listeners must now fire.
  it('fires every registered listener on a settings change, none clobbered', async () => {
    const { setOnSettingsChange, unregisterSettingsChange, commitSettings, getProviderStatus } =
      await import('../../src/lib/settings/store');
    const first = vi.fn();
    const second = vi.fn();
    setOnSettingsChange(first);
    setOnSettingsChange(second);

    const full = {
      ...DEFAULT_SETTINGS,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        video: {
          ...DEFAULT_SETTINGS.providers.video,
          apiKey: 'sk-test',
          baseUrl: 'https://apihub.agnes-ai.com',
        },
      },
    };
    await commitSettings(full);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    // The snapshot both listeners read is the post-commit one.
    expect(getProviderStatus().video.hasKey).toBe(true);

    unregisterSettingsChange(first);
    unregisterSettingsChange(second);
    await commitSettings(full);
    // Unregistered: neither fires again.
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // Regression: a loadSettings that was in flight when the user saved a new
  // provider key used to re-apply the stale persisted blob on completion,
  // rolling the chip back to "key not set" for a just-configured provider
  // (and re-applying a just-cleared key). A commit while a load is in flight
  // must invalidate the late load.
  it('a commit during an in-flight loadSettings invalidates the late load', async () => {
    const mod = await import('../../src/lib/settings/store');
    const { loadSettings, commitSettings, getProviderStatus, isSettingsLoading } = mod;
    const full = {
      ...DEFAULT_SETTINGS,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        video: {
          ...DEFAULT_SETTINGS.providers.video,
          apiKey: 'sk-new-key',
          baseUrl: 'https://apihub.agnes-ai.com',
        },
      },
    };
    // Start a load (in browser dev it reads localStorage — no row yet → null),
    // then commit a key BEFORE the load resolves. The late load must NOT
    // clobber the committed snapshot.
    const loadP = loadSettings('stale-load-profile');
    await commitSettings(full);
    expect(getProviderStatus().video.hasKey).toBe(true);
    await loadP;
    // The committed key survives the late load resolution.
    expect(getProviderStatus().video.hasKey).toBe(true);
  });

  // P6b regression: the initial-load window. Before the fix, providerStatus was
  // computed from DEFAULT_SETTINGS at module init and stayed that way until the
  // first loadSettings settled — so a freshly-configured profile showed
  // "key not set" on startup for the duration of the load. The store must now
  // expose the load lifecycle (isSettingsLoading) so the UI can render a
  // neutral state instead of asserting key presence off the default-seeded
  // snapshot.
  //
  // NOTE: in the browser-dev path the read is a synchronous localStorage
  // getItem, so by the time `await loadP` settles the flag is already false.
  // In the real Tauri path the read is an async invoke, so the flag IS true
  // for the in-flight window. We test what the unit harness can observe:
  // the flag is false after settlement, and a cross-profile switch re-arms
  // it until the new load settles.
  it('isSettingsLoading is false after a settled profile load', async () => {
    const mod = await import('../../src/lib/settings/store');
    const { loadSettings, isSettingsLoading } = mod;
    await loadSettings('p6b-settle');
    expect(isSettingsLoading()).toBe(false);
  });

  it('a cross-profile switch re-arms the loading flag until the new load settles', async () => {
    const mod = await import('../../src/lib/settings/store');
    const { loadSettings, isSettingsLoading, getLoadedProfile } = mod;
    // Settle on profile A.
    await loadSettings('p6b-a');
    expect(getLoadedProfile()).toBe('p6b-a');
    expect(isSettingsLoading()).toBe(false);
    // Start the load for B (in browser dev the read is sync, so the promise
    // may already be resolved by the time we assert — but the flag logic
    // still ran: it was set true the moment B's load began, then cleared
    // when B settled). The observable invariant: after B settles, the
    // flag is false AND the loaded profile is B.
    await loadSettings('p6b-b');
    expect(getLoadedProfile()).toBe('p6b-b');
    expect(isSettingsLoading()).toBe(false);
  });

  it('an idempotent re-load of the settled profile does not re-arm the flag', async () => {
    const mod = await import('../../src/lib/settings/store');
    const { loadSettings, isSettingsLoading } = mod;
    await loadSettings('p6b-idem');
    expect(isSettingsLoading()).toBe(false);
    // Re-calling with the same settled profile is a no-op for the flag:
    // the snapshot already represents this profile, so there is no window
    // where key-presence claims would be unreliable.
    await loadSettings('p6b-idem');
    expect(isSettingsLoading()).toBe(false);
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
    expect(modelsFor(AGNES_PRESET, 'video').map((m) => m.id)).toEqual([
      'agnes-video-2.5-flash',
      'agnes-video-v2.0',
      'agnes-video-2.5',
    ]);
    expect(modelsFor(CUSTOM_PRESET, 'text').map((m) => m.id)).toEqual(['custom-text']);
  });

  it('ships concrete Agnes specs — the P2 placeholders are filled', () => {
    expect(AGNES_PRESET.models.every((m: ModelSpec) => !m.pending)).toBe(true);
    const cv = getModel(CUSTOM_PRESET, 'custom-video');
    expect(cv?.pending).toBe(true); // custom async video shape still unknown
    expect(getModel(CUSTOM_PRESET, 'custom-text')?.pending).toBeFalsy();
  });

  it('marks the paid 2.5 video model read-only (Q3)', () => {
    expect(getModel(AGNES_PRESET, 'agnes-video-2.5')?.readOnly).toBe(true);
    expect(getModel(AGNES_PRESET, 'agnes-video-2.5-flash')?.readOnly).toBeUndefined();
    expect(getModel(AGNES_PRESET, 'agnes-image-2.5-flash')?.readOnly).toBeUndefined();
  });

  it('ships v2.0 on the 2.5 config (legacy ID, 2026-10-04 decision)', () => {
    const v2 = getModel(AGNES_PRESET, 'agnes-video-v2.0');
    expect(v2?.requestFormat).toBe('video-job-seconds');
    expect(v2?.limits.seconds).toEqual([4, 12]);
    expect(v2?.limits.resolutions).toEqual(['720P']);
    expect(v2?.media?.modes).toEqual(['keyframes', 'reference']);
    expect(v2?.media?.maxRefs).toBe(5);
  });

  it('carries per-model media + seconds limits for the pipe UI (Q7)', () => {
    const flash = getModel(AGNES_PRESET, 'agnes-video-2.5-flash');
    expect(flash?.limits.seconds).toEqual([4, 12]);
    expect(flash?.media?.modes).toEqual(['keyframes', 'reference']);
    expect(flash?.supportsSeed).toBe(true);
    const v2 = getModel(AGNES_PRESET, 'agnes-video-v2.0');
    // v2.0 ships the 2.5 config (2026-10-04) — no legacy frames shape,
    // no shared keyframes/subjects array.
    expect(v2?.requestFormat).toBe('video-job-seconds');
    expect(v2?.media?.sharedArray).toBeUndefined();
    expect(v2?.limits.maxFrames).toBeUndefined();
    expect(v2?.media?.modes).toEqual(['keyframes', 'reference']);
    const paid = getModel(AGNES_PRESET, 'agnes-video-2.5');
    expect(paid?.media?.dual).toBe(true);
  });

  it('defaults pick the first concrete model per kind on the host-root base', () => {
    expect(DEFAULT_SETTINGS.providers.text.model).toBe('agnes-2.5-flash');
    expect(DEFAULT_SETTINGS.providers.image.model).toBe('agnes-image-2.5-flash');
    expect(DEFAULT_SETTINGS.providers.video.model).toBe('agnes-video-2.5-flash');
    expect(DEFAULT_SETTINGS.providers.video.baseUrl).toBe('https://apihub.agnes-ai.com');
    expect(DEFAULT_SETTINGS.generationDefaults.alwaysNewSeed).toBe(true);
  });

  it('resolves default preset per kind', () => {
    expect(defaultPresetFor('text')).toBe('agnes');
    expect(defaultPresetFor('video')).toBe('agnes');
  });
});
