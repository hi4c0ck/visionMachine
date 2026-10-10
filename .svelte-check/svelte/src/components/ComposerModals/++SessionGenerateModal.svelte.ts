///<reference types="svelte" />
;
import type { ModelSpec, Orientation, PipeRow, ResolutionPreset, SessionData } from '$types';
import { APP_CONSTANTS } from '$constants';
import { flashToast } from '$lib/flashToast';
import { getSettings } from '$lib/settings/store';
import { modelsFor, getPreset, resolveSpecs } from '$lib/settings';
import { pipePrechecks, secondsPreview, type PipeConflict } from '$lib/settings';
import type { PipeParamOverride, RunStats } from '$lib/composerStore/sessionGeneration';
import type { ModelSelection } from './GenerateModal.svelte';
import '../composer-modal.css';
;

	export interface SessionGenerateStats {
		fps: number;
		resolution: ResolutionPreset;
		orientation: Orientation;
	};;

	/** Per-pipe Q/C run-local values keyed by pipe id. */
	type PipeParamState = Record<string, { q: number; c: number }>;;
;type $$ComponentProps = {
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
	};function $$render() {

	
	
	
	
	
	
	
	
	


	/** Inline icons — no icon dependency in the app. */
	const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>`;


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
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	let policy = $state<'stop' | 'continue'>('stop');
	let autoCompose = $state(true);
	let busy = $state(false);
	/** When ticked, confirm additionally persists the edits to the session
	 *  (store setters). Default OFF: edits are run-scoped only. */
	let applyToSession = $state(false);

	// ── Run-local stats (seeded from the open session; NEVER written back
	//    until Confirm with applyToSession ticked) ──
	let fps = $state(session.fps);
	let resolution = $state<ResolutionPreset>(session.resolution);
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
	let pipeParamsLocal = $state<PipeParamState>({});
	$effect(() => {
		if (!open) return;
		pipeParamsLocal = Object.fromEntries(pipes.map((p: PipeRow) => [p.id, { q: p.qValue, c: p.cValue }]));
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
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m: ModelSpec) => !m.readOnly);
		videoModels = (vp ? modelsFor(vp, 'video') : []).filter((m: ModelSpec) => !m.readOnly);
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
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => (open = false),"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal sg-modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});APP_CONSTANTS.strings.sessionGenerate; }
				 { svelteHTML.createElement("span", { "class":`modal-sub`,});APP_CONSTANTS.strings.sessionGenerateHint;  session.name; }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body sg-body`,});
				
				 { svelteHTML.createElement("div", { "class":`sg-split`,});
					 { svelteHTML.createElement("div", { "class":`sg-pane sg-pipes`,});
						 { svelteHTML.createElement("span", { "class":`gen-section-title`,});APP_CONSTANTS.strings.sessionPipes;  rows.length; }
						 { svelteHTML.createElement("div", { "class":`gen-pipe-list`,});
							    for(let row of __sveltets_2_ensureArray(rows)){let i = 1;row.pipe.id;
								const local = pipeParamsLocal[row.pipe.id];
								 { svelteHTML.createElement("div", { "class":`gen-pipe-row`,});
									 { svelteHTML.createElement("span", {   "class":`gen-pipe-index`,"aria-hidden":`true`,});i + 1; }
									 { svelteHTML.createElement("span", { "class":`gen-pipe-name`,});row.pipe.name; }
									 { svelteHTML.createElement("span", { "class":`gen-chips`,}); { svelteHTML.createElement("span", {});row.pipe.lengthFrames;  } }
									 { svelteHTML.createElement("span", {   "class":`gen-pipe-params`,"aria-label":`Pipe Q / C`,});
										 { svelteHTML.createElement("label", {});  { svelteHTML.createElement("input", {           "type":`number`,"min":`1`,"max":`50`,"value":local?.q ?? row.pipe.qValue,"onchange":(e) => handlePipeQ(row.pipe.id, e),});local && local.q !== row.pipe.qValue;} }
										 { svelteHTML.createElement("label", {});  { svelteHTML.createElement("input", {             "type":`number`,"min":`1`,"max":`30`,"step":`0.1`,"value":local?.c ?? row.pipe.cValue,"onchange":(e) => handlePipeC(row.pipe.id, e),});local && local.c !== row.pipe.cValue;} }
									 }
									if(row.conflicts.length){
										 { svelteHTML.createElement("span", { "class":statusClass('error'),});row.conflicts[0].message; }
								}else{
									 { svelteHTML.createElement("span", { "class":`sg-ready`,}); CHECK_ICON;APP_CONSTANTS.strings.sessionReady; }
								}
								 }
							}
						 }
					 }

					 { svelteHTML.createElement("div", { "class":`sg-pane sg-controls`,});
						
						 { svelteHTML.createElement("span", { "class":`gen-section-title`,});APP_CONSTANTS.strings.sessionModels; }
						 { svelteHTML.createElement("div", { "class":`gen-grid`,});
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "for":`sg-image-model`,});  }
								 { svelteHTML.createElement("select", {     "id":`sg-image-model`,"value":imageModel,"onchange":(e) => (imageModel = e.currentTarget.value),});
									   for(let m of __sveltets_2_ensureArray(imageModels)){m.id;
										 { svelteHTML.createElement("option", {   "value":m.id,"disabled":m.pending,});m.label ?? m.id;m.pending ? ' (details pending)' : ''; }
									}
								 }
							 }
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "for":`sg-video-model`,});  }
								 { svelteHTML.createElement("select", {     "id":`sg-video-model`,"value":videoModel,"onchange":(e) => (videoModel = e.currentTarget.value),});
									   for(let m of __sveltets_2_ensureArray(videoModels)){m.id;
										 { svelteHTML.createElement("option", {   "value":m.id,"disabled":m.pending,});m.label ?? m.id;m.pending ? ' (details pending)' : ''; }
									}
								 }
							 }
							if(selectedVideoModel?.supportsSeed){
								 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
									 { svelteHTML.createElement("label", { "for":`sg-seed`,});  }
									 { svelteHTML.createElement("input", {             "id":`sg-seed`,"type":`number`,"min":`0`,"step":`1`,"value":seed ?? '',"oninput":(e) => (seed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value)),});}
								 }
							}
						 }
						if(secHint){
							 { svelteHTML.createElement("span", { "class":`gen-sec-hint`,}); secHint.shown; secHint.clamped ? ' (clamped)' : '';    }
						}

						
						 { svelteHTML.createElement("span", { "class":`gen-section-title`,});APP_CONSTANTS.strings.sessionRunStats; }
						 { svelteHTML.createElement("div", { "class":`gen-grid three`,});
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "for":`sg-fps`,});APP_CONSTANTS.strings.fps; }
								 { svelteHTML.createElement("select", {      "id":`sg-fps`,"value":String(fps),"onchange":handleFps,});fps !== session.fps;
									   for(let f of __sveltets_2_ensureArray(APP_CONSTANTS.fpsPresets)){f;
										 { svelteHTML.createElement("option", { "value":String(f),});f; }
									}
								 }
							 }
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "for":`sg-res`,});APP_CONSTANTS.strings.resolution; }
								 { svelteHTML.createElement("select", {      "id":`sg-res`,"value":resolution,"onchange":handleResolution,});resolution !== session.resolution;
									   for(let r of __sveltets_2_ensureArray(APP_CONSTANTS.resolutions)){r;
										 { svelteHTML.createElement("option", { "value":r,});r; }
									}
								 }
							 }
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "for":`sg-orient`,});APP_CONSTANTS.strings.orientation; }
								 { svelteHTML.createElement("select", {      "id":`sg-orient`,"value":orientation,"onchange":handleOrientation,});orientation !== session.orientation;
									   for(let o of __sveltets_2_ensureArray(APP_CONSTANTS.orientations)){o;
										 { svelteHTML.createElement("option", { "value":o,});o; }
									}
								 }
							 }
						 }

						
						 { svelteHTML.createElement("span", { "class":`gen-section-title`,});APP_CONSTANTS.strings.sessionRunOptions; }
						 { svelteHTML.createElement("div", { "class":`gen-grid`,});
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "for":`sg-policy`,});APP_CONSTANTS.strings.sessionFailurePolicy; }
								 { svelteHTML.createElement("select", {   "id":`sg-policy`,"bind:value":policy,});/*Ωignore_startΩ*/() => policy = __sveltets_2_any(null);/*Ωignore_endΩ*/
									 { svelteHTML.createElement("option", { "value":`stop`,});APP_CONSTANTS.strings.sessionStopPolicy; }
									 { svelteHTML.createElement("option", { "value":`continue`,});APP_CONSTANTS.strings.sessionContinuePolicy; }
								 }
							 }
							 { svelteHTML.createElement("div", { "class":`gen-fieldrow`,});
								 { svelteHTML.createElement("label", { "class":`gen-check`,});
									 { svelteHTML.createElement("input", {    "type":`checkbox`,"bind:checked":autoCompose,});/*Ωignore_startΩ*/() => autoCompose = __sveltets_2_any(null);/*Ωignore_endΩ*/}
									APP_CONSTANTS.strings.sessionAutoCompose;
								 }
							 }
						 }

						
						if(hasStatsEdits || hasPipeParamEdits){
							 { svelteHTML.createElement("label", {   "class":`gen-check apply-toggle`,"aria-label":`Apply to session`,});
								 { svelteHTML.createElement("input", {    "type":`checkbox`,"bind:checked":applyToSession,});/*Ωignore_startΩ*/() => applyToSession = __sveltets_2_any(null);/*Ωignore_endΩ*/}
								APP_CONSTANTS.strings.sessionApplyToSession;
								 { svelteHTML.createElement("span", { "class":`gen-hint`,});APP_CONSTANTS.strings.sessionApplyToSessionHint; }
							 }
						}

						if(allConflicts.length > 0){
							 { svelteHTML.createElement("ul", {   "class":`gen-conflicts`,"aria-label":`Generation conflicts`,});
								   for(let c of __sveltets_2_ensureArray(allConflicts)){c.message;
									 { svelteHTML.createElement("li", {});c.message; }
								}
							 }
						}
					 }
				 }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {     "class":`btn-cancel`,"onclick":() => (open = false),"disabled":busy,});
					APP_CONSTANTS.strings.cancel;
				 }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":confirm,"disabled":busy || !canStart,});
					busy ? APP_CONSTANTS.strings.sessionGenerating : APP_CONSTANTS.strings.sessionGenerate;
				 }
			 }
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const SessionGenerateModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SessionGenerateModal__SvelteComponent_ = ReturnType<typeof SessionGenerateModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default SessionGenerateModal__SvelteComponent_;