/**
 * capabilityNote — pure picker-note renderer (declared modes → vid2vid limits
 * → honest cost suffix). Table-driven so every cost rule and the segment
 * ordering are pinned against the exact strings, with no catalog fixtures
 * beyond the reservations check at the bottom.
 */
import { describe, it, expect } from 'vitest';
import { capabilityNote, PRESETS } from '$lib/settings/catalog';
import type { CapabilityMode, ModelSpec, PriceSpec } from '$types';

/** Minimal spec — capabilityNote reads only capabilities + pricing. */
const m = (patch: Partial<ModelSpec> = {}): ModelSpec => ({
  id: 'test',
  kind: 'video',
  endpoint: '/test',
  sync: false,
  requestFormat: 'video-adapter',
  limits: {},
  ...patch,
});

const FREE: PriceSpec = { unit: 'free-local', currency: 'USD', rates: { base: 0 }, verifiedAt: '2026-11-22' };

describe('capabilityNote — declared modes', () => {
  it.each([
    [[], 'free on your hardware'],
    [['t2v'], 't2v · free on your hardware'],
    [['i2v'], 'i2v · free on your hardware'],
    [['t2v', 'i2v'], 't2v / i2v · free on your hardware'],
    [['t2i', 'i2i'], 't2i / i2i · free on your hardware'],
    [['v2v'], 'v2v · free on your hardware'], // rendering supports the reserved literal; no catalog row uses it
  ] as Array<[CapabilityMode[], string]>)('renders %j as the leading segment', (modes, expected) => {
    expect(capabilityNote(m({ capabilities: { modes }, pricing: FREE }))).toBe(expected);
  });

  it('still renders modes when cost is unknown', () => {
    expect(capabilityNote(m({ capabilities: { modes: ['t2v', 'i2v'] } }))).toBe('t2v / i2v · cost: unknown');
  });
});

describe('capabilityNote — cost rules (every branch, derived only from pricing)', () => {
  const cases: Array<{ name: string; pricing?: PriceSpec; expected: string }> = [
    { name: 'no pricing → unknown', expected: 'cost: unknown' },
    { name: 'free-local → honest $0 fact', pricing: FREE, expected: 'free on your hardware' },
    { name: 'free-local needs no verifiedAt', pricing: { unit: 'free-local', currency: 'USD' }, expected: 'free on your hardware' },
    {
      name: 'per-video-second single rate → ≈ $/s',
      pricing: { unit: 'per-video-second', currency: 'USD', rates: { base: 0.08 }, verifiedAt: '2026-11-21' },
      expected: '≈ $0.08/s',
    },
    {
      name: 'per-video-second tiered → from lowest $/s',
      pricing: { unit: 'per-video-second', currency: 'USD', rates: { '480p': 0.04, '580p': 0.06, '720p': 0.08, base: 0.08 }, verifiedAt: '2026-11-22' },
      expected: 'from $0.04/s',
    },
    {
      name: 'per-video single rate → ≈ $/clip',
      pricing: { unit: 'per-video', currency: 'USD', rates: { '768P-6': 0.28 }, verifiedAt: '2026-11-21' },
      expected: '≈ $0.28/clip',
    },
    {
      name: 'per-video tiered → from lowest $/clip',
      pricing: { unit: 'per-video', currency: 'USD', rates: { '768P-6': 0.28, '768P-10': 0.56, '1080P-6': 0.49 }, verifiedAt: '2026-11-21' },
      expected: 'from $0.28/clip',
    },
    {
      name: 'per-credit → vendor units at run',
      pricing: { unit: 'per-credit', currency: 'credits', rates: { usdPerCredit: 0.01 }, verifiedAt: '2026-11-21' },
      expected: 'vendor units billed at run',
    },
    {
      name: 'per-unit → vendor units at run',
      pricing: { unit: 'per-unit', currency: 'units', rates: { usdPerUnit: 0.14 }, verifiedAt: '2026-11-21' },
      expected: 'vendor units billed at run',
    },
    {
      name: 'per-video-second verifiedAt null → research pending',
      pricing: { unit: 'per-video-second', currency: 'USD', rates: { base: 0.08 }, verifiedAt: null },
      expected: 'cost: research pending',
    },
    {
      name: 'per-video-second rates absent → research pending',
      pricing: { unit: 'per-video-second', currency: 'USD', verifiedAt: '2026-11-21' },
      expected: 'cost: research pending',
    },
    {
      name: 'per-video rates empty → research pending',
      pricing: { unit: 'per-video', currency: 'USD', rates: {}, verifiedAt: '2026-11-21' },
      expected: 'cost: research pending',
    },
    {
      name: 'non-free-local $0 rate is never fabricated',
      pricing: { unit: 'per-video-second', currency: 'USD', rates: { base: 0 }, verifiedAt: '2026-11-21' },
      expected: 'cost: research pending',
    },
    {
      name: 'per-token unverified → research pending',
      pricing: { unit: 'per-token', currency: 'USD', source: 'https://openai.com/api/pricing/', verifiedAt: null },
      expected: 'cost: research pending',
    },
  ];
  it.each(cases.map((c) => [c.name, c.pricing, c.expected]))('%s', (_name, pricing, expected) => {
    expect(capabilityNote(m(pricing ? { pricing } : {}))).toBe(expected as string);
  });
});

describe('capabilityNote — segment order', () => {
  it('modes → vid2vid with its limits → cost', () => {
    expect(capabilityNote(m({
      capabilities: {
        modes: ['t2v', 'i2v'],
        vid2vid: true,
        vid2vidLimits: { maxSeconds: 10, maxMB: 200, formats: ['mp4', 'mov'] },
      },
      pricing: FREE,
    }))).toBe('t2v / i2v · vid2vid · ≤10s · ≤200MB · mp4/mov · free on your hardware');
  });

  it('vid2vid block renders only declared limits', () => {
    expect(capabilityNote(m({
      capabilities: { vid2vid: true, vid2vidLimits: { maxSeconds: 10 } },
      pricing: FREE,
    }))).toBe('vid2vid · ≤10s · free on your hardware');
  });
});

describe('catalog capability reservations', () => {
  const all = PRESETS.flatMap((p) => p.models.map((model) => ({ preset: p.id, model })));
  const label = (x: { preset: string; model: ModelSpec }) => `${x.preset}/${x.model.id}`;

  it('no catalog row declares vid2vid (Tier-B slot stays empty)', () => {
    expect(all.filter((x) => x.model.capabilities?.vid2vid || x.model.capabilities?.vid2vidLimits).map(label)).toEqual([]);
  });

  it('no catalog row claims the reserved v2v mode', () => {
    expect(all.filter((x) => x.model.capabilities?.modes?.includes('v2v')).map(label)).toEqual([]);
  });

  it('every video row declares at least one capability mode', () => {
    expect(all.filter((x) => x.model.kind === 'video' && !x.model.capabilities?.modes?.length).map(label)).toEqual([]);
  });

  it('every declared mode is one of the five literals', () => {
    const allowed = new Set<CapabilityMode>(['t2v', 'i2v', 'v2v', 't2i', 'i2i']);
    expect(all.filter((x) => (x.model.capabilities?.modes ?? []).some((mode) => !allowed.has(mode as CapabilityMode))).map(label)).toEqual([]);
  });
});
