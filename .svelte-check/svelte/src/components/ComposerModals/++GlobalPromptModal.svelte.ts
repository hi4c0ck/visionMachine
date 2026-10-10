///<reference types="svelte" />
;

import '../composer-modal.css';

;type $$ComponentProps = {
		/** Element label shown in the header (e.g. "Global", "Sound") */
		label: string;
		prompt: string;
		open: boolean;
		onConfirm: (prompt: string) => void;
	};function $$render() {

	/**
	 * Prompt editor for global-alike elements (Global style / Sound).
	 * Mirrors TagPromptModal; the panel owns the store calls and passes the
	 * element label + an onConfirm callback.
	 */
	let {
		label,
		prompt,
		open = $bindable(false),
		onConfirm,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	

	let text = $state('');

	$effect(() => {
		if (!open) return;
		text = prompt;
	});

	function confirm() {
		onConfirm(text);
		open = false;
	}
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => (open = false),"role":`presentation`,});
		 { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {}); label;  }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				 { svelteHTML.createElement("div", { "class":`modal-field`,});
					 { svelteHTML.createElement("label", { "id":`global-prompt-label`,});  }
					 { svelteHTML.createElement("textarea", {         "bind:value":text,"placeholder":label === 'Sound' ? 'Describe the sound for this range…' : 'Describe the style for this range…',"class":`modal-textarea`,"aria-labelledby":`global-prompt-label`,});/*Ωignore_startΩ*/() => text = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
				 }
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":() => (open = false),});  }
				 { svelteHTML.createElement("button", {   "class":`btn-confirm`,"onclick":confirm,});  }
			 }
		 }
	 }
}
};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const GlobalPromptModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type GlobalPromptModal__SvelteComponent_ = ReturnType<typeof GlobalPromptModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default GlobalPromptModal__SvelteComponent_;