///<reference types="svelte" />
;
import { snapTo8 } from '$lib/frameMath';
import type { FreeGap } from '$lib/frameMath';

import '../composer-modal.css';

;type $$ComponentProps = {
		startFrame: number;
		endFrame: number;
		totalFrames: number;
		gaps?: FreeGap[];
		minSpan?: number;
		open: boolean;
		onConfirm: (start: number, end: number) => void;
	};function $$render() {

	
	

	let {
		startFrame,
		endFrame,
		totalFrames,
		/** Free gaps a new zone may be placed into (before/between/after zones). */
		gaps = [],
		/** Minimum zone span to allow on creation (≈1s at session fps, 8-grid). */
		minSpan = 8,
		open = $bindable(false),
		onConfirm,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	

	let segStart = $state(0);
	let segEnd = $state(8);

	// Which gap the user is targeting; picking one re-seeds the inputs.
	let selectedGap = $state<number>(0);

	// Seed the inputs and the gap selection when the modal opens
	$effect(() => {
		if (!open) return;
		segStart = startFrame;
		segEnd = endFrame;
		selectedGap = gaps.findIndex(
			(g: FreeGap) => g.start === startFrame || (g.start <= startFrame && startFrame < g.end)
		);
		if (selectedGap < 0) selectedGap = 0;
	});

	function pickGap(i: number) {
		selectedGap = i;
		const g = gaps[i];
		if (g) {
			segStart = g.start;
			// Default end to the maximum available in the gap (fills the free
			// space); the user can shrink it via the start/end fields.
			segEnd = g.end;
		}
	}

	function confirm() {
		const start = snapTo8(segStart);
		const end = Math.min(snapTo8(segEnd), totalFrames - 1);
		if (end - start < minSpan) return;
		onConfirm(start, end);
	}

	// Live below-floor check drives the Confirm-button disabled state + hint.
	const belowMin = $derived(
		Math.min(snapTo8(segEnd), totalFrames - 1) - snapTo8(segStart) < minSpan
	);
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => open = false,"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});  }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				if(gaps.length > 0){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`seg-gap-label`,});    }
						 { svelteHTML.createElement("div", { "class":`gap-picker`,});
							    for(let g of __sveltets_2_ensureArray(gaps)){let i = 1;i;
								 { svelteHTML.createElement("button", {       "class":`gap-chip`,"onclick":() => pickGap(i),"title":`Frames ${g.start}–${g.end}`,});selectedGap === i;
									 { svelteHTML.createElement("span", { "class":`gap-label`,});g.label; }
									 { svelteHTML.createElement("span", { "class":`gap-range`,});g.start; g.end; }
								 }
							}
						 }
					 }
				}
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", { "id":`seg-start-label`,});  }
					 { svelteHTML.createElement("input", {              "type":`number`,"bind:value":segStart,"step":8,"min":0,"max":totalFrames - 1,"class":`modal-input`,"aria-labelledby":`seg-start-label`,});/*Ωignore_startΩ*/() => segStart = __sveltets_2_any(null);/*Ωignore_endΩ*/}
				 }
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", { "id":`seg-end-label`,});  }
					 { svelteHTML.createElement("input", {              "type":`number`,"bind:value":segEnd,"step":8,"min":0,"max":totalFrames - 1,"class":`modal-input`,"aria-labelledby":`seg-end-label`,});/*Ωignore_startΩ*/() => segEnd = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					if(belowMin){
						 { svelteHTML.createElement("div", { "class":`seg-min-hint`,});    minSpan;      }
					}
				 }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":() => open = false,});  }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":confirm,"disabled":belowMin,});  }
			 }
		 }
	 }
}

	
};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const SegmentModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SegmentModal__SvelteComponent_ = ReturnType<typeof SegmentModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default SegmentModal__SvelteComponent_;