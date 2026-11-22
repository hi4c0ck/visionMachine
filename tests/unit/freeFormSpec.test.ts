/**
 * Free-form model ids on freeFormModel presets (local ComfyUI-class engines).
 * Regression guard: a model id the owner TYPED (not in the catalog) must
 * resolve on the preset's base spec — limits/media/pricing/adapter data from
 * the catalog, the typed id on the wire, the reserved `pending` gate lifted
 * (owner-typed = live-verified by construction) — and ONLY on freeFormModel
 * presets (a non-free-form preset must still block unknown ids).
 * Plus the `unlockVerified` pure gate from the Settings live-verify checkboxes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Settings } from '../../src/types';
import { unlockVerified } from '../../src/lib/settings/guards';
import { LOCAL_VIDEO_PRESET, AGNES_PRESET } from '../../src/lib/settings/catalog';
import { resolveModelSpec } from '../../src/lib/settings/resolveSpecs';
import { getSettings, updateSettings } from '../../src/lib/settings/store';

const snapshot = JSON.parse(JSON.stringify(getSettings())) as Settings;

afterAll(() => {
  updateSettings((d) => {
    d.providers = JSON.parse(JSON.stringify(snapshot.providers)) as Settings['providers'];
  });
});

describe('unlockVerified (Settings live-verify gate)', () => {
  it('lifts pending for owner-verified ids only', () => {
    const pending = { id: 'm1', kind: 'video', pending: true } as const;
    const other = { id: 'm2', kind: 'video', pending: true } as const;
    expect(unlockVerified(pending as never, ['m1']).pending).toBe(false);
    expect(unlockVerified(other as never, ['m1']).pending).toBe(true);
    expect(unlockVerified(pending as never, []).pending).toBe(true);
  });

  it('leaves non-pending models untouched', () => {
    const ok = { id: 'm3', kind: 'video', pending: false } as const;
    expect(unlockVerified(ok as never, [])).toBe(ok);
  });
});

describe('resolveModelSpec — free-form (typed) model ids', () => {
  it('resolves a typed id on the local preset via its base spec', () => {
    updateSettings((d) => {
      d.providers.video = {
        preset: LOCAL_VIDEO_PRESET.id,
        baseUrl: 'http://localhost:8188',
        apiKey: '',
        model: 'my-checkpoint.safetensors',
      };
    });
    const res = resolveModelSpec('video');
    expect(res).not.toBeNull();
    expect(res!.preset).toBe('local-video');
    // Typed id travels on the wire; the reserved pending gate is lifted
    // (owner typed it against their own engine = live-verified by construction)
    expect(res!.spec.id).toBe('my-checkpoint.safetensors');
    expect(res!.spec.pending).toBe(false);
    // Catalog data still rides: limits/media/pricing from the base model
    const base = LOCAL_VIDEO_PRESET.models.find((m) => m.kind === 'video')!;
    expect(res!.spec.limits).toEqual(base.limits);
    expect(res!.spec.pricing).toEqual(base.pricing);
  });

  it('honors the this-run override id (not in the catalog) the same way', () => {
    updateSettings((d) => {
      d.providers.video = {
        preset: LOCAL_VIDEO_PRESET.id,
        baseUrl: 'http://localhost:8188',
        apiKey: '',
        model: LOCAL_VIDEO_PRESET.models.find((m) => m.kind === 'video')!.id,
      };
    });
    const res = resolveModelSpec('video', 'another-checkpoint');
    expect(res!.spec.id).toBe('another-checkpoint');
    expect(res!.spec.pending).toBe(false);
  });

  it('never free-form-resolves on non-free-form presets (store heals unknown ids instead)', () => {
    updateSettings((d) => {
      d.providers.video = {
        preset: AGNES_PRESET.id,
        baseUrl: 'https://apihub.agnes-ai.com',
        apiKey: 'sk-x',
        model: 'does-not-exist',
      };
    });
    // Store commit normalizes: an unknown model on a NON-free-form preset is
    // healed to the catalog default (migrateStoredModel), so the free-form
    // fallback in resolveModelSpec can never over-unblock cloud vendors.
    const healed = getSettings().providers.video.model;
    expect(healed).not.toBe('does-not-exist');
    const res = resolveModelSpec('video');
    expect(res!.spec.id).toBe(healed); // catalog spec, not a free-form ride
  });

  it('resolves catalog ids on free-form presets unchanged (getModel hit)', () => {
    updateSettings((d) => {
      d.providers.video = {
        preset: LOCAL_VIDEO_PRESET.id,
        baseUrl: 'http://localhost:8188',
        apiKey: '',
        model: LOCAL_VIDEO_PRESET.models.find((m) => m.kind === 'video')!.id,
      };
    });
    const res = resolveModelSpec('video');
    // Catalog hit: the reserved spec resolves AS-IS (pending stays — the
    // Settings live-verify checkbox is what unlocks reserved catalog ids)
    expect(res!.spec.pending).toBe(true);
  });
});
