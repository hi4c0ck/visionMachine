/**
 * Wan2GP MCP provider slice (local stateless JSON-RPC transport).
 * Pins the catalog/preset data, the resolveSpecs wiring, and the "portable
 * data only" rule. No live server / GPU work: Rust parsing and the stub-HTTP
 * video flow are pinned in generation/mcp.rs + generation/provider.rs tests.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { Settings } from '../../src/types';
import {
	PRESETS,
	WAN2GP_PRESET,
	getPreset,
	capabilityNote,
} from '../../src/lib/settings/catalog';
import { mergeMcp, resolveModelSpec, resolveSpecs } from '../../src/lib/settings/resolveSpecs';
import { frameGridForModel } from '../../src/lib/frameMath';
import { getSettings, updateSettings } from '../../src/lib/settings/store';

// The settings store is a non-reactive module singleton shared by every test
// in the file: snapshot + restore so later suites never see our video slot.
const snapshot = JSON.parse(JSON.stringify(getSettings())) as Settings;
afterAll(() => {
	updateSettings((d) => {
		d.providers = JSON.parse(JSON.stringify(snapshot.providers)) as Settings['providers'];
	});
});

describe('WAN2GP_PRESET catalog shape', () => {
	it('is registered as a keyless, host-root local MCP preset', () => {
		const p = getPreset('wan2gp');
		expect(p).toBeDefined();
		expect(p).toBe(WAN2GP_PRESET);
		expect(PRESETS).toContain(WAN2GP_PRESET);
		expect(p!.label).toBe('Wan2GP (local MCP)');
		expect(p!.kinds).toEqual(['video']);
		expect(p!.auth).toBe('none');
		expect(p!.urlStyle).toBe('host-root');
		expect(p!.defaultBaseUrl).toBe('http://127.0.0.1:8765');
		expect(p!.customTransport).toBe('mcp');
		expect(p!.pingPath).toEqual({ video: '/mcp' });
		expect(p!.tag).toBe('local');
	});

	it('mcp config mirrors the verified JSON-RPC contract (no SDK / session)', () => {
		const m = WAN2GP_PRESET.mcp;
		expect(m).toBeDefined();
		expect(m!.endpoint).toBe('/mcp');
		expect(m!.protocolVersion).toBe('2025-06-18');
		expect(m!.tools).toEqual({ generate: 'wangp_generate', session: 'wangp_session' });
		// Non-blocking submit: the engine gets a job_id at once and polls
		// wangp_session get_job (progress + stall + cancel). A blocking
		// wait=true render orphans the client on a long job (the 360s early
		// drop), so Wan2GP rides the poll path.
		expect(m!.generate?.wait).toBe(false);
		// No invented generation values: resolution / frames / steps / guidance
		// come from the UI controls (sizeMap, lengthFrames, qValue, cValue).
		expect(m!.settingsDefaults).toMatchObject({
			model_type: 'ti2v_2_2',
			seed: -1,
			flow_shift: 5,
			image_mode: 0,
			image_prompt_type: 'T',
		});
		for (const key of ['resolution', 'video_length', 'num_inference_steps', 'guidance_scale']) {
			expect((m!.settingsDefaults ?? {})[key]).toBeUndefined();
		}
		// No redundant per-model user block: the standard resolution/duration/
		// seed controls drive the MCP wire, so the preset ships no `tunables`.
		expect(m!.tunables).toBeUndefined();
		// The transfer actions are declared so i2v can fail explicitly instead
		// of silently ignoring image input.
		expect(m!.actions?.upload?.action).toBe('create_file_upload');
		expect(m!.actions?.download?.action).toBe('create_file_download');
		expect(m!.actions?.download?.pathArg).toBe('source');
	});

	it('keeps the pending ti2v_2_2 row unchanged beside the new H3 sibling', () => {
		expect(WAN2GP_PRESET.models).toHaveLength(2);
		const m = WAN2GP_PRESET.models.find((x) => x.id === 'ti2v_2_2')!;
		expect(m).toBeDefined();
		expect(m.id).toBe('ti2v_2_2');
		expect(m.label).toBe('Wan 2.2 TI2V (local MCP)');
		expect(m.frameGrid).toBeUndefined(); // legacy grid stays the default
		expect(m.kind).toBe('video');
		expect(m.requestFormat).toBe('mcp');
		expect(m.pending).toBe(true);
		expect(m.capabilities?.modes).toEqual(['t2v', 'i2v']);
		// Standard controls drive the MCP wire: the resolution tier maps to a
		// Wan2GP "WIDTHxHEIGHT" (480p = test-safe draft; 720p = final). The
		// standard duration + seed controls ride ctx.length_frames / ctx.seed.
		expect(m.limits?.resolutions).toEqual(['480p', '720p']);
		expect(m.limits?.sizeMap).toEqual({ '480p': '832x480', '720p': '1280x720' });
		expect(m.guidance).toBe('guidance_scale');
		expect(m.steps).toBe('num_inference_steps');
		expect(m.pricing?.unit).toBe('free-local');
		expect(m.pricing?.note).toBe('owner local install 2026-11-23, unverified-live');
		expect(m.pricing?.verifiedAt).toBeNull();
		expect(capabilityNote(m)).toContain('t2v / i2v');
		expect(capabilityNote(m)).toContain('free on your hardware');
	});

	it('declares the H3 pi-DWD 2-step row on the shared MCP transport', () => {
		const m = WAN2GP_PRESET.models.find((x) => x.id === 'minimax_h3_fl2va_pruned_pi_dwd_2step')!;
		expect(m).toBeDefined();
		expect(m.pending).toBe(true); // owner gate: never generable
		expect(m.label).toContain('local MCP');
		expect(m.label).toContain('pi-DWD');
		expect(m.requestFormat).toBe('mcp');
		expect(m.frameGrid).toEqual({ min: 107, step: 17, offset: 5 });
		expect(frameGridForModel(m.id)).toEqual({ min: 107, step: 17, offset: 5 });
		// Only owner-verified numbers: no invented pricing/limits.
		expect(m.limits).toEqual({
			fps: [24],
			maxFrames: 447,
			resolutions: ['480p'],
			sizeMap: { '480p': '832x480' },
		});
		expect(m.pricing?.unit).toBe('free-local');
		// Model-only wire defaults live in mcp.settingsDefaults (no clean
		// per-model payload slot exists for MCP); the preset's transport and
		// locked pathArg:'source' action are untouched.
		expect(m.mcp?.settingsDefaults).toMatchObject({
			model_type: 'minimax_h3_fl2va_pruned_pi_dwd_2step',
			config: 'gguf_q2_k',
			resolution: '832x480',
			num_inference_steps: 2,
			guidance_scale: 1,
		});
		expect(m.mcp?.actions).toBeUndefined(); // inherits WAN2GP_MCP verbatim
		// H3 alone gets the plain-timed wire prompt; ti2v_2_2 and every cloud
		// model keep their compiled prompt bytes unchanged.
		expect(m.promptStyle).toBe('plain-timed');
		expect(WAN2GP_PRESET.models.find((x) => x.id === 'ti2v_2_2')!.promptStyle).toBeUndefined();
		expect(mergeMcp(WAN2GP_PRESET.mcp, m)?.actions?.download?.pathArg).toBe('source');
		expect(mergeMcp(WAN2GP_PRESET.mcp, m)?.settingsDefaults?.['model_type'])
			.toBe('minimax_h3_fl2va_pruned_pi_dwd_2step');
	});

	it('carries NO owner-machine path, checkpoint or Wan2GP config value', () => {
		const blob = JSON.stringify(WAN2GP_PRESET).toLowerCase();
		for (const banned of [
			'd:/', 'd:\\', '/models', 'models/', '.ckpt', '.safetensors', '.gguf',
			'checkpoint', 'output_filename', 'overrides', 'activated_loras', 'custom_settings',
		]) {
			expect(blob.includes(banned), `banned value leaked into catalog: ${banned}`).toBe(false);
		}
	});
});

describe('resolveSpecs attaches the mcp config to the wire spec', () => {
	it('mergeMcp attaches only for requestFormat mcp', () => {
		const m = WAN2GP_PRESET.mcp!;
		const spec = WAN2GP_PRESET.models[0];
		expect(mergeMcp(m, spec)).toEqual(m);
		expect(mergeMcp(m, { ...spec, requestFormat: 'video-adapter' })).toBeNull();
		expect(mergeMcp(undefined, spec)).toBeNull();
	});

	it('resolveModelSpec + resolveSpecs carry mcp through the pending and owner-unlock paths', () => {
		updateSettings((d) => {
			d.providers.video = {
				preset: 'wan2gp', baseUrl: 'http://127.0.0.1:8765', apiKey: '', model: 'ti2v_2_2',
			};
		});
		const resolved = resolveModelSpec('video');
		expect(resolved).not.toBeNull();
		expect(resolved!.preset).toBe('wan2gp');
		expect(resolved!.spec.requestFormat).toBe('mcp');
		expect(resolved!.spec.auth).toBe('none');
		expect(resolved!.spec.pending).toBe(true);
		expect(resolved!.spec.mcp).toEqual(WAN2GP_PRESET.mcp);

		// The owner's verified tick lifts `pending` WITHOUT dropping mcp data.
		const unlocked = resolveModelSpec('video', 'ti2v_2_2', ['ti2v_2_2']);
		expect(unlocked!.spec.pending).toBe(false);
		expect(unlocked!.spec.ownerVerified).toBe(true);
		expect(unlocked!.spec.mcp).toEqual(WAN2GP_PRESET.mcp);

		const pair = resolveSpecs();
		expect(pair.video?.spec.mcp).toEqual(WAN2GP_PRESET.mcp);
		expect(pair.image?.spec.mcp).toBeUndefined();
	});

	it('never attaches mcp to a non-mcp preset', () => {
		updateSettings((d) => {
			d.providers.video = {
				preset: 'agnes', baseUrl: 'https://apihub.agnes-ai.com', apiKey: 'k',
				model: 'agnes-video-2.5-flash',
			};
		});
		expect(resolveModelSpec('video')?.spec.mcp).toBeUndefined();
	});
});
