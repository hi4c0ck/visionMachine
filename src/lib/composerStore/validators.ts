// Frame validation utilities for composer timeline
// Encapsulates 8n+1 rule logic

import { snapTo8, getMaxFrames } from '$lib/frameMath';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_SEGMENT_SPAN = 8;
const MIN_PIPE_LENGTH = 41; // 8*5+1

// ── Validation Functions ──────────────────────────────────────────────────────

export function validatePipeLength(frames: number, resolution: string): number {
  const maxFrames = getMaxFrames(resolution);
  return Math.max(MIN_PIPE_LENGTH, Math.min(maxFrames, frames));
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
