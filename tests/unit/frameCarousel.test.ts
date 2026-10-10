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
  CAROUSEL_DISSOLVE_LIFT_PX,
  carouselBackTintF,
  carouselFwdDimF,
  carouselGlowF,
  carouselLiftF,
  carouselBlurF,
  carouselDissolveOpacity,
  carouselDissolveDirF,
  carouselDissolveReveal,
  carouselStackTuckF,
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
  it('scales the deck cascade: 1.0 center, 0.76 ±1, 0.64 ±2, 0.55 ±3, 0 beyond', () => {
    expect(carouselCardScale(0)).toBe(1.0);
    expect(carouselCardScale(1)).toBe(0.76);
    expect(carouselCardScale(-1)).toBe(0.76);
    expect(carouselCardScale(2)).toBe(0.64);
    expect(carouselCardScale(-2)).toBe(0.64);
    expect(carouselCardScale(3)).toBe(0.55);
    expect(carouselCardScale(-3)).toBe(0.55);
    expect(carouselCardScale(4)).toBe(0);
  });
});

describe('carouselCardScaleF (continuous deck cascade, float distance)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('matches the discrete cascade at the grid stops', () => {
    near(carouselCardScaleF(0), 1.0);
    near(carouselCardScaleF(1), 0.76);
    near(carouselCardScaleF(2), 0.64);
    near(carouselCardScaleF(3), 0.55);
    near(carouselCardScaleF(4), 0);
    near(carouselCardScaleF(-1), 0.76);
    near(carouselCardScaleF(-4), 0);
  });

  it('interpolates linearly between stops (the semi-state)', () => {
    near(carouselCardScaleF(0.5), 0.88);
    near(carouselCardScaleF(1.5), 0.7);
    near(carouselCardScaleF(2.5), 0.595);
    near(carouselCardScaleF(3.5), 0.275);
    near(carouselCardScaleF(-0.5), 0.88);
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

describe('carouselCardX (continuous deck offset, float distance)', () => {
  const CARD_W = 170;
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is centered at 0 and tucks the first neighbor under the front card', () => {
    near(carouselCardX(0, CARD_W), 0);
    near(carouselCardX(1, CARD_W), CARD_W * 0.55); // first neighbor tucked under
    near(carouselCardX(-1, CARD_W), -CARD_W * 0.55);
    near(carouselCardX(2, CARD_W), CARD_W * 0.87);
    near(carouselCardX(3, CARD_W), CARD_W * 1.13);
  });

  it('interpolates linearly toward the center for |d| < 1', () => {
    near(carouselCardX(0.5, CARD_W), CARD_W * 0.275);
    near(carouselCardX(-0.25, CARD_W), -CARD_W * 0.1375);
  });

  it('steps out a little less each card (shrinking sliver) and is symmetric', () => {
    // The gap between card1 and card2 is smaller than the gap at card1:
    // 0.32 < 0.55 of cardW — the nested `[ [[]] ]` cascade.
    expect(carouselCardX(2, CARD_W) - carouselCardX(1, CARD_W)).toBeLessThan(carouselCardX(1, CARD_W));
    near(carouselCardX(1.5, CARD_W), -carouselCardX(-1.5, CARD_W));
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

// ── Stacked-treatment layer (horizontal nested [ [[]] ] depth) ───────────
describe('carouselBackTintF (backwards blue-grey tint, signed distance)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is 0 for the front and all forward cards', () => {
    near(carouselBackTintF(0), 0);
    near(carouselBackTintF(0.5), 0);
    near(carouselBackTintF(1), 0);
    near(carouselBackTintF(3), 0);
  });

  it('ramps to 0.45 at the first back stop and grows 0.10/step, capped 0.7', () => {
    near(carouselBackTintF(-0.5), 0.225);
    near(carouselBackTintF(-1), 0.45);
    near(carouselBackTintF(-2), 0.55);
    near(carouselBackTintF(-3), 0.65);
    near(carouselBackTintF(-4), 0.7);
    near(carouselBackTintF(-5), 0.7);
  });

  it('is continuous across d = 0', () => {
    expect(Math.abs(carouselBackTintF(0.00001) - carouselBackTintF(0))).toBeLessThan(0.0002);
    expect(Math.abs(carouselBackTintF(-0.00001) - carouselBackTintF(0))).toBeLessThan(0.0002);
  });
});

describe('carouselFwdDimF (forwards warm dim, symmetric ramp)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is 0 for the front and all backwards cards', () => {
    near(carouselFwdDimF(0), 0);
    near(carouselFwdDimF(-1), 0);
    near(carouselFwdDimF(-3), 0);
  });

  it('ramps to 0.25 at d=1, grows 0.10/step, capped 0.45', () => {
    near(carouselFwdDimF(0.5), 0.125);
    near(carouselFwdDimF(1), 0.25);
    near(carouselFwdDimF(2), 0.35);
    near(carouselFwdDimF(3), 0.45);
    near(carouselFwdDimF(4), 0.45);
  });
});

describe('carouselGlowF (front accent glow, cross-fade)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is 1 at center, 0 at |d| >= 1, and symmetric', () => {
    near(carouselGlowF(0), 1);
    near(carouselGlowF(0.5), 0.5);
    near(carouselGlowF(1), 0);
    near(carouselGlowF(-1), 0);
    near(carouselGlowF(2), 0);
    near(carouselGlowF(-0.5), carouselGlowF(0.5));
  });

  it('cross-fades 0.5/0.5 between a front and its successor', () => {
    near(carouselGlowF(0.5), 0.5);
    near(carouselGlowF(-0.5), 0.5);
  });
});

describe('carouselLiftF (grab-and-place dissolve arc)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is 0 at both resting positions and peaks at |d| = 0.5', () => {
    near(carouselLiftF(0), 0);
    near(carouselLiftF(1), 0);
    near(carouselLiftF(-1), 0);
    near(carouselLiftF(0.5), CAROUSEL_DISSOLVE_LIFT_PX);
    near(carouselLiftF(-0.5), CAROUSEL_DISSOLVE_LIFT_PX);
  });

  it('interpolates linearly on each side and is symmetric', () => {
    near(carouselLiftF(0.25), CAROUSEL_DISSOLVE_LIFT_PX / 2);
    near(carouselLiftF(0.75), CAROUSEL_DISSOLVE_LIFT_PX / 2);
    near(carouselLiftF(-0.25), carouselLiftF(0.25));
    near(carouselLiftF(-0.75), carouselLiftF(0.75));
  });

  it('stays 0 beyond |d| = 1', () => {
    near(carouselLiftF(1.5), 0);
    near(carouselLiftF(-2), 0);
  });
});

describe('carouselBlurF (depth blur, front stays sharp)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is 0 within |d| < 0.5 (front area) and ramps to a 3px cap', () => {
    near(carouselBlurF(0), 0);
    near(carouselBlurF(0.5), 0);
    near(carouselBlurF(1), 0.6);
    near(carouselBlurF(2), 1.8);
    near(carouselBlurF(3), 3);
    near(carouselBlurF(4), 3);
    near(carouselBlurF(-3), 3);
  });

  it('is symmetric', () => {
    near(carouselBlurF(1.5), carouselBlurF(-1.5));
  });
});

describe('carouselDissolveOpacity (v9: accent wave channel, receding-only, sin-bump)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);
  const PEAK = 0.9;
  const sin = (a: number) => PEAK * Math.sin(Math.PI * a);

  it('is 0 when idle (moveDir=0) for every card', () => {
    for (const d of [-0.5, 0, 0.5]) near(carouselDissolveOpacity(d, 0), 0);
  });

  it('forward move (moveDir>0): only the LEFT receding side washes; the RIGHT arriving side stays clean', () => {
    near(carouselDissolveOpacity(-0.5, 1), PEAK);   // receding left front at switch → peak
    near(carouselDissolveOpacity(0.5, 1), 0);        // arriving right front → clean
    near(carouselDissolveOpacity(1.5, 1), 0);        // far right → clean
  });

  it('backward move (moveDir<0): only the RIGHT receding side washes; the LEFT arriving side stays clean', () => {
    near(carouselDissolveOpacity(0.5, -1), PEAK);    // receding right front at switch → peak
    near(carouselDissolveOpacity(-0.5, -1), 0);      // arriving left front → clean
  });

  it('is 0 at the center rest stop (|d|=0) and at the neighbor rest stop (|d|=1)', () => {
    near(carouselDissolveOpacity(-0, 1), 0);
    near(carouselDissolveOpacity(-1, 1), 0);
    near(carouselDissolveOpacity(0, -1), 0);
    near(carouselDissolveOpacity(1, -1), 0);
  });

  it('peaks at exactly PEAK at the switch distance (|d|=0.5)', () => {
    near(carouselDissolveOpacity(-0.5, 1), PEAK);
    near(carouselDissolveOpacity(0.5, -1), PEAK);
  });

  it('ramps smoothly 0→PEAK for |d| in [0, 0.5] (receding side)', () => {
    near(carouselDissolveOpacity(-0.25, 1), sin(0.25));
    near(carouselDissolveOpacity(0.25, -1), sin(0.25));
    expect(carouselDissolveOpacity(-0.25, 1)).toBeGreaterThan(0);
    expect(carouselDissolveOpacity(-0.25, 1)).toBeLessThan(PEAK);
  });

  it('ramps smoothly PEAK→0 for |d| in [0.5, 1] (receding side, clearing before rest stop)', () => {
    near(carouselDissolveOpacity(-0.75, 1), sin(0.75));
    near(carouselDissolveOpacity(0.75, -1), sin(0.75));
    expect(carouselDissolveOpacity(-0.75, 1)).toBeLessThan(PEAK);
    expect(carouselDissolveOpacity(-0.75, 1)).toBeGreaterThan(0);
  });

  it('is clamped to [0, PEAK]', () => {
    for (const d of [-1.5, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5]) {
      for (const m of [-1, 0, 1]) {
        const v = carouselDissolveOpacity(d, m);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(PEAK);
      }
    }
  });
});

describe('carouselDissolveDirF (v6: center-facing edge of the receding side)', () => {
  // The direction is set by the MOTION (moveDir), not the card side:
  //   forward  (moveDir>0): receding left front opens toward center → 'to right'
  //   backward (moveDir<0): receding right front opens toward center → 'to left'
  // The `d` argument is informational only; only the receding card ever
  // renders a non-zero wash, so its single direction is what shows.
  it('forward: direction is "to right" regardless of card side', () => {
    expect(carouselDissolveDirF(-0.5, 1)).toBe('to right');
    expect(carouselDissolveDirF(0.5, 1)).toBe('to right');
  });

  it('backward: direction is "to left" regardless of card side', () => {
    expect(carouselDissolveDirF(0.5, -1)).toBe('to left');
    expect(carouselDissolveDirF(-0.5, -1)).toBe('to left');
  });

  it('idle: harmless "to right" default', () => {
    expect(carouselDissolveDirF(-0.5, 0)).toBe('to right');
  });
});

describe('carouselDissolveReveal (v9: strong smooth media reveal, receding-only)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);
  const PEAK = 0.85;
  const sin = (a: number) => PEAK * Math.sin(Math.PI * a);

  it('is 0 when idle (moveDir=0) for every card', () => {
    for (const d of [-0.5, 0, 0.5, 1]) near(carouselDissolveReveal(d, 0), 0);
  });

  it('forward: only the LEFT receding side reveals; the RIGHT arriving side stays clean', () => {
    near(carouselDissolveReveal(-0.5, 1), PEAK); // receding left front at switch → peak reveal
    near(carouselDissolveReveal(0.5, 1), 0);       // arriving right front → clean
    near(carouselDissolveReveal(1.5, 1), 0);        // far right → clean
  });

  it('backward: only the RIGHT receding side reveals; the LEFT arriving side stays clean', () => {
    near(carouselDissolveReveal(0.5, -1), PEAK);    // receding right front at switch → peak reveal
    near(carouselDissolveReveal(-0.5, -1), 0);      // arriving left front → clean
  });

  it('is 0 at BOTH rest stops (|d|=0 and |d|=1) — no effect at the center stable position', () => {
    near(carouselDissolveReveal(0, 1), 0);
    near(carouselDissolveReveal(-1, 1), 0);
    near(carouselDissolveReveal(0, -1), 0);
    near(carouselDissolveReveal(1, -1), 0);
  });

  it('peaks at exactly PEAK at the switch distance (|d|=0.5)', () => {
    near(carouselDissolveReveal(-0.5, 1), PEAK);
    near(carouselDissolveReveal(0.5, -1), PEAK);
  });

  it('ramps smoothly 0→PEAK then PEAK→0 (receding side)', () => {
    near(carouselDissolveReveal(-0.25, 1), sin(0.25));
    near(carouselDissolveReveal(-0.75, 1), sin(0.75));
    expect(carouselDissolveReveal(-0.25, 1)).toBeGreaterThan(0);
    expect(carouselDissolveReveal(-0.25, 1)).toBeLessThan(PEAK);
  });

  it('is clamped to [0, PEAK]', () => {
    for (const d of [-1.5, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5]) {
      for (const m of [-1, 0, 1]) {
        const v = carouselDissolveReveal(d, m);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(PEAK);
      }
    }
  });
});

describe('carouselStackTuckF (v8: horizontal brick-interlock tuck)', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);
  const CARD_W = 170;
  const P = 0.15 * CARD_W; // peak tuck at |d|=0.5

  it('is 0 at the front rest stop (|d|=0) and every integer stop', () => {
    // The card rests EXACTLY at its ladder offset at the final slot — no drift.
    near(carouselStackTuckF(0, CARD_W), 0);
    near(carouselStackTuckF(1, CARD_W), 0);
    near(carouselStackTuckF(-1, CARD_W), 0);
    near(carouselStackTuckF(2, CARD_W), 0);
    near(carouselStackTuckF(-2, CARD_W), 0);
  });

  it('peaks at P at the switch midpoint (|d|=0.5)', () => {
    near(carouselStackTuckF(0.5, CARD_W), P);
    near(carouselStackTuckF(-0.5, CARD_W), P);
  });

  it('tucks inward only between the two front rest stops; 0 beyond |d|=1', () => {
    near(carouselStackTuckF(1, CARD_W), 0);
    near(carouselStackTuckF(1.5, CARD_W), 0);
    near(carouselStackTuckF(2, CARD_W), 0);
    expect(carouselStackTuckF(0.25, CARD_W)).toBeGreaterThan(0);
    expect(carouselStackTuckF(0.25, CARD_W)).toBeLessThan(P);
  });

  it('is symmetric (d === -d)', () => {
    for (const d of [0.25, 0.5, 0.75, 1.25]) {
      near(carouselStackTuckF(d, CARD_W), carouselStackTuckF(-d, CARD_W));
    }
  });

  it('is clamped to [0, P]', () => {
    for (const d of [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, -3]) {
      expect(carouselStackTuckF(d, CARD_W)).toBeGreaterThanOrEqual(0);
      expect(carouselStackTuckF(d, CARD_W)).toBeLessThanOrEqual(P);
    }
  });
});