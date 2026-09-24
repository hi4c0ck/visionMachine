export type PipeExpansionState = Record<string, boolean>;

export function pipeTaskId(pipeId: string, taskIds: Record<string, string>, taskViews: Record<string, { taskId: string }>): string | null {
  return taskIds[pipeId] ?? taskViews[pipeId]?.taskId ?? null;
}

export function togglePipeExpanded(state: PipeExpansionState, taskId: string): PipeExpansionState {
  return { ...state, [taskId]: !state[taskId] };
}
