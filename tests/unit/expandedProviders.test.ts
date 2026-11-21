/**
 * Expanded provider system (plan 2026-11-21_110654-video-adapter-multi-provider).
 * Pins the data-layer contracts: new presets, keyless gates, free-form model
 * ids, urlStyle normalization, and the Tier-A adapter merge. The Agnes
 * production path stays pinned by settings.test.ts (byte-stable).
 */
import { describe, it, expect } from 'vitest';
import type { Settings } from '../../src/types';
import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	normalizeBaseUrl,
	isConfigured,
	providerStatusFor,
} from '../../src/lib/settings/guards';
import {
	PRESETS,
	AGNES_PRESET,
	CUSTOM_PRESET,
	getPreset,
	getModel,
} from '../../src/lib/settings/catalog';
import { mergeAdapter } from '../../src/lib/settings/resolveSpecs';

describe('expanded catalog', () => {
	it('ships the OpenAI-route text presets + the Tier-A video presets', () => {
		for (const id of ['openai', 'openrouter', 'ollama', 'lmstudio', 'llamacpp']) {
			const p = getPreset(id);
			expect(p, id).toBeDefined();
			expect(p!.kinds).toEqual(['text']);
		}
		for (const id of ['runway', 'fal', 'replicate', 'luma', 'kling', 'minimax']) {
			const p = getPreset(id);
			expect(p, id).toBeDefined();
			expect(p!.kinds).toEqual(['video']);
			expect(p!.adapter, `${id} adapter`).toBeDefined();
		}
		// Agnes + custom stay first (default seeding order unchanged).
		expect(PRESETS[0]).toBe(AGNES_PRESET);
		expect(PRESETS[1]).toBe(CUSTOM_PRESET);
	});

	it('local presets are keyless; fal uses the Key header scheme', () => {
		expect(getPreset('ollama')!.auth).toBe('none');
		expect(getPreset('lmstudio')!.auth).toBe('none');
		expect(getPreset('llamacpp')!.auth).toBe('none');
		expect(getPreset('fal')!.auth).toBe('key-header');
		expect(getPreset('runway')!.auth).toBe('bearer');
		expect(AGNES_PRESET.auth).toBe('bearer');
	});

	it('every new video model ships pending until live-verified (no mocks, D1)', () => {
		for (const id of ['runway', 'fal', 'replicate', 'luma', 'kling', 'minimax']) {
			for (const m of getPreset(id)!.models) {
				expect(m.pending, `${id}/${m.id}`).toBe(true);
				expect(m.requestFormat).toBe('video-adapter');
				expect(m.adapterPayload, `${id}/${m.id} payload`).toBeDefined();
			}
		}
		// Agnes models are NOT pending (production path untouched).
		expect(AGNES_PRESET.models.every((m) => !m.pending)).toBe(true);
	});

	it('free-form presets carry the flag + model listing surface', () => {
		expect(CUSTOM_PRESET.freeFormModel).toBe(true);
		expect(getPreset('openrouter')!.freeFormModel).toBe(true);
		expect(getPreset('ollama')!.modelList).toEqual({ endpoint: '/api/tags', shape: 'ollama' });
		expect(getPreset('lmstudio')!.modelList).toEqual({ endpoint: '/models', shape: 'openai' });
		// Closed catalog presets keep the constrained picker.
		expect(AGNES_PRESET.freeFormModel).toBeFalsy();
		expect(getPreset('runway')!.freeFormModel).toBeFalsy();
	});

	it('runway adapter pins the researched contract (version header, 0-1 progress, credits)', () => {
		const a = getPreset('runway')!.adapter!;
		expect(a.headers?.['X-Runway-Version']).toBe('2024-11-06');
		expect(a.response.progressScale).toBe(1);
		expect(a.response.statusMap['THROTTLED']).toBe('throttled');
		expect(a.response.reportedCost).toEqual({ path: 'cost.credits', unit: 'credits' });
		expect(a.cancel).toEqual({ endpoint: '/v1/tasks/{jobId}', method: 'DELETE' });
	});

	it('fal adapter pins the two-stage result trap (COMPLETED includes failures)', () => {
		const a = getPreset('fal')!.adapter!;
		expect(a.poll.resultEndpoint).toBe('/{model}/requests/{jobId}');
		expect(a.response.statusMap['COMPLETED']).toBe('succeeded');
		expect(a.response.errorPath).toBe('detail');
	});

	it('minimax adapter pins retrieve mode; kling maps both succeed casings', () => {
		const mm = getPreset('minimax')!.adapter!;
		expect(mm.response.artifact.mode).toBe('retrieve');
		expect(mm.response.artifact.fileIdPath).toBe('file_id');
		expect(mm.response.envelope?.codePath).toBe('base_resp.status_code');
		const kl = getPreset('kling')!.adapter!;
		expect(kl.response.statusMap['succeed']).toBe('succeeded');
		expect(kl.response.statusMap['succeeded']).toBe('succeeded');
		expect(kl.response.reportedCost?.unit).toBe('units');
	});

	it('text capability flags: agnes thinking toggle, openai-route none, locals json_object', () => {
		expect(getModel(AGNES_PRESET, 'agnes-2.5-flash')?.thinkingToggle).toBe(true);
		expect(getModel(AGNES_PRESET, 'agnes-2.5-flash')?.structuredOutput).toBe('json_schema');
		expect(getModel(getPreset('openai')!, 'gpt-4.1')?.thinkingToggle).toBeFalsy();
		expect(getModel(getPreset('ollama')!, 'local-model')?.structuredOutput).toBe('json_object');
	});
});

describe('keyless gates (auth none)', () => {
	const ollamaSlot = {
		preset: 'ollama',
		baseUrl: 'http://localhost:11434',
		apiKey: '',
		model: 'llama3.1:8b',
	};

	it('isConfigured: keyless slot needs only url + model', () => {
		expect(isConfigured(ollamaSlot)).toBe(true);
		expect(isConfigured({ ...ollamaSlot, baseUrl: '' })).toBe(false);
		expect(isConfigured({ ...ollamaSlot, model: '' })).toBe(false);
		// Keyed presets keep the key requirement.
		expect(isConfigured({ preset: 'runway', baseUrl: 'https://api.dev.runwayml.com', apiKey: '', model: 'gen4.5' })).toBe(false);
	});

	it('providerStatusFor: no key gap for keyless presets', () => {
		const s: Settings = {
			...DEFAULT_SETTINGS,
			providers: { ...DEFAULT_SETTINGS.providers, text: ollamaSlot },
		};
		const st = providerStatusFor('text', s);
		expect(st.configured).toBe(true);
		expect(st.gaps).toEqual([]);
		expect(st.hasKey).toBe(false); // presence flag stays honest
	});

	it('normalizeSettings keeps a typed free-form model id (no catalog heal)', () => {
		const out = normalizeSettings({
			providers: { text: { preset: 'ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' } },
		});
		expect(out.providers.text.model).toBe('qwen2.5:14b');
		const custom = normalizeSettings({
			providers: { text: { preset: 'custom', baseUrl: 'https://my.server/v1', model: 'my-chat-model' } },
		});
		expect(custom.providers.text.model).toBe('my-chat-model');
		// Closed presets still migrate unknown ids (Agnes pin).
		const agnes = normalizeSettings({
			providers: { video: { preset: 'agnes', baseUrl: 'https://apihub.agnes-ai.com', model: 'gone-model' } },
		});
		expect(agnes.providers.video.model).toBe('agnes-video-2.5-flash');
	});
});

describe('urlStyle normalization', () => {
	it('host-root presets strip a pasted /v1; v1-native keep it', () => {
		expect(normalizeBaseUrl('runway', 'https://api.dev.runwayml.com/v1')).toBe('https://api.dev.runwayml.com');
		expect(normalizeBaseUrl('ollama', 'http://localhost:11434/v1')).toBe('http://localhost:11434');
		expect(normalizeBaseUrl('openai', 'https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
		expect(normalizeBaseUrl('luma', 'https://api.lumalabs.ai/dream-machine/v1')).toBe('https://api.lumalabs.ai/dream-machine/v1');
		// Agnes behavior byte-stable.
		expect(normalizeBaseUrl('agnes', 'https://apihub.agnes-ai.com/v1/')).toBe('https://apihub.agnes-ai.com');
	});
});

describe('mergeAdapter (preset ⊕ model overrides ⊕ payload)', () => {
	it('merges the runway t2v endpoint override + per-model payload', () => {
		const preset = getPreset('runway')!;
		const t2v = getModel(preset, 'gen4.5-t2v')!;
		const merged = mergeAdapter(preset.adapter, t2v)!;
		expect(merged.create.endpoint).toBe('/v1/text_to_video');
		// Vendor transport survives the override.
		expect(merged.poll.endpoint).toBe('/v1/tasks/{jobId}');
		expect(merged.headers?.['X-Runway-Version']).toBe('2024-11-06');
		expect(merged.payload).toEqual(t2v.adapterPayload);
	});

	it('deep-merges nested response deltas (kling t2v poll path)', () => {
		const preset = getPreset('kling')!;
		const t2v = getModel(preset, 'kling-v2-6-t2v')!;
		const merged = mergeAdapter(preset.adapter, t2v)!;
		expect(merged.poll.endpoint).toBe('/v1/videos/text2video/{jobId}');
		// Untouched response fields survive the deep merge.
		expect(merged.response.jobIdPath).toBe('data.task_id');
		expect(merged.response.envelope?.codePath).toBe('code');
	});

	it('non-adapter models and missing preset adapters merge to null', () => {
		expect(mergeAdapter(getPreset('runway')!.adapter, getModel(AGNES_PRESET, 'agnes-video-2.5-flash')!)).toBeNull();
		expect(mergeAdapter(undefined, getModel(getPreset('runway')!, 'gen4.5')!)).toBeNull();
	});

	it('i2v model keeps the vendor create endpoint and carries its payload', () => {
		const preset = getPreset('runway')!;
		const i2v = getModel(preset, 'gen4.5')!;
		const merged = mergeAdapter(preset.adapter, i2v)!;
		expect(merged.create.endpoint).toBe('/v1/image_to_video');
		expect(merged.payload['promptImage']).toBe('{{media:first}}');
		expect(merged.media?.input).toBe('url-or-data');
	});
});
