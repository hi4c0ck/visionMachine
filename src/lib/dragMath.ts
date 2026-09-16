// Pure drag math for temporal elements (segments, tags).
// Segments span the pipe; tags are strictly contained in their parent segment.
// No DOM, no store — testable without a browser.

import { snapFrame, MIN_SPAN } from './frameGeometry';

/** Touching boundaries are NOT an overlap (same invariant as the store). */
function rangesOverlapStrict(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

/**
 * Constrain a tag drag so same-type siblings in the zone never overlap.
 * The live preview (`candidate`) comes from `calculateElementDrag`; this
 * resolver slides/clamps it off the occupied sibling ranges:
 *  - body: fixed-duration slide, pushed to the nearest side of each
 *    conflicting sibling; clamped to bounds; falls back to `original`
 *    when no conflict-free position exists (the store backstop rejects
 *    the commit, so the data stays consistent).
 *  - left: start is pushed past the rightmost edge of every sibling that
 *    reaches under the (fixed) end, clamped to `end - minSpan`.
 *  - right: mirror of left.
 * Returns the constrained [start, end].
 */
export function resolveTagDragConflict(
	handle: 'left' | 'right' | 'body',
	candidate: [number, number],
	original: [number, number],
	occupied: Array<[number, number]>,
	bounds: DragBounds,
	minSpan: number = MIN_SPAN
): [number, number] {
	if (occupied.length === 0) return candidate;

	if (handle === 'body') {
		let [start, end] = candidate;
		const duration = end - start;
		// Bounded push loop: each pass slides the tag off any conflicting
		// sibling (nearest side); a jammed tag settles or falls back below.
		for (let pass = 0; pass <= occupied.length; pass++) {
			let moved = false;
			for (const [os, oe] of occupied) {
				if (!rangesOverlapStrict(start, end, os, oe)) continue;
				// leftGap / rightGap are both negative while overlapping:
				// the (negative) value closest to 0 is the SHORTER move.
				const leftGap = start - oe; // slide right onto the sibling's end: dist = -leftGap
				const rightGap = os - end; // slide left onto the sibling's start: dist = -rightGap
				const target = leftGap >= rightGap ? oe : os - duration;
				if (target !== start) {
					start = target;
					end = start + duration;
					moved = true;
				}
			}
			if (!moved) break;
		}
		// Clamp the fixed duration into the bounds.
		start = Math.max(bounds.min, Math.min(start, bounds.max - duration));
		end = start + duration;
		// Still overlapping after the best effort → fall back to the
		// pre-drag range (commit backstop in the store stays consistent).
		if (occupied.some(([os, oe]) => rangesOverlapStrict(start, end, os, oe))) {
			return original;
		}
		return [start, end];
	}

	let [start, end] = candidate;
	if (handle === 'left') {
		const intruding = occupied.filter(([os]) => os < end);
		if (intruding.length > 0) {
			start = Math.max(start, Math.max(...intruding.map(([, oe]) => oe)));
		}
		start = Math.min(Math.max(start, bounds.min), end - minSpan);
		return [start, end];
	}

	const intruding = occupied.filter(([, oe]) => oe > start);
	if (intruding.length > 0) {
		end = Math.min(end, Math.min(...intruding.map(([os]) => os)));
	}
	end = Math.max(Math.min(end, bounds.max), start + minSpan);
	return [start, end];
}

export interface TemporalDragState {
	type: 'segment' | 'tag' | 'global';
	id: string;
	segmentId: string;
	handle: 'left' | 'right' | 'body';
	startFrame: number;
	endFrame: number;
	pointerStartFrame: number;
}

export interface DragBounds {
	min: number;
	max: number;
}

/** Segment & global: pipe [0, totalFrames-1]. Tag: parent segment [segStart, segEnd]. */
export function getDragBounds(
	drag: Pick<TemporalDragState, 'type' | 'segmentId'>,
	totalFrames: number,
	segment: { frameStart: number; frameEnd: number } | undefined
): DragBounds {
	if (drag.type === 'segment' || drag.type === 'global') {
		return { min: 0, max: totalFrames - 1 };
	}
	return { min: segment?.frameStart ?? 0, max: segment?.frameEnd ?? totalFrames - 1 };
}

/**
 * Compute new [start, end] for a drag. Body drags preserve duration;
 * thumb drags respect MIN_SPAN. All values snap to FRAME_STEP.
 */
export function calculateElementDrag(
	drag: TemporalDragState,
	pointerFrame: number,
	bounds: DragBounds
): [number, number] {
	const delta = snapFrame(pointerFrame - drag.pointerStartFrame);
	let start = drag.startFrame;
	let end = drag.endFrame;
	const { min, max } = bounds;

	if (drag.handle === 'body') {
		// Spec-prescribed single-clamp: move by delta, clamp the new start into
		// [min, max - duration], snap ONCE. (An extra snapFrame after the clamp
		// was the old double-snap; all inputs are already 8n-aligned so it is a
		// no-op, but the shape now matches the spec.)
		const duration = end - start;
		const nextStart = Math.max(min, Math.min(snapFrame(start + delta), max - duration));
		start = nextStart;
		end = nextStart + duration;
	}

	if (drag.handle === 'left') {
		start = snapFrame(drag.startFrame + delta);
		start = Math.max(min, Math.min(start, end - MIN_SPAN));
	}

	if (drag.handle === 'right') {
		end = snapFrame(drag.endFrame + delta);
		end = Math.min(max, Math.max(end, start + MIN_SPAN));
	}

	return [start, end];
}
