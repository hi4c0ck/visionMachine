// Generation task event channel — the "backend owns state, frontend renders"
// push side. The Rust state machine (registry) emits `gen-task` window events
// on every meaningful transition; the UI re-renders from the embedded
// authoritative `view` instead of relying on the 1 s poll to deliver state.
// The poll is demoted to a fallback / on-demand refresh (open / focus /
// manual refresh button).
//
// Browser (no backend): `subscribeGenTask` resolves a no-op unlisten and the
// UI keeps working off polls only — the shape is identical either way.

import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { GenerationTaskStatus, GenerationTaskView } from '$types';

export interface GenTaskEvent {
  taskId: string;
  /** `update` = live stage/progress tick; `terminal` = machine finished. */
  kind: 'update' | 'terminal';
  /** Terminal status only; absent on live updates. */
  status?: GenerationTaskStatus;
  /** The authoritative current task view the UI renders from. */
  view: GenerationTaskView;
}

/**
 * Subscribe to the generation state machine's event stream. Returns an
 * unlisten (resolves to a no-op in the browser so the caller is uniform).
 * On-demand re-sync (modal open / window focus / refresh button) stays in the
 * caller, which already holds its own `get_generation_task` fetch helper.
 */
export function subscribeGenTask(onEvent: (event: GenTaskEvent) => void): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => {});
  }
  // Async-settle race guard (same class as runProgress.ts): `listen` resolves
  // LATER than a synchronous teardown, so without this a late-resolving
  // listener leaks — it holds the subscriber closure (and its component tree)
  // and keeps firing on every `gen-task` tick: the unbounded renderer-RAM
  // class. `disposed` closes that race; `unlisten` handles the resolved case.
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  listen<GenTaskEvent>('gen-task', (e) => onEvent(e.payload))
    .then((u) => {
      if (disposed) {
        u();
        return;
      }
      unlisten = u;
    })
    .catch(() => {});
  return Promise.resolve(() => {
    disposed = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  });
}
