///<reference types="svelte" />
;
import type { PipeRow, SubjectReference } from '$types';
import {
		addSubjectRef as addSubjectRefAction,
		updateSubjectRef as updateSubjectRefAction,
	} from '$lib/composerStore';
import { flashToast } from '$lib/flashToast';

import '../composer-modal.css';

;type $$ComponentProps = {
		pipe: PipeRow;
		sessionId: string | undefined;
		maxFrames: number;
		editingRefId: string | null;
		maxSubjectRefs: number;
		open: boolean;
		/** Fires after a successful EDIT save so the caller can re-validate
		 * the reference's URL accessibility (D5 red-out clears on success). */
		onSaved?: (refId: string) => void;
	};function $$render() {

	
	
	

	let {
		pipe,
		sessionId,
		maxFrames,
		editingRefId,
		maxSubjectRefs,
		open = $bindable(false),
		onSaved,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	

	let srType = $state<'url' | 'txt2img' | 'img2img'>('url');
	let srImageUrl = $state('');
	let srPrompt = $state('');
	let srUseFrames = $state(false);
	let srStart = $state(0);
	let srEnd = $state(8);

	// Seed values when the modal opens (moved verbatim from openSubjectRefModal)
	$effect(() => {
		if (!open) return;
		const existing = editingRefId
			? (pipe.subjectReferences ?? []).find((r: SubjectReference) => r.id === editingRefId)
			: null;
		if (existing) {
			srType = existing.type ?? 'url';
			srImageUrl = existing.imageUrl;
			srPrompt = existing.prompt ?? '';
			srUseFrames = existing.useFrames ?? false;
			srStart = existing.frameStart ?? 0;
			srEnd = existing.frameEnd ?? Math.min(8, maxFrames - 1);
		} else {
			srType = 'url';
			srImageUrl = '';
			srPrompt = '';
			srUseFrames = false;
			srStart = 0;
			srEnd = Math.min(8, maxFrames - 1);
		}
	});

	// Subjects follow the same preset rules as keyframes:
	// url → imageUrl, txt2img → prompt, img2img → imageUrl (reference) + prompt.
	const srValid = $derived(
		srType === 'url'
			? srImageUrl.trim().length > 0
			: srType === 'txt2img'
			? srPrompt.trim().length > 0
			: srImageUrl.trim().length > 0 && srPrompt.trim().length > 0,
	);

	async function confirm() {
		if (!sessionId) return;
		if (!srValid) return;
		if (!editingRefId && (pipe.subjectReferences?.length ?? 0) >= maxSubjectRefs) return;

		let result;
		if (editingRefId) {
			// Atomic: one operation updates type/preset + range + useFrames together,
			// so a failure can't leave a partial edit behind.
			result = await updateSubjectRefAction(sessionId, pipe.id, editingRefId, {
				imageUrl: srImageUrl,
				useFrames: srUseFrames,
				frameStart: srUseFrames ? srStart : undefined,
				frameEnd: srUseFrames ? srEnd : undefined,
				type: srType,
				prompt: srPrompt,
			});
			if (result.errors.length === 0) onSaved?.(editingRefId);
		} else {
			// Newly added refs get checked on the next generation Confirm (D5).
			result = await addSubjectRefAction(
				sessionId,
				pipe.id,
				srImageUrl,
				srUseFrames,
				srUseFrames ? srStart : undefined,
				srUseFrames ? srEnd : undefined,
				srType,
				srPrompt,
			);
		}
		if (result.errors.length > 0) {
			flashToast(result.errors[0] || 'Failed to save subject reference');
			console.error('[SubjectRefModal] confirm:', result.errors);
			return;
		}
		open = false;
	}
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => open = false,"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});editingRefId ? 'Edit Subject Reference' : 'Add Subject Reference'; }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				 { svelteHTML.createElement("div", { "class":`mode-selector`,});
					 { svelteHTML.createElement("button", {   "class":`mode-btn ${srType === 'url' ? 'active' : ''}`,"onclick":() => (srType = 'url'),});  }
					 { svelteHTML.createElement("button", {   "class":`mode-btn ${srType === 'txt2img' ? 'active' : ''}`,"onclick":() => (srType = 'txt2img'),});  }
					 { svelteHTML.createElement("button", {   "class":`mode-btn ${srType === 'img2img' ? 'active' : ''}`,"onclick":() => (srType = 'img2img'),});  }
				 }
				if(srType === 'url'){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`sr-url-label`,});  }
						 { svelteHTML.createElement("input", {          "type":`text`,"bind:value":srImageUrl,"placeholder":`https://...`,"class":`modal-input`,"aria-labelledby":`sr-url-label`,});/*Ωignore_startΩ*/() => srImageUrl = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					 }
				} else if (srType === 'txt2img'){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`sr-prompt-label`,});  }
						 { svelteHTML.createElement("textarea", {       "bind:value":srPrompt,"placeholder":`Describe the subject image...`,"class":`modal-textarea`,"aria-labelledby":`sr-prompt-label`,});/*Ωignore_startΩ*/() => srPrompt = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
					 }
				}else{
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`sr-ref-label`,});   }
						 { svelteHTML.createElement("input", {          "type":`text`,"bind:value":srImageUrl,"placeholder":`https://...`,"class":`modal-input`,"aria-labelledby":`sr-ref-label`,});/*Ωignore_startΩ*/() => srImageUrl = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					 }
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`sr-img2img-prompt-label`,});  }
						 { svelteHTML.createElement("textarea", {       "bind:value":srPrompt,"placeholder":`Describe the transformation...`,"class":`modal-textarea`,"aria-labelledby":`sr-img2img-prompt-label`,});/*Ωignore_startΩ*/() => srPrompt = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
					 }
				}
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", {});
						 { svelteHTML.createElement("input", {    "type":`checkbox`,"bind:checked":srUseFrames,});/*Ωignore_startΩ*/() => srUseFrames = __sveltets_2_any(null);/*Ωignore_endΩ*/}
						  
					 }
				 }
				if(srUseFrames){
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`sr-start-label`,});  }
						 { svelteHTML.createElement("input", {              "type":`number`,"bind:value":srStart,"step":8,"min":0,"max":maxFrames - 1,"class":`modal-input`,"aria-labelledby":`sr-start-label`,});/*Ωignore_startΩ*/() => srStart = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					 }
					 { svelteHTML.createElement("div", { "class":`modal-field`,});
						 { svelteHTML.createElement("label", { "id":`sr-end-label`,});  }
						 { svelteHTML.createElement("input", {              "type":`number`,"bind:value":srEnd,"step":8,"min":0,"max":maxFrames - 1,"class":`modal-input`,"aria-labelledby":`sr-end-label`,});/*Ωignore_startΩ*/() => srEnd = __sveltets_2_any(null);/*Ωignore_endΩ*/}
					 }
				}
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":() => (open = false),});  }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":confirm,"disabled":!srValid,});  }
			 }
		 }
	 }
}
};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const SubjectRefModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SubjectRefModal__SvelteComponent_ = ReturnType<typeof SubjectRefModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default SubjectRefModal__SvelteComponent_;