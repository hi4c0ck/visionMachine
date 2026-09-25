import { describe, expect, it } from 'vitest';
import { groupStaleUiState, isStaleGroup, pipeTaskId, togglePipeExpanded, groupComposeUiState } from '../../src/lib/compactPipes';

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

  // Regression: compose failures are persisted on the group but the modal
  // previously showed only an "OK" button — the error must surface, and a
  // "done" compose whose session.mp4 is absent is NOT a success.
  describe('group compose outcome display', () => {
    it('shows the persisted compose error when composeState is error', () => {
      const ui = groupComposeUiState(false, 'error', 'ffmpeg output invalid: source Pipe 1 metadata: no input video resolution', null);
      expect(ui.visible).toBe(true);
      expect(ui.tone).toBe('error');
      expect(ui.label).toBe('Session video failed to compose');
      expect(ui.detail).toBe('ffmpeg output invalid: source Pipe 1 metadata: no input video resolution');
    });
    it('does not hide the error while the group is still busy', () => {
      const ui = groupComposeUiState(true, 'error', 'boom', null);
      expect(ui.visible).toBe(false);
    });
    it('treats a done compose with a session.mp4 path as success', () => {
      const ui = groupComposeUiState(false, 'done', null, 'C:/session/session-video/session.mp4');
      expect(ui.visible).toBe(true);
      expect(ui.tone).toBe('ok');
      expect(ui.label).toContain('C:/session/session-video/session.mp4');
    });
    it('never presents a done compose without session.mp4 as success', () => {
      const ui = groupComposeUiState(false, 'done', null, null);
      expect(ui.visible).toBe(true);
      expect(ui.tone).toBe('error');
      expect(ui.label).toContain('session.mp4 is missing');
    });
    it('shows cancelled and skipped as neutral notes, not errors', () => {
      expect(groupComposeUiState(false, 'cancelled', null, null).tone).toBe('warning');
      expect(groupComposeUiState(false, 'skipped', null, null).tone).toBe('info');
    });
    it('shows nothing when compose has not been requested yet', () => {
      expect(groupComposeUiState(false, null, null, null).visible).toBe(false);
    });
  });
});
