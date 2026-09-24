import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export type CompositionPhase = 'preparing' | 'copy' | 'reencode' | 'finalizing' | 'complete';

export interface CompositionProgressEvent {
  sessionId: string;
  phase: CompositionPhase;
  /** Clamped to 0..1. Omitted when this phase has no meaningful percentage. */
  progress?: number;
  detail?: string;
}

/** Keep UI percentages monotonic and bounded even if a later FFmpeg tick regresses. */
export function applyCompositionProgress(
  current: { phase: CompositionPhase; progress: number; detail?: string } | null,
  event: CompositionProgressEvent,
): { phase: CompositionPhase; progress: number; detail?: string } {
  const incoming = Number.isFinite(event.progress) ? Math.max(0, Math.min(1, event.progress!)) : current?.progress ?? 0;
  return {
    phase: event.phase,
    progress: Math.max(current?.progress ?? 0, incoming),
    detail: event.detail,
  };
}

export function subscribeCompositionProgress(
  onEvent: (event: CompositionProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen<CompositionProgressEvent>('composition-progress', ({ payload }) => onEvent(payload));
}
