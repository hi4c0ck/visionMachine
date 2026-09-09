// Pure frame-range drag math for the composer timeline.
//
// One coordinate system, one snap system: all bounds are frame numbers,
// all results are snapped to FRAME_STEP multiples. No DOM access here —
// this is testable pure math that ComposerPanel routes through in a single
// code path for segments and tags.

import { snapFrame, MIN_SPAN } from './frameGeometry';

/** Segment body drag: duration preserved, clamped to [0, maxEnd - duration]. */
export function calcSegmentBodyDrag(
	dragStart: number,
	dragEnd: number,
	delta: number,
	maxEnd: number
): [number, number] {
	const duration = dragEnd - dragStart;
	const nextStart = Math.max(0, Math.min(snapFrame(dragStart + delta), maxEnd - duration));
	return [nextStart, nextStart + duration];
}

/** Segment handle drag (left or right), clamped with MIN_SPAN to [0, maxEnd]. */
export function calcSegmentHandleDrag(
	dragStart: number,
	dragEnd: number,
	delta: number,
	handle: 'left' | 'right',
	maxEnd: number
): [number, number] {
	if (handle === 'left') {
		let start = snapFrame(dragStart + delta);
		start = Math.max(0, Math.min(start, dragEnd - MIN_SPAN));
		return [start, dragEnd];
	}
	let end = snapFrame(dragEnd + delta);
	end = Math.min(maxEnd, Math.max(end, dragStart + MIN_SPAN));
	return [dragStart, end];
}

/**
 * Tag drag strictly contained in the parent segment [segStart, segEnd].
 * Body: duration preserved + clamped. Left/right: MIN_SPAN respected.
 */
export function calcTagDrag(
	segStart: number,
	segEnd: number,
	dragStart: number,
	dragEnd: number,
	delta: number,
	handle: 'left' | 'right' | 'body'
): [number, number] {
	const duration = dragEnd - dragStart;
	let start = dragStart;
	let end = dragEnd;
	if (handle === 'body') {
		const nextStart = Math.max(segStart, Math.min(snapFrame(start + delta), segEnd - duration));
		start = nextStart;
		end = nextStart + duration;
	} else if (handle === 'left') {
		start = Math.max(segStart, Math.min(snapFrame(start + delta), end - MIN_SPAN));
	} else {
		end = Math.min(segEnd, Math.max(snapFrame(end + delta), start + MIN_SPAN));
	}
	return [start, end];
}
