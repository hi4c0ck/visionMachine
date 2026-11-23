/**
 * Free-form model ids on freeFormModel presets (local ComfyUI-class engines).
 * Regression guard: a model id the owner TYPED (not in the catalog) must
 * resolve on the preset's base spec — limits/media/pricing/adapter data from
 * the catalog, the typed id on the wire, the reserved `pending` gate lifted
 * (owner-typed = live-verified by construction) — and ONLY on freeFormModel
 * presets (a non-free-form preset must still block unknown ids).
 * Plus the `unlockVerified` pure gate from the Settings live-verify checkboxes.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { ModelSpec, PipeRow, SessionData, Settings } from '../../src/types';
import { unlockVerified } from '../../src/lib/settings/guards';
import { pipePrechecks } from '../../src/lib/settings/prechecks';
import { LOCAL_VIDEO_PRESET, AGNES_PRESET, capabilityNote } from '../../src/lib/settings/catalog';
import { resolveModelSpec } from '../../src/lib/settings/resolveSpecs';
import { getSettings, updateSettings } from '../../src/lib/settings/store';

const snapshot = JSON.parse(JSON.stringify(getSettings())) as Settings;

// Shared empty key for the local/free-form slots in these tests.
const NO_KEY = '';

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

describe('capabilityNote (model capability + limitations marking)', () => {
  it('renders vid2vid with its limitations as one note', () => {
    expect(
      capabilityNote({
        id: 'x', kind: 'video', endpoint: '', sync: false, requestFormat: 'video-adapter',
        limits: {},
        capabilities: {
          vid2vid: true,
          vid2vidLimits: { maxSeconds: 10, maxMB: 200, formats: ['mp4', 'mov'] },
        },
      }),
    ).toBe('vid2vid · ≤10s · ≤200MB · mp4/mov · cost: unknown');
  });

  it('renders bare "vid2vid" when no limitations are declared', () => {
    expect(
      capabilityNote({
        id: 'x', kind: 'video', endpoint: '', sync: false, requestFormat: 'video-adapter',
        limits: {},
        capabilities: { vid2vid: true },
      }),
    ).toBe('vid2vid · cost: unknown');
  });

  it('renders only the cost hint when the model declares no capabilities', () => {
    expect(
      capabilityNote({
        id: 'x', kind: 'video', endpoint: '', sync: false, requestFormat: 'video-adapter',
        limits: {},
      }),
    ).toBe('cost: unknown');
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
    // Typed free-form fallback is owner-verified by construction.
    expect(res!.spec.ownerVerified).toBe(true);
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
    expect(res!.spec.ownerVerified).toBe(true);
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
    expect(res!.spec.ownerVerified).toBeUndefined();
  });
});

describe('resolveModelSpec — owner gate applied at the resolver', () => {
  const pendingVideoId = () => LOCAL_VIDEO_PRESET.models.find((m) => m.kind === 'video' && m.pending)!.id;

  it('verified tick: pending catalog id resolves pending=false with ownerVerified=true', () => {
    const id = pendingVideoId();
    updateSettings((d) => {
      d.providers.video = {
        preset: LOCAL_VIDEO_PRESET.id,
        baseUrl: 'http://localhost:8188',
        apiKey: NO_KEY,
        model: id,
        verified: [id],
      };
    });
    const res = resolveModelSpec('video', undefined, getSettings().providers.video.verified);
    expect(res!.spec.id).toBe(id);
    expect(res!.spec.pending).toBe(false);
    expect(res!.spec.ownerVerified).toBe(true);
  });

  it('untick: selected catalog id stays pending with no ownerVerified (selection kept)', () => {
    const id = pendingVideoId();
    updateSettings((d) => {
      d.providers.video = {
        preset: LOCAL_VIDEO_PRESET.id,
        baseUrl: 'http://localhost:8188',
        apiKey: NO_KEY,
        model: id,
        verified: undefined,
      };
    });
    const slot = getSettings().providers.video;
    expect(slot.model).toBe(id); // untick must not change the selection
    expect(slot.verified).toBeUndefined();
    const res = resolveModelSpec('video', undefined, slot.verified);
    expect(res!.spec.id).toBe(id);
    expect(res!.spec.pending).toBe(true);
    expect(res!.spec.ownerVerified).toBeUndefined();
  });

  it('typed free-form id: pending=false with ownerVerified=true', () => {
    updateSettings((d) => {
      d.providers.video = {
        preset: LOCAL_VIDEO_PRESET.id,
        baseUrl: 'http://localhost:8188',
        apiKey: NO_KEY,
        model: 'owner-typed-checkpoint.safetensors',
        verified: undefined,
      };
    });
    const res = resolveModelSpec('video', undefined, getSettings().providers.video.verified);
    expect(res!.spec.id).toBe('owner-typed-checkpoint.safetensors');
    expect(res!.spec.pending).toBe(false);
    expect(res!.spec.ownerVerified).toBe(true);
  });
});

describe('pipePrechecks — spec-pending names the offending id + settings pointer', () => {
  const pipe = () => ({
    id: 'p1', name: 'P', lengthFrames: 121, qValue: 18, cValue: 7,
    keyframes: [], subjectReferences: [], elements: [], orderIndex: 0,
  }) as PipeRow;
  const session = () => ({
    id: 's1', name: 'S', createdAt: 0, updatedAt: 0, directoryPath: '', pipes: [],
    fps: 24, resolution: '720p', orientation: 'horizontal', totalGeneratedFrames: 0,
  }) as SessionData;
  const videoSpec = (id: string, pending: boolean) => ({
    id, kind: 'video', endpoint: '', sync: false, requestFormat: 'video-job-seconds', limits: {}, pending,
  }) as ModelSpec;

  it('video spec-pending message includes the video model id', () => {
    const c = pipePrechecks(pipe(), session(), null, videoSpec('pending-video-id', true));
    const hit = c.find((x) => x.code === 'spec-pending');
    expect(hit).toBeTruthy();
    expect(hit!.message).toContain('pending-video-id');
    expect(hit!.message).toContain('Settings > Providers > Live-verified models');
  });

  it('image spec-pending message includes the image model id', () => {
    const img = { ...videoSpec('pending-image-id', true), kind: 'image' } as ModelSpec;
    const c = pipePrechecks(pipe(), session(), img, videoSpec('generable-video', false));
    const hit = c.find((x) => x.code === 'spec-pending');
    expect(hit).toBeTruthy();
    expect(hit!.message).toContain('pending-image-id');
    expect(hit!.message).toContain('Settings > Providers > Live-verified models');
  });
});
