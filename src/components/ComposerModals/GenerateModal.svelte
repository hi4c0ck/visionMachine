<script lang="ts">
	// Generate confirm modal (D8): presets + final prompt (read-only) plus a
	// per-run model override (Phase 4). Global settings stay the source of
	// truth; the override applies to THIS generation only and is recorded in
	// the portable generation log (model + taskId per piece).
	import type { ModelSpec, PipeRow, SessionData } from '$types';
	import { summarizePipe } from '$lib/promptEngine';
	import { flashToast } from '$lib/flashToast';
	import { APP_CONSTANTS } from '$constants';
	import { getSettings } from '$lib/settings/store';
	import { modelsFor, getPreset } from '$lib/settings/catalog';
	import '../composer-modal.css';

	export interface ModelSelection {
		imageModel: string;
		videoModel: string;
	}

	let {
		pipe,
		session,
		open = $bindable(false),
		onConfirm,
	} = $props<{
		pipe: PipeRow;
		session: SessionData;
		open: boolean;
		onConfirm: (models: ModelSelection) => Promise<void> | void;
	}>();

	const prompt = $derived(summarizePipe(pipe));
	let expanded = $state(false);
	let busy = $state(false);

	// Per-run model override: seed from the global provider settings each
	// open; the user may switch models for just this run (regenerating a
	// piece, A/B between models). The choice is logged, never written back.
	let imageModel = $state('');
	let videoModel = $state('');
	let imageModels = $state<ModelSpec[]>([]);
	let videoModels = $state<ModelSpec[]>([]);
	$effect(() => {
		if (!open) return;
		const s = getSettings();
		imageModel = s.providers.image.model;
		videoModel = s.providers.video.model;
		const ip = getPreset(s.providers.image.preset);
		const vp = getPreset(s.providers.video.preset);
		imageModels = ip ? modelsFor(ip, 'image') : [];
		videoModels = vp ? modelsFor(vp, 'video') : [];
	});

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			flashToast(APP_CONSTANTS.strings.promptCopied, 'info');
		} catch {
			flashToast('Copy failed', 'error');
		}
	}

	async function confirm() {
		if (busy) return;
		busy = true;
		try {
			await onConfirm({ imageModel, videoModel });
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => (open = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Generate — {pipe.name}</h3>
				<span class="modal-sub">Presets + final prompt · pick the models for this run</span>
			</div>
			<div class="modal-body">
				<div class="gen-presets" aria-label="Generation presets">
					<span>{session.fps} fps</span>
					<span>{session.resolution}</span>
					<span>{session.orientation}</span>
					<span>Q {pipe.qValue}</span>
					<span>C {pipe.cValue}</span>
					<span>{pipe.lengthFrames} frames</span>
				</div>
				<div class="gen-models" aria-label="Model selection for this run">
					<div class="gen-model">
						<label for="gen-image-model">Image model</label>
						<select id="gen-image-model" value={imageModel} onchange={(e) => (imageModel = e.currentTarget.value)}>
							{#each imageModels as m (m.id)}
								<option value={m.id} disabled={m.pending}>{m.label ?? m.id}{m.pending ? ' (details pending)' : ''}</option>
							{/each}
						</select>
					</div>
					<div class="gen-model">
						<label for="gen-video-model">Video model</label>
						<select id="gen-video-model" value={videoModel} onchange={(e) => (videoModel = e.currentTarget.value)}>
							{#each videoModels as m (m.id)}
								<option value={m.id} disabled={m.pending}>{m.label ?? m.id}{m.pending ? ' (details pending)' : ''}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="gen-prompt-wrap">
					<div class="gen-prompt-head">
						<span class="gen-prompt-label">Final prompt</span>
						<div class="gen-prompt-actions">
							<button class="gen-mini-btn" type="button" onclick={() => (expanded = !expanded)}>
								{expanded ? 'Collapse' : 'Expand'}
							</button>
							<button class="gen-mini-btn" type="button" onclick={copyPrompt}>Copy</button>
						</div>
					</div>
					<textarea
						class="modal-textarea gen-prompt"
						class:expanded
						readonly
						rows={expanded ? 18 : 6}
						value={prompt}
						aria-label="Final prompt"
					></textarea>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)} disabled={busy}>
					{APP_CONSTANTS.strings.cancel}
				</button>
				<button class="btn-confirm" onclick={confirm} disabled={busy}>
					{busy ? 'Starting…' : APP_CONSTANTS.strings.generate}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.gen-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 14px;
	}

	.gen-presets span {
		padding: 3px 8px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		font-size: 12px;
		color: var(--text-secondary, #a1a1aa);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.gen-models {
		display: flex;
		gap: 10px;
		margin-bottom: 14px;
	}

	.gen-model {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.gen-model label {
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-secondary, #a1a1aa);
	}

	.gen-model select {
		width: 100%;
		padding: 9px 11px;
		font-size: 0.85rem;
		color: var(--text-primary, #fff);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
	}

	.gen-model select:focus {
		outline: none;
		border-color: var(--accent-color, #ff3e00);
	}

	.gen-prompt-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.gen-prompt-label {
		font-size: 0.75rem;
		color: var(--text-muted, #71717a);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.gen-prompt-actions {
		display: flex;
		gap: 6px;
	}

	.gen-mini-btn {
		padding: 3px 10px;
		font-size: 12px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		color: var(--text-primary, #fff);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		cursor: pointer;
	}

	.gen-mini-btn:hover {
		border-color: var(--accent-color, #ff3e00);
	}

	.gen-prompt {
		resize: none;
		scrollbar-width: thin;
	}

	.gen-prompt.expanded {
		height: 320px;
	}
</style>
