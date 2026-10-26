export type PipeExpansionState = Record<string, boolean>;

/** A persisted running group is stale when no registered/live task remains. */
export function isStaleGroup(groupStatus: string | null | undefined, hasLiveTask: boolean): boolean {
  return groupStatus === 'running' && !hasLiveTask;
}

export interface GroupStaleUiState {
  stale: boolean;
  note: string;
  readOnly: boolean;
  showCancel: boolean;
}

export function groupStaleUiState(stale: boolean, busy: boolean): GroupStaleUiState {
  return {
    stale,
    note: stale ? 'Generation state is stale — app restarted' : '',
    readOnly: stale,
    showCancel: busy && !stale,
  };
}

export function pipeTaskId(pipeId: string, taskIds: Record<string, string>, taskViews: Record<string, { taskId: string }>): string | null {
  return taskIds[pipeId] ?? taskViews[pipeId]?.taskId ?? null;
}

export function togglePipeExpanded(state: PipeExpansionState, taskId: string): PipeExpansionState {
  return { ...state, [taskId]: !state[taskId] };
}

// ── Stage status → friendly word + card-state class ──────────────────────
// The generation modals render each stage as a calm card (shared
// .gen-stage-* anatomy in composer-modal.css). The raw backend status
// ("ready", "rate-limited", "generating"…) is a machine value; these
// helpers map it to what a human reads, plus the CSS state class that
// tints the card. "ready" is the image-stage equivalent of "done" (the
// artifact exists) and reads the same way.
export function stageStatusWord(status: string): string {
  switch (status) {
    case 'done':
    case 'ready':
      return 'Ready';
    case 'pending':
      return 'Queued';
    case 'generating':
      return 'In progress';
    case 'rate-limited':
      return 'Rate limited';
    case 'error':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

/** CSS state class for a stage card (see .gen-stage.* in composer-modal.css). */
export function stageStateClass(status: string): string | null {
  switch (status) {
    case 'done':
    case 'ready':
      return 'done';
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    case 'generating':
      return 'active';
    case 'rate-limited':
      return 'ratelimited';
    default:
      return null;
  }
}

// ── Session-composition outcome UI state ─────────────────────────────
// A finished group must not be presented as a clean success when its
// auto-compose step failed (or produced no session.mp4): the persisted
// composeState/composeError drive an explicit note in the group modal
// instead of a silent "OK".
export interface GroupComposeUiState {
  visible: boolean;
  tone: 'ok' | 'warning' | 'info' | 'error' | null;
  label: string;
  detail: string | null;
}

export function groupComposeUiState(
  busy: boolean,
  composeState: string | null | undefined,
  composeError: string | null | undefined,
  sessionVideoPath: string | null | undefined,
): GroupComposeUiState {
  // Composition still in flight — the running indicator is enough.
  if (busy) return { visible: false, tone: null, label: '', detail: null };
  switch (composeState) {
    case 'error':
      return {
        visible: true,
        tone: 'error',
        label: 'Session video failed to compose',
        detail: composeError ?? null,
      };
    case 'cancelled':
      return { visible: true, tone: 'warning', label: 'Session video composition was cancelled', detail: null };
    case 'skipped':
      return { visible: true, tone: 'info', label: 'Session video composition was skipped', detail: null };
    case 'done':
      // A "done" without the output file is still a failure — never present
      // compose completion as success when session.mp4 is absent.
      if (sessionVideoPath) {
        return { visible: true, tone: 'ok', label: `Session video ready: ${sessionVideoPath}`, detail: null };
      }
      return {
        visible: true,
        tone: 'error',
        label: 'Composition reported success but session.mp4 is missing',
        detail: null,
      };
    default:
      return { visible: false, tone: null, label: '', detail: null };
  }
}
