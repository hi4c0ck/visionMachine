// Generation task poller — the progress modal polls `get_generation_task`
// on an interval; stops automatically when the task reaches a terminal state.
// Pure (no component coupling) so it is unit-testable with fake timers.

import type { GenerationTaskStatus, GenerationTaskView } from '$types';

export interface PollHandle {
  stop(): void;
}

export function isTerminalTaskStatus(status: GenerationTaskStatus): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

export function pollTask(opts: {
  taskId: string;
  /** poll period in ms (default 1000) */
  intervalMs?: number;
  fetchTask: (taskId: string) => Promise<GenerationTaskView>;
  onTick: (view: GenerationTaskView) => void;
}): PollHandle {
  const interval = opts.intervalMs ?? 1000;
  let stopped = false;

  (async () => {
    while (!stopped) {
      let view: GenerationTaskView | undefined;
      try {
        view = await opts.fetchTask(opts.taskId);
      } catch {
        // transient IPC failure — keep polling on the next tick
      }
      if (stopped) return;
      if (view) {
        opts.onTick(view);
        if (isTerminalTaskStatus(view.status)) return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      if (stopped) return;
    }
  })();

  return {
    stop() {
      stopped = true;
    },
  };
}
