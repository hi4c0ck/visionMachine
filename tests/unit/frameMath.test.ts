/**
 * Unit tests for frameMath.ts utilities
 *
 * 8n+1 rule:
 *   - Total frames (pipe length): 8n+1 → {1, 9, 17, 25, ..., 121, 241, 441}
 *   - Segment boundaries (start/end): multiples of 8 → {0, 8, 16, 24, ...}
 *   - Last valid segment end = totalFrames - 1 (the +1 frame is spare)
 *     e.g. total=241 → last end=240; total=121 → last end=120
 *   - Min span: 8 frames
 */
import { describe, it, expect } from 'vitest';
import {
  snapTo8,
  snapTo8nPlus1,
  clampLength,
  validateSegments,
  validateKeyframe,
  frameToX,
  xToFrame,
  getMaxFrames,
  getMaxSegmentEnd,
  isValidSegmentBoundary,
  isValidFrameCount,
} from '../../src/lib/frameMath';

// ── snapTo8 ──────────────────────────────────────────────────────────────────

describe('snapTo8', () => {
  it('should snap down to nearest multiple of 8', () => {
    expect(snapTo8(0)).toBe(0);
    expect(snapTo8(1)).toBe(0);
    expect(snapTo8(7)).toBe(0);
    expect(snapTo8(8)).toBe(8);
    expect(snapTo8(9)).toBe(8);
    expect(snapTo8(15)).toBe(8);
    expect(snapTo8(16)).toBe(16);
    expect(snapTo8(240)).toBe(240);
    expect(snapTo8(241)).toBe(240);
  });
});

// ── snapTo8nPlus1 ────────────────────────────────────────────────────────────

describe('snapTo8nPlus1', () => {
  it('should return smallest 8n+1 >= frame', () => {
    expect(snapTo8nPlus1(0)).toBe(1);    // 8*0+1
    expect(snapTo8nPlus1(1)).toBe(1);    // already valid
    expect(snapTo8nPlus1(2)).toBe(9);    // next 8n+1 after 1
    expect(snapTo8nPlus1(9)).toBe(9);    // already valid
    expect(snapTo8nPlus1(10)).toBe(17);
    expect(snapTo8nPlus1(17)).toBe(17);
    expect(snapTo8nPlus1(121)).toBe(121);
    expect(snapTo8nPlus1(241)).toBe(241);
    expect(snapTo8nPlus1(441)).toBe(441);
  });
});

// ── isValidSegmentBoundary / isValidFrameCount ───────────────────────────────

describe('boundary validators', () => {
  it('isValidSegmentBoundary: multiples of 8', () => {
    expect(isValidSegmentBoundary(0)).toBe(true);
    expect(isValidSegmentBoundary(8)).toBe(true);
    expect(isValidSegmentBoundary(16)).toBe(true);
    expect(isValidSegmentBoundary(240)).toBe(true);
    expect(isValidSegmentBoundary(1)).toBe(false);
    expect(isValidSegmentBoundary(9)).toBe(false);
    expect(isValidSegmentBoundary(241)).toBe(false);
  });

  it('isValidFrameCount: 8n+1 values', () => {
    expect(isValidFrameCount(1)).toBe(true);
    expect(isValidFrameCount(9)).toBe(true);
    expect(isValidFrameCount(17)).toBe(true);
    expect(isValidFrameCount(121)).toBe(true);
    expect(isValidFrameCount(241)).toBe(true);
    expect(isValidFrameCount(441)).toBe(true);
    expect(isValidFrameCount(0)).toBe(false);
    expect(isValidFrameCount(8)).toBe(false);
    expect(isValidFrameCount(10)).toBe(false);
  });
});

// ── clampLength ──────────────────────────────────────────────────────────────

describe('clampLength', () => {
  it('should clamp to minimum of 41', () => {
    expect(clampLength(0, 241)).toBe(41);
    expect(clampLength(10, 241)).toBe(41);
    expect(clampLength(40, 241)).toBe(41);
    expect(clampLength(41, 241)).toBe(41);
  });

  it('should clamp to maximum 8n+1 value', () => {
    expect(clampLength(300, 241)).toBe(241);
    expect(clampLength(500, 441)).toBe(441);
    expect(clampLength(150, 121)).toBe(121);
  });

  it('should snap up to valid 8n+1', () => {
    // 42 → next 8n+1 is 49? No: ceil((42-1)/8)=ceil(5.125)=6, 8*6+1=49
    expect(clampLength(42, 241)).toBe(49);
  });
});

// ── getMaxSegmentEnd ─────────────────────────────────────────────────────────

describe('getMaxSegmentEnd', () => {
  it('should return totalFrames - 1', () => {
    expect(getMaxSegmentEnd(1)).toBe(0);
    expect(getMaxSegmentEnd(9)).toBe(8);
    expect(getMaxSegmentEnd(17)).toBe(16);
    expect(getMaxSegmentEnd(121)).toBe(120);
    expect(getMaxSegmentEnd(241)).toBe(240);
    expect(getMaxSegmentEnd(441)).toBe(440);
  });
});

// ── validateSegments ─────────────────────────────────────────────────────────

describe('validateSegments', () => {
  const maxEnd121 = getMaxSegmentEnd(121); // 120
  const maxEnd241 = getMaxSegmentEnd(241); // 240

  it('should accept valid segments within bounds', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: 0, frameEnd: 48, spec: { color: '#fff', name: 'Scene' } },
      { id: '2', tag: 'camera', value: 45, prompt: '', frameStart: 48, frameEnd: 96, spec: { color: '#fff', name: 'Camera' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(true);
  });

  it('should reject overlapping same-tag segments', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: 0, frameEnd: 64, spec: { color: '#fff', name: 'Scene' } },
      { id: '2', tag: 'scene', value: 1, prompt: 'test2', frameStart: 56, frameEnd: 104, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('overlap'))).toBe(true);
  });

  it('should allow touching same-tag segments (no overlap)', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'a', frameStart: 0, frameEnd: 48, spec: { color: '#fff', name: 'Scene' } },
      { id: '2', tag: 'scene', value: 1, prompt: 'b', frameStart: 48, frameEnd: 96, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(true);
  });

  it('should reject frameEnd exceeding maxSegmentEnd', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: 0, frameEnd: 121, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('240') || e.includes('max usable'))).toBe(true);
  });

  it('should reject non-multiple-of-8 boundaries', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: 1, frameEnd: 49, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('multiple of 8'))).toBe(true);
  });

  it('should reject segments with span less than 8 frames', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: 0, frameEnd: 7, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('minimum span'))).toBe(true);
  });

  it('should accept span of exactly 8 frames', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: 0, frameEnd: 8, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd241);
    expect(result.valid).toBe(true);
  });

  it('should reject negative frameStart', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'test', frameStart: -8, frameEnd: 0, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd121);
    expect(result.valid).toBe(false);
  });

  it('should accept valid segments near boundary for 241-total pipe', () => {
    const segments = [
      { id: '1', tag: 'scene', value: 0, prompt: 'a', frameStart: 0, frameEnd: 240, spec: { color: '#fff', name: 'Scene' } },
    ];
    const result = validateSegments(segments, maxEnd241);
    expect(result.valid).toBe(true);
  });
});

// ── validateKeyframe ─────────────────────────────────────────────────────────

describe('validateKeyframe', () => {
  it('should accept valid url keyframe at frame 8', () => {
    const kf = { id: '1', frame: 8, type: 'url' as const, imageSrc: 'https://example.com/img.jpg', status: 'pending' };
    expect(validateKeyframe(kf).valid).toBe(true);
  });

  it('should reject url keyframe without source', () => {
    const kf = { id: '1', frame: 8, type: 'url' as const, status: 'pending' };
    expect(validateKeyframe(kf).valid).toBe(false);
  });

  it('should reject img2img keyframe without referenceUrl', () => {
    const kf = { id: '1', frame: 8, type: 'img2img' as const, status: 'pending' };
    expect(validateKeyframe(kf).valid).toBe(false);
  });

  it('should reject keyframe at invalid frame (not multiple of 8)', () => {
    // Frame 9 is NOT a multiple of 8 (valid are 0, 8, 16, 24, ...)
    const kf = { id: '1', frame: 9, type: 'url' as const, imageSrc: 'https://example.com/img.jpg', status: 'pending' };
    expect(validateKeyframe(kf).valid).toBe(false);
  });

  it('should accept keyframe at frame 0', () => {
    const kf = { id: '1', frame: 0, type: 'url' as const, imageSrc: 'https://example.com/img.jpg', status: 'pending' };
    expect(validateKeyframe(kf).valid).toBe(true);
  });

  it('should accept keyframe at frame 240 (multiple of 8)', () => {
    const kf = { id: '1', frame: 240, type: 'url' as const, imageSrc: 'https://example.com/img.jpg', status: 'pending' };
    expect(validateKeyframe(kf).valid).toBe(true);
  });
});

// ── frameToX / xToFrame ──────────────────────────────────────────────────────

describe('frameToX / xToFrame', () => {
  it('should convert frame to percentage using totalFrames-1 as denominator', () => {
    // frame 0 → 0%, frame 120 → 100% (for totalFrames=121, denom=120)
    expect(frameToX(0, 121)).toBe(0);
    expect(frameToX(120, 121)).toBe(100);
    expect(frameToX(60, 121)).toBeCloseTo(50, 1);
  });

  it('should convert percentage back to snapped multiple of 8', () => {
    // xToFrame snaps to snapTo8 (multiple of 8)
    expect(xToFrame(0, 121)).toBe(0);
    // 50% of 120 = 60 → snapTo8(60) = 56
    expect(xToFrame(50, 121)).toBe(56);
    expect(xToFrame(100, 121)).toBe(120);
  });
});

// ── getMaxFrames ──────────────────────────────────────────────────────────────

describe('getMaxFrames', () => {
  it('should return correct 8n+1 total for each resolution', () => {
    expect(getMaxFrames('480p')).toBe(441);  // 8*55+1
    expect(getMaxFrames('720p')).toBe(241);  // 8*30+1
    expect(getMaxFrames('1080p')).toBe(121); // 8*15+1
  });
});
