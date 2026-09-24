import { describe, expect, it } from 'vitest';
import { groupStaleUiState, isStaleGroup, pipeTaskId, togglePipeExpanded } from '../../src/lib/compactPipes';

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
  it('marks only a persisted running group without a live task as stale', () => {
    expect(isStaleGroup('running', false)).toBe(true);
    expect(isStaleGroup('running', true)).toBe(false);
    expect(isStaleGroup('done', false)).toBe(false);
    expect(isStaleGroup(null, false)).toBe(false);
  });
  it('renders stale group rows as read-only with restart guidance', () => {
    const stale = groupStaleUiState(true, true);
    expect(stale).toEqual({
      stale: true,
      note: 'Generation state is stale — app restarted',
      readOnly: true,
      showCancel: false,
    });
    expect(groupStaleUiState(false, true).showCancel).toBe(true);
  });
});
