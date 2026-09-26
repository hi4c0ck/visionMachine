<script lang="ts">
	import type { ModelSpec, Orientation, PipeRow, ResolutionPreset, SessionData } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { getSettings } from '$lib/settings/store';
	import { modelsFor, getPreset, resolveSpecs } from '$lib/settings';
	import { pipePrechecks, secondsPreview, type PipeConflict } from '$lib/settings';
	import type { ModelSelection } from './GenerateModal.svelte';
	import '../composer-modal.css';

	export interface SessionGenerateStats {
		fps: number;
		resolution: ResolutionPreset;
		orientation: Orientation;
	}

	let {
		open = $bindable(false),
		session,
		pipes,
		onConfirm,
		/** Store-level setters so the run-stats edits persist to the session
		 *  like the ToolsPanel does (updateFPS / updateResolution / …). */
		onFpsChange,
		onResolutionChange,
		onOrientationChange,
		/** Per-pipe Q/C setters (updateQ / updateC) for the run-stats row. */
		onPipeQChange,
		onPipeCChange,
		/** "Save As": copy the session (media tree included) and redirect this
		 *  run at the copy. Resolves to the new session's pipes to regenerate. */
		onSaveAs,
	} = $props<{
		open: boolean;
		session: SessionData;
		pipes: PipeRow[];
		onConfirm: (
			models: ModelSelection,
			seed: number | null,
			policy: 'stop' | 'continue',
			autoCompose: boolean,
			stats: SessionGenerateStats,
		) => Promise<void> | void;
		onFpsChange?: (fps: number) => void;
		onResolutionChange?: (res: string) => void;
		onOrientationChange?: (o: string) => void;
		onPipeQChange?: (pipeId: string, q: number) => void;
		onPipeCChange?: (pipeId: string, c: number) => void;
		onSaveAs?: () => Promise<void> | void;
	}>();

	let policy = $state<'stop' | 'continue'>('stop');
	let autoCompose = $state(true);
	let busy = $state(false);
	let savingAs = $state(false);

	// ── Run stats (seeded from the open session; edits persist via the store) ──
	let fps = $state(session.fps);
	let resolution = $state<ResolutionPreset>(session.resolution);
	let orientation = $state<Orientation>(session.orientation);
	$effect(() => {
		if (!open) return;
		fps = session.fps;
		resolution = session.resolution;
		orientation = session.orientation;
	});
	const stats: SessionGenerateStats = $derived({ fps, resolution, orientation });

	// ── Per-run model override (same pattern as GenerateModal) ──
	let imageModel = $state('');
	let videoModel = $state('');
	let imageModels = $state<ModelSpec[]>([]);
	let videoModels = $state<ModelSpec[]>([]);
	let seed = $state<number | null>(null);
	const selectedVideoModel = $derived(videoModels.find((m) => m.id === videoModel) ?? null);

	$effect(() => {
		if (!open) return;
		const s = getSettings();
		imageModel = s.providers.image.model;
		videoModel = s.providers.video.model;
		const ip = getPreset(s.providers.image.preset);
		const vp = getPreset(s.providers.video.preset);
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m: ModelSpec) => !m.readOnly);
		videoModels = (vp ? modelsFor(vp, 'video') : []).filter((m: ModelSpec) => !m.readOnly);
		if (s.generationDefaults.alwaysNewSeed) seed = Math.floor(Math.random() * 100000);
	});

	const pair = $derived(resolveSpecs(imageModel, videoModel));

	// Per-pipe pre-checks against the CURRENT model picks (live, like GenerateModal).
	const rows = $derived(
		pipes.map((pipe: PipeRow) => ({
			pipe,
			conflicts: pipePrechecks(pipe, session, pair.image?.spec ?? null, pair.video?.spec ?? null),
		})) as Array<{ pipe: PipeRow; conflicts: PipeConflict[] }>,
	);
	const allConflicts = $derived(rows.flatMap((r) => r.conflicts));

	// A frames/seconds hint for the selected video model (clamped to its limits).
	const secHint = $derived.by(() => {
		const spec = selectedVideoModel;
		if (!spec || spec.requestFormat !== 'video-job-seconds') return null;
		// Use the longest pipe as the worst case for the hint.
		const longest = pipes.reduce((acc: number, p: PipeRow) => Math.max(acc, p.lengthFrames ?? 0), 0);
		if (!longest) return null;
		return secondsPreview({ lengthFrames: longest } as PipeRow, session, spec);
	});

	// Block confirm only when the policy is 'stop' AND a conflict exists;
	// 'continue' policy flags conflicts but still allows the run to start
	// (healthy pipes proceed, conflicting ones are skipped at runtime).
	const canStart = $derived(
		pipes.length > 0 && (policy === 'continue' || allConflicts.length === 0),
	);

	function handlePipeQ(pipeId: string, e: Event) {
		const next = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(next)) onPipeQChange?.(pipeId, next);
	}
	function handlePipeC(pipeId: string, e: Event) {
		const next = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(next)) onPipeCChange?.(pipeId, next);
	}

	function handleFps(e: Event) {
		const next = Number((e.target as HTMLSelectElement).value);
		if (Number.isFinite(next)) {
			fps = next;
			onFpsChange?.(next);
		}
	}
	function handleResolution(e: Event) {
		const next = (e.target as HTMLSelectElement).value as ResolutionPreset;
		resolution = next;
		onResolutionChange?.(next);
	}
	function handleOrientation(e: Event) {
		const next = (e.target as HTMLSelectElement).value as Orientation;
		orientation = next;
		onOrientationChange?.(next);
	}

	function statusClass(status: string): string {
		switch (status) {
			case 'done':
				return 'gen-status-chip done';
			case 'error':
				return 'gen-status-chip error';
			case 'cancelled':
			case 'rate-limited':
				return 'gen-status-chip cancelled';
			case 'running':
			case 'generating':
				return 'gen-status-chip running';
			default:
				return 'gen-status-chip';
		}
	}

	async function saveAs() {
		if (savingAs || !onSaveAs) return;
		savingAs = true;
		try {
			await onSaveAs();
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			savingAs = false;
		}
	}

	async function confirm() {
		if (busy || !canStart) return;
		busy = true;
		try {
			await onConfirm({ imageModel, videoModel }, seed, policy, autoCompose, stats);
		} catch (e) {
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
				<h3>{APP_CONSTANTS.strings.sessionGenerate}</h3>
				<span class="modal-sub">{APP_CONSTANTS.strings.sessionGenerateHint} · {session.name}</span>
			</div>
			<div class="modal-body">
				<!-- ── Save As ── -->
				{#if onSaveAs}
					<div class="saveas-row" aria-label="Save As">
						<span class="gen-section-title">{APP_CONSTANTS.strings.sessionSaveAs}</span>
						<button class="gen-mini-btn" type="button" onclick={saveAs} disabled={savingAs}>
							{savingAs ? APP_CONSTANTS.strings.sessionSaveAsCopying : APP_CONSTANTS.strings.sessionSaveAsCopy}
						</button>
					</div>
				{/if}

				<!-- ── Pipes (ordered) with per-pipe pre-checks ── -->
				<span class="gen-section-title">{APP_CONSTANTS.strings.sessionPipes}</span>
				<div class="gen-pipe-list">
					{#each rows as row (row.pipe.id)}
						<div class="gen-pipe-row">
							<span class="gen-pipe-name">{row.pipe.name}</span>
							<span class="gen-chips"><span>{row.pipe.lengthFrames}f</span></span>
							<span class="gen-pipe-params" aria-label="Pipe Q / C">
								<label>Q<input type="number" min="1" max="50" value={row.pipe.qValue} onchange={(e) => handlePipeQ(row.pipe.id, e)} /></label>
								<label>C<input type="number" min="1" max="30" step="0.1" value={row.pipe.cValue} onchange={(e) => handlePipeC(row.pipe.id, e)} /></label>
							</span>
							{#if row.conflicts.length}
								<span class={statusClass('error')}>{row.conflicts[0].message}</span>
							{:else}
								<span class={statusClass('done')}>{APP_CONSTANTS.strings.sessionReady}</span>
							{/if}
						</div>
					{/each}
				</div>

				<!-- ── Models (per-run override, seeded from global settings) ── -->
				<span class="gen-section-title">{APP_CONSTANTS.strings.sessionModels}</span>
				<div class="gen-grid">
					<div class="gen-fieldrow">
						<label for="sg-image-model">Image model</label>
						<select id="sg-image-model" value={imageModel} onchange={(e) => (imageModel = e.currentTarget.value)}>
							{#each imageModels as m (m.id)}
								<option value={m.id} disabled={m.pending}>{m.label ?? m.id}{m.pending ? ' (details pending)' : ''}</option>
							{/each}
						</select>
					</div>
					<div class="gen-fieldrow">
						<label for="sg-video-model">Video model</label>
						<select id="sg-video-model" value={videoModel} onchange={(e) => (videoModel = e.currentTarget.value)}>
							{#each videoModels as m (m.id)}
								<option value={m.id} disabled={m.pending}>{m.label ?? m.id}{m.pending ? ' (details pending)' : ''}</option>
							{/each}
						</select>
					</div>
					{#if selectedVideoModel?.supportsSeed}
						<div class="gen-fieldrow">
							<label for="sg-seed">Seed (video)</label>
							<input
								id="sg-seed"
								type="number"
								min="0"
								step="1"
								value={seed ?? ''}
								oninput={(e) => (seed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
							/>
						</div>
					{/if}
				</div>
				{#if secHint}
					<span class="gen-sec-hint">≈ {secHint.shown}s{secHint.clamped ? ' (clamped)' : ''} · longest pipe</span>
				{/if}

				<!-- ── Run stats (session-level; edits persist via the store) ── -->
				{#if onFpsChange || onResolutionChange || onOrientationChange}
					<span class="gen-section-title">{APP_CONSTANTS.strings.sessionRunStats}</span>
					<div class="gen-grid three">
						<div class="gen-fieldrow">
							<label for="sg-fps">{APP_CONSTANTS.strings.fps}</label>
							<select id="sg-fps" value={String(fps)} onchange={handleFps}>
								{#each APP_CONSTANTS.fpsPresets as f (f)}
									<option value={String(f)}>{f}</option>
								{/each}
							</select>
						</div>
						<div class="gen-fieldrow">
							<label for="sg-res">{APP_CONSTANTS.strings.resolution}</label>
							<select id="sg-res" value={resolution} onchange={handleResolution}>
								{#each APP_CONSTANTS.resolutions as r (r)}
									<option value={r}>{r}</option>
								{/each}
							</select>
						</div>
						<div class="gen-fieldrow">
							<label for="sg-orient">{APP_CONSTANTS.strings.orientation}</label>
							<select id="sg-orient" value={orientation} onchange={handleOrientation}>
								{#each APP_CONSTANTS.orientations as o (o)}
									<option value={o}>{o}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}

				<!-- ── Run options ── -->
				<span class="gen-section-title">{APP_CONSTANTS.strings.sessionRunOptions}</span>
				<div class="gen-grid">
					<div class="gen-fieldrow">
						<label for="sg-policy">{APP_CONSTANTS.strings.sessionFailurePolicy}</label>
						<select id="sg-policy" bind:value={policy}>
							<option value="stop">{APP_CONSTANTS.strings.sessionStopPolicy}</option>
							<option value="continue">{APP_CONSTANTS.strings.sessionContinuePolicy}</option>
						</select>
					</div>
					<div class="gen-fieldrow">
						<label class="gen-check">
							<input type="checkbox" bind:checked={autoCompose} />
							{APP_CONSTANTS.strings.sessionAutoCompose}
						</label>
					</div>
				</div>

				{#if allConflicts.length > 0}
					<ul class="gen-conflicts" aria-label="Generation conflicts">
						{#each allConflicts as c (c.message)}
							<li>{c.message}</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)} disabled={busy}>
					{APP_CONSTANTS.strings.cancel}
				</button>
				<button class="btn-confirm" onclick={confirm} disabled={busy || !canStart}>
					{busy ? APP_CONSTANTS.strings.sessionGenerating : APP_CONSTANTS.strings.sessionGenerate}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.saveas-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
		border: 1px dashed var(--border-color, #3f3f46);
		border-radius: 7px;
	}

	.gen-mini-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		font-size: 12px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		color: var(--text-secondary, #a1a1aa);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease;
	}

	.gen-mini-btn:hover:not(:disabled) {
		border-color: var(--accent-color, #ff3e00);
		color: var(--text-primary, #fff);
	}

	.gen-mini-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.gen-pipe-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.gen-pipe-row {
		display: grid;
		grid-template-columns: minmax(90px, 1fr) auto auto;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 7px;
	}

	.gen-pipe-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary, #fff);
	}

	.gen-pipe-params {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.gen-pipe-params label {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 11px;
		color: var(--text-muted, #71717a);
	}

	.gen-pipe-params input {
		width: 52px;
		padding: 3px 5px;
		font-size: 12px;
		color: var(--text-primary, #fff);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 4px;
	}

	.gen-pipe-params input:focus {
		outline: none;
		border-color: var(--accent-color, #ff3e00);
	}

	.gen-check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-secondary, #a1a1aa);
		cursor: pointer;
		padding: 9px 0;
	}

	.gen-sec-hint {
		display: inline-block;
		margin-top: 6px;
		padding: 3px 8px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 5px;
		font-size: 12px;
		color: var(--text-muted, #71717a);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.gen-conflicts {
		list-style: none;
		padding: 8px 10px;
		margin: 0;
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
