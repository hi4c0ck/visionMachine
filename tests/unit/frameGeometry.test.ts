/**
 * Unit tests for centralized frame geometry engine.
 */

import { describe, it, expect } from 'vitest';
import {
	createFrameGeometry,
	frameToPx,
	pxToFrame,
	clientXToFrame,
	snapFrame,
	rangeWidthPx,
	clampFrame,
	FRAME_STEP,
	MIN_SPAN
} from '$lib/frameGeometry';

describe('createFrameGeometry', () => {
	it('creates valid geometry for 241 frames at 1200px width', () => {
		const g = createFrameGeometry(241, 1200);
		expect(g.totalFrames).toBe(241);
		expect(g.contentEndFrame).toBe(240);
		expect(g.width).toBe(1200);
	});

	it('throws for non-integer totalFrames', () => {
		expect(() => createFrameGeometry(0, 100)).toThrow('Invalid totalFrames: 0');
		expect(() => createFrameGeometry(-1, 100)).toThrow('Invalid totalFrames: -1');
		expect(() => createFrameGeometry(1, 100)).toThrow('Invalid totalFrames: 1');
		expect(() => createFrameGeometry(2.5, 100)).toThrow();
	});

	it('throws for invalid width', () => {
		expect(() => createFrameGeometry(241, 0)).toThrow('Invalid width: 0');
		expect(() => createFrameGeometry(241, -100)).toThrow('Invalid width: -100');
	});

	it('throws for non-finite inputs', () => {
		expect(() => createFrameGeometry(NaN, 100)).toThrow();
		expect(() => createFrameGeometry(241, Infinity)).toThrow();
	});
});

describe('frameToPx', () => {
	const g = createFrameGeometry(241, 1200);

	it('maps frame 0 to the left edge', () => {
		expect(frameToPx(0, g)).toBe(0);
	});

	it('maps frame 240 to the right edge', () => {
		expect(frameToPx(240, g)).toBe(1200);
	});

	it('maps frame 120 to midpoint', () => {
		expect(frameToPx(120, g)).toBeCloseTo(600, 5);
	});

	it('clamps negative frames to 0', () => {
		expect(frameToPx(-8, g)).toBe(0);
	});

	it('clamps frames beyond contentEndFrame to width', () => {
		expect(frameToPx(300, g)).toBe(1200);
	});

	it('maps each 8n frame proportionally', () => {
		for (let f = 0; f <= 240; f += 8) {
			const expected = (f / 240) * 1200;
			expect(frameToPx(f, g)).toBeCloseTo(expected, 5);
		}
	});
});

describe('pxToFrame', () => {
	const g = createFrameGeometry(241, 1200);

	it('round-trips frame 0', () => {
		expect(pxToFrame(0, g)).toBe(0);
	});

	it('round-trips frame 240', () => {
		expect(pxToFrame(1200, g)).toBe(240);
	});

	it('round-trips frame 120', () => {
		expect(pxToFrame(600, g)).toBeCloseTo(120, 5);
	});
});

describe('clientXToFrame', () => {
	const g = createFrameGeometry(241, 1200);

	it('maps pointer boundaries correctly', () => {
		const rect = new DOMRect(100, 0, 1200, 100);

		expect(clientXToFrame(100, rect, g)).toBe(0);
		expect(clientXToFrame(1300, rect, g)).toBe(240);
	});

	it('maps center pointer to center frame', () => {
		const rect = new DOMRect(0, 0, 1200, 100);
		expect(clientXToFrame(600, rect, g)).toBeCloseTo(120, 5);
	});
});

describe('snapFrame', () => {
	it('snaps to nearest multiple of 8', () => {
		expect(snapFrame(0)).toBe(0);
		expect(snapFrame(4)).toBe(8);    // Math.round(0.5) = 1 → 8
		expect(snapFrame(5)).toBe(8);   // Math.round(0.625) = 1 → 8
		expect(snapFrame(12)).toBe(16); // Math.round(1.5) = 2 → 16
		expect(snapFrame(240)).toBe(240);
		expect(snapFrame(-4)).toBe(-0); // Math.round(-0.5) = -0 → -0
		expect(snapFrame(-5)).toBe(-8); // Math.round(-0.625) = -1 → -8
	});
});

describe('clampFrame', () => {
	const g = createFrameGeometry(241, 1200);

	it('clamps to valid range', () => {
		expect(clampFrame(-10, g)).toBe(0);
		expect(clampFrame(300, g)).toBe(240);
		expect(clampFrame(120, g)).toBe(120);
	});
});

describe('rangeWidthPx', () => {
	const g = createFrameGeometry(241, 1200);

	it('calculates correct range width', () => {
		const start = frameToPx(32, g);
		const end = frameToPx(96, g);

		expect(rangeWidthPx(32, 96, g)).toBeCloseTo(end - start, 5);
	});

	it('returns 0 for invalid ranges', () => {
		expect(rangeWidthPx(96, 32, g)).toBe(0);
	});
});

describe('FRAME_STEP and MIN_SPAN constants', () => {
	it('FRAME_STEP is 8', () => {
		expect(FRAME_STEP).toBe(8);
	});

	it('MIN_SPAN is 8', () => {
		expect(MIN_SPAN).toBe(8);
	});
});
