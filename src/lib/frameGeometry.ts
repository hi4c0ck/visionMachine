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

export function createFrameGeometry(
	totalFrames: number,
	width: number
): FrameGeometry {
	if (!Number.isInteger(totalFrames) || totalFrames < 2) {
		throw new Error(`Invalid totalFrames: ${totalFrames}`);
	}
	if (!Number.isFinite(width) || width <= 0) {
		throw new Error(`Invalid width: ${width}`);
	}
	return {
		totalFrames,
		contentEndFrame: totalFrames - 1,
		width
	};
}

export function clampFrame(
	frame: number,
	geometry: FrameGeometry
): number {
	return Math.min(geometry.contentEndFrame, Math.max(0, frame));
}

export function snapFrame(frame: number): number {
	return Math.round(frame / FRAME_STEP) * FRAME_STEP;
}

export function snapFrameDown(frame: number): number {
	return Math.floor(frame / FRAME_STEP) * FRAME_STEP;
}

export function snapFrameUp(frame: number): number {
	return Math.ceil(frame / FRAME_STEP) * FRAME_STEP;
}

/**
 * Frame -> pixel.
 * 0 => 0, contentEndFrame => width
 */
export function frameToPx(
	frame: number,
	geometry: FrameGeometry
): number {
	const value = clampFrame(frame, geometry);
	return (value / geometry.contentEndFrame) * geometry.width;
}

/**
 * Frame -> percentage.
 * Only use this for CSS percentage positioning.
 * Interactive geometry should use frameToPx().
 */
export function frameToPercent(
	frame: number,
	geometry: FrameGeometry
): number {
	return (frameToPx(frame, geometry) / geometry.width) * 100;
}

/**
 * Pixel -> unsnapped frame.
 */
export function pxToFrame(
	x: number,
	geometry: FrameGeometry
): number {
	const clampedX = Math.min(geometry.width, Math.max(0, x));
	return (clampedX / geometry.width) * geometry.contentEndFrame;
}

/**
 * Pixel -> snapped frame.
 */
export function pxToSnappedFrame(
	x: number,
	geometry: FrameGeometry
): number {
	return clampFrame(snapFrame(pxToFrame(x, geometry)), geometry);
}

/**
 * clientX -> snapped frame using DOM rect.
 */
export function clientXToFrame(
	clientX: number,
	rect: DOMRect,
	geometry: FrameGeometry
): number {
	return pxToSnappedFrame(clientX - rect.left, geometry);
}

/**
 * Pixel delta -> frame delta.
 * Do NOT snap this value independently when doing body drags.
 * Calculate frame position from original frame + snapped delta.
 */
export function pxDeltaToFrame(
	pxDelta: number,
	geometry: FrameGeometry
): number {
	return (pxDelta / geometry.width) * geometry.contentEndFrame;
}

export function rangeWidthPx(
	startFrame: number,
	endFrame: number,
	geometry: FrameGeometry
): number {
	return Math.max(
		0,
		frameToPx(endFrame, geometry) -
		frameToPx(startFrame, geometry)
	);
}

export function rangeStyle(
	startFrame: number,
	endFrame: number,
	geometry: FrameGeometry
): string {
	const left = frameToPx(startFrame, geometry);
	const width = rangeWidthPx(startFrame, endFrame, geometry);
	return `left:${left}px;width:${width}px;`;
}
