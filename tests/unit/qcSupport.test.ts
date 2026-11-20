/**
 * Q/C wire-support classification (bug batch nov19, item 8).
 * Pins the honest-badge logic against the live-probed catalog shape.
 */
import { describe, it, expect } from 'vitest';
import { qcSupport } from '$lib/settings/qcSupport';
import { AGNES_PRESET, CUSTOM_PRESET } from '$lib/settings/catalog';
import type { ModelSpec } from '$types';

describe('qcSupport', () => {
	it('null/undefined spec → none', () => {
		expect(qcSupport(null)).toBe('none');
		expect(qcSupport(undefined)).toBe('none');
	});
	it('no knobs declared → none (logged only)', () => {
		expect(qcSupport({ id: 'x' } as ModelSpec)).toBe('none');
	});
	it('img2img-only gate → img2img-only', () => {
		expect(
			qcSupport({ id: 'x', guidance: 'guidance_scale', img2imgOnly: true } as ModelSpec),
		).toBe('img2img-only');
	});
	it('knobs without the gate → full', () => {
		expect(qcSupport({ id: 'x', guidance: 'guidance_scale' } as ModelSpec)).toBe('full');
		expect(qcSupport({ id: 'x', steps: 'num_inference_steps' } as ModelSpec)).toBe('full');
	});
	it('shipped Agnes image 2.5-flash is img2img-only with both knobs + range', () => {
		const spec = AGNES_PRESET.models.find((m) => m.id === 'agnes-image-2.5-flash')!;
		expect(qcSupport(spec)).toBe('img2img-only');
		expect(spec.guidance).toBe('guidance_scale');
		expect(spec.steps).toBe('num_inference_steps');
		expect(spec.guidanceRange).toEqual([0.5, 15]);
	});
	it('shipped video models declare no knobs (every route rejects them)', () => {
		for (const m of AGNES_PRESET.models.filter((m) => m.kind === 'video')) {
			expect(qcSupport(m)).toBe('none');
			expect(m.guidance).toBeUndefined();
			expect(m.steps).toBeUndefined();
		}
	});
	it('custom escape-hatch models stay none until a user declares knobs', () => {
		const img = CUSTOM_PRESET.models.find((m) => m.id === 'custom-image')!;
		expect(qcSupport(img)).toBe('none');
	});
});