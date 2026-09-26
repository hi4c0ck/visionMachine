/**
 * Group restore contract.
 *
 * A restored group must report BOTH the compose outcome (state + error) and
 * the run's source records (pipe id, task id, source path, staged path, order
 * index), so a finished group can never be presented as a clean success while
 * its composition actually failed, and a reader can prove which clips
 * produced the session video.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: mockInvoke,
}));

import { fetchGenerationGroup } from '../../src/lib/composerStore/sessionGeneration';

describe('group restore surfaces compose outcome and run sources', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('parses composeState, composeError and ordered source records', async () => {
    mockInvoke.mockResolvedValue({
      groupId: 'g1',
      sessionId: 's1',
      status: 'done',
      live: false,
      composeState: 'error',
      composeError: 'ffmpeg exited 1',
      sessionVideoPath: null,
      sources: [
        { pipeId: 'p0', taskId: 't0', sourcePath: 'a.mp4', stagedPath: 'sa.mp4', orderIndex: 0 },
        { pipeId: 'p1', taskId: 't1', sourcePath: 'b.mp4', stagedPath: 'sb.mp4', orderIndex: 1 },
      ],
    });
    const g = await fetchGenerationGroup('g1');
    expect(mockInvoke).toHaveBeenCalledWith('get_generation_group', { groupId: 'g1' });
    expect(g.composeState).toBe('error');
    expect(g.composeError).toBe('ffmpeg exited 1');
    expect(g.live).toBe(false);
    // Source records keep their order index so a reader can rebuild concat order.
    expect(g.sources).toEqual([
      { pipeId: 'p0', taskId: 't0', sourcePath: 'a.mp4', stagedPath: 'sa.mp4', orderIndex: 0 },
      { pipeId: 'p1', taskId: 't1', sourcePath: 'b.mp4', stagedPath: 'sb.mp4', orderIndex: 1 },
    ]);
  });

  it('reports each source record with its own order index (concat order)', async () => {
    mockInvoke.mockResolvedValue({
      groupId: 'g3',
      live: false,
      sources: [
        { pipeId: 'b', taskId: 'tb', sourcePath: 'b.mp4', stagedPath: 'pipe-1-b.mp4', orderIndex: 1 },
        { pipeId: 'a', taskId: 'ta', sourcePath: 'a.mp4', stagedPath: 'pipe-0-a.mp4', orderIndex: 0 },
      ],
    });
    const g = await fetchGenerationGroup('g3');
    const order = (g.sources ?? []).map((s) => s.orderIndex);
    expect(order).toEqual([1, 0]);
    // The staged path is the concat input; the source path is the untouched
    // original in the pipe's own task dir.
    expect((g.sources ?? [])[1].stagedPath).toBe('pipe-0-a.mp4');
    expect((g.sources ?? [])[1].sourcePath).toBe('a.mp4');
  });

  it('defaults to an empty source list when the backend omits it (pre-0011 row)', async () => {
    mockInvoke.mockResolvedValue({
      groupId: 'g2',
      live: false,
      composeState: 'done',
      sessionVideoPath: 'C:/m/s/session-video/session.mp4',
    });
    const g = await fetchGenerationGroup('g2');
    expect(g.sources).toEqual([]);
    expect(g.composeState).toBe('done');
    expect(g.sessionVideoPath).toBe('C:/m/s/session-video/session.mp4');
  });

  it('accepts snake_case backend field names', async () => {
    mockInvoke.mockResolvedValue({
      group_id: 'g4',
      session_id: 's4',
      status: 'done',
      live: false,
      compose_state: 'cancelled',
      compose_error: null,
      session_video_path: null,
    });
    const g = await fetchGenerationGroup('g4');
    expect(g.groupId).toBe('g4');
    expect(g.sessionId).toBe('s4');
    expect(g.composeState).toBe('cancelled');
    expect(g.sources).toEqual([]);
  });
});
