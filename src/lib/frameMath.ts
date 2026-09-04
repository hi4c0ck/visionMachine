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

/**
 * Snap a frame number DOWN to the nearest multiple of 8.
 */
export function snapTo8(frame: number): number {
  return Math.floor(frame / 8) * 8;
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
 * Convert frame to x-coordinate percentage for rendering.
 * Uses (totalFrames - 1) as denominator since last frame is never used for content.
 */
export function frameToPercent(frame: number, totalFrames: number): number {
  return (frame / (totalFrames - 1)) * 100;
}

/**
 * Convert x-coordinate percentage back to a snapped frame position.
 */
export function percentToFrame(xPercent: number, totalFrames: number): number {
  const raw = (xPercent / 100) * (totalFrames - 1);
  return snapTo8(Math.round(raw));
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
  const maxEnd = totalFrames - 1;
  
  // Sort by start frame
  const sorted = [...existingSegments].sort((a, b) => a.frameStart - b.frameStart);
  
  // Try to fit before first segment
  if (sorted.length === 0 || sorted[0].frameStart >= minSpan) {
    return { start: 0, end: Math.min(minSpan, maxEnd) };
  }
  
  // Try gaps between segments
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].frameEnd;
    const gapEnd = sorted[i + 1].frameStart;
    if (gapEnd - gapStart >= minSpan) {
      return { start: gapStart, end: Math.min(gapStart + minSpan, gapEnd) };
    }
  }
  
  // Try after last segment
  const lastEnd = sorted[sorted.length - 1].frameEnd;
  if (lastEnd < maxEnd) {
    return { start: lastEnd, end: Math.min(lastEnd + minSpan, maxEnd) };
  }
  
  return null;
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
