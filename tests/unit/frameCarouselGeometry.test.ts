/**
 * Unit tests for the frame carousel ASPECT-AWARE geometry (top-panel video
 * cards sized to the true video aspect, not a fixed landscape crop).
 *
 * The pure math lives in $lib/frameDecoder so it's testable without a DOM:
 *   - carouselCardWidth   : strip height × video aspect → card width (px)
 *   - carouselDragPxPerStep : 1-step horizontal travel (px), fold by overlap
 *   - thumbnailIntrinsic  : canvas backing-store dims that fill the card
 *
 * The dip/offset/opacity helpers tested in frameCarousel.test.ts still apply
 * — the difference here is that CARD_W itself now varies with aspect.
 */
import { describe, it, expect } from 'vitest';
import {
  CAROUSEL_STRIP_H,
  CAROUSEL_FALLBACK_CARD_W,
  CAROUSEL_DECK_OFFSET_LADDER,
  CAROUSEL_DECK_SCALE_LADDER,
  carouselCardWidth,
  carouselDragPxPerStep,
  thumbnailIntrinsic,
  carouselCardX,
  carouselCardScaleF,
  carouselCardOpacityF,
} from '$lib/frameDecoder';

// ── constants ────────────────────────────────────────────────────────────────
describe('carousel constants', () => {
  it('strip height matches the Frame.svelte .frame-preview band', () => {
    expect(CAROUSEL_STRIP_H).toBe(180);
  });

  it('fallback card width is the legacy fixed 170px', () => {
    expect(CAROUSEL_FALLBACK_CARD_W).toBe(170);
  });

  it('deck offset ladder tucks the first neighbor under the front (0.55 cardW)', () => {
    expect(CAROUSEL_DECK_OFFSET_LADDER).toEqual([0, 0.55, 0.87, 1.13, 1.35]);
    expect(CAROUSEL_DECK_SCALE_LADDER).toEqual([1.0, 0.76, 0.64, 0.55, 0]);
  });
});

// ── carouselCardWidth ────────────────────────────────────────────────────────
describe('carouselCardWidth', () => {
  it('falls back to 170px when aspect is unknown', () => {
    expect(carouselCardWidth(180, null)).toBe(170);
    expect(carouselCardWidth(180, undefined)).toBe(170);
    expect(carouselCardWidth(180, 0)).toBe(170);
  });

  it('computes strip-height × aspect, rounded', () => {
    // 16:9 landscape: 180 × 1.7778 ≈ 320
    expect(carouselCardWidth(180, 16 / 9)).toBe(320);
    // 9:16 portrait: 180 × 0.5625 = 101 (rounded)
    expect(carouselCardWidth(180, 9 / 16)).toBe(101);
    // 1:1 square: 180 × 1 = 180
    expect(carouselCardWidth(180, 1)).toBe(180);
    // 4:3: 180 × 1.3333 ≈ 240
    expect(carouselCardWidth(180, 4 / 3)).toBe(240);
    // 3:4: 180 × 0.75 = 135
    expect(carouselCardWidth(180, 3 / 4)).toBe(135);
    // A taller portrait band (260px) widens the portrait card proportionally:
    // 260 × 0.5625 = 146
    expect(carouselCardWidth(260, 9 / 16)).toBe(146);
  });

  it('portrait cards are narrower than landscape cards', () => {
    const portrait = carouselCardWidth(180, 9 / 16);
    const landscape = carouselCardWidth(180, 16 / 9);
    expect(portrait).toBeLessThan(landscape);
    // Portrait (aspect < 1) stays under the strip height; landscape (aspect > 1)
    // exceeds it — both are correct for their orientation.
    expect(portrait).toBeLessThan(CAROUSEL_STRIP_H);
    expect(landscape).toBeGreaterThan(CAROUSEL_STRIP_H);
  });

  it('rejects negative / non-finite aspect', () => {
    expect(carouselCardWidth(180, -1)).toBe(170);
    expect(carouselCardWidth(180, NaN)).toBe(170);
    expect(carouselCardWidth(180, Infinity)).toBe(170);
    expect(carouselCardWidth(180, -Infinity)).toBe(170);
  });
});

// ── carouselDragPxPerStep ────────────────────────────────────────────────────
describe('carouselDragPxPerStep', () => {
  it('tucks one step by the first-neighbor deck offset', () => {
    // 170px card: round(170 × 0.55) = round(93.5) = 94 (Math.round half-up).
    expect(carouselDragPxPerStep(170)).toBe(94);
    // 101px card (9:16 portrait): round(101 × 0.55) = round(55.55) = 56.
    expect(carouselDragPxPerStep(101)).toBe(56);
    // 320px card (16:9 landscape): round(320 × 0.55) = round(176) = 176.
    expect(carouselDragPxPerStep(320)).toBe(176);
  });
});

// ── thumbnailIntrinsic ───────────────────────────────────────────────────────
describe('thumbnailIntrinsic', () => {
  it('is 1:1 with the card box, aspect-corrected to the source', () => {
    // Landscape card (320px) with a 16:9 source bitmap:
    // w = 320, h = round(320 × 9/16) = 180 — exactly the 180px strip height.
    expect(thumbnailIntrinsic(320, 1600, 900)).toEqual({ w: 320, h: 180 });
    // Portrait card (101px) with a 9:16 source bitmap:
    // w = 101, h = round(101 × 16/9) = round(179.6) = 180 — full strip height.
    expect(thumbnailIntrinsic(101, 720, 1280)).toEqual({ w: 101, h: 180 });
    // Square card (180px) with a 1:1 source:
    // w = 180, h = 180.
    expect(thumbnailIntrinsic(180, 1080, 1080)).toEqual({ w: 180, h: 180 });
  });

	 it('clamps height to a minimum of 1px (no zero-height canvas)', () => {
		// An extreme ultra-wide source (10000:5 = 2000:1) at a narrow card →
		// h rounds to 0 → clamped to 1 so the canvas always has a valid backing
		// store. w = 50, ratio = 5/10000 = 0.0005, round(50 × 0.0005) = 0.
		expect(thumbnailIntrinsic(50, 10000, 5).h).toBe(1);
		expect(thumbnailIntrinsic(50, 10000, 5).w).toBe(50);
		// Zero bitmap height: ratio clamps, height floored at 1.
		expect(thumbnailIntrinsic(100, 100, 0).h).toBe(1);
		// Zero bitmap width: the ratio guard defaults to 0 → height floored at 1.
		expect(thumbnailIntrinsic(100, 0, 100).h).toBe(1);
		expect(thumbnailIntrinsic(100, 0, 100).w).toBe(100);
	});

  it('backing store width is 1:1 with the card width (no double scaler)', () => {
    for (const cardW of [50, 101, 170, 180, 320]) {
      expect(thumbnailIntrinsic(cardW, 100, 100).w).toBe(cardW);
    }
  });
});

// ── integrated: card width → dip offset still consistent ────────────────────
describe('carouselCardX with aspect-driven card width', () => {
  it('first neighbor tucks UNDER the front card (0.55 cardW out), for any aspect', () => {
    const W = carouselCardWidth(180, 9 / 16); // 101
    expect(carouselCardX(1, W)).toBeCloseTo(W * 0.55, 5);
    expect(carouselCardX(-1, W)).toBeCloseTo(-W * 0.55, 5);
  });

  it('far neighbors step out a little less each time (shrinking sliver)', () => {
    const W = carouselCardWidth(180, 16 / 9); // 320
    expect(carouselCardX(2, W)).toBeCloseTo(W * 0.87, 5);
    expect(carouselCardX(3, W)).toBeCloseTo(W * 1.13, 5);
    // Each further card steps out less than the previous: the visible sliver
    // shrinks down the deck → the nested `[ [[]] ]` cascade.
    expect(carouselCardX(1, W) - 0).toBeGreaterThan(0);
    expect(carouselCardX(2, W) - carouselCardX(1, W)).toBeLessThan(
      carouselCardX(1, W) - 0,
    );
  });

  it('deck scale + opacity are aspect-independent (pure fns of distance)', () => {
    // Same values regardless of card width — only position scales with W.
    expect(carouselCardScaleF(0)).toBe(1);
    expect(carouselCardScaleF(1)).toBeCloseTo(0.76, 5);
    expect(carouselCardScaleF(4)).toBe(0);
    expect(carouselCardOpacityF(3)).toBe(1);
    expect(carouselCardOpacityF(4)).toBe(0);
  });
});
