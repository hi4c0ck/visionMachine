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
  frameToPercent,
  percentToFrame,
  getMaxFrames,
  getMaxSegmentEnd,
  isValidSegmentBoundary,
  isValidFrameCount,
  getFreeGaps,
  placeTagInZone,
  evenSplitZone,
  minZoneSpan,
} from '../../src/lib/frameMath';

// ── minZoneSpan ──────────────────────────────────────────────────────────────

describe('minZoneSpan', () => {
  it('snaps the 1s floor up to the 8-grid for each fps', () => {
    expect(minZoneSpan(18)).toBe(24); // ceil(18/8)*8 = 3*8
    expect(minZoneSpan(24)).toBe(24); // exactly 3*8
    expect(minZoneSpan(30)).toBe(32); // ceil(30/8)*8 = 4*8
    expect(minZoneSpan(48)).toBe(48); // exactly 6*8
    expect(minZoneSpan(60)).toBe(64); // ceil(60/8)*8 = 8*8
  });

  it('never drops below the 8-frame engine floor', () => {
    expect(minZoneSpan(1)).toBe(8);
    expect(minZoneSpan(0)).toBe(8);
    expect(minZoneSpan(8)).toBe(8);
  });
});

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
    expect(result.errors.some(e => e.includes('120') || e.includes('max usable'))).toBe(true);
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

// ── frameToPercent / percentToFrame ───────────────────────────────────────────

describe('frameToPercent / percentToFrame', () => {
  it('should convert frame to percentage using totalFrames-1 as denominator', () => {
    // frame 0 → 0%, frame 120 → 100% (for totalFrames=121, denom=120)
    expect(frameToPercent(0, 121)).toBe(0);
    expect(frameToPercent(120, 121)).toBe(100);
    expect(frameToPercent(60, 121)).toBeCloseTo(50, 1);
  });

  it('should convert percentage back to snapped multiple of 8', () => {
    // percentToFrame snaps to snapTo8 (multiple of 8)
    expect(percentToFrame(0, 121)).toBe(0);
    // 50% of 120 = 60 → snapTo8(60) = 56
    expect(percentToFrame(50, 121)).toBe(56);
    expect(percentToFrame(100, 121)).toBe(120);
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

// ── getFreeGaps ──────────────────────────────────────────────────────────────

describe('getFreeGaps', () => {
  const seg = (s: number, e: number) => ({ frameStart: s, frameEnd: e });

  it('enumerates a single gap when the pipe is empty', () => {
    const gaps = getFreeGaps([], 241, 8);
    expect(gaps).toHaveLength(1);
    // Empty pipe → the whole 0..maxEnd range is one gap, labeled as "after".
    expect(gaps[0]).toMatchObject({ start: 0, end: 240 });
    expect(gaps[0].label).toBe('After last zone');
  });

  it('finds gaps before, between, and after zones', () => {
    // Zones 40–60 and 100–120 on a 241-frame pipe (maxEnd 240).
    const gaps = getFreeGaps([seg(40, 60), seg(100, 120)], 241, 8);
    const labels = gaps.map((g) => g.label);
    expect(labels).toContain('Before Zone 1');
    expect(labels).toContain('Between Zone 1 & 2');
    expect(labels).toContain('After last zone');
    // The between-zone gap spans 60..100 → start 60, end 100.
    const between = gaps.find((g) => g.label === 'Between Zone 1 & 2')!;
    expect(between.start).toBe(60);
    expect(between.end).toBe(100);
  });

  it('skips a too-small between-zone gap', () => {
    // Zones 0–40 and 40–80 are end-to-end → no usable gap between them.
    const gaps = getFreeGaps([seg(0, 40), seg(40, 80)], 241, 8);
    expect(gaps.map((g) => g.label)).not.toContain('Between Zone 1 & 2');
    // The only free space is after zone 2 (80..240).
    expect(gaps.map((g) => g.label)).toContain('After last zone');
  });

  it('returns no gaps when zones are packed end-to-end', () => {
    // 0–80, 80–160, 160–240 fills the whole 241-frame pipe (maxEnd 240).
    const gaps = getFreeGaps([seg(0, 80), seg(80, 160), seg(160, 240)], 241, 8);
    expect(gaps).toHaveLength(0);
  });

  it('respects a custom min span', () => {
    // A 16-frame between-zone gap only qualifies at minSpan 16, not 24.
    const gapsAt16 = getFreeGaps([seg(0, 80), seg(96, 176)], 241, 16);
    expect(gapsAt16.map((g) => g.label)).toContain('Between Zone 1 & 2');
    const gapsAt24 = getFreeGaps([seg(0, 80), seg(96, 176)], 241, 24);
    expect(gapsAt24.map((g) => g.label)).not.toContain('Between Zone 1 & 2');
  });
});

// ── placeTagInZone ───────────────────────────────────────────────────────────

describe('placeTagInZone', () => {
  const zone = (s: number, e: number) => ({ frameStart: s, frameEnd: e });
  const range = (s: number, e: number) => ({ frameStart: s, frameEnd: e });

  it('spans the whole zone when no same-type tags exist', () => {
    // The common case: first tag of a type in a zone owns the full span.
    expect(placeTagInZone(zone(0, 120), [], 8)).toEqual({ start: 0, end: 120 });
  });

  it('drops into the leading gap when one exists', () => {
    // Zone 0–120 with a same-type tag at 40–80 → the leading gap 0–40 fits.
    expect(placeTagInZone(zone(0, 120), [range(40, 80)], 8)).toEqual({ start: 0, end: 40 });
  });

  it('drops into the middle gap between two tags', () => {
    // Tags at 0–40 and 80–120 → middle gap 40–80 is the first usable slot.
    const slot = placeTagInZone(zone(0, 120), [range(0, 40), range(80, 120)], 8);
    expect(slot).toEqual({ start: 40, end: 80 });
  });

  it('drops into the trailing gap when only that fits', () => {
    // Tag at 0–40 → leading gap is 0 (size 0), middle none, trailing 40–120 fits.
    const slot = placeTagInZone(zone(0, 120), [range(0, 40)], 8);
    expect(slot).toEqual({ start: 40, end: 120 });
  });

  it('returns null when the zone is packed with same-type tags', () => {
    // 0–40, 40–80, 80–120 → no gap ≥ 8 frames anywhere → reject.
    expect(placeTagInZone(zone(0, 120), [range(0, 40), range(40, 80), range(80, 120)], 8)).toBeNull();
  });

  it('rejects a packed zone even when the tags are out of order', () => {
    // Same as above but the list is not pre-sorted — the function must sort.
    expect(placeTagInZone(zone(0, 120), [range(80, 120), range(0, 40), range(40, 80)], 8)).toBeNull();
  });
});

describe('evenSplitZone', () => {
  const zone = (s: number, e: number) => ({ frameStart: s, frameEnd: e });

  it('splits a full zone into two even parts on the 8-grid', () => {
    expect(evenSplitZone(zone(0, 120), 2, 8)).toEqual([
      { start: 0, end: 64 },
      { start: 64, end: 120 },
    ]);
  });

  it('splits into three equal parts when they land on the grid', () => {
    expect(evenSplitZone(zone(0, 120), 3, 8)).toEqual([
      { start: 0, end: 40 },
      { start: 40, end: 80 },
      { start: 80, end: 120 },
    ]);
  });

  it('a single part is the whole zone', () => {
    expect(evenSplitZone(zone(0, 120), 1, 8)).toEqual([{ start: 0, end: 120 }]);
  });

  it('returns null when min-span parts cannot fit (zone too small)', () => {
    // An 8-frame zone cannot hold two 8-frame tags.
    expect(evenSplitZone(zone(0, 8), 2, 8)).toBeNull();
    // 40 frames cannot hold six 8-frame parts.
    expect(evenSplitZone(zone(0, 40), 6, 8)).toBeNull();
  });

  it('keeps parts inside the zone, contiguous, and ≥ minSpan', () => {
    const parts = evenSplitZone(zone(16, 104), 4, 8);
    expect(parts).toHaveLength(4);
    expect(parts![0].start).toBe(16);
    expect(parts![3].end).toBe(104);
    for (let i = 0; i < 3; i++) {
      expect(parts![i + 1].start).toBe(parts![i].end);
      expect(parts![i + 1].start - parts![i].start).toBeGreaterThanOrEqual(8);
    }
  });
});
