/**
 * Unit tests for refOutcomes (src/lib/generationOutcome.ts) — the mapping from
 * a terminal generation task view to per-reference status flips:
 *   ready/done → done, error → error, cancelled/pending/generating → pending.
 * Video stages never flip a reference and are skipped entirely.
 */
import { describe, it, expect } from 'vitest';
import { refOutcomes } from '../../src/lib/generationOutcome';
import type { GenerationStageView, GenerationTaskView } from '../../src/types/app';

function stage(overrides: Partial<GenerationStageView> & { id: string }): GenerationStageView {
  return {
    label: 'stage',
    kind: 'image',
    sourceKind: 'keyframe',
    sourceId: 'k1',
    status: 'done',
    progress: 1,
    ...overrides,
  };
}

function view(stages: GenerationStageView[]): GenerationTaskView {
  return {
    taskId: 't1',
    sessionId: 's1',
    pipeId: 'p1',
    status: 'done',
    progress: 1,
    stages,
  };
}

describe('refOutcomes', () => {
  it('maps done and ready stage statuses to done', () => {
    const out = refOutcomes(
      view([
        stage({ id: 'a', sourceId: 'k1' }), // default status 'done'
        stage({ id: 'b', sourceKind: 'subject', sourceId: 's1', status: 'ready' }),
      ]),
    );
    expect(out).toEqual([
      { kind: 'keyframe', refId: 'k1', status: 'done' },
      { kind: 'subject', refId: 's1', status: 'done' },
    ]);
  });

  it('maps error to error', () => {
    const out = refOutcomes(view([stage({ id: 'a', status: 'error' })]));
    expect(out).toEqual([{ kind: 'keyframe', refId: 'k1', status: 'error' }]);
  });

  it('maps cancelled / pending / generating to pending', () => {
    for (const status of ['cancelled', 'pending', 'generating'] as const) {
      const out = refOutcomes(view([stage({ id: 'a', status })]));
      expect(out).toEqual([{ kind: 'keyframe', refId: 'k1', status: 'pending' }]);
    }
  });

  it('skips video stages entirely', () => {
    const out = refOutcomes(
      view([
        stage({ id: 'v', kind: 'video', sourceKind: 'video', sourceId: 'p1', status: 'done' }),
        stage({ id: 'a', sourceId: 'k1', status: 'done' }),
      ]),
    );
    expect(out).toEqual([{ kind: 'keyframe', refId: 'k1', status: 'done' }]);
  });

  it('maps sourceKind to outcome kind (keyframe → keyframe, subject → subject)', () => {
    const out = refOutcomes(
      view([
        stage({ id: 'a', sourceKind: 'keyframe', sourceId: 'k9' }),
        stage({ id: 'b', sourceKind: 'subject', sourceId: 's9' }),
      ]),
    );
    expect(out.map((o) => o.kind)).toEqual(['keyframe', 'subject']);
    expect(out.map((o) => o.refId)).toEqual(['k9', 's9']);
  });

  it('returns an empty list for an empty stage list', () => {
    expect(refOutcomes(view([]))).toEqual([]);
  });
});
