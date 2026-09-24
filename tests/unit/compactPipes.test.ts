import { describe, expect, it } from 'vitest';
import { pipeTaskId, togglePipeExpanded } from '../../src/lib/compactPipes';

describe('compact pipe row state', () => {
  it('toggles expansion without mutating the previous state', () => {
    const first = togglePipeExpanded({}, 't1');
    expect(first.t1).toBe(true);
    expect(togglePipeExpanded(first, 't1').t1).toBe(false);
    expect(first.t1).toBe(true);
  });
  it('resolves a task id for a queued pipe and uses fetched view as fallback', () => {
    expect(pipeTaskId('p2', { p2: 't2' }, {})).toBe('t2');
    expect(pipeTaskId('p3', {}, { p3: { taskId: 't3' } })).toBe('t3');
  });
});
