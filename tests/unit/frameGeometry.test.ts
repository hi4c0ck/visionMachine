/**
 * Unit tests for centralized frame geometry engine.
 * Run with: npm run test
 */

import { describe, it, expect } from 'vitest';
import {
	createFrameGeometry,
	frameToPx,
	pxToFrame,
	snapFrame,
	snapFrameDown,
	snapFrameUp,
	pointerToFrame,
	framePercent,
	rangeWidthPx,
	frameDeltaToPx,
	pxDeltaToFrame,
	FRAME_STEP,
} from '$lib/frameGeometry';

describe('createFrameGeometry', () => {
	it('creates valid geometry for 241 frames at 1000px width', () => {
		const g = createFrameGeometry(241, 1000);
		expect(g.totalFrames).toBe(241);
		expect(g.contentEndFrame).toBe(240);
		expect(g.width).toBe(1000);
	});

	it('throws for invalid totalFrames', () => {
		expect(() => createFrameGeometry(0, 100)).toThrow('Invalid totalFrames: 0');
		expect(() => createFrameGeometry(-1, 100)).toThrow('Invalid totalFrames: -1');
		expect(() => createFrameGeometry(1, 100)).toThrow('Invalid totalFrames: 1');
	});

	it('throws for invalid width', () => {
		expect(() => createFrameGeometry(241, 0)).toThrow('Invalid ruler width: 0');
		expect(() => createFrameGeometry(241, -100)).toThrow('Invalid ruler width: -100');
	});

	it('throws for non-finite inputs', () => {
		expect(() => createFrameGeometry(NaN, 100)).toThrow();
		expect(() => createFrameGeometry(241, Infinity)).toThrow();
	});
});

describe('frameToPx', () => {
	const g = createFrameGeometry(241, 1000);

	it('maps frame 0 to x=0', () => {
		expect(frameToPx(0, g)).toBe(0);
	});

	it('maps last content frame to full width', () => {
		expect(frameToPx(240, g)).toBe(1000);
	});

	it('maps frame 120 to midpoint', () => {
		expect(frameToPx(120, g)).toBeCloseTo(500, 5);
	});

	it('clamps negative frames to 0', () => {
		expect(frameToPx(-8, g)).toBe(0);
	});

	it('clamps frames beyond contentEndFrame to width', () => {
		expect(frameToPx(300, g)).toBe(1000);
	});

	it('maps each 8n frame proportionally', () => {
		for (let f = 0; f <= 240; f += 8) {
			const expected = (f / 240) * 1000;
			expect(frameToPx(f, g)).toBeCloseTo(expected, 5);
		}
	});
});

describe('pxToFrame', () => {
	const g = createFrameGeometry(241, 1000);

	it('maps x=0 to frame 0', () => {
		expect(pxToFrame(0, g)).toBe(0);
	});

	it('maps x=1000 to frame 240', () => {
		expect(pxToFrame(1000, g)).toBe(240);
	});

	it('round trips through frameToPx', () => {
		for (let f = 0; f <= 240; f += 8) {
			const px = frameToPx(f, g);
			expect(pxToFrame(px, g)).toBeCloseTo(f, 10);
		}
	});

	it('clamps negative x to frame 0', () => {
		expect(pxToFrame(-50, g)).toBe(0);
	});

	it('clamps x beyond width to frame 240', () => {
		expect(pxToFrame(1500, g)).toBe(240);
	});
});

describe('snapFrame', () => {
	it('snaps to nearest multiple of 8', () => {
		expect(snapFrame(0)).toBe(0);
		expect(snapFrame(4)).toBe(8);    // 4/8=0.5 → round(0.5)=1 → 8
		expect(snapFrame(5)).toBe(8);   // 5/8=0.625 → round(0.625)=1 → 8
		expect(snapFrame(12)).toBe(16); // 12/8=1.5 → round(1.5)=2 → 16
		expect(snapFrame(240)).toBe(240);
		expect(snapFrame(236)).toBe(240);
		expect(snapFrame(238)).toBe(240);
	});

	it('handles negative values', () => {
		expect(snapFrame(-4)).toBe(-0); // -4/8=-0.5 → round(-0.5)=-0 → -0*8=-0
		expect(snapFrame(-5)).toBe(-8); // -5/8=-0.625 → round(-0.625)=-1 → -8
	});
});

describe('snapFrameDown / snapFrameUp', () => {
	it('snapFrameDown floors to multiple of 8', () => {
		expect(snapFrameDown(7)).toBe(0);
		expect(snapFrameDown(8)).toBe(8);
		expect(snapFrameDown(15)).toBe(8);
		expect(snapFrameDown(16)).toBe(16);
	});

	it('snapFrameUp ceils to multiple of 8', () => {
		expect(snapFrameUp(1)).toBe(8);
		expect(snapFrameUp(8)).toBe(8);
		expect(snapFrameUp(9)).toBe(16);
		expect(snapFrameUp(16)).toBe(16);
	});
});

describe('pointerToFrame', () => {
	const g = createFrameGeometry(241, 1000);
	const rect = new DOMRect(0, 0, 1000, 40);

	it('maps left edge to frame 0', () => {
		expect(pointerToFrame(0, rect, g)).toBe(0);
	});

	it('maps right edge to frame 240', () => {
		expect(pointerToFrame(1000, rect, g)).toBe(240);
	});

	it('snaps to nearest 8', () => {
		// pixel 100 → frame ~20.8 → snap to 20 or 24
		const result = pointerToFrame(100, rect, g);
		expect(result % 8).toBe(0);
	});

	it('clamps to content range', () => {
		expect(pointerToFrame(-50, rect, g)).toBe(0);
		expect(pointerToFrame(1050, rect, g)).toBe(240);
	});
});

describe('framePercent', () => {
	const g = createFrameGeometry(241, 1000);

	it('returns 0% for frame 0', () => {
		expect(framePercent(0, g)).toBe(0);
	});

	it('returns 100% for frame 240', () => {
		expect(framePercent(240, g)).toBe(100);
	});

	it('returns proportional percentages', () => {
		expect(framePercent(120, g)).toBeCloseTo(50, 5);
		expect(framePercent(60, g)).toBeCloseTo(25, 5);
	});
});

describe('rangeWidthPx', () => {
	const g = createFrameGeometry(241, 1000);

	it('returns 0 for same start and end', () => {
		expect(rangeWidthPx(32, 32, g)).toBe(0);
	});

	it('returns correct width for frame range', () => {
		// frames 0 to 240 span full 1000px
		expect(rangeWidthPx(0, 240, g)).toBe(1000);
		// frames 0 to 120 span half
		expect(rangeWidthPx(0, 120, g)).toBeCloseTo(500, 5);
	});
});

describe('frameDeltaToPx / pxDeltaToFrame', () => {
	const g = createFrameGeometry(241, 1000);

	it('converts frame delta to pixels', () => {
		expect(frameDeltaToPx(240, g)).toBe(1000);
		expect(frameDeltaToPx(120, g)).toBeCloseTo(500, 5);
	});

	it('converts pixel delta to frames', () => {
		expect(pxDeltaToFrame(1000, g)).toBe(240);
		expect(pxDeltaToFrame(500, g)).toBeCloseTo(120, 5);
	});

	it('round trips delta conversions', () => {
		for (const delta of [8, 16, 32, 64, 120, 240]) {
			const px = frameDeltaToPx(delta, g);
			const back = pxDeltaToFrame(px, g);
			expect(back).toBeCloseTo(delta, 5);
		}
	});
});

describe('FRAME_STEP constant', () => {
	it('equals 8', () => {
		expect(FRAME_STEP).toBe(8);
	});
});

describe('integration: all primitives share identical coordinates', () => {
	const g = createFrameGeometry(241, 1000);
	const testFrames = [0, 8, 16, 32, 64, 120, 200, 240];

	it('frameToPx is consistent across all test frames', () => {
		for (const f of testFrames) {
			const px = frameToPx(f, g);
			const back = pxToFrame(px, g);
			expect(back).toBeCloseTo(f, 10);
		}
	});

	it('framePercent matches frameToPx / width * 100', () => {
		for (const f of testFrames) {
			const pct = framePercent(f, g);
			const expected = (frameToPx(f, g) / g.width) * 100;
			expect(pct).toBeCloseTo(expected, 10);
		}
	});

	it('rangeWidthPx equals difference of frameToPx', () => {
		for (const start of [0, 32, 80]) {
			for (const end of [start + 8, start + 16, start + 80]) {
				if (end > g.contentEndFrame) continue;
				const rw = rangeWidthPx(start, end, g);
				const diff = frameToPx(end, g) - frameToPx(start, g);
				expect(rw).toBeCloseTo(diff, 5);
			}
		}
	});
});
