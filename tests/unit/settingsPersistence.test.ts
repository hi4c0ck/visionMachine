/**
 * Settings persistence round-trip regression.
 *
 * A field present in the TS type but missing from a normalizer (or absent
 * from the Rust serde struct) is erased on the next save/load and still
 * compiles — the gate ticks in the modal then reverts after Save. Pin the
 * full seam: tick → commitSettings (persist) → loadSettings (reload) keeps
 * verified + carousel + experimental intact.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Settings } from '../../src/types';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/lib/settings/guards';
import { commitSettings, getSettings, loadSettings } from '../../src/lib/settings/store';

const PROFILE = 'settings-persistence-roundtrip';
const KEY = `vm-settings-${PROFILE}`;

describe('settings persistence round-trip', () => {
  let original: Settings;

  beforeAll(async () => {
    original = JSON.parse(JSON.stringify(getSettings())) as Settings;
    // Establish a profile first (persistNow is a no-op without a profileId),
    // from a clean localStorage slate.
    localStorage.removeItem(KEY);
    await loadSettings(PROFILE);
  });

  afterAll(async () => {
    // The store is a module singleton shared across tests in this worker —
    // restore the snapshot so later suites do not inherit the ticked state.
    await commitSettings(original);
    localStorage.removeItem(KEY);
  });

  it('tick → commitSettings → loadSettings keeps verified + carousel + experimental', async () => {
    // "Tick": the owner live-verifies two pending ids on the video slot
    // (ProviderCard.toggleVerified shape: list set, model selected), flips
    // the carousel treatment and opts into the experimental compose gate.
    const draft: Settings = {
      ...(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings),
      providers: {
        ...DEFAULT_SETTINGS.providers,
        video: {
          ...DEFAULT_SETTINGS.providers.video,
          preset: 'custom',
          baseUrl: 'https://api.openai.com/v1',
          model: 'custom-video',
          verified: ['custom-video', 'another-pending-id'],
        },
      },
      carousel: { immersiveSnaps: false, autoScroll: 'fast' },
      experimental: { composePipes: true },
    };

    await commitSettings(draft);

    // What actually hit storage (browser-dev path) must carry all three —
    // this is the blob save_settings persists / get_settings returns.
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    expect(stored?.providers?.video?.verified).toEqual(['custom-video', 'another-pending-id']);
    expect(stored?.carousel).toEqual({ immersiveSnaps: false, autoScroll: 'fast' });
    expect(stored?.experimental).toEqual({ composePipes: true });

    // Fresh profile load re-normalizes the stored blob; no field may drop.
    await loadSettings(PROFILE);
    const loaded = getSettings();
    expect(loaded.providers.video.verified).toEqual(['custom-video', 'another-pending-id']);
    expect(loaded.providers.video.model).toBe('custom-video');
    expect(loaded.carousel).toEqual({ immersiveSnaps: false, autoScroll: 'fast' });
    expect(loaded.experimental).toEqual({ composePipes: true });
  });

  it('normalizeSlot filters non-string verified ids and drops an empty list', () => {
    // ProviderCard.toggleVerified writes `undefined` on untick, so an empty
    // array must normalize away rather than persist an empty list.
    const filtered = normalizeSettings({
      providers: {
        video: { preset: 'custom', model: 'custom-video', verified: ['a', 42, null, 'b'] },
      },
    });
    expect(filtered.providers.video.verified).toEqual(['a', 'b']);
    expect(
      normalizeSettings({
        providers: { video: { preset: 'custom', model: 'custom-video', verified: [] } },
      }).providers.video.verified,
    ).toBeUndefined();
  });
});
