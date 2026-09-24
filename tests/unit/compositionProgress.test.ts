import { describe, expect, it } from 'vitest';
import { applyCompositionProgress, type CompositionProgressEvent } from '$lib/compositionProgress';

const event = (changes: Partial<CompositionProgressEvent>): CompositionProgressEvent => ({
  sessionId: 'session-1',
  phase: 'preparing',
  ...changes,
});

describe('applyCompositionProgress', () => {
  it('tracks phase and detail', () => {
    const state = applyCompositionProgress(null, event({ phase: 'reencode', progress: 0.1, detail: 'Re-encoding' }));
    expect(state).toEqual({ phase: 'reencode', progress: 0.1, detail: 'Re-encoding' });
  });

  it('clamps and prevents backend percentages from moving backwards', () => {
    let state = applyCompositionProgress(null, event({ progress: 0.6 }));
    state = applyCompositionProgress(state, event({ progress: 0.2 }));
    expect(state.progress).toBe(0.6);
    state = applyCompositionProgress(state, event({ progress: 1.4 }));
    expect(state.progress).toBe(1);
  });

  it('preserves the last percentage when a phase has no numeric progress', () => {
    const state = applyCompositionProgress(
      applyCompositionProgress(null, event({ phase: 'copy', progress: 0.4 })),
      event({ phase: 'finalizing', detail: 'Finalizing output' }),
    );
    expect(state).toEqual({ phase: 'finalizing', progress: 0.4, detail: 'Finalizing output' });
  });
});
