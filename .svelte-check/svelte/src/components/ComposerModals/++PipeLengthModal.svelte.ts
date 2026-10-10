///<reference types="svelte" />
;
import type { PipeRow } from '$types';
import { snapTo8nPlus1 } from '$lib/frameMath';
import '../composer-modal.css';

;type $$ComponentProps = {
		pipe: PipeRow;
		/** Session fps — frames ↔ seconds conversion. */
		fps: number;
		/** Resolution cap (8n+1). */
		maxFrames: number;
		/** Computed by the panel for the current pending frames: which zones/tags
		 *  would be trimmed away when the pipe shrinks to it. Empty when growing. */
		trimPreview: {
			trimmedZones: number;
			trimmedTags: number;
			/** Zones fully clipped out (start beyond the new length). */
			lostZoneLabels?: string[];
			/** Tags fully clipped out. */
			lostTagLabels?: string[];
		};
		open: boolean;
		onConfirm: (frames: number) => void;
		/** Fires on every pending-frames change so the panel recomputes the
		 *  trim preview live as the user types. */
		onPreview: (frames: number) => void;
	};function $$render() {

	
	
	

	let {
		pipe,
		fps,
		maxFrames,
		/** Live preview of what would be trimmed when committing the current
		 *  pending frame count (computed by the panel, keyed off `onPreview`). */
		trimPreview,
		open = $bindable(false),
		onConfirm,
		onPreview,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	const MIN_LENGTH = 41; // 8*5+1
	// Seconds → frames step (1 tick = one frame at the session fps). Display is
	// rounded to 1 decimal; the value itself keeps full precision for the
	// cross-calculation back to frames.
	const SEC_STEP = 1 / Math.max(1, fps);
	const FRAME_STEP = 8; // frame arrows snap on the 8-frame grid

	let frames = $state(pipe.lengthFrames);
	let seconds = $state(pipe.lengthFrames / Math.max(1, fps));

	// Seed both inputs from the pipe when the modal opens.
	$effect(() => {
		if (!open) return;
		frames = pipe.lengthFrames;
		seconds = pipe.lengthFrames / Math.max(1, fps);
	});

	// Frames (source of truth) — snap to a valid 8n+1 count within [41, maxFrames].
	function applyFrames(raw: number) {
		if (!Number.isFinite(raw)) return;
		frames = Math.max(MIN_LENGTH, Math.min(snapTo8nPlus1(raw), maxFrames));
		seconds = frames / Math.max(1, fps);
		onPreview(frames);
	}

	// Step the frame count by ±8 (the 8-frame grid), clamped to the valid
	// 8n+1 range. This drives the visible ▲/▼ arrows next to the frames field.
	function nudgeFrames(delta: number) {
		applyFrames(frames + delta * FRAME_STEP);
	}

	// Seconds → frames (live recalculation).
	function applySeconds(raw: number) {
		if (!Number.isFinite(raw) || raw <= 0) return;
		frames = Math.max(MIN_LENGTH, Math.min(snapTo8nPlus1(Math.round(raw * Math.max(1, fps))), maxFrames));
		seconds = frames / Math.max(1, fps);
		onPreview(frames);
	}

	const trimmed = $derived(frames < pipe.lengthFrames);

	function confirm() {
		if (frames === pipe.lengthFrames) {
			open = false;
			return;
		}
		onConfirm(frames);
		open = false;
	}
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => open = false,"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});  }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", { "id":`pl-frames-label`,});  }
					 { svelteHTML.createElement("div", { "class":`pl-stepper`,});
						 { svelteHTML.createElement("button", {           "type":`button`,"class":`pl-step`,"onclick":() => nudgeFrames(-1),"disabled":frames <= MIN_LENGTH,"title":`-8 frames`,"aria-label":`8 frames less`,});  }
						 { svelteHTML.createElement("input", {                 "type":`number`,"step":FRAME_STEP,"min":MIN_LENGTH,"max":maxFrames,"value":frames,"onchange":(e) => applyFrames(Number(e.currentTarget.value)),"class":`modal-input`,"aria-labelledby":`pl-frames-label`,});}
						 { svelteHTML.createElement("button", {           "type":`button`,"class":`pl-step`,"onclick":() => nudgeFrames(1),"disabled":frames >= maxFrames,"title":`+8 frames`,"aria-label":`8 frames more`,});  }
					 }
				 }
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", { "id":`pl-seconds-label`,});  fps;  }
					 { svelteHTML.createElement("input", {                 "type":`number`,"step":SEC_STEP,"min":`0.1`,"max":maxFrames / Math.max(1, fps),"value":Number(seconds.toFixed(1)),"onchange":(e) => applySeconds(Number(e.currentTarget.value)),"class":`modal-input`,"aria-labelledby":`pl-seconds-label`,});}
				 }

				
				if(trimmed){
					 { svelteHTML.createElement("div", { "class":`pl-warning`,});
						 { svelteHTML.createElement("p", {});
							  pipe.lengthFrames;  frames;
							if(trimPreview.trimmedZones > 0 || trimPreview.trimmedTags > 0){  trimPreview.trimmedZones; (trimPreview.trimmedZones !== 1 ? 's' : '');
								 trimPreview.trimmedTags; (trimPreview.trimmedTags !== 1 ? 's' : ''); }else{       }
						 }
						if(trimPreview.lostZoneLabels && trimPreview.lostZoneLabels.length > 0){
							 { svelteHTML.createElement("p", { "class":`pl-warning-detail`,});  trimPreview.lostZoneLabels.join(', '); }
						}
						if(trimPreview.lostTagLabels && trimPreview.lostTagLabels.length > 0){
							 { svelteHTML.createElement("p", { "class":`pl-warning-detail`,});  trimPreview.lostTagLabels.join(', '); }
						}
					 }
				}
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":() => open = false,});  }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":confirm,"disabled":frames === pipe.lengthFrames,});  }
			 }
		 }
	 }
}



};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const PipeLengthModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type PipeLengthModal__SvelteComponent_ = ReturnType<typeof PipeLengthModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default PipeLengthModal__SvelteComponent_;