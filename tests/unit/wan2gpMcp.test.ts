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
		expect(m!.generate?.wait).toBe(true);
		expect(m!.settingsDefaults).toMatchObject({
			model_type: 'ti2v_2_2',
			seed: -1,
			resolution: '1280x720',
			video_length: 121,
			num_inference_steps: 50,
			guidance_scale: 5,
			flow_shift: 5,
			image_mode: 0,
			image_prompt_type: 'T',
		});
		// The transfer actions are declared so i2v can fail explicitly instead
		// of silently ignoring image input.
		expect(m!.actions?.upload?.action).toBe('create_file_upload');
		expect(m!.actions?.download?.action).toBe('create_file_download');
	});

	it('ships one pending ti2v_2_2 model with t2v/i2v + honest free-local pricing', () => {
		expect(WAN2GP_PRESET.models).toHaveLength(1);
		const m = WAN2GP_PRESET.models[0];
		expect(m.id).toBe('ti2v_2_2');
		expect(m.kind).toBe('video');
		expect(m.requestFormat).toBe('mcp');
		expect(m.pending).toBe(true);
		expect(m.capabilities?.modes).toEqual(['t2v', 'i2v']);
		expect(m.pricing?.unit).toBe('free-local');
		expect(m.pricing?.note).toBe('owner local install 2026-11-23, unverified-live');
		expect(m.pricing?.verifiedAt).toBeNull();
		expect(capabilityNote(m)).toContain('t2v / i2v');
		expect(capabilityNote(m)).toContain('free on your hardware');
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
