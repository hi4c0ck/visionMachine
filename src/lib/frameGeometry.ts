// Canonical frame geometry engine for VisionMachine composer timeline
//
// This is the ONE source of truth for frame↔pixel conversion.
// Every timeline primitive (FrameRuler, Segment, Tag, MultiThumbSlider)
// consumes the same FrameGeometry instance.
//
// Invariant:
//   frame 0       → x = 0
//   frame N-1     → x = width   (where N = totalFrames)

export const FRAME_STEP = 8;
export const MIN_SPAN = 8;

export interface FrameGeometry {
	totalFrames: number;
	contentEndFrame: number;
	width: number;
}

/**
 * Create a FrameGeometry from total frame count and rendered pixel width.
 * Throws if inputs are invalid.
 */
export function createFrameGeometry(
	totalFrames: number,
	width: number
): FrameGeometry {
	if (!Number.isFinite(totalFrames) || totalFrames < 2) {
		throw new Error(`Invalid totalFrames: ${totalFrames}`);
	}
	if (!Number.isFinite(width) || width <= 0) {
		throw new Error(`Invalid ruler width: ${width}`);
	}
	return {
		totalFrames,
		contentEndFrame: totalFrames - 1,
		width
	};
}

/**
 * Convert a valid content frame to exact pixel coordinate.
 * frame 0       → 0
 * frame N-1     → width
 */
export function frameToPx(frame: number, geometry: FrameGeometry): number {
	const clamped = clamp(frame, 0, geometry.contentEndFrame);
	return (clamped / geometry.contentEndFrame) * geometry.width;
}

/**
 * Convert an exact pixel coordinate back into the nearest frame.
 * Returns UNSNAPPED frame — snapping is a separate operation.
 */
export function pxToFrame(x: number, geometry: FrameGeometry): number {
	const clampedX = clamp(x, 0, geometry.width);
	return (clampedX / geometry.width) * geometry.contentEndFrame;
}

/**
 * Snap any frame value to the nearest timeline boundary (multiple of 8).
 */
export function snapFrame(frame: number): number {
	return Math.round(frame / FRAME_STEP) * FRAME_STEP;
}

/**
 * Snap down (floor to nearest multiple of 8).
 */
export function snapFrameDown(frame: number): number {
	return Math.floor(frame / FRAME_STEP) * FRAME_STEP;
}

/**
 * Snap up (ceil to nearest multiple of 8).
 */
export function snapFrameUp(frame: number): number {
	return Math.ceil(frame / FRAME_STEP) * FRAME_STEP;
}

/**
 * Convert clientX directly into a snapped frame using a DOM rect.
 */
export function pointerToFrame(
	clientX: number,
	rect: DOMRect,
	geometry: FrameGeometry
): number {
	const localX = clientX - rect.left;
	const rawFrame = pxToFrame(localX, geometry);
	return clamp(snapFrame(rawFrame), 0, geometry.contentEndFrame);
}

/**
 * Convert a frame to percentage for static CSS positioning.
 * Use frameToPx() for draggable/interactive elements instead.
 */
export function framePercent(frame: number, geometry: FrameGeometry): number {
	return (frameToPx(frame, geometry) / geometry.width) * 100;
}

/**
 * Pixel width of a frame range.
 */
export function rangeWidthPx(
	startFrame: number,
	endFrame: number,
	geometry: FrameGeometry
): number {
	return Math.max(0, frameToPx(endFrame, geometry) - frameToPx(startFrame, geometry));
}

/**
 * Convert a frame delta into an exact pixel delta.
 */
export function frameDeltaToPx(frameDelta: number, geometry: FrameGeometry): number {
	return (frameDelta / geometry.contentEndFrame) * geometry.width;
}

/**
 * Convert a pixel delta to frame space.
 */
export function pxDeltaToFrame(pxDelta: number, geometry: FrameGeometry): number {
	return (pxDelta / geometry.width) * geometry.contentEndFrame;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
