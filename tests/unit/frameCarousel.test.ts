/**
 * Unit tests for the frame carousel helpers (plan B1): the 8n-grid snap,
 * the visible-card window math, and the card dip scale.
 *
 * The WebCodecs decode pipeline itself (FrameSource) needs a real
 * VideoDecoder + an H.264 blob; the math helpers here are pure and cover
 * the carousel geometry that the plan's test section calls out.
 */
import { describe, it, expect } from 'vitest';
import {
  CAROUSEL_STEP,
  snapCarouselFrame,
  carouselWindow,
  carouselCardScale,
  carouselCardScaleF,
  carouselCardX,
  carouselCardOpacityF,
} from '$lib/frameDecoder';

describe('CAROUSEL_STEP', () => {
  it('is the composer 8-frame grid', () => {
    expect(CAROUSEL_STEP).toBe(8);
  });
});

describe('snapCarouselFrame', () => {
  it('snaps to the nearest multiple of the step, clamped to bounds', () => {
    // 241 frames (8*30+1): last usable = 240.
    expect(snapCarouselFrame(0, 241)).toBe(0);
    expect(snapCarouselFrame(3, 241)).toBe(0);
    expect(snapCarouselFrame(4, 241)).toBe(8);
    expect(snapCarouselFrame(5, 241)).toBe(8);
    expect(snapCarouselFrame(99, 241)).toBe(96);
    // Past the end → clamp to the last usable frame.
    expect(snapCarouselFrame(300, 241)).toBe(240);
    // Negative → clamp to 0.
    expect(snapCarouselFrame(-5, 241)).toBe(0);
  });

  it('respects a custom (relaxed) step for perf', () => {
    // Sub-sampled 4-frame grid.
    expect(snapCarouselFrame(3, 241, 4)).toBe(4);
    expect(snapCarouselFrame(7, 241, 4)).toBe(8);
  });
});

describe('carouselWindow', () => {
  it('returns center ± span·step, clamped and sorted', () => {
    // Center 100, step 8, span 2 → 84, 92, 100, 108, 116.
    expect(carouselWindow(100, 241, 8, 2)).toEqual([84, 92, 100, 108, 116]);
  });

  it('clamps the low end (no negative frames)', () => {
    // Center 8 → -8/0 clipped, 8, 16, 24.
    expect(carouselWindow(8, 241, 8, 2)).toEqual([0, 8, 16, 24]);
  });

  it('clamps the high end (no frames past totalFrames-1)', () => {
    // Center 240 (last of 241) → 224, 232, 240 (248/256 ≥ 241 clipped).
    expect(carouselWindow(240, 241, 8, 2)).toEqual([224, 232, 240]);
    // One step earlier: a full four-card window touching the last frame.
    expect(carouselWindow(232, 241, 8, 2)).toEqual([216, 224, 232, 240]);
  });

  it('supports a wider span (2-3 neighbors each side as approved)', () => {
    // Center 64, span 3 → 40, 48, 56, 64, 72, 80, 88.
    expect(carouselWindow(64, 241, 8, 3)).toEqual([40, 48, 56, 64, 72, 80, 88]);
  });

  it('handles a tiny video (fewer frames than the full window)', () => {
    // 17 frames, center 8 → only 0, 8, 16 exist.
    expect(carouselWindow(8, 17, 8, 2)).toEqual([0, 8, 16]);
  });
});

describe('carouselCardScale', () => {
  it('scales the dip: 1.0 center, 0.85 ±1, 0.70 ±2, 0.55 ±3, 0 beyond', () => {
    expect(carouselCardScale(0)).toBe(1.0);
    expect(carouselCardScale(1)).toBe(0.85);
    expect(carouselCardScale(-1)).toBe(0.85);
    expect(carouselCardScale(2)).toBe(0.7);
    expect(carouselCardScale(-2)).toBe(0.7);
    expect(carouselCardScale(3)).toBe(0.55);
    expect(carouselCardScale(-3)).toBe(0.55);
    expect(carouselCardScale(4)).toBe(0);
  });
});

describe('carouselCardScaleF (continuous dip, float distance)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('matches the discrete dip at the grid stops', () => {
    near(carouselCardScaleF(0), 1.0);
    near(carouselCardScaleF(1), 0.85);
    near(carouselCardScaleF(2), 0.7);
    near(carouselCardScaleF(3), 0.55);
    near(carouselCardScaleF(4), 0);
    near(carouselCardScaleF(-1), 0.85);
    near(carouselCardScaleF(-4), 0);
  });

  it('interpolates linearly between stops (the semi-state)', () => {
    near(carouselCardScaleF(0.5), 0.925);
    near(carouselCardScaleF(1.5), 0.775);
    near(carouselCardScaleF(2.5), 0.625);
    near(carouselCardScaleF(3.5), 0.275);
    near(carouselCardScaleF(-0.5), 0.925);
  });

  it('is continuous at every breakpoint (no jumps)', () => {
    for (const bp of [1, 2, 3]) {
      // 1e-5 away from the stop reads within ~1e-5 of the stop value.
      expect(Math.abs(carouselCardScaleF(bp - 0.00001) - carouselCardScaleF(bp))).toBeLessThan(0.0002);
      expect(Math.abs(carouselCardScaleF(bp + 0.00001) - carouselCardScaleF(bp))).toBeLessThan(0.0002);
    }
  });

  it('stays at 0 beyond 4 steps and is symmetric', () => {
    near(carouselCardScaleF(4.5), 0);
    near(carouselCardScaleF(-5), 0);
    for (const d of [0.3, 1.7, 2.2, 3.4]) {
      near(carouselCardScaleF(d), carouselCardScaleF(-d));
    }
  });
});

describe('carouselCardX (continuous offset, float distance)', () => {
  const CARD_W = 170;
  const OVERLAP = 0.55;
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is centered at 0 and matches the discrete stops', () => {
    near(carouselCardX(0, CARD_W, OVERLAP), 0);
    near(carouselCardX(1, CARD_W, OVERLAP), CARD_W); // first neighbor: one full width out
    near(carouselCardX(-1, CARD_W, OVERLAP), -CARD_W);
    near(carouselCardX(2, CARD_W, OVERLAP), CARD_W * (1 + 0.45));
    near(carouselCardX(3, CARD_W, OVERLAP), CARD_W * (1 + 2 * 0.45));
  });

  it('interpolates linearly toward the center for |d| < 1', () => {
    near(carouselCardX(0.5, CARD_W, OVERLAP), CARD_W * 0.5);
    near(carouselCardX(-0.25, CARD_W, OVERLAP), -CARD_W * 0.25);
  });

  it('is continuous at d = 1 and symmetric', () => {
    // 1e-5 away from the stop reads within ~1e-3 px of the stop value
    // (both branches are linear, meeting exactly at CARD_W).
    expect(Math.abs(carouselCardX(0.99999, CARD_W, OVERLAP) - CARD_W)).toBeLessThan(0.002);
    expect(Math.abs(carouselCardX(1.00001, CARD_W, OVERLAP) - CARD_W)).toBeLessThan(0.002);
    near(carouselCardX(1.5, CARD_W, OVERLAP), -carouselCardX(-1.5, CARD_W, OVERLAP));
  });
});

describe('carouselCardOpacityF (edge fade, float distance)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('holds 1 up to 3 steps, fades to 0 at 4', () => {
    near(carouselCardOpacityF(0), 1);
    near(carouselCardOpacityF(1), 1);
    near(carouselCardOpacityF(3), 1);
    near(carouselCardOpacityF(3.5), 0.5);
    near(carouselCardOpacityF(4), 0);
    near(carouselCardOpacityF(4.5), 0);
  });

  it('is symmetric', () => {
    near(carouselCardOpacityF(3.2), carouselCardOpacityF(-3.2));
  });
});
