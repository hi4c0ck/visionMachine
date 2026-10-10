///<reference types="svelte" />
;// Settings modal (docs/settings-provider-tasks.md, Phase 3): shell with
// three tabs (Defaults | Providers | Tools), a local draft, and an explicit
// Save bar (dirty indicator — no auto-save for keys/URLs). The provider
// status chip (Phase 4) opens this at the Providers tab; the Tools tab
// hosts the ffmpeg path override (two-variant ship: tiny = user path).

import type { ProviderKind, ProviderSlot, Settings } from '$types';
import { getSettings, commitSettings } from '$lib/settings/store';
import { flashToast } from '$lib/flashToast';
import SettingsDefaults from './SettingsDefaults.svelte';
import ProviderCard from './ProviderCard.svelte';
import ToolsSettings from './ToolsSettings.svelte';
import '../composer-modal.css';

;type $$ComponentProps = {
		open?: boolean;
		initialTab?: 'defaults' | 'providers' | 'tools';
	};function $$render() {

	
	
	
	
	
	
	
	
	
	
	
	

	let {
		open = $bindable(false),
		initialTab = 'defaults',
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	const KINDS: ProviderKind[] = ['text', 'image', 'video'];

	let tab = $state<'defaults' | 'providers' | 'tools'>('defaults');
	let draft = $state<Settings>(getSettings());
	let saving = $state(false);

	// Re-seed the draft every time the modal opens — edits are local until
	// Save commits them to the shared store.
	$effect(() => {
		if (open) {
			tab = initialTab;
			draft = JSON.parse(JSON.stringify(getSettings()));
		}
	});

	const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(getSettings()));

	function setSlot(kind: ProviderKind, slot: ProviderSlot) {
		draft.providers[kind] = slot;
	}

	function applyDefaults(mutator: (d: Settings) => void) {
		mutator(draft);
	}

	function cancel() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') cancel();
	}

	async function save() {
		if (saving || !dirty) return;
		saving = true;
		try {
			await commitSettings(draft);
			flashToast('Settings saved', 'info');
			open = false;
		} catch (e) {
			console.error('[SettingsModal] save failed:', e);
			flashToast('Failed to save settings', 'error');
		} finally {
			saving = false;
		}
	}
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":cancel,"role":`presentation`,});
		 { svelteHTML.createElement("div", {            "class":`modal settings-modal`,"role":`dialog`,"aria-modal":`true`,"onclick":(e) => e.stopPropagation(),"onkeydown":onKeydown,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {});  { svelteHTML.createElement("span", { "class":`modal-sub`,});  } }
				 { svelteHTML.createElement("div", {   "class":`tab-row`,"role":`tablist`,});
					 { svelteHTML.createElement("button", {         "class":`tab-btn`,"role":`tab`,"aria-selected":tab === 'defaults',"onclick":() => (tab = 'defaults'),});tab === 'defaults';  }
					 { svelteHTML.createElement("button", {         "class":`tab-btn`,"role":`tab`,"aria-selected":tab === 'providers',"onclick":() => (tab = 'providers'),});tab === 'providers';  }
					 { svelteHTML.createElement("button", {         "class":`tab-btn`,"role":`tab`,"aria-selected":tab === 'tools',"onclick":() => (tab = 'tools'),});tab === 'tools';  }
				 }
			 }

			 { svelteHTML.createElement("div", { "class":`modal-body settings-body`,});
				if(tab === 'defaults'){
					 { const $$_stluafeDsgnitteS3C = __sveltets_2_ensureComponent(SettingsDefaults); new $$_stluafeDsgnitteS3C({ target: __sveltets_2_any(), props: {   draft,"ondraftchange":applyDefaults,}});}
				} else if (tab === 'providers'){
					 { svelteHTML.createElement("div", { "class":`provider-list`,});
						   for(let kind of __sveltets_2_ensureArray(KINDS)){kind;
							 { const $$_draCredivorP4C = __sveltets_2_ensureComponent(ProviderCard); new $$_draCredivorP4C({ target: __sveltets_2_any(), props: {     kind,"slot":draft.providers[kind],"onslotchange":(s) => setSlot(kind, s),}});}
						}
					 }
				}else{
					 { const $$_sgnitteSslooT3C = __sveltets_2_ensureComponent(ToolsSettings); new $$_sgnitteSslooT3C({ target: __sveltets_2_any(), props: {   draft,"ondraftchange":applyDefaults,}});}
				}
			 }

			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				 { svelteHTML.createElement("span", {    "class":`save-hint`,"aria-live":`polite`,});dirty;
					dirty ? 'Unsaved changes' : 'Saved';
				 }
				 { svelteHTML.createElement("button", {     "class":`btn-cancel`,"onclick":cancel,"disabled":saving,});  }
				 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":save,"disabled":!dirty || saving,});
					saving ? 'Saving…' : 'Save';
				 }
			 }
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const SettingsModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SettingsModal__SvelteComponent_ = ReturnType<typeof SettingsModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default SettingsModal__SvelteComponent_;