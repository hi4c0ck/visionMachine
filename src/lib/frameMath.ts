// Frame math utilities for VisionMachine composer timeline
//
// 8n+1 rule:
//   - Total frames per pipe: 8n+1 (1, 9, 17, ..., 241, 441)
//   - Segment boundaries (frameStart / frameEnd): must be multiples of 8
//     → valid starts: 0, 8, 16, 24, ...
//     → valid ends:   8, 16, 24, 32, ...
//   - Last possible segment end = totalFrames - 1  (the +1 frame is never used for content)
//     e.g. for 241 total → last segment ends at 240
//   - Minimum span: 8 frames (one inference batch)

import { snapFrameDown, FRAME_STEP } from './frameGeometry';

/**
 * @deprecated Use snapFrameDown from './frameGeometry' instead.
 */
export const snapTo8 = snapFrameDown;

/**
 * Minimum zone span at CREATION: ≈1s of footage at the session fps,
 * snapped up to the 8-frame grid (24fps→24, 18fps→24, 30fps→32, 60fps→64).
 * Sub-1s zones stay reachable via drag-resize (8-frame engine floor),
 * not via zone creation.
 */
export function minZoneSpan(fps: number): number {
  const effective = fps > 0 ? fps : 8;
  return Math.ceil(effective / 8) * 8;
}

/**
 * Snap a total frame count to the nearest valid 8n+1 value.
 */
export function snapTo8nPlus1(frame: number): number {
  if (frame <= 0) return 1;
  const n = Math.ceil((frame - 1) / 8);
  return 8 * n + 1;
}

/**
 * Check if a segment boundary (start/end) is valid — must be a multiple of 8.
 */
export function isValidSegmentBoundary(frame: number): boolean {
  return frame >= 0 && frame % 8 === 0;
}

/**
 * Check if a total frame count is valid (8n+1).
 */
export function isValidFrameCount(frame: number): boolean {
  return frame >= 1 && (frame - 1) % 8 === 0;
}

/**
 * Clamp a frame length to valid 8n+1 range for given resolution.
 */
export function clampLength(length: number, maxFrames: number): number {
  const MIN_LENGTH = 41; // 8*5+1 = 41
  const snapped = snapTo8nPlus1(length);
  return Math.max(MIN_LENGTH, Math.min(snapped, maxFrames));
}

/**
 * Get the maximum usable frame for a segment end.
 */
export function getMaxSegmentEnd(totalFrames: number): number {
  return totalFrames - 1;
}

/**
 * @deprecated Use framePercent from './frameGeometry' instead.
 */
export function frameToPercent(frame: number, totalFrames: number): number {
  return (frame / (totalFrames - 1)) * 100;
}

/**
 * @deprecated Use pxToFrame from './frameGeometry' instead.
 */
export function percentToFrame(xPercent: number, totalFrames: number): number {
  const raw = (xPercent / 100) * (totalFrames - 1);
  return snapFrameDown(Math.round(raw));
}

/**
 * Check if two ranges overlap.
 */
export function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Check if a child range is fully contained within a parent range.
 */
export function isRangeContained(childStart: number, childEnd: number, parentStart: number, parentEnd: number): boolean {
  return childStart >= parentStart && childEnd <= parentEnd;
}

/**
 * Check if two ranges overlap (for timeline segments).
 * Touching boundaries are considered overlapping (not allowed).
 */
export function rangesOverlapStrict(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Find the next available non-overlapping range after a given frame.
 * Returns [start, end] or null if no space available.
 */
export function getNextAvailableRange(
  existingSegments: Array<{ frameStart: number; frameEnd: number }>,
  totalFrames: number,
  minSpan: number = 8
): { start: number; end: number } | null {
  const gaps = getFreeGaps(existingSegments, totalFrames, minSpan);
  return gaps.length > 0 ? gaps[0] : null;
}

export interface FreeGap {
  /** First usable frame in the gap (multiple of 8, or 0). */
  start: number;
  /** Last usable frame in the gap (multiple of 8, ≤ totalFrames-1). */
  end: number;
  /** Where this gap is, for the UI to label it. */
  label: string;
}

/**
 * Enumerate EVERY free gap that can hold a zone of at least `minSpan` frames:
 * before the first zone, between zones, and after the last zone. This is what
 * the "+ Zone" picker offers — a user can insert a zone into any allowed free
 * space, not just the first one `getNextAvailableRange` returns.
 *
 * A gap [gStart, gEnd] is usable when gEnd - gStart >= minSpan (it can host a
 * min-span zone). End-to-end packed zones leave no usable gap → empty list.
 */
export function getFreeGaps(
  existingSegments: Array<{ frameStart: number; frameEnd: number }>,
  totalFrames: number,
  minSpan: number = 8
): FreeGap[] {
  const maxEnd = totalFrames - 1;
  const sorted = [...existingSegments].sort((a, b) => a.frameStart - b.frameStart);
  const gaps: FreeGap[] = [];

  // Space before the first zone (only when a zone actually exists).
  if (sorted.length > 0) {
    const beforeStart = 0;
    const beforeEnd = sorted[0].frameStart;
    if (beforeEnd - beforeStart >= minSpan) {
      gaps.push({ start: beforeStart, end: beforeEnd, label: 'Before Zone 1' });
    }
  }

  // Gaps between zones.
  for (let i = 0; i < sorted.length - 1; i++) {
    const gStart = sorted[i].frameEnd;
    const gEnd = sorted[i + 1].frameStart;
    if (gEnd - gStart >= minSpan) {
      gaps.push({ start: gStart, end: gEnd, label: `Between Zone ${i + 1} & ${i + 2}` });
    }
  }

  // Space after the last zone.
  const afterStart = sorted.length > 0 ? sorted[sorted.length - 1].frameEnd : 0;
  if (maxEnd - afterStart >= minSpan) {
    gaps.push({ start: afterStart, end: maxEnd, label: 'After last zone' });
  }

  return gaps;
}

/**
 * Pick the frame span for a new tag of a given type within its parent zone,
 * so that tags of the same type NEVER overlap.
 *
 * Option (c): if the zone is empty of this type, the tag spans the whole
 * zone (the common case). Otherwise the tag is placed in the first free slot
 * (≥ minSpan) left inside the zone by the existing tags of this type. If no
 * slot is free, returns null → the caller surfaces "no free slot" instead of
 * silently stacking a duplicate.
 */
export function placeTagInZone(
  zone: { frameStart: number; frameEnd: number },
  existingSameType: Array<{ frameStart: number; frameEnd: number }>,
  minSpan: number = 8
): { start: number; end: number } | null {
  if (existingSameType.length === 0) {
    return { start: zone.frameStart, end: zone.frameEnd };
  }
  const sorted = [...existingSameType].sort((a, b) => a.frameStart - b.frameStart);
  // Walk left→right: leading gap, then between each pair.
  let cursor = zone.frameStart;
  for (const tag of sorted) {
    if (tag.frameStart - cursor >= minSpan) {
      return { start: cursor, end: tag.frameStart };
    }
    cursor = Math.max(cursor, tag.frameEnd);
  }
  // Trailing gap after the last tag.
  if (zone.frameEnd - cursor >= minSpan) {
    return { start: cursor, end: zone.frameEnd };
  }
  return null;
}

/**
 * Split a zone into `parts` contiguous even parts, boundaries on the 8-grid,
 * every part ≥ minSpan. Used as the fallback when a zone is FULL of one tag
 * type (no free slot): instead of rejecting the new tag, all same-type tags
 * (existing + new) are redistributed evenly so they share the zone.
 *
 * Returns the part ranges, or null when the zone is physically too small to
 * hold `parts` tags of minSpan frames.
 */
export function evenSplitZone(
  zone: { frameStart: number; frameEnd: number },
  parts: number,
  minSpan: number = 8,
): Array<{ start: number; end: number }> | null {
  if (parts < 1) return null;
  const zs = zone.frameStart;
  const ze = zone.frameEnd;
  const span = ze - zs;
  const boundaries: number[] = [zs];
  for (let i = 1; i < parts; i++) {
    const ideal = zs + (span * i) / parts;
    const b = Math.round(ideal / 8) * 8; // snap to the 8-grid
    if (b - boundaries[boundaries.length - 1] < minSpan) return null; // previous part too small
    boundaries.push(b);
  }
  if (ze - boundaries[boundaries.length - 1] < minSpan) return null; // last part too small
  const result: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < parts; i++) {
    result.push({ start: boundaries[i], end: boundaries[i + 1] ?? ze });
  }
  return result;
}

/**
 * Validate segments for overlaps, bounds, and min-span rules.
 */
export function validateSegments(
  segments: Array<{ frameStart: number; frameEnd: number; tag?: string }>,
  maxSegmentEnd: number,
  minSpan: number = 8
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    if (!isValidSegmentBoundary(seg.frameStart)) {
      errors.push(`Segment ${i}: frameStart must be a multiple of 8`);
    }
    if (!isValidSegmentBoundary(seg.frameEnd)) {
      errors.push(`Segment ${i}: frameEnd must be a multiple of 8`);
    }
    if (seg.frameStart < 0) {
      errors.push(`Segment ${i}: frameStart must be >= 0`);
    }
    if (seg.frameEnd > maxSegmentEnd) {
      errors.push(`Segment ${i}: frameEnd must be <= ${maxSegmentEnd}`);
    }
    if (seg.frameEnd - seg.frameStart < minSpan) {
      errors.push(`Segment ${i}: minimum span is ${minSpan} frames`);
    }
  }
  
  // Check for overlaps between segments
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (rangesOverlap(a.frameStart, a.frameEnd, b.frameStart, b.frameEnd)) {
        errors.push(`Overlap detected between segments ${i} and ${j}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a keyframe.
 */
export function validateKeyframe(kf: {
  frame?: number;
  slot_index?: number;
  type?: string;
  imageSrc?: string;
  prompt?: string;
  referenceUrl?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (kf.frame === undefined || kf.frame === null || kf.frame < 0) {
    errors.push('Keyframe requires a valid frame position');
  } else if (kf.frame % 8 !== 0) {
    errors.push('Keyframe POSITION must be a multiple of 8 (e.g. 0, 8, 16)');
  }
  
  if (kf.slot_index !== undefined && kf.slot_index !== null) {
    if (kf.slot_index < 1 || kf.slot_index > 3) {
      errors.push('Keyframe slot must be 1, 2, or 3');
    }
  }
  
  switch (kf.type) {
    case 'url':
      if (!kf.imageSrc || kf.imageSrc.trim() === '') {
        errors.push('URL keyframe requires image source');
      }
      break;
    case 'txt2img':
      if (!kf.prompt || kf.prompt.trim() === '') {
        errors.push('Text-to-image keyframe requires prompt');
      }
      break;
    case 'img2img':
      if (!kf.referenceUrl || kf.referenceUrl.trim() === '') {
        errors.push('Image-to-image keyframe requires reference URL');
      }
      break;
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate tag frames against parent segment bounds.
 */
export function validateTagFrames(
  start: number,
  end: number,
  parentStart: number,
  parentEnd: number,
  maxSegmentEnd: number
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
    snappedEnd = Math.max(snappedStart + 8, snappedEnd);
  }
  if (snappedEnd > maxSegmentEnd) {
    snappedEnd = snapTo8(maxSegmentEnd);
    errors.push('Tag end exceeds pipe max frame');
  }
  
  return { snapped: [snappedStart, snappedEnd], valid: errors.length === 0, errors };
}

/**
 * Snap a proposed segment end down to a valid multiple of 8.
 */
export function snapSegmentEnd(end: number, maxSegmentEnd: number): number {
  return Math.min(snapTo8(end), maxSegmentEnd);
}

/**
 * Get max frames for a resolution preset.
 */
export function getMaxFrames(resolution: string): number {
  switch (resolution) {
    case '480p': return 441;
    case '720p': return 241;
    case '1080p': return 121;
    default: return 241;
  }
}
