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
