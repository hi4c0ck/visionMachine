// Composer Service Interfaces
// Interface Segregation + Service Layer Pattern

import type {
  SessionData,
  PipeRow,
  TagType,
  PipeKeyframe,
  GlobalElement,
  SoundElement,
  TimelineElement,
  Segment,
  TagElement,
  ResolutionPreset,
  SubjectReference,
  KeyframeType,
  GenerationStatus,
  PipeLastGeneration,
} from '$types';

// ── Result Type ───────────────────────────────────────────────────────────────

export interface ServiceResult {
  errors: string[];
  /** Non-fatal notices (e.g. "trimmed N out-of-bounds tags"). Surfaced to
   *  the UI as warnings without blocking the operation. */
  warnings?: string[];
}

export type Result<T> = T extends void ? ServiceResult : T & ServiceResult;

// ── Pipe Service Interface ────────────────────────────────────────────────────

export interface PipeService {
  add(sessionId: string): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string): Promise<ServiceResult>;
  move(sessionId: string, pipeId: string, newOrderIndex: number): Promise<ServiceResult>;
  duplicate(sessionId: string, pipeId: string): Promise<ServiceResult>;
  updateQ(sessionId: string, pipeId: string, qValue: number): Promise<ServiceResult>;
  updateC(sessionId: string, pipeId: string, cValue: number): Promise<ServiceResult>;
  /** Switch the pipe's media mode (docs/agnes-model-catalog.md, Q7). Drives
   *  keyframes/subject-refs row visibility per the video model's media caps. */
  setMediaMode(sessionId: string, pipeId: string, mode: 'keyframes' | 'reference'): Promise<ServiceResult>;
  setLength(sessionId: string, pipeId: string, frames: number): Promise<ServiceResult>;
  getPipe(session: SessionData, pipeId: string): PipeRow | undefined;
}

// ── Element Service Interface ─────────────────────────────────────────────────

export interface ElementService {
  addGlobal(sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  updateGlobalRange(sessionId: string, pipeId: string, globalId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  toggleGlobal(sessionId: string, pipeId: string, globalId: string): Promise<ServiceResult>;
  removeGlobal(sessionId: string, pipeId: string, globalId: string): Promise<ServiceResult>;
  addTimeline(sessionId: string, pipeId: string): Promise<ServiceResult>;
  getTimelineElement(pipe: PipeRow): TimelineElement | undefined;
  getGlobalElement(pipe: PipeRow): GlobalElement | undefined;
  getSoundElement(pipe: PipeRow): SoundElement | undefined;
  addSound(sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  updateSoundRange(sessionId: string, pipeId: string, soundId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  toggleSound(sessionId: string, pipeId: string, soundId: string): Promise<ServiceResult>;
  removeSound(sessionId: string, pipeId: string, soundId: string): Promise<ServiceResult>;
  updateGlobalPrompt(sessionId: string, pipeId: string, globalId: string, prompt: string): Promise<ServiceResult>;
  updateSoundPrompt(sessionId: string, pipeId: string, soundId: string, prompt: string): Promise<ServiceResult>;
}

// ── Segment Service Interface ─────────────────────────────────────────────────

export interface SegmentService {
  add(sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string, segmentId: string): Promise<ServiceResult>;
  resize(sessionId: string, pipeId: string, segmentId: string, newStart: number, newEnd: number): Promise<ServiceResult>;
}

// ── Tag Service Interface ─────────────────────────────────────────────────────

export interface TagService {
  add(sessionId: string, pipeId: string, segmentId: string, tagType: TagType): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string, segmentId: string, tagId: string): Promise<ServiceResult>;
  resize(sessionId: string, pipeId: string, segmentId: string, tagId: string, newStart: number, newEnd: number): Promise<ServiceResult>;
  updateValue(sessionId: string, pipeId: string, segmentId: string, tagId: string, value: number): Promise<ServiceResult>;
  updatePrompt(sessionId: string, pipeId: string, segmentId: string, tagId: string, prompt: string): Promise<ServiceResult>;
}

// ── Keyframe Service Interface ────────────────────────────────────────────────

export interface KeyframeService {
  add(
    sessionId: string,
    pipeId: string,
    slotIndex: number,
    frame: number,
    type: 'url' | 'txt2img' | 'img2img',
    value: string,
    referenceUrl?: string,
  ): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string, keyframeId: string): Promise<ServiceResult>;
  move(sessionId: string, pipeId: string, keyframeId: string, newFrame: number): Promise<ServiceResult>;
}

// ── Subject Reference Service Interface ─────────────────────────────────────

export interface SubjectReferenceService {
  add(
    sessionId: string,
    pipeId: string,
    imageUrl: string,
    useFrames: boolean,
    frameStart?: number,
    frameEnd?: number,
    /** Generation preset type (subjects follow keyframe rules; legacy = 'url') */
    type?: KeyframeType,
    /** Prompt for txt2img / img2img */
    prompt?: string,
  ): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string, refId: string): Promise<ServiceResult>;
  toggle(sessionId: string, pipeId: string, refId: string): Promise<ServiceResult>;
  updateRange(sessionId: string, pipeId: string, refId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  updateImageUrl(sessionId: string, pipeId: string, refId: string, imageUrl: string): Promise<ServiceResult>;
  updateUseFrames(sessionId: string, pipeId: string, refId: string, useFrames: boolean): Promise<ServiceResult>;
  /**
   * Atomic full update of a subject reference. Validates/clamps the frame
   * range against the pipe's own frame space, drops the temporal range when
   * useFrames is false, and applies everything as one logical mutation
   * returning a single aggregated ServiceResult.
   */
  update(
    sessionId: string,
    pipeId: string,
    refId: string,
    update: {
      imageUrl: string;
      useFrames: boolean;
      frameStart?: number;
      frameEnd?: number;
      type?: KeyframeType;
      prompt?: string;
    },
  ): Promise<ServiceResult>;
}

// ── Generation Result Service Interface ─────────────────────────────────────

export interface GenerationService {
  /** Attach (or replace) the last-generation artifact on a pipe. */
  attachLastGeneration(sessionId: string, pipeId: string, gen: PipeLastGeneration): Promise<ServiceResult>;
  /** Flip a keyframe or subject reference's generation status after a task terminal. */
  markRefStatus(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
    status: GenerationStatus,
  ): Promise<ServiceResult>;
  /**
   * Queue a piece for regeneration on the next run (status-dot click).
   * Non-destructive: the settled preview data is kept; the registry's
   * Ready-skip is overridden while the flag is set, and the flag is
   * cleared automatically when the fresh artifact is attached.
   */
  queueRefRegen(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
  ): Promise<ServiceResult>;
  /**
   * Cancel a queued regeneration (status-dot re-click while queued).
   * The settled asset keeps its validity; the flag just no longer overrides
   * the registry's Ready-skip on the next run.
   */
  clearRefRegen(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
  ): Promise<ServiceResult>;
  /**
   * Link a generated image back to its keyframe / subject: sets previewLocalPath
   * (UI preview + fallback source) and previewRemoteUrl (primary video-API
   * source). Persists via notifyUpdate → saveSession so it survives restarts.
   */
  attachGeneratedImage(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
    localPath: string,
    remoteUrl?: string,
  ): Promise<ServiceResult>;
}

// ── Session Service Interface ─────────────────────────────────────────────────

export interface SessionService {
  load(sessionId: string): Promise<ServiceResult & { session?: SessionData }>;
  save(sessionId: string): Promise<ServiceResult>;
  hydrate(sessions: SessionData[]): Promise<void>;
}

// ── Migration Service Interface ───────────────────────────────────────────────

export interface MigrationService {
  migratePipe(pipe: PipeRow): PipeRow;
}

// ── Store Interface ───────────────────────────────────────────────────────────

export interface ComposerStore {
  sessions: Map<string, SessionData>;
  unsynced: Set<string>;
  setOnUpdate(callback: (sessionId: string) => void): void;
}