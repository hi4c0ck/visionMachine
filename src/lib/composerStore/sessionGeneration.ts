import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { GenerationTaskView } from '$types';

export type FailurePolicy = 'stop' | 'continue';
export interface SessionGenerationInput {
  sessionId: string; imageModel?: string; videoModel?: string; seed?: number | null;
  profileId?: string | null; pipeIds?: string[] | null; failurePolicy: FailurePolicy; autoCompose: boolean;
}
export interface SessionGenerationStart { groupId: string; firstTaskId: string; firstView: GenerationTaskView; }
export interface GenerationGroupView {
  groupId: string; sessionId: string; status: string; live: boolean;
  pipes: Array<{ pipeId?: string; taskId?: string | null; status?: string; progress?: number }>;
  progress: number; sessionVideoPath?: string | null; composeState?: string | null; composeError?: string | null;
}
export interface GroupEvent {
  groupId: string; kind: 'pipe-started' | 'pipe-terminal' | 'compose-started' | 'compose-terminal' | 'group-terminal' | string;
  pipeId?: string | null; taskId?: string | null; status?: string | null;
}

export function buildSessionGenerationPayload(input: SessionGenerationInput) {
  return { sessionId: input.sessionId, imageModel: input.imageModel, videoModel: input.videoModel,
    seed: input.seed, profileId: input.profileId, pipeIds: input.pipeIds,
    failurePolicy: input.failurePolicy, autoCompose: input.autoCompose };
}
export async function startSessionGeneration(input: SessionGenerationInput): Promise<SessionGenerationStart> {
  const raw = await invoke('start_session_generation', { input: buildSessionGenerationPayload(input) }) as any;
  return { groupId: raw.group_id ?? raw.groupId, firstTaskId: raw.first_task_id ?? raw.firstTaskId, firstView: raw.first_view ?? raw.firstView };
}
export async function fetchGenerationGroup(groupId: string): Promise<GenerationGroupView> {
  const raw = await invoke('get_generation_group', { groupId }) as any;
  return {
    groupId: raw.groupId ?? raw.group_id,
    sessionId: raw.sessionId ?? raw.session_id,
    status: raw.status,
    live: raw.live === true,
    pipes: raw.pipes ?? [],
    progress: raw.progress ?? 0,
    sessionVideoPath: raw.sessionVideoPath ?? raw.session_video_path,
    composeState: raw.composeState ?? raw.compose_state,
    composeError: raw.composeError ?? raw.compose_error,
  };
}
export async function cancelSessionGeneration(groupId: string): Promise<void> {
  await invoke('cancel_generation_group', { groupId });
}
export function subscribeGroupEvent(groupId: string, cb: (event: GroupEvent) => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen<any>('group-event', (e) => { if (e.payload?.groupId === groupId) cb(e.payload as GroupEvent); });
}
export function groupEventIsTerminal(event: GroupEvent): boolean { return event.kind === 'group-terminal'; }
