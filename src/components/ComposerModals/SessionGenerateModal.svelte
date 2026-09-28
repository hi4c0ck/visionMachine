<script lang="ts">
	import type { ModelSpec, Orientation, PipeRow, ResolutionPreset, SessionData } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { getSettings } from '$lib/settings/store';
	import { modelsFor, getPreset, resolveSpecs } from '$lib/settings';
	import { pipePrechecks, secondsPreview, type PipeConflict } from '$lib/settings';
	import type { PipeParamOverride, RunStats } from '$lib/composerStore/sessionGeneration';
	import type { ModelSelection } from './GenerateModal.svelte';
	import '../composer-modal.css';

	export interface SessionGenerateStats {
		fps: number;
		resolution: ResolutionPreset;
		orientation: Orientation;
	}

	/** Copy + auto-compose icons (inline SVGs — no icon dependency in the app). */
	const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>`;
	const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>`;

	/** Per-pipe Q/C run-local values keyed by pipe id. */
	type PipeParamState = Record<string, { q: number; c: number }>;

	let {
		open = $bindable(false),
		session,
		pipes,
		onConfirm,
		/** Store-level setters used ONLY when "apply to session" is ticked —
		 *  the canonical persistence path (updateFPS / updateResolution / …). */
		onFpsChange,
		onResolutionChange,
		onOrientationChange,
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
			runStats: RunStats | null,
			pipeParams: Record<string, PipeParamOverride> | null,
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
	/** When ticked, confirm additionally persists the edits to the session
	 *  (store setters). Default OFF: edits are run-scoped only. */
	let applyToSession = $state(false);
	/** "Save As" ran: suppress the open-change effect re-seeding so the local
	 *  run-local edits (fps/res/orientation, Q/C) survive the session swap and
	 *  apply to the COPY instead of being reset to the copy's values. */
	let saveAsDone = $state(false);
	/** Pre-copy Q/C map, re-keyed to the copy's new pipe ids when the copy
	 *  resolves (the backend re-mints every piece id in pipe order). */
	let preCopyParams: PipeParamState | null = null;
	/** Pipe ids captured before the copy; consumed once by the re-key effect. */
	let oldPipeIdsRef: string[] | null = null;

	// ── Run-local stats (seeded from the open session; NEVER written back
	//    until Confirm with applyToSession ticked) ──
	let fps = $state(session.fps);
	let resolution = $state<ResolutionPreset>(session.resolution);
	let orientation = $state<Orientation>(session.orientation);
	$effect(() => {
		if (!open) return;
		if (saveAsDone) return; // session swapped to the copy — keep the run-local edits
		fps = session.fps;
		resolution = session.resolution;
		orientation = session.orientation;
		applyToSession = false;
	});
	const stats: SessionGenerateStats = $derived({ fps, resolution, orientation });

	// The run-scoped diff: only fields that actually differ from the session
	// value ride the wire (the backend builds the EngineInput from the
	// composer row when a field is absent).
	const runStats: RunStats = $derived.by(() => {
		const out: RunStats = {};
		if (fps !== session.fps) out.fps = fps;
		if (resolution !== session.resolution) out.resolution = resolution;
		if (orientation !== session.orientation) out.orientation = orientation;
		return out;
	});

	// ── Per-pipe Q/C run-local values (seeded from the pipe rows) ──
	let pipeParamsLocal = $state<PipeParamState>({});
	$effect(() => {
		if (!open) return;
		if (saveAsDone) return; // the copy re-mints the pipe ids; keep the
		// edits the user typed before the copy instead of losing them.
		pipeParamsLocal = Object.fromEntries(pipes.map((p: PipeRow) => [p.id, { q: p.qValue, c: p.cValue }]));
	});
	// Re-key: when the copy's re-minted pipe ids arrive (pipes prop updates
	// after handleCopySession swaps selectedSessionId + loadSession resolves),
	// map the captured pre-copy Q/C onto the new ids by pipe position
	// (Pipe::rekeyed preserves order: old index i → new index i).
	$effect(() => {
		if (!saveAsDone || !preCopyParams || !oldPipeIdsRef) return;
		const preCopy = preCopyParams; // capture — const narrows for the closure
		const oldIds = oldPipeIdsRef;
		const newIds = pipes.map((p: PipeRow) => p.id);
		if (newIds.length === oldIds.length && newIds[0] !== oldIds[0]) {
			// The pipes prop switched to the copy's re-minted ids — re-key now.
			pipeParamsLocal = Object.fromEntries(
				newIds.map((newId: string, i: number) => [
					newId,
					preCopy[oldIds[i]] ?? { q: pipes[i].qValue, c: pipes[i].cValue },
				]),
			);
			preCopyParams = null;
			oldPipeIdsRef = null;
		}
	});
	/** The Q/C diff map: only pipes whose local value differs from the row
	 *  value, and only the values that changed. Empty → null on the wire. */
	const pipeParams: Record<string, PipeParamOverride> = $derived.by(() => {
		const out: Record<string, PipeParamOverride> = {};
		for (const p of pipes) {
			const local = pipeParamsLocal[p.id];
			if (!local) continue;
			const entry: PipeParamOverride = {};
			if (local.q !== p.qValue) entry.qValue = local.q;
			if (local.c !== p.cValue) entry.cValue = local.c;
			if (Object.keys(entry).length > 0) out[p.id] = entry;
		}
		return out;
	});
	const hasPipeParamEdits = $derived(Object.keys(pipeParams).length > 0);

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
		const longest = pipes.reduce((acc: number, p: PipeRow) => Math.max(acc, p.lengthFrames ?? 0), 0);
		if (!longest) return null;
		return secondsPreview({ lengthFrames: longest } as PipeRow, session, spec);
	});

	// Block confirm only when the policy is 'stop' AND a conflict exists;
	// 'continue' policy flags conflicts but still allows the run to start.
	const canStart = $derived(
		pipes.length > 0 && (policy === 'continue' || allConflicts.length === 0),
	);

	const hasStatsEdits = $derived(
		runStats.fps !== undefined || runStats.resolution !== undefined || runStats.orientation !== undefined,
	);

	function handlePipeQ(pipeId: string, e: Event) {
		const next = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(next) && pipeParamsLocal[pipeId]) {
			pipeParamsLocal = { ...pipeParamsLocal, [pipeId]: { ...pipeParamsLocal[pipeId], q: next } };
		}
	}
	function handlePipeC(pipeId: string, e: Event) {
		const next = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(next) && pipeParamsLocal[pipeId]) {
			pipeParamsLocal = { ...pipeParamsLocal, [pipeId]: { ...pipeParamsLocal[pipeId], c: next } };
		}
	}

	function handleFps(e: Event) {
		const next = Number((e.target as HTMLSelectElement).value);
		if (Number.isFinite(next)) fps = next;
	}
	function handleResolution(e: Event) {
		resolution = (e.target as HTMLSelectElement).value as ResolutionPreset;
	}
	function handleOrientation(e: Event) {
		orientation = (e.target as HTMLSelectElement).value as Orientation;
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
		if (savingAs || busy || !onSaveAs) return;
		savingAs = true;
		try {
			// Capture the typed Q/C by pipe position BEFORE the copy re-mints
			// every pipe id (Pipe::rekeyed preserves order, so index i of
			// the old array maps to index i of the new one).
			const oldPipeIds = pipes.map((p: PipeRow) => p.id);
			preCopyParams = {
				...pipeParamsLocal,
				...Object.fromEntries(
					pipes.map((p: PipeRow, i: number) => [p.id, { q: p.qValue, c: p.cValue }]),
				),
			};
			await onSaveAs();
			// The session prop now points at the copy; keep every run-local
			// edit (stats + Q/C) targeting it instead of re-seeding.
			// The copy's re-minted pipe ids arrive with the next pipes prop
			// update — the $effect below re-keys preCopyParams onto them.
			saveAsDone = true;
			oldPipeIdsRef = oldPipeIds;
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
			// "Apply to session": persist the run-local edits through the
			// canonical store path (the session row is updated + saved),
			// so the modal's values and the session's values agree after
			// the run. Run-scoped (toggle off): the session stays untouched.
			if (applyToSession) {
				if (runStats.fps !== undefined) onFpsChange?.(fps);
				if (runStats.resolution !== undefined) onResolutionChange?.(resolution);
				if (runStats.orientation !== undefined) onOrientationChange?.(orientation);
				for (const [pipeId, entry] of Object.entries(pipeParams)) {
					if (entry.qValue !== undefined) onPipeQChange?.(pipeId, entry.qValue);
					if (entry.cValue !== undefined) onPipeCChange?.(pipeId, entry.cValue);
				}
			}
			await onConfirm({ imageModel, videoModel }, seed, policy, autoCompose, stats,
				Object.keys(runStats).length > 0 ? runStats : null,
				hasPipeParamEdits ? pipeParams : null);
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => (open = false)} role="presentation">
		<div class="modal sg-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{APP_CONSTANTS.strings.sessionGenerate}</h3>
				<span class="modal-sub">{APP_CONSTANTS.strings.sessionGenerateHint} · {session.name}</span>
			</div>
			<div class="modal-body sg-body">
				<!-- ── Two-pane body: scrollable pipes (left) + run controls (right). ── -->
				<div class="sg-split">
					<div class="sg-pane sg-pipes">
						<span class="gen-section-title">{APP_CONSTANTS.strings.sessionPipes} · {rows.length}</span>
						<div class="gen-pipe-list">
							{#each rows as row, i (row.pipe.id)}
								{@const local = pipeParamsLocal[row.pipe.id]}
								<div class="gen-pipe-row">
									<span class="gen-pipe-index" aria-hidden="true">{i + 1}</span>
									<span class="gen-pipe-name">{row.pipe.name}</span>
									<span class="gen-chips"><span>{row.pipe.lengthFrames}f</span></span>
									<span class="gen-pipe-params" aria-label="Pipe Q / C">
										<label>Q<input type="number" min="1" max="50" value={local?.q ?? row.pipe.qValue}
											class:changed={local && local.q !== row.pipe.qValue}
											onchange={(e) => handlePipeQ(row.pipe.id, e)} /></label>
										<label>C<input type="number" min="1" max="30" step="0.1" value={local?.c ?? row.pipe.cValue}
											class:changed={local && local.c !== row.pipe.cValue}
											onchange={(e) => handlePipeC(row.pipe.id, e)} /></label>
									</span>
									{#if row.conflicts.length}
										<span class={statusClass('error')}>{row.conflicts[0].message}</span>
								{:else}
									<span class="sg-ready">{@html CHECK_ICON}{APP_CONSTANTS.strings.sessionReady}</span>
								{/if}
								</div>
							{/each}
						</div>
					</div>

					<div class="sg-pane sg-controls">
						<!-- ── Save As (duplicates the session + its media, re-targets THIS run at the copy) ── -->
						{#if onSaveAs}
							<div class="saveas-card" role="group" aria-label="Save As">
								<button class="saveas-btn" type="button" onclick={saveAs} disabled={savingAs || busy}
									title="Duplicates this session (pipes + media) and re-targets this run at the copy — the original stays untouched.">
									{@html COPY_ICON}<span>{savingAs ? APP_CONSTANTS.strings.sessionSaveAsCopying : APP_CONSTANTS.strings.sessionSaveAsCopy}</span>
								</button>
								<p class="saveas-hint">Run on a duplicate instead — originals, media and last-gen state stay untouched.</p>
							</div>
						{/if}

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

						<!-- ── Run stats (run-local; persist via the toggle below) ── -->
						<span class="gen-section-title">{APP_CONSTANTS.strings.sessionRunStats}</span>
						<div class="gen-grid three">
							<div class="gen-fieldrow">
								<label for="sg-fps">{APP_CONSTANTS.strings.fps}</label>
								<select id="sg-fps" value={String(fps)} onchange={handleFps}
									class:changed={fps !== session.fps}>
									{#each APP_CONSTANTS.fpsPresets as f (f)}
										<option value={String(f)}>{f}</option>
									{/each}
								</select>
							</div>
							<div class="gen-fieldrow">
								<label for="sg-res">{APP_CONSTANTS.strings.resolution}</label>
								<select id="sg-res" value={resolution} onchange={handleResolution}
									class:changed={resolution !== session.resolution}>
									{#each APP_CONSTANTS.resolutions as r (r)}
										<option value={r}>{r}</option>
									{/each}
								</select>
							</div>
							<div class="gen-fieldrow">
								<label for="sg-orient">{APP_CONSTANTS.strings.orientation}</label>
								<select id="sg-orient" value={orientation} onchange={handleOrientation}
									class:changed={orientation !== session.orientation}>
									{#each APP_CONSTANTS.orientations as o (o)}
										<option value={o}>{o}</option>
									{/each}
								</select>
							</div>
						</div>

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

						<!-- ── Persist toggle (only when there's something to persist) ── -->
						{#if hasStatsEdits || hasPipeParamEdits}
							<label class="gen-check apply-toggle" aria-label="Apply to session">
								<input type="checkbox" bind:checked={applyToSession} />
								{APP_CONSTANTS.strings.sessionApplyToSession}
								<span class="gen-hint">{APP_CONSTANTS.strings.sessionApplyToSessionHint}</span>
							</label>
						{/if}

						{#if allConflicts.length > 0}
							<ul class="gen-conflicts" aria-label="Generation conflicts">
								{#each allConflicts as c (c.message)}
									<li>{c.message}</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
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
	/* Wide two-pane session modal: pipes scroll on the left, controls stay on the right. */
	.sg-modal {
		width: min(860px, 94vw);
		max-width: 860px;
	}

	.sg-body {
		padding: 14px 18px 18px;
		gap: 12px;
	}

	.sg-split {
		display: grid;
		grid-template-columns: minmax(300px, 44%) minmax(260px, 1fr);
		gap: 14px;
		align-items: start;
	}

	.sg-pane {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	/* Left pane: the pipe list owns the scroll (long sessions → no modal growth). */
	.sg-pipes .gen-pipe-list {
		max-height: min(46vh, 430px);
		overflow-y: auto;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
		padding: 8px;
		gap: 6px;
		scrollbar-width: thin;
	}

	.sg-pipes .gen-pipe-row {
		grid-template-columns: 18px minmax(0, 1fr) auto auto;
		gap: 8px;
		padding: 7px 8px;
		border-radius: 6px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.gen-pipe-index {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted, #71717a);
		background: var(--bg-secondary, #27272a);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 50%;
		flex-shrink: 0;
	}

	.sg-ready {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--success-color, #4ade80);
		white-space: nowrap;
	}

	.gen-pipe-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary, #fff);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Right pane: the Save-As card is explained, not just a mystery button. */
	.saveas-card {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 10px 12px;
		border: 1px dashed var(--border-color, #3f3f46);
		border-radius: 8px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.saveas-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		padding: 6px 11px;
		font-size: 12px;
		font-weight: 500;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		color: var(--text-secondary, #a1a1aa);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease;
	}

	.saveas-btn:hover:not(:disabled) {
		border-color: var(--accent-color, #ff3e00);
		color: var(--text-primary, #fff);
	}

	.saveas-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.saveas-hint {
		margin: 0;
		font-size: 11px;
		line-height: 1.4;
		color: var(--text-muted, #71717a);
	}

	/* Narrow viewports: stack the panes back into the classic single column. */
	@media (max-width: 640px) {
		.sg-split {
			grid-template-columns: 1fr;
		}
		.sg-pipes .gen-pipe-list {
			max-height: 30vh;
		}
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

	.gen-pipe-params input.changed {
		border-color: var(--warning-color, #fbbf24);
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

	.apply-toggle {
		padding: 8px 10px;
		border: 1px dashed var(--border-color, #3f3f46);
		border-radius: 7px;
	}

	.gen-hint {
		font-size: 11px;
		color: var(--text-muted, #71717a);
	}

	/* Run-stats selects: highlight the ones that differ from the session. */
	.gen-fieldrow select.changed {
		border-color: var(--warning-color, #fbbf24);
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
