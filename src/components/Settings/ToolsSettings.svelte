<script lang="ts">
	// Settings "Tools" tab: local tooling overrides. v1 = the ffmpeg path
	// (tiny-variant escape hatch). The path is probed with `-version` only
	// (probe_ffmpeg_path allowlists the ffmpeg/ffprobe basename), and on Save
	// the settings store mirrors it into the backend locator chain.
	import { invoke, isTauri } from '@tauri-apps/api/core';
	import { flashToast } from '$lib/flashToast';
	import '../composer-modal.css';

	let {
		draft,
		ondraftchange,
	} = $props<{
		draft: { tools: { ffmpegPath: string } };
		ondraftchange: (m: (d: any) => void) => void;
	}>();

	let testing = $state(false);
	let probeStatus = $state<'idle' | 'ok' | 'none'>('idle');
	let probeLabel = $state('');

	function setFfmpegPath(v: string) {
		probeStatus = 'idle';
		probeLabel = '';
		ondraftchange((d: any) => {
			d.tools = { ...d.tools, ffmpegPath: v };
		});
	}

	async function testPath() {
		const p = draft.tools.ffmpegPath.trim();
		if (!p) {
			probeStatus = 'idle';
			probeLabel = 'Enter a path to test';
			return;
		}
		if (!isTauri()) {
			probeStatus = 'idle';
			probeLabel = 'Desktop only';
			return;
		}
		testing = true;
		try {
			const r = (await invoke('probe_ffmpeg_path', { path: p })) as {
				source: string;
				path: string;
				versionLine: string;
			};
			if (r.source === 'none') {
				probeStatus = 'none';
				probeLabel = 'Not a working ffmpeg executable';
			} else {
				probeStatus = 'ok';
				probeLabel = r.versionLine || 'ok';
			}
		} catch (e) {
			probeStatus = 'none';
			probeLabel = String(e);
		} finally {
			testing = false;
		}
	}

	function clearPath() {
		ondraftchange((d: any) => {
			d.tools = { ...d.tools, ffmpegPath: '' };
		});
		probeStatus = 'idle';
		probeLabel = '';
		flashToast('ffmpeg path cleared', 'info');
	}
</script>

<div class="tools-settings">
	<div class="tools-header">
		<h4 class="tools-title">ffmpeg</h4>
		<span class="tools-sub">
			Used for session video composition. Empty = use the bundled binary (Full build) or system $PATH.
		</span>
	</div>

	<label class="form-label" for="ffmpeg-path">ffmpeg executable path</label>
	<div class="ffmpeg-row">
		<input
			id="ffmpeg-path"
			type="text"
			class="modal-input ffmpeg-input"
			value={draft.tools.ffmpegPath}
			oninput={(e) => setFfmpegPath(e.currentTarget.value)}
			placeholder="e.g. C:\Tools\ffmpeg\bin\ffmpeg.exe"
			spellcheck="false"
		/>
		<button class="btn-test" onclick={testPath} disabled={testing}>
			{testing ? 'Testing…' : 'Test'}
		</button>
		{#if draft.tools.ffmpegPath}
			<button class="btn-clear" onclick={clearPath} title="Clear path">×</button>
		{/if}
	</div>

	{#if probeStatus === 'ok'}
		<div class="probe-line probe-ok" aria-live="polite">✓ {probeLabel}</div>
	{:else if probeStatus === 'none'}
		<div class="probe-line probe-err" aria-live="polite">✕ {probeLabel}</div>
	{:else if probeLabel}
		<div class="probe-line" aria-live="polite">{probeLabel}</div>
	{/if}
</div>

<style>
	.tools-settings {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
	}

	.tools-header {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 4px;
	}

	.tools-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary, #fff);
	}

	.tools-sub {
		font-size: 0.72rem;
		color: var(--text-muted, #71717a);
	}

	.form-label {
		font-size: 0.72rem;
		color: var(--text-secondary, #a1a1aa);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.ffmpeg-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.ffmpeg-input {
		flex: 1;
	}

	.btn-test {
		padding: 5px 12px;
		font-size: 0.75rem;
		border-radius: 5px;
		border: 1px solid var(--border-color, #3f3f46);
		background: var(--bg-tertiary, #27272a);
		color: var(--text-primary, #fff);
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-test:hover:not(:disabled) {
		border-color: var(--accent-color, #ff3e00);
	}

	.btn-test:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.btn-clear {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 1px solid var(--border-color, #3f3f46);
		background: transparent;
		color: var(--text-muted, #71717a);
		cursor: pointer;
		font-size: 0.8rem;
		line-height: 1;
	}

	.btn-clear:hover {
		color: var(--text-primary, #fff);
		border-color: var(--accent-color, #ff3e00);
	}

	.probe-line {
		font-size: 0.72rem;
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
	}

	.probe-ok {
		color: #4ade80;
	}

	.probe-err {
		color: #f87171;
	}
</style>
