import { describe, it, expect } from 'vitest';
import {
	calcSegmentBodyDrag,
	calcSegmentHandleDrag,
	calcTagDrag,
} from '../../src/lib/dragMath';

// PIPE: totalFrames 241 (8n+1) → maxEnd = 240.
// SNAP: FRAME_STEP = 8; MIN_SPAN = 8.

describe('calcSegmentBodyDrag', () => {
	const MAX_END = 240;

	it('preserves duration on free move', () => {
		// [32..64] duration 32, +16 → [48..80]
		expect(calcSegmentBodyDrag(32, 64, 16, MAX_END)).toEqual([48, 80]);
	});

	it('snaps delta to FRAME_STEP', () => {
		// [0..8], delta 10 → snapFrame(10)=8 → [8..16]
		expect(calcSegmentBodyDrag(0, 8, 10, MAX_END)).toEqual([8, 16]);
	});

	it('clamps at start of pipe (start=0)', () => {
		// [8..16] delta -500 → snapFrame(-492) = -496 → clamps to 0 → [0..8]
		expect(calcSegmentBodyDrag(8, 16, -500, MAX_END)).toEqual([0, 8]);
	});

	it('clamps at end of pipe (start = maxEnd - duration)', () => {
		// [128..160] delta +500 → snapFrame(628)=624 → maxStart 240-32=208 → [208..240]
		expect(calcSegmentBodyDrag(128, 160, 500, MAX_END)).toEqual([208, 240]);
	});
});

describe('calcSegmentHandleDrag', () => {
	const MAX_END = 240;

	it('left handle respects 0 and MIN_SPAN', () => {
		// [8..40] delta -500 → snapFrame(-492) = -496 → clamps to 0
		expect(calcSegmentHandleDrag(8, 40, -500, 'left', MAX_END)).toEqual([0, 40]);
		// MIN_SPAN: [8..16] delta -500 → start ≤ end-8=8, but 0 is free (span 16 ≥ MIN_SPAN)
		expect(calcSegmentHandleDrag(8, 16, -500, 'left', MAX_END)).toEqual([0, 16]);
		// MIN_SPAN binding: [40..48] delta +500 → start clamps to end-8=40
		expect(calcSegmentHandleDrag(40, 48, 500, 'left', MAX_END)).toEqual([40, 48]);
	});

	it('right handle respects maxEnd and MIN_SPAN', () => {
		// [200..232] delta +500 → end clamps to 240
		expect(calcSegmentHandleDrag(200, 232, 500, 'right', MAX_END)).toEqual([200, 240]);
		// MIN_SPAN: [0..8] delta -500 → end >= start+8 = 8 → [0..8]
		expect(calcSegmentHandleDrag(0, 8, -500, 'right', MAX_END)).toEqual([0, 8]);
	});

	it('snaps handle moves to FRAME_STEP', () => {
		expect(calcSegmentHandleDrag(0, 40, 10, 'left', MAX_END)).toEqual([8, 40]);
	});
});

describe('calcTagDrag (strict containment in parent segment)', () => {
	// Parent segment [32..128]

	it('body drag cannot escape the segment — clamps to segEnd - duration', () => {
		// [56..88] duration 32, +500 → snapFrame(556)=552 → clamp 128-32=96 → [96..128]
		expect(calcTagDrag(32, 128, 56, 88, 500, 'body')).toEqual([96, 128]);
	});

	it('body drag cannot escape left — clamps to segStart', () => {
		// [56..88] -500 → snapFrame(-444) → clamps to 32 → [32..64]
		expect(calcTagDrag(32, 128, 56, 88, -500, 'body')).toEqual([32, 64]);
	});

	it('left thumb clamps to segStart but keeps MIN_SPAN', () => {
		// [56..88] delta -500 → start clamps to 32; MIN_SPAN keeps ≤ 88-8=80
		expect(calcTagDrag(32, 128, 56, 88, -500, 'left')).toEqual([32, 88]);
	});

	it('right thumb clamps to segEnd but keeps MIN_SPAN', () => {
		// [56..88] delta +500 → end clamps to 128
		expect(calcTagDrag(32, 128, 56, 88, 500, 'right')).toEqual([56, 128]);
		// MIN_SPAN: [96..128] delta -500 → end >= 96+8=104 → [96..104]
		expect(calcTagDrag(32, 128, 96, 128, -500, 'right')).toEqual([96, 104]);
	});
});
