import { describe, expect, it } from 'vitest';
import { groupStaleUiState, isStaleGroup, pipeTaskId, togglePipeExpanded, groupComposeUiState, stageStatusWord, stageStateClass, fmtElapsed, nextExpandedId } from '../../src/lib/compactPipes';

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

  describe('stage status → friendly word + card-state class', () => {
    it('maps terminal image states (done/ready) to Ready + done card', () => {
      expect(stageStatusWord('done')).toBe('Ready');
      expect(stageStatusWord('ready')).toBe('Ready');
      expect(stageStateClass('done')).toBe('done');
      expect(stageStateClass('ready')).toBe('done');
    });
    it('maps in-flight states', () => {
      expect(stageStatusWord('pending')).toBe('Queued');
      expect(stageStateClass('pending')).toBeNull();
      expect(stageStatusWord('generating')).toBe('In progress');
      expect(stageStateClass('generating')).toBe('active');
      expect(stageStatusWord('rate-limited')).toBe('Rate limited');
      expect(stageStateClass('rate-limited')).toBe('ratelimited');
    });
    it('maps failures', () => {
      expect(stageStatusWord('error')).toBe('Failed');
      expect(stageStateClass('error')).toBe('error');
      expect(stageStatusWord('cancelled')).toBe('Cancelled');
      expect(stageStateClass('cancelled')).toBe('cancelled');
    });
    it('passes unknown raw statuses through unchanged (no card state)', () => {
      expect(stageStatusWord('weird')).toBe('weird');
      expect(stageStateClass('weird')).toBeNull();
    });
  });
});

describe('item 5: pinned-strip elapsed + single-expand accordion', () => {
  it('fmtElapsed renders m:ss from Unix ms', () => {
    const start = 1_000_000;
    expect(fmtElapsed(start, start + 41_000)).toBe('0:41');
    expect(fmtElapsed(start, start + 125_000)).toBe('2:05');
  });
  it('fmtElapsed: unknown/zero start → empty (pre-migration rows)', () => {
    expect(fmtElapsed(0, 9_999_999)).toBe('');
    expect(fmtElapsed(-5, 9_999_999)).toBe('');
  });
  it('fmtElapsed clamps a future start to 0:00', () => {
    expect(fmtElapsed(5_000, 1_000)).toBe('0:00');
  });
  it('nextExpandedId: opening a row closes the previous (single-expand)', () => {
    expect(nextExpandedId('t1', 't2')).toBe('t2');
    expect(nextExpandedId(null, 't2')).toBe('t2');
  });
  it('nextExpandedId: clicking the open row collapses it', () => {
    expect(nextExpandedId('t2', 't2')).toBeNull();
  });
});
