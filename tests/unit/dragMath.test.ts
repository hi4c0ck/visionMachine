import { describe, it, expect } from 'vitest';
import {
	calculateElementDrag,
	getDragBounds,
	resolveTagDragConflict,
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
	it('global ranges span the pipe (same bounds as segments)', () => {
		const d = drag({ type: 'global', id: 'g-1', segmentId: 'g-1' });
		expect(getDragBounds(d, 241, undefined)).toEqual({ min: 0, max: 240 });
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
	describe('calculateElementDrag (global range)', () => {
		const g = segPipeBounds('segment');
		it('body drag preserves duration', () => {
			const d = drag({ type: 'global', id: 'g-1', segmentId: 'g-1', handle: 'body', startFrame: 16, endFrame: 112, pointerStartFrame: 0 });
			// +48 → [64, 160]
			expect(calculateElementDrag(d, 48, g)).toEqual([64, 160]);
		});
		it('right grip extends to pipe end', () => {
			const d = drag({ type: 'global', id: 'g-1', segmentId: 'g-1', handle: 'right', startFrame: 0, endFrame: 120, pointerStartFrame: 0 });
			expect(calculateElementDrag(d, 1000, g)).toEqual([0, 240]);
		});
		it('left grip respects MIN_SPAN', () => {
			const d = drag({ type: 'global', id: 'g-1', segmentId: 'g-1', handle: 'left', startFrame: 0, endFrame: 8, pointerStartFrame: 0 });
			expect(calculateElementDrag(d, 1000, g)).toEqual([0, 8]); // can't shrink below min span
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

describe('resolveTagDragConflict (same-type siblings never overlap)', () => {
	const pipe = { min: 0, max: 240 };

	it('returns the candidate when no same-type siblings exist', () => {
		expect(resolveTagDragConflict('body', [40, 80], [32, 72], [], pipe)).toEqual([40, 80]);
	});

	it('body: slides onto the nearest clear side of a conflicting sibling', () => {
		// Sibling [0, 60]; a 60-frame tag dragged left to [12, 72] settles
		// against the sibling's end (48 right) rather than past its start (72 left).
		expect(resolveTagDragConflict('body', [12, 72], [60, 120], [[0, 60]], pipe)).toEqual([60, 120]);
	});

	it('body: slides left onto the sibling start when that is the shorter move', () => {
		// Sibling [120, 180]; a 60-frame tag dragged right to [108, 168] settles
		// against the sibling's start (48 left) rather than past its end (72 right).
		expect(resolveTagDragConflict('body', [108, 168], [60, 120], [[120, 180]], pipe)).toEqual([60, 120]);
	});

	it('body: settles into the gap between two siblings', () => {
		// Siblings [0, 60] and [120, 180]; a 60-frame tag dragged into the left
		// sibling settles into the free gap [60, 120].
		expect(
			resolveTagDragConflict('body', [30, 90], [60, 120], [[0, 60], [120, 180]], pipe)
		).toEqual([60, 120]);
	});

	it('body: a fully jammed tag falls back to its original range', () => {
		// Packed zone [0, 32]: sibling [16, 32], tag [0, 16]. Dragging the tag
		// fully onto the sibling leaves no clear slot -> back to where it was.
		const packed = { min: 0, max: 32 };
		expect(resolveTagDragConflict('body', [16, 32], [0, 16], [[16, 32]], packed)).toEqual([0, 16]);
	});

	it('left grip: start is pushed past the sibling it would overlap', () => {
		// Sibling [0, 60]; tag [60, 120] with its left grip dragged to 40
		// cannot enter the sibling -> start stays at 60.
		expect(resolveTagDragConflict('left', [40, 120], [60, 120], [[0, 60]], pipe)).toEqual([60, 120]);
	});

	it('left grip: a min-size tag pinned against a sibling stays put', () => {
		// Sibling [0, 40]; tag [40, 48] (8 frames). The grip wants start 0,
		// but end - MIN_SPAN pins it back at 40.
		expect(resolveTagDragConflict('left', [0, 48], [40, 48], [[0, 40]], pipe)).toEqual([40, 48]);
	});

	it('right grip: end is pulled back before the sibling it would overlap', () => {
		// Sibling [80, 120]; tag [40, 80] with its right grip dragged to 100
		// cannot enter the sibling -> end stays at 80.
		expect(resolveTagDragConflict('right', [40, 100], [40, 80], [[80, 120]], pipe)).toEqual([40, 80]);
	});

	it('right grip: a min-size tag pinned against a sibling stays put', () => {
		// Sibling [8, 40]; tag [0, 8] (min size). The grip wants end 24,
		// but start + MIN_SPAN pins it back at 8.
		expect(resolveTagDragConflict('right', [0, 24], [0, 8], [[8, 40]], pipe)).toEqual([0, 8]);
	});
});
