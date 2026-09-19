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
	import { pipePrechecks, secondsPreview, type PipeConflict } from '$lib/settings';
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
		onConfirm: (models: ModelSelection, seed: number | null) => Promise<void> | void;
	}>();

	const prompt = $derived(summarizePipe(pipe));
	let expanded = $state(false);
	let busy = $state(false);
	let justCopied = $state(false);
	let copyTimer: number | undefined;

	// Per-run model override: seed from the global provider settings each
	// open; the user may switch models for just this run (regenerating a
	// piece, A/B between models). The choice is logged, never written back.
	let imageModel = $state('');
	let videoModel = $state('');
	let imageModels = $state<ModelSpec[]>([]);
	let videoModels = $state<ModelSpec[]>([]);
	// Seed (docs/agnes-model-catalog.md): auto-rolled while Settings →
	// “Always use a new seed” is ON; otherwise the value stays fixed and
	// editable (reproducible runs). Shown only for seed-supporting models.
	let seed = $state<number | null>(null);
	const selectedVideoModel = $derived(videoModels.find((m) => m.id === videoModel) ?? null);

	// Phase A: live pre-checks + seconds hint against the CURRENT model picks,
	// so conflicts are visible before the user hits Confirm (E4).
	const conflicts = $derived.by((): PipeConflict[] => {
		const imgSpec = imageModels.find((m) => m.id === imageModel) ?? null;
		return pipePrechecks(pipe, session, imgSpec, selectedVideoModel);
	});
	const secHint = $derived.by(() => {
		const spec = selectedVideoModel;
		if (!spec || spec.requestFormat !== 'video-job-seconds') return null;
		return secondsPreview(pipe, session, spec);
	});
	$effect(() => {
		if (!open) return;
		const s = getSettings();
		imageModel = s.providers.image.model;
		videoModel = s.providers.video.model;
		const ip = getPreset(s.providers.image.preset);
		const vp = getPreset(s.providers.video.preset);
		// Read-only (paid) models are Settings-browse only (Q3) — they are
		// not confirmable for generation.
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m: ModelSpec) => !m.readOnly);
		videoModels = (vp ? modelsFor(vp, 'video') : []).filter((m: ModelSpec) => !m.readOnly);
		// Re-roll only when “always new seed” is on; keep the fixed value
		// across opens otherwise.
		if (s.generationDefaults.alwaysNewSeed) seed = Math.floor(Math.random() * 100000);
	});

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			flashToast(APP_CONSTANTS.strings.promptCopied, 'info');
			justCopied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = window.setTimeout(() => (justCopied = false), 1500);
		} catch {
			flashToast('Copy failed', 'error');
		}
	}

	async function confirm() {
		if (busy || conflicts.length > 0) return;
		busy = true;
		try {
			await onConfirm({ imageModel, videoModel }, seed);
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
				<span class="modal-sub">Final prompt + models for this run</span>
			</div>
			<div class="modal-body">
				<div class="gen-models" aria-label="Model selection for this run">
					<span class="gen-section-title">Models</span>
					<div class="gen-model-row">
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
					{#if selectedVideoModel?.supportsSeed}
						<div class="gen-model">
							<label for="gen-seed">Seed (video)</label>
							<input
								id="gen-seed"
								type="number"
								min="0"
								step="1"
								value={seed ?? ''}
								oninput={(e) => (seed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
							/>
						</div>
					{/if}
					{#if secHint}
						<div class="gen-sec-hint" aria-label="Duration for this run">
							<span>≈ {secHint.shown}s{secHint.clamped ? ' (clamped)' : ''}</span>
						</div>
					{/if}
				</div>
			</div>
				<div class="gen-prompt-wrap">
					<span class="gen-section-title">Final prompt</span>
					<div class="gen-prompt-box">
						<textarea
							class="modal-textarea gen-prompt"
							class:expanded
							readonly
							rows={expanded ? 18 : 6}
							value={prompt}
							aria-label="Final prompt"
						></textarea>
						<div class="gen-prompt-actions">
							<button class="gen-mini-btn" type="button" onclick={() => (expanded = !expanded)} aria-expanded={expanded} title={expanded ? 'Collapse' : 'Expand'} aria-label={expanded ? 'Collapse prompt' : 'Expand prompt'}>
								<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
									{#if expanded}
										<path d="M2.5 7.5 6 4l3.5 3.5" />
									{:else}
										<path d="M2.5 4.5 6 8l3.5-3.5" />
									{/if}
								</svg>
							</button>
							<button class="gen-mini-btn" class:copied={justCopied} type="button" onclick={copyPrompt} title={justCopied ? 'Copied' : 'Copy'} aria-label="Copy prompt">
								<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
									{#if justCopied}
										<path d="M2.5 6.5 5 9l4.5-5" />
									{:else}
										<rect x="4.2" y="4.2" width="5.6" height="5.6" rx="1" />
										<path d="M3.8 4V2.6A.6.6 0 0 1 4.4 2h3.8" />
										{/if}
								</svg>
							</button>
						</div>
					</div>
				</div>
				{#if conflicts.length > 0}
						<ul class="gen-conflicts" aria-label="Generation conflicts">
							{#each conflicts as c (c.message)}
								<li>{c.message}</li>
							{/each}
						</ul>
					{/if}
				<div class="gen-presets" aria-label="Generation presets">
					<span>{session.fps} fps</span>
					<span>{session.resolution}</span>
					<span>{session.orientation}</span>
					<span>Q {pipe.qValue}</span>
					<span>C {pipe.cValue}</span>
					<span>{pipe.lengthFrames} frames</span>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)} disabled={busy}>
					{APP_CONSTANTS.strings.cancel}
				</button>
				<button class="btn-confirm" onclick={confirm} disabled={busy || conflicts.length > 0}>
					{busy ? 'Starting…' : APP_CONSTANTS.strings.generate}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.gen-section-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted, #71717a);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.gen-models {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.gen-model-row {
		display: flex;
		gap: 10px;
		align-items: flex-end;
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

	.gen-model select,
	.gen-model input {
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

	.gen-prompt-wrap {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.gen-prompt-box {
		position: relative;
	}

	.gen-prompt-actions {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		gap: 5px;
		opacity: 0.35;
		transition: opacity 0.15s ease;
	}

	.gen-prompt-box:hover .gen-prompt-actions {
		opacity: 0.9;
	}

	.gen-prompt-actions .gen-mini-btn {
		padding: 4px;
		background: var(--bg-elevated, rgba(255, 255, 255, 0.08));
		backdrop-filter: blur(4px);
	}

	.gen-mini-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		font-size: 12px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		color: var(--text-secondary, #a1a1aa);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
	}

	.gen-mini-btn svg {
		flex: none;
	}

	.gen-mini-btn:hover {
		border-color: var(--accent-color, #ff3e00);
		color: var(--text-primary, #fff);
	}

	.gen-mini-btn.copied {
		color: var(--accent-color, #59B5FF);
		border-color: var(--accent-color, #59B5FF);
		background: var(--accent-bg, rgba(89, 181, 255, 0.1));
	}

	.gen-prompt {
		color: var(--text-secondary, #a1a1aa);
		line-height: 1.6;
		font-size: 0.85rem;
		resize: none;
		scrollbar-width: thin;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		width: 100%;
		min-height: 140px;
		padding: 12px 14px;
	}

	.gen-prompt:focus {
		outline: none;
		border-color: var(--accent-color, #59B5FF);
	}

	.gen-prompt.expanded {
		height: 320px;
	}

	.gen-sec-hint {
		display: inline-flex;
		align-items: center;
		padding: 3px 8px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		font-size: 12px;
		color: var(--text-muted, #71717a);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.gen-presets {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding-top: 12px;
		border-top: 1px dashed var(--border-color, #3f3f46);
	}

	.gen-presets span {
		padding: 3px 8px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		font-size: 11px;
		color: var(--text-muted, #71717a);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.gen-conflicts {
		list-style: none;
		padding: 8px 10px;
		margin: 0 0 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border: 1px solid var(--danger-color, #ef4444);
		border-radius: 6px;
		background: var(--danger-bg, rgba(239, 68, 68, 0.08));
		color: var(--danger-color, #ef4444);
		font-size: 0.78rem;
	}
</style>
