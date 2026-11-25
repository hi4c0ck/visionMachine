<script lang="ts">
	// Generate confirm modal (D8): presets + final prompt (read-only) plus a
	// per-run model override (Phase 4). Global settings stay the source of
	// truth; the override applies to THIS generation only and is recorded in
	// the portable generation log (model + taskId per piece).
	import type { ModelSpec, PipeRow, SessionData } from '$types';
	import { summarizePipe } from '$lib/promptEngine';
	import { flashToast } from '$lib/flashToast';
	import { APP_CONSTANTS } from '$constants';
	import { getSettings, estimateGenerationCost, type CostEstimate } from '$lib/settings/store';
	import { unlockVerified, verificationGlyph } from '$lib/settings/guards';
	import { modelsFor, getPreset, capabilityNote } from '$lib/settings/catalog';
	import { pipePrechecks, secondsPreview, type PipeConflict } from '$lib/settings';
	import { frameGridForModel, fitFramesToGrid, getMaxFrames, FRAME_GRID_WARNING } from '$lib/frameMath';
	import { reflowFrameGrid } from '$lib/composerStore';
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

	// Session fps inherited for the engine's seconds math (length units + position cues).
	const prompt = $derived(summarizePipe(pipe, { fps: session?.fps ?? undefined }));
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
	// Owner tick lists, captured from the live settings in the same effect
	// that rebuilds the model arrays — the glyph helper is a PURE function of
	// (spec, verified), never a `getSettings()` call inside the template.
	let imageVerified = $state<readonly string[] | undefined>(undefined);
	let videoVerified = $state<readonly string[] | undefined>(undefined);
	// Seed (docs/agnes-model-catalog.md): auto-rolled while Settings →
	// “Always use a new seed” is ON; otherwise the value stays fixed and
	// editable (reproducible runs). Shown only for seed-supporting models.
	let seed = $state<number | null>(null);
	const selectedVideoModel = $derived(videoModels.find((m) => m.id === videoModel) ?? null);

	// Frame-grid drift: warn ONLY when the picked model's grid would actually
	// change this pipe's length under the session's resolution cap. Confirm
	// then calls reflowFrameGrid(videoModel) before starting generation.
	const gridWouldChange = $derived.by(() => {
		const next = fitFramesToGrid(
			pipe.lengthFrames,
			frameGridForModel(videoModel),
			getMaxFrames(session?.resolution ?? '720p'),
		);
		return next !== pipe.lengthFrames;
	});

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

	// Pre-run cost hint (docs/pricing-usage-design.md §11, the deferred
	// generate-modal slice): an honest estimate from the selected VIDEO
	// model's static pricing — local hardware reads "free on your
	// hardware", a known rate reads "≈ $X", and unknown stays unknown
	// (never a fabricated $0). Stale responses are dropped (seq guard).
	let costEst = $state<CostEstimate | null>(null);
	let costSeq = 0;
	$effect(() => {
		const spec = selectedVideoModel;
		if (!open || !spec) {
			costSeq += 1;
			costEst = null;
			return;
		}
		// video-job-seconds models ride the clamped seconds preview;
		// adapter models (ComfyUI-class) carry no seconds hint — the
		// pipe's own length in seconds.
		const seconds = secHint
			? Number(secHint.shown)
			: Math.round((pipe.lengthFrames / Math.max(session?.fps ?? 24, 1)) * 10) / 10;
		const seq = ++costSeq;
		void estimateGenerationCost(spec, seconds, session?.resolution ?? '720p').then((r) => {
			if (seq === costSeq) costEst = r;
		});
	});
	const costPillText = $derived.by(() => {
		if (!costEst) return '';
		if (!costEst.known) return 'cost: unknown';
		if ((costEst.estimatedUsd ?? 0) === 0 && /local/i.test(costEst.basis)) return 'free on your hardware';
		return `≈ $${(costEst.estimatedUsd ?? 0).toFixed(2)}`;
	});
	// Reseed at most once per distinct model/preset config. The self-heal
	// check below READS the model arrays + models, and a plain run reassigns
	// those $state arrays on every pass — Svelte re-invalidates this very
	// effect until it aborts with `effect_update_depth_exceeded` (the
	// "frozen window / modal never appears" symptom). The key guard makes
	// re-runs no-ops; as a bonus the user's own select picks no longer snap
	// back to the settings default.
	let modelSeedKey = $state<string | null>(null);
	$effect(() => {
		if (!open) return;
		const s = getSettings();
		// Snapshot the owner tick lists for the display-only glyphs. The
		// effect re-runs whenever these change (they are in the seed key).
		imageVerified = s.providers.image.verified;
		videoVerified = s.providers.video.verified;
		// The verified id lists are part of the seed signature: a tick/untick
		// while the modal is open must refresh the unlocked model arrays —
		// otherwise the select keeps a stale (un)locked set.
		const key = [
			s.providers.image.model, s.providers.video.model,
			s.providers.image.preset, s.providers.video.preset,
			(s.providers.image.verified ?? []).join(','),
			(s.providers.video.verified ?? []).join(','),
		].join('|');
		if (modelSeedKey === key) return;
		modelSeedKey = key;
		imageModel = s.providers.image.model;
		videoModel = s.providers.video.model;
		const ip = getPreset(s.providers.image.preset);
		const vp = getPreset(s.providers.video.preset);
		// Read-only (paid) models are Settings-browse only (Q3) — they are
		// not confirmable for generation.
		imageModels = (ip ? modelsFor(ip, 'image') : [])
			.filter((m: ModelSpec) => !m.readOnly && !m.obsolete)
			.map((m) => unlockVerified(m, s.providers.image.verified));
		videoModels = (vp ? modelsFor(vp, 'video') : [])
			.filter((m: ModelSpec) => !m.readOnly && !m.obsolete)
			.map((m) => unlockVerified(m, s.providers.video.verified));
		// Self-heal: a saved default that is no longer selectable (read-only /
		// unknown) must not leave the select empty — fall back to the first
		// generable model of the kind.
		if (!imageModels.some((m) => m.id === imageModel)) imageModel = imageModels.find((m) => !m.pending)?.id ?? imageModel;
		if (!videoModels.some((m) => m.id === videoModel)) videoModel = videoModels.find((m) => !m.pending)?.id ?? videoModel;
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
			// Model-change reflow: re-fit EVERY session to the picked model's
			// frame grid (reusing the store's rescaleElements) before the
			// generation command reads the timelines.
			if (gridWouldChange) await reflowFrameGrid(videoModel);
			await onConfirm({ imageModel, videoModel }, seed);
		} catch (e) {
			// Never swallow the error silently: surface it so the user knows
			// generation was blocked and why (the modal stays open, they can
			// retry or inspect the settings).
			flashToast(e instanceof Error ? e.message : String(e), 'error');
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
				<span class="gen-section-title">Models</span>
				<div class="gen-grid" aria-label="Model selection for this run">
					<div class="gen-fieldrow">
						<label for="gen-image-model">Image model</label>
						<select id="gen-image-model" value={imageModel} onchange={(e) => (imageModel = e.currentTarget.value)}>
							{#each imageModels as m (m.id)}
								{@const glyph = verificationGlyph(m, imageVerified)}
								<option value={m.id} disabled={m.pending}>{glyph ? `${glyph} ` : ''}{m.label ?? m.id}{m.pending ? (m.id === imageModel ? ' (details pending - selected, unverified)' : ' (details pending)') : ''}{capabilityNote(m) ? ` (${capabilityNote(m)})` : ''}</option>
							{/each}
							{#if imageModel && !imageModels.some((m) => m.id === imageModel)}
								<!-- Free-form preset: the Settings-typed model id (not in the catalog) — owner-typed = verified by construction -->
								<option value={imageModel}>✓ {imageModel} (custom)</option>
							{/if}
						</select>
					</div>
					<div class="gen-fieldrow">
						<label for="gen-video-model">Video model</label>
						<select id="gen-video-model" value={videoModel} onchange={(e) => (videoModel = e.currentTarget.value)}>
							{#each videoModels as m (m.id)}
								{@const glyph = verificationGlyph(m, videoVerified)}
								<option value={m.id} disabled={m.pending}>{glyph ? `${glyph} ` : ''}{m.label ?? m.id}{m.pending ? (m.id === videoModel ? ' (details pending - selected, unverified)' : ' (details pending)') : ''}{capabilityNote(m) ? ` (${capabilityNote(m)})` : ''}</option>
							{/each}
							{#if videoModel && !videoModels.some((m) => m.id === videoModel)}
								<!-- Free-form preset: the Settings-typed model id (not in the catalog) — owner-typed = verified by construction -->
								<option value={videoModel}>✓ {videoModel} (custom)</option>
							{/if}
						</select>
					</div>
					{#if selectedVideoModel?.supportsSeed}
						<div class="gen-fieldrow">
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
				{#if gridWouldChange}
					<div class="gen-warning-box" role="note">
						<p>{FRAME_GRID_WARNING}</p>
					</div>
				{/if}
				<div class="gen-presets-section" aria-label="Generation presets">
					<div class="gen-chips">
						<span>{session.fps} fps</span>
						<span>{session.resolution}</span>
						<span>{session.orientation}</span>
						<span>{pipe.lengthFrames} frames</span>
						{#if costEst}
							<span class="gen-cost-pill" class:cost-unknown={!costEst.known} title={costEst.basis}>{costPillText}</span>
						{/if}
					</div>
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
	/* ── GenerateModal-specific chrome. The shared anatomy
	   (.modal-overlay / .modal / .modal-header / .modal-body /
	   .modal-footer / .gen-section-title / .gen-grid / .gen-fieldrow /
	   .gen-chips / .modal-textarea) is in composer-modal.css; only the
	   prompt box, its mini action buttons, the seconds hint, and the
	   dashed divider section are GenerateModal-specific and live here. */

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

	/* Read-only final prompt box — .modal-textarea supplies the shared
	   input geometry; this rule adds only the read-only affordance
	   (no vertical resize; the Expand button swaps the height). */
	.gen-prompt {
		color: var(--text-secondary, #a1a1aa);
		line-height: 1.6;
		resize: none;
		scrollbar-width: thin;
		min-height: 140px;
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

	/* Dashed divider between the prompt box and the run-stat chips. */
	.gen-presets-section {
		padding-top: 12px;
		border-top: 1px dashed var(--border-color, #3f3f46);
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
