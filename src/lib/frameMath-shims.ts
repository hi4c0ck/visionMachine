// Backward-compat shims for frameMath.ts
// These re-export from frameGeometry.ts so existing callers don't break.
// NEW code should import directly from '$lib/frameGeometry'.

import { snapFrameDown, FRAME_STEP } from './frameGeometry';

/**
 * @deprecated Use frameGeometry.snapFrameDown() or frameGeometry.snapFrame() instead.
 */
export const snapTo8 = snapFrameDown;

/**
 * @deprecated Use frameGeometry.framePercent() instead.
 */
export function frameToPercent(frame: number, totalFrames: number): number {
	return (frame / (totalFrames - 1)) * 100;
}

/**
 * @deprecated Use frameGeometry.pxToFrame() with geometry instead.
 */
export function percentToFrame(xPercent: number, totalFrames: number): number {
	const raw = (xPercent / 100) * (totalFrames - 1);
	return Math.round(raw);
}

/**
 * Re-export FRAME_STEP constant for convenience.
 */
export { FRAME_STEP } from './frameGeometry';
