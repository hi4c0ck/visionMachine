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
		const duration = end - start;
		start += delta;
		end += delta;
		if (start < min) {
			start = min;
			end = min + duration;
		}
		if (end > max) {
			end = max;
			start = max - duration;
		}
		start = snapFrame(start);
		end = start + duration;
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
