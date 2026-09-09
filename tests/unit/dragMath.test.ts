import { describe, it, expect } from 'vitest';
import {
	calculateElementDrag,
	getDragBounds,
	type TemporalDragState,
} from '../../src/lib/dragMath';

function drag(partial: Partial<TemporalDragState>): TemporalDragState {
	return {
		type: 'segment',
		id: 'seg-1',
		segmentId: 'seg-1',
		handle: 'body',
		startFrame: 0,
		endFrame: 88,
		pointerStartFrame: 0,
		...partial,
	};
}

function segPipeBounds(type: 'segment' | 'tag') {
	// segments: 0..240; tags clamped to parent seg (32..128)
	return type === 'segment' ? { min: 0, max: 240 } : { min: 32, max: 128 };
}

describe('getDragBounds', () => {
	it('segments span the pipe', () => {
		expect(getDragBounds(drag({}), 241, undefined)).toEqual({ min: 0, max: 240 });
	});
	it('tags are contained in their parent segment', () => {
		const d = drag({ type: 'tag', segmentId: 'seg-9' });
		expect(getDragBounds(d, 241, { frameStart: 32, frameEnd: 128 })).toEqual({ min: 32, max: 128 });
	});
	it('tag without segment falls back to pipe span', () => {
		const d = drag({ type: 'tag', segmentId: 'seg-9' });
		expect(getDragBounds(d, 241, undefined)).toEqual({ min: 0, max: 240 });
	});
});

describe('calculateElementDrag (segment)', () => {
	const g = segPipeBounds('segment');
	it('body drag preserves duration and clamps at 0', () => {
		const d = drag({ handle: 'body', startFrame: 0, endFrame: 88, pointerStartFrame: 0 });
		// delta -1000 → start wants -1000 → clamped to 0
		expect(calculateElementDrag(d, -1000, g)).toEqual([0, 88]);
	});
	it('body drag preserves duration and clamps at maxEnd', () => {
		const d = drag({ handle: 'body', startFrame: 96, endFrame: 192, pointerStartFrame: 0 });
		const [s, e] = calculateElementDrag(d, 1000, g);
		expect(e).toBe(240);
		expect(s).toBe(240 - 96); // duration 96 preserved, snapped (multiple of 8)
	});
	it('left thumb respects MIN_SPAN', () => {
		const d = drag({ handle: 'left', startFrame: 0, endFrame: 16, pointerStartFrame: 0 });
		expect(calculateElementDrag(d, 1000, g)).toEqual([8, 16]); // 16 - 8 min span
	});
	it('right thumb clamps at maxEnd', () => {
		const d = drag({ handle: 'right', startFrame: 200, endFrame: 208, pointerStartFrame: 0 });
		expect(calculateElementDrag(d, 1000, g)).toEqual([200, 240]);
	});
	it('body drag with duration > span clamps to the bound without drifting', () => {
		// Invariant: duration (160) is larger than the room left near max. The
		// single-clamp must pin start to (max - duration) and keep end at max,
		// preserving duration exactly (no double-snap drift).
		const d = drag({ handle: 'body', startFrame: 80, endFrame: 240, pointerStartFrame: 0 });
		const [s, e] = calculateElementDrag(d, 1000, g);
		expect(e).toBe(240);
		expect(e - s).toBe(160); // duration preserved
		expect(s).toBe(80); // start pinned at max - duration
	});
	it('body drag mid-range produces exactly start + delta (trailing snap gone)', () => {
		// A mid-range move where start + delta is already 8n-aligned: the result
		// must equal start + delta exactly — proving no second snapFrame is
		// applied after the clamp (the old double-snap shape).
		const d = drag({ handle: 'body', startFrame: 32, endFrame: 80, pointerStartFrame: 0 });
		// +48 → wants 80, well within [0, 240 - 48 = 192]
		expect(calculateElementDrag(d, 48, g)).toEqual([80, 128]);
	});
});

describe('calculateElementDrag (tag, contained)', () => {
	const g = segPipeBounds('tag');
	it('tag body cannot escape parent segment', () => {
		const d = drag({ type: 'tag', handle: 'body', startFrame: 56, endFrame: 88, pointerStartFrame: 0 });
		expect(calculateElementDrag(d, 1000, g)).toEqual([96, 128]); // 128 - 32
		expect(calculateElementDrag(d, -1000, g)).toEqual([32, 64]);
	});
	it('tag left thumb keeps MIN_SPAN inside parent', () => {
		const d = drag({ type: 'tag', handle: 'left', startFrame: 56, endFrame: 64, pointerStartFrame: 0 });
		expect(calculateElementDrag(d, -1000, g)).toEqual([32, 64]);
	});
});
