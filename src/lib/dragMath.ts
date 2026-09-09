// Pure drag math for temporal elements (segments, tags).
// Segments span the pipe; tags are strictly contained in their parent segment.
// No DOM, no store — testable without a browser.

import { snapFrame, MIN_SPAN } from './frameGeometry';

export interface TemporalDragState {
	type: 'segment' | 'tag';
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

/** Segment: pipe [0, totalFrames-1]. Tag: parent segment [segStart, segEnd]. */
export function getDragBounds(
	drag: Pick<TemporalDragState, 'type' | 'segmentId'>,
	totalFrames: number,
	segment: { frameStart: number; frameEnd: number } | undefined
): DragBounds {
	if (drag.type === 'segment') {
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
