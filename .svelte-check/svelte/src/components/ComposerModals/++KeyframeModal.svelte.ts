///<reference types="svelte" />
;
import type { PipeRow, PipeKeyframe } from '$types';
import { addKeyframe as addKeyframeAction } from '$lib/composerStore';
import { flashToast } from '$lib/flashToast';
import { snapTo8 } from '$lib/frameMath';

import '../composer-modal.css';

;type $$ComponentProps = {
		pipe: PipeRow;
		sessionId: string | undefined;
		maxFrames: number;
		editingSlot: number | null;
		open: boolean;
		/** Fires after a successful save so the caller can re-validate the
		 * reference's URL accessibility (D5 red-out clears on success). */
		onSaved?: (refId: string) => void;
	};function $$render() {

	
	
	
	

	let {
		pipe,
		sessionId,
		maxFrames,
		editingSlot,
		open = $bindable(false),
		onSaved,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	

	let kfType = $state<'url' | 'txt2img' | 'img2img'>('url');
	let kfValue = $state('');
	// img2img carries two independent fields: the reference image and the prompt.
	let kfReferenceUrl = $state('');
	let kfFrame = $state(0);

	// Seed values when the modal opens (moved verbatim from openKeyframeModal)
	$effect(() => {
		if (!open || editingSlot === null) return;
		const existing = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === editingSlot);
		if (existing) {
			kfType = existing.type;
			kfValue = existing.imageSrc ?? existing.prompt ?? '';
			kfReferenceUrl = existing.referenceUrl ?? '';
			kfFrame = existing.frame;
		} else {
			kfType = 'url';
			kfValue = '';
			kfReferenceUrl = '';
			kfFrame = snapTo8(pipe.keyframes.length > 0 ? pipe.keyframes[0].frame : 0);
		}
	});

	// url needs a URL; txt2img needs a prompt; img2img needs both.
	const kfValid = $derived(
		kfType === 'url'
			? kfValue.trim().length > 0
			: kfType === 'txt2img'
				? kfValue.trim().length > 0
				: kfReferenceUrl.trim().length > 0 && kfValue.trim().length > 0,
	);

	async function confirm() {
		if (!sessionId || editingSlot === null) return;
		if (!kfValid) return;
		const result = await addKeyframeAction(
			sessionId,
			pipe.id,
			editingSlot,
			kfFrame,
			kfType,
			kfValue,
			kfType === 'img2img' ? kfReferenceUrl : undefined,
		);
		if (result.errors.length > 0) {
			flashToast(result.errors[0] || 'Failed to save keyframe');
			console.error('[KeyframeModal] confirm:', result.errors);
			return;
		}
		open = false;
		kfValue = '';
		kfReferenceUrl = '';
		// upsert keeps the id stable — resolve it and let the caller re-check
		const savedKf = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === editingSlot);
		if (savedKf) onSaved?.(savedKf.id);
	}
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => open = false,"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});editingSlot ? 'Edit Keyframe' : 'Add Keyframe';  { svelteHTML.createElement("span", { "class":`modal-sub`,}); editingSlot ?? '?'; } }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				 { svelteHTML.createElement("div", { "class":`mode-selector`,});
					 { svelteHTML.createElement("button", {   "class":`mode-btn ${kfType === 'url' ? 'active' : ''}`,"onclick":() => kfType = 'url',});  }
					 { svelteHTML.createElement("button", {   "class":`mode-btn ${kfType === 'txt2img' ? 'active' : ''}`,"onclick":() => kfType = 'txt2img',});  }
					 { svelteHTML.createElement("button", {   "class":`mode-btn ${kfType === 'img2img' ? 'active' : ''}`,"onclick":() => kfType = 'img2img',});  }
				 }
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", { "id":`kf-frame-label`,});  }
					 { svelteHTML.createElement("input", {              "type":`number`,"bind:value":kfFrame,"step":8,"min":0,"max":maxFrames - 1,"class":`modal-input`,"aria-labelledby":`kf-frame-label`,});/*Ωignore_startΩ*/() => kfFrame = __sveltets_2_any(null);/*Ωignore_endΩ*/}
				 }
				if(kfType === 'url'){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`kf-url-label`,});  }
						 { svelteHTML.createElement("input", {          "type":`text`,"bind:value":kfValue,"placeholder":`https://...`,"class":`modal-input`,"aria-labelledby":`kf-url-label`,});/*Ωignore_startΩ*/() => kfValue = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					 }
				} else if (kfType === 'txt2img'){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`kf-prompt-label`,});  }
						 { svelteHTML.createElement("textarea", {       "bind:value":kfValue,"placeholder":`Describe the image...`,"class":`modal-textarea`,"aria-labelledby":`kf-prompt-label`,});/*Ωignore_startΩ*/() => kfValue = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
					 }
				} else if (kfType === 'img2img'){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`kf-ref-label`,});   }
						 { svelteHTML.createElement("input", {          "type":`text`,"bind:value":kfReferenceUrl,"placeholder":`https://...`,"class":`modal-input`,"aria-labelledby":`kf-ref-label`,});/*Ωignore_startΩ*/() => kfReferenceUrl = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					 }
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`kf-img2img-prompt-label`,});  }
						 { svelteHTML.createElement("textarea", {       "bind:value":kfValue,"placeholder":`Describe the image...`,"class":`modal-textarea`,"aria-labelledby":`kf-img2img-prompt-label`,});/*Ωignore_startΩ*/() => kfValue = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
					 }
				}
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":() => open = false,});  }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":confirm,"disabled":!kfValid,});  }
			 }
		 }
	 }
}
};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const KeyframeModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type KeyframeModal__SvelteComponent_ = ReturnType<typeof KeyframeModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default KeyframeModal__SvelteComponent_;