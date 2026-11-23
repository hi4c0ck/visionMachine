/**
 * verificationGlyph — display-only picker glyph. Table-driven: the exact
 * glyph is pinned for every state, including the gate invariant that a raw
 * pending spec can never be turned into '✓' by the verified list alone.
 * Nothing here touches pending/unlockVerified/prechecks — pure renderer only.
 */
import { describe, it, expect } from 'vitest';
import { verificationGlyph } from '$lib/settings/guards';
import type { ModelSpec } from '$types';

/** Minimal spec — the helper reads only `pending` and `id`. */
const m = (patch: Partial<ModelSpec> = {}): ModelSpec => ({
  id: 'h3-lite',
  kind: 'video',
  endpoint: '/test',
  sync: false,
  requestFormat: 'video-adapter',
  limits: {},
  ...patch,
});

type Glyph = '?' | '✓' | '';

describe('verificationGlyph — locked semantics (table)', () => {
  const cases: Array<{
    name: string;
    spec: ModelSpec;
    verified: readonly unknown[] | null | undefined;
    expected: Glyph;
  }> = [
    {
      name: 'catalog pending → ? (reserved, no concrete run)',
      spec: m({ pending: true }),
      verified: undefined,
      expected: '?',
    },
    {
      name: 'owner-ticked concrete model → ✓',
      spec: m(),
      verified: ['h3-lite'],
      expected: '✓',
    },
    {
      name: 'catalog-generable, no tick → no glyph (data ≠ verification claim)',
      spec: m(),
      verified: undefined,
      expected: '',
    },
    {
      name: 'pending + ticked still ? (gate not bypassed by the list)',
      spec: m({ pending: true }),
      verified: ['h3-lite'],
      expected: '?',
    },
    {
      name: 'ticked a DIFFERENT id → no glyph',
      spec: m(),
      verified: ['other-model'],
      expected: '',
    },
    {
      name: 'empty / null / undefined verified → no glyph',
      spec: m(),
      verified: [],
      expected: '',
    },
    {
      name: 'null verified list is ignored',
      spec: m(),
      verified: null,
      expected: '',
    },
    {
      name: 'non-string entries ignored (malformed persisted data) → no glyph',
      spec: m(),
      verified: [42, null, undefined, {}, true, ['h3-lite']],
      expected: '',
    },
    {
      name: 'non-string entries ignored, real string id still ticks',
      spec: m(),
      verified: [42, null, {}, 'h3-lite'],
      expected: '✓',
    },
  ];

  it.each(cases.map((c) => [c.name, c.spec, c.verified, c.expected] as const))(
    '%s',
    (_name, spec, verified, expected) => {
      // `unknown[]` in the table models persisted data that may contain
      // non-strings; the helper must ignore them at runtime.
      expect(verificationGlyph(spec, verified as readonly string[] | null | undefined)).toBe(expected);
    },
  );
});
