/**
 * Unit tests for the generation task poller (src/lib/taskPoller.ts).
 * Covers: polling until terminal state, stop() halting, no double-fire after
 * terminal, and transient IPC failure tolerance. Uses fake timers so no
 * real waiting happens.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollTask, isTerminalTaskStatus } from '../../src/lib/taskPoller';
import type { GenerationTaskView } from '../../src/types/app';

function makeView(status: GenerationTaskView['status']): GenerationTaskView {
  return {
    taskId: 't1',
    sessionId: 's1',
    pipeId: 'p1',
    status,
    progress: status === 'done' ? 1 : 0.4,
    stages: [],
  };
}

describe('taskPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies terminal statuses', () => {
    expect(isTerminalTaskStatus('done')).toBe(true);
    expect(isTerminalTaskStatus('error')).toBe(true);
    expect(isTerminalTaskStatus('cancelled')).toBe(true);
    expect(isTerminalTaskStatus('running')).toBe(false);
    expect(isTerminalTaskStatus('queued')).toBe(false);
  });

  it('polls until the task reaches a terminal state, then stops', async () => {
    let calls = 0;
    const fetchTask = vi.fn(async (): Promise<GenerationTaskView> => {
      calls += 1;
      return makeView(calls < 3 ? 'running' : 'done');
    });
    const ticks: GenerationTaskView['status'][] = [];
    pollTask({
      taskId: 't1',
      intervalMs: 100,
      fetchTask,
      onTick: (v) => ticks.push(v.status),
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(ticks).toEqual(['running', 'running', 'done']);
    expect(fetchTask).toHaveBeenCalledTimes(3);

    // No further fetches once the task is terminal.
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchTask).toHaveBeenCalledTimes(3);
    expect(ticks).toHaveLength(3);
  });

  it('stop() halts polling without extra fetches', async () => {
    const fetchTask = vi.fn(async (): Promise<GenerationTaskView> => makeView('running'));
    const handle = pollTask({
      taskId: 't1',
      intervalMs: 100,
      fetchTask,
      onTick: () => {},
    });

    await vi.advanceTimersByTimeAsync(300);
    handle.stop();
    const callsAtStop = fetchTask.mock.calls.length;

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchTask.mock.calls.length).toBe(callsAtStop);
  });

  it('keeps polling through transient fetch failures', async () => {
    let calls = 0;
    const fetchTask = vi.fn(async (): Promise<GenerationTaskView> => {
      calls += 1;
      if (calls === 1) throw new Error('IPC down');
      return makeView('done');
    });
    const ticks: GenerationTaskView['status'][] = [];
    pollTask({
      taskId: 't1',
      intervalMs: 100,
      fetchTask,
      onTick: (v) => ticks.push(v.status),
    });

    await vi.advanceTimersByTimeAsync(300);
    // The failed tick produced no onTick; the next poll recovered.
    expect(ticks).toEqual(['done']);
    expect(fetchTask).toHaveBeenCalledTimes(2);
  });
});
