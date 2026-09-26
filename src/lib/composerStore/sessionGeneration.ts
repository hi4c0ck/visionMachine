import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { GenerationTaskView, ModelSpec } from '$types';

export type FailurePolicy = 'stop' | 'continue';
/** Run-scoped session-stats override (fps/res/orientation). Only fields that
 *  differ from the session's stored values are set; the backend builds the
 *  EngineInput from the composer row when a field is absent. */
export interface RunStats {
  fps?: number;
  resolution?: string;
  orientation?: string;
}
/** Per-pipe Q/C diff map: only the pipes the user actually changed are
 *  present, and only the values that differ from the pipe's stored values
 *  are set. An empty/absent map means "run everything as stored". */
export interface PipeParamOverride {
  qValue?: number;
  cValue?: number;
}
export interface SessionGenerationInput {
  sessionId: string; imageModel?: string; videoModel?: string; seed?: number | null;
  profileId?: string | null; pipeIds?: string[] | null; failurePolicy: FailurePolicy; autoCompose: boolean;
  /** Per-pipe final prompt strings (promptEngine output) keyed by pipe id.
   *  Sent so the group's pipes run with real prompts, matching the per-pipe
   *  `start_generation` flow. */
  prompts?: Record<string, string> | null;
  /** Resolved model specs (frontend catalog → wire mirror), exactly as the
   *  per-pipe `start_generation` flow sends. The provider engine REQUIRES
   *  these — without `video_spec` the video stage fails with
   *  "video stage has no resolved video spec". */
  imageSpec?: ModelSpec | null; videoSpec?: ModelSpec | null;
  /** Run-scoped session-stats override (the modal's fps/res/orientation
   *  edits, when "apply to session" is OFF). Absent = the backend uses
   *  the composer row's values. */
  runStats?: RunStats | null;
  /** Run-scoped per-pipe Q/C diff map (only changed pipes/values). */
  pipeParams?: Record<string, PipeParamOverride> | null;
}
export interface SessionGenerationStart { groupId: string; firstTaskId: string; firstView: GenerationTaskView; }
/** One current-run source record: which pipe's clip fed this run's
 *  composition, where it came from, where it was staged, and its position in
 *  the concat order. Persisted with the compose state so a restored group
 *  can prove which clips produced the session video. */
export interface GroupSourceRecord {
  pipeId: string; taskId: string; sourcePath: string; stagedPath: string; orderIndex: number;
}
export interface GenerationGroupView {
  groupId: string; sessionId: string; status: string; live: boolean;
  pipes: Array<{ pipeId?: string; taskId?: string | null; status?: string; progress?: number }>;
  progress: number; sessionVideoPath?: string | null; composeState?: string | null; composeError?: string | null;
  /** This run's source records, in concat (`orderIndex`) order. */
  sources?: GroupSourceRecord[];
}
export interface GroupEvent {
  groupId: string; kind: 'pipe-started' | 'pipe-terminal' | 'compose-started' | 'compose-terminal' | 'group-terminal' | string;
  pipeId?: string | null; taskId?: string | null; status?: string | null;
}

export function buildSessionGenerationPayload(input: SessionGenerationInput) {
  return { sessionId: input.sessionId, imageModel: input.imageModel, videoModel: input.videoModel,
    seed: input.seed, profileId: input.profileId, pipeIds: input.pipeIds,
    failurePolicy: input.failurePolicy, autoCompose: input.autoCompose, prompts: input.prompts ?? null,
    // Serde mirror of the frontend catalog spec (Rust `ModelSpecWire`,
    // camelCase) — the same fields the per-pipe flow sends.
    imageSpec: input.imageSpec ?? null, videoSpec: input.videoSpec ?? null,
    // Run-scoped overrides (Option fields on the Rust input — absent/null =
    // "build from the composer/pipe rows", the per-pipe default).
    runStats: input.runStats ?? null, pipeParams: input.pipeParams ?? null };
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
    sources: raw.sources ?? [],
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
