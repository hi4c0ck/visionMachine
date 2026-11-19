// Q/C wire-support classification (bug batch nov19, item 8).
//
// Live-probed 2026-11-19: the Agnes img2img queue accepts guidance_scale +
// num_inference_steps; the txt2img queue and ALL video routes reject them.
// The UI must say so at the sliders instead of letting the user tune a
// silent no-op. Pure helper → unit-testable; the strings live in constants.

import type { ModelSpec } from '$types';

export type QcSupport = 'full' | 'img2img-only' | 'none';

/** Classify what the resolved IMAGE spec does with the Q/C knobs:
 *  - none: no guidance/steps declared → logged only, never sent.
 *  - img2img-only: knobs ride reference-based (img2img) requests only.
 *  - full: knobs ride every image request.
 *  Video models never declare the knobs (Agnes rejects them on every
 *  route) — the note covers that in its wording. */
export function qcSupport(imageSpec: ModelSpec | null | undefined): QcSupport {
	if (!imageSpec || (!imageSpec.guidance && !imageSpec.steps)) return 'none';
	if (imageSpec.img2imgOnly) return 'img2img-only';
	return 'full';
}