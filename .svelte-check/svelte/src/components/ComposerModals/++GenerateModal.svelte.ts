///<reference types="svelte" />
;// Generate confirm modal (D8): presets + final prompt (read-only) plus a
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
;

	export interface ModelSelection {
		imageModel: string;
		videoModel: string;
	};
;type $$ComponentProps = {
		pipe: PipeRow;
		session: SessionData;
		open: boolean;
		onConfirm: (models: ModelSelection, seed: number | null) => Promise<void> | void;
	};function $$render() {

	
	
	
	
	
	
	
	
	
	
	
	


	let {
		pipe,
		session,
		open = $bindable(false),
		onConfirm,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

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
		// Read-only (paid) models are Settings-browse only (Q3) — they are
		// not confirmable for generation.
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m: ModelSpec) => !m.readOnly);
		videoModels = (vp ? modelsFor(vp, 'video') : []).filter((m: ModelSpec) => !m.readOnly);
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
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => (open = false),"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});  pipe.name; }
				 { svelteHTML.createElement("span", { "class":`modal-sub`,});       }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				 { svelteHTML.createElement("div", {   "class":`gen-models`,"aria-label":`Model selection for this run`,});
					 { svelteHTML.createElement("span", { "class":`gen-section-title`,});  }
					 { svelteHTML.createElement("div", { "class":`gen-model-row`,});
					 { svelteHTML.createElement("div", { "class":`gen-model`,});
						 { svelteHTML.createElement("label", { "for":`gen-image-model`,});  }
						 { svelteHTML.createElement("select", {     "id":`gen-image-model`,"value":imageModel,"onchange":(e) => (imageModel = e.currentTarget.value),});
							   for(let m of __sveltets_2_ensureArray(imageModels)){m.id;
								 { svelteHTML.createElement("option", {   "value":m.id,"disabled":m.pending,});m.label ?? m.id;m.pending ? ' (details pending)' : ''; }
							}
						 }
					 }
					 { svelteHTML.createElement("div", { "class":`gen-model`,});
						 { svelteHTML.createElement("label", { "for":`gen-video-model`,});  }
						 { svelteHTML.createElement("select", {     "id":`gen-video-model`,"value":videoModel,"onchange":(e) => (videoModel = e.currentTarget.value),});
							   for(let m of __sveltets_2_ensureArray(videoModels)){m.id;
								 { svelteHTML.createElement("option", {   "value":m.id,"disabled":m.pending,});m.label ?? m.id;m.pending ? ' (details pending)' : ''; }
							}
						 }
					 }
					if(selectedVideoModel?.supportsSeed){
						 { svelteHTML.createElement("div", { "class":`gen-model`,});
							 { svelteHTML.createElement("label", { "for":`gen-seed`,});  }
							 { svelteHTML.createElement("input", {             "id":`gen-seed`,"type":`number`,"min":`0`,"step":`1`,"value":seed ?? '',"oninput":(e) => (seed = e.currentTarget.value === '' ? null : Number(e.currentTarget.value)),});}
						 }
					}
					if(secHint){
						 { svelteHTML.createElement("div", {   "class":`gen-sec-hint`,"aria-label":`Duration for this run`,});
							 { svelteHTML.createElement("span", {}); secHint.shown; secHint.clamped ? ' (clamped)' : ''; }
						 }
					}
				 }
			 }
				 { svelteHTML.createElement("div", { "class":`gen-prompt-wrap`,});
					 { svelteHTML.createElement("span", { "class":`gen-section-title`,});  }
					 { svelteHTML.createElement("div", { "class":`gen-prompt-box`,});
						 { svelteHTML.createElement("textarea", {           "class":`modal-textarea gen-prompt`,"readonly":true,"rows":expanded ? 18 : 6,"value":prompt,"aria-label":`Final prompt`,});expanded; }
						 { svelteHTML.createElement("div", { "class":`gen-prompt-actions`,});
							 { svelteHTML.createElement("button", {           "class":`gen-mini-btn`,"type":`button`,"onclick":() => (expanded = !expanded),"aria-expanded":expanded,"title":expanded ? 'Collapse' : 'Expand',"aria-label":expanded ? 'Collapse prompt' : 'Expand prompt',});
								 { svelteHTML.createElement("svg", {             "width":`12`,"height":`12`,"viewBox":`0 0 12 12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"aria-hidden":`true`,});
									if(expanded){
										 { svelteHTML.createElement("path", {  "d":`M2.5 7.5 6 4l3.5 3.5`,});}
									}else{
										 { svelteHTML.createElement("path", {  "d":`M2.5 4.5 6 8l3.5-3.5`,});}
									}
								 }
							 }
							 { svelteHTML.createElement("button", {          "class":`gen-mini-btn`,"type":`button`,"onclick":copyPrompt,"title":justCopied ? 'Copied' : 'Copy',"aria-label":`Copy prompt`,});justCopied;
								 { svelteHTML.createElement("svg", {             "width":`12`,"height":`12`,"viewBox":`0 0 12 12`,"fill":`none`,"stroke":`currentColor`,"stroke-width":`1.5`,"aria-hidden":`true`,});
									if(justCopied){
										 { svelteHTML.createElement("path", {  "d":`M2.5 6.5 5 9l4.5-5`,});}
									}else{
										 { svelteHTML.createElement("rect", {          "x":`4.2`,"y":`4.2`,"width":`5.6`,"height":`5.6`,"rx":`1`,});}
										 { svelteHTML.createElement("path", {  "d":`M3.8 4V2.6A.6.6 0 0 1 4.4 2h3.8`,});}
										}
								 }
							 }
						 }
					 }
				 }
				if(conflicts.length > 0){
						 { svelteHTML.createElement("ul", {   "class":`gen-conflicts`,"aria-label":`Generation conflicts`,});
							   for(let c of __sveltets_2_ensureArray(conflicts)){c.message;
								 { svelteHTML.createElement("li", {});c.message; }
							}
						 }
					}
				 { svelteHTML.createElement("div", {   "class":`gen-presets`,"aria-label":`Generation presets`,});
					 { svelteHTML.createElement("span", {});session.fps;  }
					 { svelteHTML.createElement("span", {});session.resolution; }
					 { svelteHTML.createElement("span", {});session.orientation; }
					 { svelteHTML.createElement("span", {}); pipe.qValue; }
					 { svelteHTML.createElement("span", {}); pipe.cValue; }
					 { svelteHTML.createElement("span", {});pipe.lengthFrames;  }
				 }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {     "class":`btn-cancel`,"onclick":() => (open = false),"disabled":busy,});
					APP_CONSTANTS.strings.cancel;
				 }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":confirm,"disabled":busy || conflicts.length > 0,});
					busy ? 'Starting…' : APP_CONSTANTS.strings.generate;
				 }
			 }
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const GenerateModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type GenerateModal__SvelteComponent_ = ReturnType<typeof GenerateModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default GenerateModal__SvelteComponent_;