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
  /** Per-pipe "force first keyframe" toggles, keyed by pipe id. The
   *  sequential auto-catch watches EACH pipe's own setup: a pipe WITHOUT a
   *  settled slot-1 keyframe is always filled from the previous pipe's last
   *  frame (the "create the first keyframe" default); a pipe that already HAS
   *  a settled slot-1 is overwritten only when its id is set true here. The
   *  decision is per pipe, never a single global switch. Absent/empty = no
   *  pipe is forced (pure non-destructive catch). */
  forceLastFrames?: Record<string, boolean> | null;
  /** Experimental "compose pipes" per-pipe boundary-trim switches, keyed by
   *  pipe id (only the interior pipes that opted in, first pipe excluded).
   *  Empty/absent = classic lossless splice. The master gate lives in
   *  settings (experimental.composePipes); this map is what the modal lets
   *  the user toggle per pipe. */
  trimBoundary?: Record<string, boolean> | null;
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
  /** The run-level error message (e.g. a transport failure that aborted the
   *  whole group before any pipe finished). Present on a terminal-error
   *  group; what the "stubbed with error" reopen must surface. */
  error?: string | null;
  /** This run's source records, in concat (`orderIndex`) order. */
  sources?: GroupSourceRecord[];
  /**
   * 0012 G8: the video-normalization params the last compose ran with,
   * snapshotted on the group row. `null`/absent = pre-0012 group (no
   * snapshot). The UI compares these against the session's CURRENT
   * target + crop mode: a mismatch = the stored session video is stale
   * (the user changed the size/crop after this compose), so it is
   * flagged for re-compose instead of being trusted as current.
   */
  cropModeUsed?: string | null;
  targetWUsed?: number | null;
  targetHUsed?: number | null;
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
    runStats: input.runStats ?? null, pipeParams: input.pipeParams ?? null,
    // Per-pipe "force first keyframe" toggles (empty map = pure non-destructive
    // catch; the backend then keys each pipe off its own settled slot-1).
    forceLastFrames: input.forceLastFrames ?? {},
    // Experimental "compose pipes" boundary-trim: only the ON interior pipes,
    // keyed by pipe id (first pipe never included). Empty = classic lossless
    // splice. Maps to the Rust `trim_boundary` (camelCase rename).
    trimBoundary: input.trimBoundary ?? {} };
}
export async function startSessionGeneration(input: SessionGenerationInput, timeoutMs = 60_000): Promise<SessionGenerationStart> {
  // Bound the wait: a wedged invoke would leave the generate modal stuck in
  // busy forever (Cancel disabled, "screen locked" report). If the backend
  // task nevertheless started past the deadline the registry still tracks
  // it — restoring the session surfaces it instead of losing the run.
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(
      () => reject(new Error(`Session start timed out after ${Math.round(timeoutMs / 1000)} s — try again`)),
      timeoutMs,
    ),
  );
  const raw = (await Promise.race([
    invoke('start_session_generation', { input: buildSessionGenerationPayload(input) }),
    timeout,
  ])) as any;
  return { groupId: raw.group_id ?? raw.groupId, firstTaskId: raw.first_task_id ?? raw.firstTaskId, firstView: raw.first_view ?? raw.firstView };
}
export async function fetchGenerationGroup(groupId: string): Promise<GenerationGroupView> {
  // NOTE: `get_generation_group` is a `rename_all = "snake_case"` flat-arg
  // command — the JS payload key must be `group_id` (same convention as
  // `get_generation_task` / `cancel_generation`, which the rest of the app
  // already calls with snake_case keys). The camelCase `{ groupId }` form
  // silently deserializes to an empty string and the command errors — that
  // silent failure is why session-video restore never worked.
  const raw = await invoke('get_generation_group', { group_id: groupId }) as any;
  return parseGenerationGroup(raw);
}

/**
 * The session's most recent group row from the DB (or `null` when the
 * session has no group runs). Pure read — the localStorage bridge is gone
 * after a group goes terminal or across an app restart, so this is the
 * source of truth for "which composed session video does this session own".
 */
export async function fetchLatestGenerationGroupForSession(
  sessionId: string,
): Promise<GenerationGroupView | null> {
  // Same snake_case flat-arg convention as get_generation_group above.
  const raw = (await invoke('get_latest_session_generation_group', {
    session_id: sessionId,
  })) as any;
  if (!raw || raw === null) return null;
  return parseGenerationGroup(raw);
}

function parseGenerationGroup(raw: any): GenerationGroupView {
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
    error: raw.error ?? null,
    sources: raw.sources ?? [],
    // 0012 G8: the snapshot is absent on pre-0012 groups (null).
    cropModeUsed: raw.cropModeUsed ?? null,
    targetWUsed: raw.targetWUsed ?? null,
    targetHUsed: raw.targetHUsed ?? null,
  };
}

/**
 * 0012 G8: is the session's stored composed video STALE relative to the
 * session's current target + crop settings? The compose snapshot
 * (`cropModeUsed` / `targetWUsed` / `targetHUsed`) was written when the
 * session video was produced; if the user has since changed the session's
 * crop mode or custom target size, the stored video no longer matches what a
 * fresh compose would produce and the UI should offer a re-compose.
 *
 * Returns `true` only when a snapshot exists AND at least one of the
 * crop-mode / target dims differs from the current session value. `null`
 * snapshots (pre-0012 groups) return `false` — we can't compare, so we
 * don't flag stale. A no-target session (custom dims null) compares against
 * the resolution-preset-derived target, mirroring `target_dims` on the
 * backend.
 */
export function isComposeStale(
  group: { cropModeUsed?: string | null; targetWUsed?: number | null; targetHUsed?: number | null } | null | undefined,
  session: {
    cropMode?: string;
    customWidth?: number | null;
    customHeight?: number | null;
    resolution: string;
    orientation: string;
  },
): boolean {
  if (!group) return false;
  // No snapshot (pre-0012) -> can't decide, never flag.
  if (group.cropModeUsed == null && group.targetWUsed == null && group.targetHUsed == null) return false;
  // Resolve the current target dims (custom override when both present, else
  // the resolution-preset dims — same rule as Rust `target_dims`).
  const presetDims: Record<string, Record<string, [number, number]>> = {
    '480p': { horizontal: [854, 480], vertical: [480, 854], square: [480, 480] },
    '720p': { horizontal: [1280, 720], vertical: [720, 1280], square: [720, 720] },
    '1080p': { horizontal: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] },
  };
  const roundEven = (v: number) => Math.round(v / 2) * 2;
  const bothCustom =
    typeof session.customWidth === 'number' &&
    typeof session.customHeight === 'number' &&
    session.customWidth >= 32 && session.customWidth <= 8192 &&
    session.customHeight >= 32 && session.customHeight <= 8192;
  const [cw, ch] = bothCustom
    ? [roundEven(session.customWidth!), roundEven(session.customHeight!)]
    : (presetDims[session.resolution]?.[session.orientation] ?? [1280, 720]);
  const curCrop = session.cropMode ?? 'center';
  // Compare each known snapshot field against the current value.
  if (group.cropModeUsed != null && group.cropModeUsed !== curCrop) return true;
  if (group.targetWUsed != null && group.targetWUsed !== cw) return true;
  if (group.targetHUsed != null && group.targetHUsed !== ch) return true;
  return false;
}
export async function cancelSessionGeneration(groupId: string): Promise<void> {
  // snake_case flat-arg convention (rename_all = "snake_case" on the command).
  await invoke('cancel_generation_group', { group_id: groupId });
}
export function subscribeGroupEvent(groupId: string, cb: (event: GroupEvent) => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen<any>('group-event', (e) => { if (e.payload?.groupId === groupId) cb(e.payload as GroupEvent); });
}
export function groupEventIsTerminal(event: GroupEvent): boolean { return event.kind === 'group-terminal'; }
