<script lang="ts">
	import { untrack } from 'svelte';
	import type { ModelSpec, Orientation, PipeRow, ResolutionPreset, SessionData } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { getSettings } from '$lib/settings/store';
	import { modelsFor, getPreset, resolveSpecs } from '$lib/settings';
	import { pipePrechecks, secondsPreview, type PipeConflict } from '$lib/settings';
	import type { PipeParamOverride, RunStats } from '$lib/composerStore/sessionGeneration';
	import { Q_RANGE, C_RANGE, validateQValue, validateCValue } from '$lib/composerStore/validators';
	import { masterState, setMaster } from '$lib/sessionMasters';
	import { qcSupport } from '$lib/settings/qcSupport';
	import type { ModelSelection } from './GenerateModal.svelte';
	import { effectiveTargetDims, targetDimsLabel } from '$types';
	import { availableResolutionsForModel } from '$lib/settings/mediaMode';
	import '../composer-modal.css';

	export interface SessionGenerateStats {
		fps: number;
		resolution: ResolutionPreset;
		orientation: Orientation;
	}

	/** Inline icons — no icon dependency in the app. */
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
			forceLastFrames: Record<string, boolean> | null,
			trimBoundary: Record<string, boolean> | null,
		) => Promise<void> | void;
		onFpsChange?: (fps: number) => void;
		onResolutionChange?: (res: string) => void;
		onOrientationChange?: (o: string) => void;
		onPipeQChange?: (pipeId: string, q: number) => void;
		onPipeCChange?: (pipeId: string, c: number) => void;
	}>();

	let policy = $state<'stop' | 'continue'>('stop');
	let autoCompose = $state(true);
	/** Per-pipe "force first keyframe" toggles, keyed by pipe id. Shown ONLY
	 *  on pipes that sit after the group's first pipe (they can catch the
	 *  previous pipe's last frame), run in keyframe mode, AND already own a
	 *  settled slot-1 keyframe. Ticked → this pipe's settled slot-1 is
	 *  overwritten by the previous pipe's last frame during the run. Pipes
	 *  WITHOUT a settled slot-1 are always auto-filled (no toggle needed).
	 *  The decision is per pipe, never a single global switch. */
	let forceLastFramesLocal = $state<Record<string, boolean>>({});
	let trimBoundaryLocal = $state<Record<string, boolean>>({});
	let busy = $state(false);
	/** When ticked, confirm additionally persists the edits to the session
	 *  (store setters). Default OFF: edits are run-scoped only. */
	let applyToSession = $state(false);

	// ── Run-local stats (seeded from the open session; NEVER written back
	//    until Confirm with applyToSession ticked) ──
	// svelte-ignore state_referenced_locally — intentional: seed from session, sync via effect
	let fps = $state(session.fps);
	// svelte-ignore state_referenced_locally — intentional: seed from session, sync via effect
	let resolution = $state<ResolutionPreset>(session.resolution);
	// svelte-ignore state_referenced_locally — intentional: seed from session, sync via effect
	let orientation = $state<Orientation>(session.orientation);
	$effect(() => {
		if (!open) return;
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
	// Bug batch nov19 (item 3, RC1): per-field DIRTY tracking. The old seed
	// ran once at open and the diff compared stale locals against the live
	// rows — a ToolsPanel edit while the modal was open became a PHANTOM
	// override that reverted the user's edit on the wire. Now: unedited
	// fields re-sync to the row whenever it changes (the pipes prop is a
	// fresh array per store mutation since the item-1 pipe-ref bridge);
	// only fields the user actually typed ride the diff.
	let pipeParamsLocal = $state<PipeParamState>({});
	let paramDirty = $state<Record<string, { q?: boolean; c?: boolean }>>({});
	$effect(() => {
		if (!open) return;
		const rows = pipes; // tracked: fresh array identity per store mutation
		// untrack the locals: reading-what-we-write would loop the effect.
		const cur = untrack(() => pipeParamsLocal);
		const dirty = untrack(() => paramDirty);
		const next: PipeParamState = {};
		let changed = Object.keys(cur).length !== rows.length;
		for (const p of rows) {
			const existing = cur[p.id];
			const q = dirty[p.id]?.q && existing ? existing.q : p.qValue;
			const c = dirty[p.id]?.c && existing ? existing.c : p.cValue;
			next[p.id] = { q, c };
			if (!existing || existing.q !== q || existing.c !== c) changed = true;
		}
		// Write only on a real change → the effect converges (no loop).
		if (changed) pipeParamsLocal = next;
	});
	/** The Q/C diff map: only DIRTY fields whose local value differs from
	 *  the row value. Empty → null on the wire. An unedited field can never
	 *  ship an override (it mirrors the row by construction). */
	const pipeParams: Record<string, PipeParamOverride> = $derived.by(() => {
		const out: Record<string, PipeParamOverride> = {};
		for (const p of pipes) {
			const local = pipeParamsLocal[p.id];
			if (!local) continue;
			const dirty = paramDirty[p.id];
			const entry: PipeParamOverride = {};
			if (dirty?.q && local.q !== p.qValue) entry.qValue = local.q;
			if (dirty?.c && local.c !== p.cValue) entry.cValue = local.c;
			if (Object.keys(entry).length > 0) out[p.id] = entry;
		}
		return out;
	});
	const hasPipeParamEdits = $derived(Object.keys(pipeParams).length > 0);

	// ── Per-pipe "force first keyframe" (re-snap) — offered on every INTERIOR
	//    keyframe-mode pipe (not the group's first, and not reference-mode,
	//    which doesn't consume slot-1). Ticked → this pipe's first keyframe is
	//    (re)snap'd from the previous pipe's last frame: an EMPTY slot-1 gets
	//    created, a SETTLED one gets overwritten (the backend
	//    `upsert_slot1_image` does both). A pipe with no first kf is auto-filled
	//    by the catch regardless; the tick makes that explicit / forces the
	//    rewrite. Defaults to OFF. ──
	/** Pipes eligible for the per-pipe force toggle: interior + keyframe mode.
	 *  No settled-state gate — an empty first kf (like a pipe that has none
	 *  yet) is exactly where the user wants to pull the snapped cut in, so the
	 *  checkbox is shown on it too. */
	const forceEligible = $derived(
		new Set<string>(
			pipes
				.slice(1)
				.filter((p: PipeRow) => p.mediaMode !== 'reference')
				.map((p: PipeRow) => p.id),
		),
	);
	/** The diff the wire carries: only eligible pipes that are ticked. */
	const forceLastFrames: Record<string, boolean> = $derived.by(() => {
		const out: Record<string, boolean> = {};
		for (const [id, on] of Object.entries(forceLastFramesLocal)) {
			if (on && forceEligible.has(id)) out[id] = true;
		}
		return out;
	});
	$effect(() => {
		if (!open) return;
		forceLastFramesLocal = {};
		trimBoundaryLocal = {};
		paramDirty = {};
	});

	// ── Per-pipe "experimental compose pipes" boundary-trim (run-scoped).
	//    Offered on every INTERIOR pipe (the group's first pipe is never
	//    trimmed — nothing precedes it) and only when the master gate
	//    settings.experimental.composePipes is ON. Ticked → the session-video
	//    auto-compose drops BOUNDARY_TRIM_FRAMES (one 8n+1 interval) off that
	//    pipe's clip head so the splice lands in stable content. Run-scoped
	//    only: it rides the wire (StartSessionGenerationInput.trim_boundary),
	//    never written back to the session row by this modal. ──
	const composeGateOn = $derived(getSettings().experimental?.composePipes === true);
	const trimEligible = $derived(new Set<string>(pipes.slice(1).map((p: PipeRow) => p.id)));
	const trimBoundary: Record<string, boolean> = $derived.by(() => {
		const out: Record<string, boolean> = {};
		if (!composeGateOn) return out;
		for (const [id, on] of Object.entries(trimBoundaryLocal)) {
			if (on && trimEligible.has(id)) out[id] = true;
		}
		return out;
	});

	// ── Master toggles (bug batch nov19, item 9): check/uncheck ALL eligible
	//    pipes at once. Pure bulk edits of the same run-local state — the
	//    per-pipe diff maps and the wire are unchanged. ──
	const forceMaster = $derived(masterState(forceEligible, forceLastFramesLocal));
	const trimMaster = $derived(masterState(trimEligible, trimBoundaryLocal));
	function toggleForceAll(e: Event) {
		const on = (e.target as HTMLInputElement).checked;
		forceLastFramesLocal = setMaster(forceEligible, forceLastFramesLocal, on);
	}
	function toggleTrimAll(e: Event) {
		const on = (e.target as HTMLInputElement).checked;
		trimBoundaryLocal = setMaster(trimEligible, trimBoundaryLocal, on);
	}

	// 0012: session target size label + crop-method label + the compose
	// re-encode badge. `none` crop resolves to center for mixed-size sets, so
	// the badge reflects whether the session actually needs a re-encode pass.
	const targetLabel = $derived.by(() => {
		return targetDimsLabel(
			(resolution ?? session.resolution) as ResolutionPreset,
			(orientation ?? session.orientation) as Orientation,
			session.customWidth,
			session.customHeight,
		);
	});
	const cropModeActive: string = $derived(session.cropMode ?? 'center');
	const cropLabel = $derived.by(() => {
		switch (cropModeActive) {
			case 'fit': return 'Fit (letterbox)';
			case 'top': return 'Top crop';
			case 'bottom': return 'Bottom crop';
			case 'exact': return 'Exact';
			case 'none': return 'Auto (center if mixed)';
			default: return 'Center crop';
		}
	});
	// A re-encode happens when trim is active OR a non-none crop is set (the
	// lossless gate skips copy in either case).
	const anyTrimOn = $derived(Object.keys(trimBoundary).length > 0);
	const reencodeBadge = $derived(
		anyTrimOn && cropModeActive !== 'none'
			? 're-encode (trim + crop)'
			: anyTrimOn
				? 're-encode (trim)'
				: cropModeActive !== 'none'
					? 're-encode (size norm)'
					: null,
	);

	// ── Per-run model override (same pattern as GenerateModal) ──
	let imageModel = $state('');
	let videoModel = $state('');
	let imageModels = $state<ModelSpec[]>([]);
	// Item 8: honest Q/C note for the picked image model — the per-pipe Q/C
	// inputs above edit real values, but the wire only carries them on
	// img2img keyframes (Agnes txt2img + video routes reject the knobs).
	const qcNote = $derived.by(() => {
		const spec = imageModels.find((m) => m.id === imageModel) ?? null;
		const support = qcSupport(spec);
		return support === 'img2img-only'
			? APP_CONSTANTS.strings.qcSupportImg2ImgOnly
			: support === 'none'
				? APP_CONSTANTS.strings.qcSupportNone
				: null;
	});
	let videoModels = $state<ModelSpec[]>([]);
	let seed = $state<number | null>(null);
	const selectedVideoModel = $derived(videoModels.find((m) => m.id === videoModel) ?? null);
	// 0012: offer only the resolution presets the active video model can emit.
	const resOptions = $derived(
		availableResolutionsForModel(selectedVideoModel, resolution),
	);

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
		const key = [s.providers.image.model, s.providers.video.model, s.providers.image.preset, s.providers.video.preset].join('|');
		if (modelSeedKey === key) return;
		modelSeedKey = key;
		imageModel = s.providers.image.model;
		videoModel = s.providers.video.model;
		const ip = getPreset(s.providers.image.preset);
		const vp = getPreset(s.providers.video.preset);
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m: ModelSpec) => !m.readOnly && !m.obsolete);
		videoModels = (vp ? modelsFor(vp, 'video') : []).filter((m: ModelSpec) => !m.readOnly && !m.obsolete);
		// Self-heal: a saved default that is no longer selectable (read-only /
		// unknown) must not leave the select empty — fall back to the first
		// generable model of the kind.
		if (!imageModels.some((m) => m.id === imageModel)) imageModel = imageModels.find((m) => !m.pending)?.id ?? imageModel;
		if (!videoModels.some((m) => m.id === videoModel)) videoModel = videoModels.find((m) => !m.pending)?.id ?? videoModel;
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
		const raw = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(raw) && pipeParamsLocal[pipeId]) {
			// Item 3 (RC2): clamp to the ONE range source — the wire can
			// never carry a value the panel/store would reject.
			const next = validateQValue(raw);
			pipeParamsLocal = { ...pipeParamsLocal, [pipeId]: { ...pipeParamsLocal[pipeId], q: next } };
			paramDirty = { ...paramDirty, [pipeId]: { ...paramDirty[pipeId], q: true } };
		}
	}
	function handlePipeC(pipeId: string, e: Event) {
		const raw = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(raw) && pipeParamsLocal[pipeId]) {
			const next = validateCValue(raw);
			pipeParamsLocal = { ...pipeParamsLocal, [pipeId]: { ...pipeParamsLocal[pipeId], c: next } };
			paramDirty = { ...paramDirty, [pipeId]: { ...paramDirty[pipeId], c: true } };
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
				hasPipeParamEdits ? pipeParams : null,
				Object.keys(forceLastFrames).length > 0 ? forceLastFrames : null,
				Object.keys(trimBoundary).length > 0 ? trimBoundary : null);
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
						{#if qcNote}
							<p class="sg-qc-note">{qcNote}</p>
						{/if}
						<!-- Item 9: master check-all controls above the pipe list. -->
						{#if forceEligible.size > 0 || (composeGateOn && trimEligible.size > 0)}
							<div class="sg-masters">
								{#if forceEligible.size > 0}
									<label class="gen-check sg-master" title={APP_CONSTANTS.strings.sessionPipeForceLastFrameHint}>
										<input type="checkbox" checked={forceMaster.all} indeterminate={forceMaster.mixed}
											onchange={toggleForceAll} />
										<span>{APP_CONSTANTS.strings.sessionForceAll}</span>
									</label>
								{/if}
								{#if composeGateOn && trimEligible.size > 0}
									<label class="gen-check sg-master" title={APP_CONSTANTS.strings.sessionTrimAllHint}>
										<input type="checkbox" checked={trimMaster.all} indeterminate={trimMaster.mixed}
											onchange={toggleTrimAll} />
										<span>{APP_CONSTANTS.strings.sessionTrimAll}</span>
									</label>
								{/if}
							</div>
						{/if}
						<div class="gen-pipe-list">
							{#each rows as row, i (row.pipe.id)}
								{@const local = pipeParamsLocal[row.pipe.id]}
								<div class="gen-pipe-row">
									<span class="gen-pipe-index" aria-hidden="true">{i + 1}</span>
									<span class="gen-pipe-name">{row.pipe.name}</span>
									<span class="gen-chips"><span>{row.pipe.lengthFrames}f</span></span>
									<span class="gen-pipe-params" aria-label="Pipe Q / C">
										<label>Q<input type="number" min={Q_RANGE.min} max={Q_RANGE.max} step={Q_RANGE.step} value={local?.q ?? row.pipe.qValue}
											class:changed={local && local.q !== row.pipe.qValue}
											onchange={(e) => handlePipeQ(row.pipe.id, e)} /></label>
										<label>C<input type="number" min={C_RANGE.min} max={C_RANGE.max} step={C_RANGE.step} value={local?.c ?? row.pipe.cValue}
											class:changed={local && local.c !== row.pipe.cValue}
											onchange={(e) => handlePipeC(row.pipe.id, e)} /></label>
									</span>
									{#if forceEligible.has(row.pipe.id)}
										<label class="gen-check sg-force" title={APP_CONSTANTS.strings.sessionPipeForceLastFrameHint}>
											<input type="checkbox" checked={!!forceLastFramesLocal[row.pipe.id]}
												onchange={(e) => (forceLastFramesLocal = { ...forceLastFramesLocal, [row.pipe.id]: (e.target as HTMLInputElement).checked })} />
											<span class="sg-force-label">{APP_CONSTANTS.strings.sessionPipeForceLastFrame}</span>
										</label>
									{/if}
									{#if composeGateOn && trimEligible.has(row.pipe.id)}
										<label class="gen-check sg-trim" title="Experimental: drop one 8n+1 keyframe interval off this pipe's clip head so the session-video splice lands in stable content (off = classic lossless back-to-back splice)">
											<input type="checkbox" checked={!!trimBoundaryLocal[row.pipe.id]}
												onchange={(e) => (trimBoundaryLocal = { ...trimBoundaryLocal, [row.pipe.id]: (e.target as HTMLInputElement).checked })} />
											<span class="sg-trim-label">Trim 8f boundary</span>
										</label>
									{/if}
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
									{#each resOptions as r (r)}
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

						<!-- 0012: session target size + compose normalization badge -->
						<div class="sg-target-row">
							<span class="sg-target-label">Session target</span>
							<span class="sg-target-value">{targetLabel}</span>
							<span class="sg-target-crop">· {cropLabel}</span>
							{#if reencodeBadge}
								<span class="sg-badge">{reencodeBadge}</span>
							{/if}
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
							<div class="gen-fieldrow">
								<span class="gen-hint sg-catch-note">{APP_CONSTANTS.strings.sessionCatchLastFrameNote}</span>
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

	/* Per-pipe "force first keyframe" toggle (shown only on eligible settled
	   non-first pipes). A compact inline checkbox inside the pipe row. */
	.sg-pipes .sg-force {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: var(--text-muted, #71717a);
		cursor: pointer;
		padding: 0;
	}

	.sg-pipes .sg-force input {
		width: auto;
		margin: 0;
	}

	/* Item 8: honest Q/C support note under the Pipes heading. */
	.sg-qc-note {
		font-size: 10px;
		line-height: 1.4;
		color: var(--text-muted);
		margin: 2px 0 6px;
	}

	/* Item 9: master check-all row above the pipe list — same gen-check
	   chrome, hairline separator so the bulk controls read apart from rows. */
	.sg-masters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		padding: 4px 2px 8px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border-color);
	}
	.sg-masters .sg-master {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: var(--text-secondary);
		cursor: pointer;
	}
	.sg-masters .sg-master input {
		width: auto;
		margin: 0;
	}

	.sg-pipes .sg-force .sg-force-label {
		white-space: nowrap;
	}

	/* Per-pipe experimental boundary-trim toggle (interior pipes only, when
	   the master gate is on). Same compact inline style as .sg-force, but the
	   accent border makes the "experimental" opt-in visually distinct. */
	.sg-pipes .sg-trim {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: var(--text-muted, #71717a);
		cursor: pointer;
		padding: 2px 6px;
		border: 1px dashed var(--border-color, #3f3f46);
		border-radius: 5px;
	}
	.sg-pipes .sg-trim:hover {
		border-color: var(--accent-color, #ff3e00);
	}
	.sg-pipes .sg-trim input {
		width: auto;
		margin: 0;
		accent-color: var(--accent-color, #ff3e00);
	}
	.sg-pipes .sg-trim .sg-trim-label {
		white-space: nowrap;
	}

	/* Explains the automatic per-pipe catch that runs in the background. */
	.sg-catch-note {
		display: block;
		padding: 8px 10px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	/* 0012: session target size + crop-method row with the compose re-encode
	   badge. Surfaces "Session: 1920×1080 · Center crop · re-encode (size norm)"
	   so the user sees what the final session video will look like. */
	.sg-target-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px 0 4px;
		padding: 8px 10px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		font-size: 0.78rem;
		flex-wrap: wrap;
	}
	.sg-target-label {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.sg-target-value {
		color: var(--text-primary);
		font-weight: 500;
	}
	.sg-target-crop {
		color: var(--text-secondary);
	}
	.sg-badge {
		margin-left: auto;
		font-size: 10px;
		color: var(--text-muted);
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 999px;
		padding: 2px 8px;
		white-space: nowrap;
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
