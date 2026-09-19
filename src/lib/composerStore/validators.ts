// Frame validation utilities for composer timeline
// Encapsulates 8n+1 rule logic

import { snapTo8, snapTo8nPlus1, getMaxFrames } from '$lib/frameMath';
import { defaultResolutionFor } from '$lib/resolutionPresets';
import type { PipeRow, SessionData, TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_SEGMENT_SPAN = 8;

// ── Validation Functions ──────────────────────────────────────────────────────

export function validatePipeLength(frames: number, resolution: string): number {
  const maxFrames = getMaxFrames(resolution);
  const MIN_LENGTH = 41; // 8*5+1 = 41
  const snapped = snapTo8nPlus1(frames);
  return Math.max(MIN_LENGTH, Math.min(snapped, maxFrames));
}

export function validateSegmentFrames(
  start: number,
  end: number,
  maxSegmentEnd: number,
): { snapped: [number, number]; valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let snappedStart = snapTo8(start);
  let snappedEnd = snapTo8(end);

  // Snap to valid boundaries
  if (snappedStart < 0) {
    snappedStart = 0;
    errors.push('frameStart cannot be negative');
  }
  if (snappedEnd > maxSegmentEnd) {
    snappedEnd = maxSegmentEnd;
    errors.push(`frameEnd exceeds max (${maxSegmentEnd})`);
  }
  if (snappedEnd - snappedStart < MIN_SEGMENT_SPAN) {
    errors.push(`minimum segment span is ${MIN_SEGMENT_SPAN} frames`);
    // Try to fix by expanding
    if (snappedStart === snappedEnd) {
      snappedEnd = Math.min(snappedStart + MIN_SEGMENT_SPAN, maxSegmentEnd);
    }
  }

  return { snapped: [snappedStart, snappedEnd], valid: errors.length === 0, errors };
}

/**
 * Validate tag frames against parent segment bounds.
 */
export function validateTagFrames(
  start: number,
  end: number,
  parentStart: number,
  parentEnd: number,
  maxSegmentEnd: number,
): { snapped: [number, number]; valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let snappedStart = snapTo8(start);
  let snappedEnd = snapTo8(end);

  // Clamp to parent bounds
  if (snappedStart < parentStart) {
    snappedStart = parentStart;
    errors.push('Tag start cannot be before parent segment start');
  }
  if (snappedEnd > parentEnd) {
    snappedEnd = parentEnd;
    errors.push('Tag end cannot be after parent segment end');
  }
  if (snappedEnd <= snappedStart) {
    errors.push('Tag end must be greater than start');
    snappedEnd = Math.max(snappedStart + MIN_SEGMENT_SPAN, snappedEnd);
  }
  if (snappedEnd > maxSegmentEnd) {
    snappedEnd = snapTo8(maxSegmentEnd);
    errors.push('Tag end exceeds pipe max frame');
  }

  return { snapped: [snappedStart, snappedEnd], valid: errors.length === 0, errors };
}

export function validateKeyframeFrame(
  frame: number,
  maxFrame: number,
): { snapped: number; valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let snapped = snapTo8(frame);

  if (snapped < 0) {
    snapped = 0;
    errors.push('frame cannot be negative');
  }
  if (snapped > maxFrame) {
    snapped = snapTo8(maxFrame);
    errors.push(`frame exceeds pipe length (${maxFrame})`);
  }

  return { snapped, valid: errors.length === 0, errors };
}

export function validateQValue(qValue: number): number {
  return Math.max(5, Math.min(30, qValue));
}

export function validateCValue(cValue: number): number {
  return Math.max(0.5, Math.min(15, cValue));
}

export function generatePipeName(existingCount: number): string {
  return `Pipe ${existingCount + 1}`;
}

export function reindexPipes(pipes: any[]): void {
  pipes.forEach((p: any, i: number) => {
    p.orderIndex = i;
  });
}

/**
 * Normalize a raw (legacy or freshly-mapped) pipe into a valid PipeRow:
 * guarantees required arrays exist, required scalar fields have defaults,
 * and frame ranges are clamped into the pipe's own frame space. Prevents
 * "cannot read properties of undefined" crashes when the user re-enters an
 * app whose on-disk session data predates a data-shape change.
 */
/**
 * Normalize a raw (legacy or partial) session into a valid SessionData:
 * session-level scalars get defaults so the tools-panel selects (FPS etc.)
 * never render empty, `pipes` is guaranteed to be an array, and every pipe
 * is normalized. Composes normalizePipe — safe to run in place on any
 * session object (store hydration, localStorage legacy data, backend maps).
 */
export function normalizeSession(session: SessionData): SessionData {
  if (!session.name) session.name = 'Session';
  if (!Array.isArray(session.pipes)) session.pipes = [];
  for (const pipe of session.pipes) normalizePipe(pipe);
  if (!Number.isFinite(session.fps) || (session.fps as number) <= 0) session.fps = 24;
  // Missing resolution defaults to the orientation's generation preset
  // (placeholder — provider settings will own these values later).
  if (!session.resolution) session.resolution = defaultResolutionFor(session.orientation) ?? '720p';
  if (!session.orientation) session.orientation = 'horizontal';
  if (session.totalGeneratedFrames === undefined || session.totalGeneratedFrames === null) {
    session.totalGeneratedFrames = 0;
  }
  return session;
}

export function normalizePipe(pipe: PipeRow): PipeRow {
  // Ensure structural arrays exist (legacy sessions may lack them).
  if (!Array.isArray(pipe.keyframes)) pipe.keyframes = [];
  if (!Array.isArray(pipe.subjectReferences)) pipe.subjectReferences = [];
  if (!Array.isArray(pipe.elements)) pipe.elements = [];

  // Required scalars with sane defaults.
  if (!Number.isFinite(pipe.lengthFrames) || pipe.lengthFrames < 41) {
    pipe.lengthFrames = pipe.lengthFrames && pipe.lengthFrames > 1 ? Math.round(pipe.lengthFrames) : 241;
  }
  if (!Number.isFinite(pipe.qValue)) pipe.qValue = 18;
  if (!Number.isFinite(pipe.cValue)) pipe.cValue = 7;
  if (pipe.orderIndex === undefined || pipe.orderIndex === null) pipe.orderIndex = 0;
  if (pipe.id === undefined || pipe.id === null || pipe.id === '') {
    pipe.id = crypto.randomUUID();
  }
  if (!pipe.name) pipe.name = 'Pipe';
  // Media mode (docs/agnes-model-catalog.md, Q7): legacy pipes default to
  // 'keyframes'; any unknown value coerces back.
  if (pipe.mediaMode !== 'reference') pipe.mediaMode = 'keyframes';

  // Ensure each element has a valid id so keys/stores don't get 'undefined'.
  for (const el of pipe.elements as any[]) {
    if (!el.id) el.id = crypto.randomUUID();
    if (el.tag === 'timeline') {
      if (!Array.isArray(el.segments)) el.segments = [];
      for (const seg of el.segments) {
        if (!seg.id) seg.id = crypto.randomUUID();
        if (!Number.isFinite(seg.frameStart)) seg.frameStart = 0;
        if (!Number.isFinite(seg.frameEnd)) seg.frameEnd = pipe.lengthFrames - 1;
        if (seg.frameStart < 0) seg.frameStart = 0;
        if (seg.frameEnd > pipe.lengthFrames - 1) seg.frameEnd = pipe.lengthFrames - 1;
        if (!Array.isArray(seg.tags)) seg.tags = [];
        for (const tag of seg.tags) {
          if (!tag.id) tag.id = crypto.randomUUID();
          // Tag ranges must stay within the parent segment and the pipe.
          if (!Number.isFinite(tag.frameStart) || tag.frameStart < seg.frameStart) tag.frameStart = seg.frameStart;
          if (!Number.isFinite(tag.frameEnd) || tag.frameEnd > Math.min(seg.frameEnd, pipe.lengthFrames - 1)) tag.frameEnd = seg.frameEnd;
          if (tag.frameEnd <= tag.frameStart) tag.frameEnd = Math.min(tag.frameStart + 8, seg.frameEnd);
          if (tag.spec === undefined || tag.spec === null) tag.spec = TAG_SPECIFICATIONS[tag.tag as TagType];
        }
      }
    } else if (el.tag === 'global_style' || el.tag === 'sound') {
      if (!Number.isFinite(el.frameStart) || el.frameStart < 0) el.frameStart = 0;
      if (!Number.isFinite(el.frameEnd) || el.frameEnd > pipe.lengthFrames - 1) el.frameEnd = pipe.lengthFrames - 1;
      if (el.enabled === undefined || el.enabled === null) el.enabled = true;
      // Prompt fallback: a legacy global element may carry only `value`.
      if (el.tag === 'global_style' && el.prompt === undefined && el.value !== undefined && el.value !== null) {
        el.prompt = String(el.value);
      }
    }
  }

  // Keyframe frames within pipe bounds.
  for (const kf of pipe.keyframes) {
    if (!Number.isFinite(kf.frame) || kf.frame < 0) kf.frame = 0;
    if (kf.frame > pipe.lengthFrames - 1) kf.frame = pipe.lengthFrames - 1;
    if (!kf.id) kf.id = crypto.randomUUID();
    if (!Number.isFinite(kf.slotIndex)) kf.slotIndex = 1;
    if (!kf.status) kf.status = 'pending';
  }

  // Subject-ref frame ranges within pipe bounds.
  for (const ref of pipe.subjectReferences) {
    if (!ref.id) ref.id = crypto.randomUUID();
    if (!ref.imageUrl) ref.imageUrl = '';
    if (ref.visible === undefined) ref.visible = true;
    if (ref.useFrames && (ref.frameStart !== undefined || ref.frameEnd !== undefined)) {
      if (!Number.isFinite(ref.frameStart) || ref.frameStart === undefined || ref.frameStart < 0) ref.frameStart = 0;
      if (!Number.isFinite(ref.frameEnd) || ref.frameEnd === undefined) ref.frameEnd = pipe.lengthFrames - 1;
      if (ref.frameEnd! > pipe.lengthFrames - 1) ref.frameEnd = pipe.lengthFrames - 1;
      if (ref.frameEnd! <= ref.frameStart!) ref.frameEnd = ref.frameStart! + 8;
    }
  }

  return pipe;
}
