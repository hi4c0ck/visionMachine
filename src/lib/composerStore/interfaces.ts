// Composer Service Interfaces
// Interface Segregation + Service Layer Pattern

import type {
  SessionData,
  PipeRow,
  TagType,
  PipeKeyframe,
  GlobalElement,
  TimelineElement,
  Segment,
  TagElement,
  ResolutionPreset,
  SubjectReference,
} from '$types';

// ── Result Type ───────────────────────────────────────────────────────────────

export interface ServiceResult {
  errors: string[];
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
  ): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string, keyframeId: string): Promise<ServiceResult>;
  move(sessionId: string, pipeId: string, keyframeId: string, newFrame: number): Promise<ServiceResult>;
}

// ── Subject Reference Service Interface ──────────────────────────────────────

export interface SubjectReferenceService {
  add(sessionId: string, pipeId: string, imageUrl: string, useFrames: boolean, frameStart?: number, frameEnd?: number): Promise<ServiceResult>;
  remove(sessionId: string, pipeId: string, refId: string): Promise<ServiceResult>;
  toggle(sessionId: string, pipeId: string, refId: string): Promise<ServiceResult>;
  updateRange(sessionId: string, pipeId: string, refId: string, frameStart: number, frameEnd: number): Promise<ServiceResult>;
  updateImageUrl(sessionId: string, pipeId: string, refId: string, imageUrl: string): Promise<ServiceResult>;
  updateUseFrames(sessionId: string, pipeId: string, refId: string, useFrames: boolean): Promise<ServiceResult>;
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