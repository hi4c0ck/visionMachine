///<reference types="svelte" />
;// One provider-kind card (docs/settings-provider-tasks.md, Phase 3).
// Preset + base URL + masked key + preset-constrained model + real
// connection test. The card is stateless: the modal owns the draft slot
// and gets it back via onchange.

import type { ProviderKind, ProviderSlot } from '$types';
import { PRESETS, getPreset, modelsFor } from '$lib/settings/catalog';
import { validateHttpUrl, isConfigured } from '$lib/settings/guards';
import { testProvider, type TestProviderOutcome } from '$lib/settings/store';

;type $$ComponentProps = {
		kind: ProviderKind;
		/** The modal's draft slot for this kind. */
		slot: ProviderSlot;
		/** Hand the edited slot back to the modal.
		 * NOTE: not named `onchange` — Svelte 5 reserves on<dom-event> prop
		 * names for event listeners, which breaks $props typing. */
		onslotchange: (slot: ProviderSlot) => void;
	};function $$render() {

	
	
	
	
	
	
	
	

	let {
		kind,
		slot,
		onslotchange,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	const KIND_LABELS: Record<ProviderKind, string> = {
		text: 'Text — prompts & summarizer',
		image: 'Image — keyframes & subjects',
		video: 'Video — final output',
	};

	let showKey = $state(false);
	let testing = $state(false);
	let testResult = $state<TestProviderOutcome | null>(null);

	const preset = $derived(getPreset(slot.preset) ?? PRESETS[0]);
	const presetOptions = $derived(PRESETS.filter((p) => p.kinds.includes(kind)));
	const modelOptions = $derived(modelsFor(preset, kind));
	const selectedModel = $derived(modelOptions.find((m) => m.id === slot.model) ?? null);
	// Read-only (paid) models: the user inspects these parameters here
	// (docs/agnes-model-catalog.md, Q3) — show the concrete limits.
	const modelLimitsText = $derived.by(() => {
		const lim = selectedModel?.limits;
		if (!lim) return '';
		const parts: string[] = [];
		if (lim.resolutions?.length) parts.push(lim.resolutions.join(' / '));
		if (lim.seconds) parts.push(`${lim.seconds[0]}–${lim.seconds[1]}s`);
		if (lim.maxFrames) parts.push(`≤${lim.maxFrames} frames`);
		if (lim.fps?.length) parts.push(`fps ${lim.fps.join(' / ')}`);
		return parts.join(' · ');
	});

	// Preset switch reflows URL to the preset default and picks the first
	// usable model for this kind — predictable, no dangling model.
	// It also clears the key: a key belongs to the vendor its URL points at,
	// so carrying the old preset's key into the new one made the card read
	// "Configured" while the chip correctly reported the key as not set.
	function setPreset(id: string) {
		const next = getPreset(id);
		if (!next || next.id === slot.preset) return;
		const models = modelsFor(next, kind);
		const model = models.find((m) => !m.pending) ?? models[0];
		onslotchange({
			...slot,
			preset: next.id,
			baseUrl: next.defaultBaseUrl,
			apiKey: '',
			model: model?.id ?? slot.model,
		});
		testResult = null;
	}

	async function runTest() {
		if (!validateHttpUrl(slot.baseUrl) || testing) return;
		testing = true;
		testResult = null;
		try {
			testResult = await testProvider(slot.baseUrl, slot.apiKey);
		} finally {
			testing = false;
		}
	}
;
async () => {

	 { svelteHTML.createElement("section", { "class":`provider-card`,});
	 { svelteHTML.createElement("header", { "class":`card-head`,});
		 { svelteHTML.createElement("span", { "class":`kind-label`,});KIND_LABELS[kind as ProviderKind]; }
		 { svelteHTML.createElement("span", {  "class":`status-badge`,});isConfigured(slot);
			isConfigured(slot) ? 'Configured' : 'Not set';
		 }
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "for":`prov-preset-${kind}`,});  }
		 { svelteHTML.createElement("select", {     "id":`prov-preset-${kind}`,"value":slot.preset,"onchange":(e) => setPreset(e.currentTarget.value),});
			   for(let p of __sveltets_2_ensureArray(presetOptions)){p.id;
				 { svelteHTML.createElement("option", { "value":p.id,});p.label; }
			}
		 }
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "for":`prov-url-${kind}`,});  }
		 { svelteHTML.createElement("input", {             "id":`prov-url-${kind}`,"type":`text`,"spellcheck":`false`,"placeholder":`https://api.example.com/v1`,"value":slot.baseUrl,"oninput":(e) => {
				onslotchange({ ...slot, baseUrl: e.currentTarget.value });
				testResult = null;
			},});}
		if(slot.baseUrl && !validateHttpUrl(slot.baseUrl)){
			 { svelteHTML.createElement("span", { "class":`hint hint-error`,});      }
		}
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("div", { "class":`key-row`,});
			 { svelteHTML.createElement("label", { "for":`prov-key-${kind}`,});  }
			 { svelteHTML.createElement("button", {       "class":`mini-btn`,"type":`button`,"disabled":!slot.apiKey,"onclick":() => (showKey = !showKey),});
				showKey ? 'Hide' : 'Show';
			 }
		 }
		 { svelteHTML.createElement("input", {             "id":`prov-key-${kind}`,"type":showKey ? 'text' : 'password',"spellcheck":`false`,"placeholder":`Paste your API key`,"value":slot.apiKey,"oninput":(e) => {
				onslotchange({ ...slot, apiKey: e.currentTarget.value });
				testResult = null;
			},});}
		 { svelteHTML.createElement("span", { "class":`hint`,});          }
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "for":`prov-model-${kind}`,});  }
		 { svelteHTML.createElement("select", {     "id":`prov-model-${kind}`,"value":slot.model,"onchange":(e) => onslotchange({ ...slot, model: e.currentTarget.value }),});
			   for(let m of __sveltets_2_ensureArray(modelOptions)){m.id;
				 { svelteHTML.createElement("option", {   "value":m.id,"disabled":m.pending,});m.label ?? m.id;m.pending ? ' (details pending)' : ''; }
			}
		 }
		if(selectedModel?.readOnly){
			 { svelteHTML.createElement("span", { "class":`hint hint-readonly`,});               }
		}
		if(modelLimitsText){
			 { svelteHTML.createElement("span", { "class":`hint`,}); modelLimitsText; }
		}
	 }

	 { svelteHTML.createElement("div", { "class":`test-row`,});
		 { svelteHTML.createElement("button", {        "class":`btn-test`,"type":`button`,"disabled":!validateHttpUrl(slot.baseUrl) || testing,"onclick":runTest,});
			testing ? 'Testing…' : 'Test connection';
		 }
		if(testResult){
			 { svelteHTML.createElement("span", {  "class":`test-result`,});testResult.reachable;testResult.message; }
		}
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ProviderCard__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ProviderCard__SvelteComponent_ = ReturnType<typeof ProviderCard__SvelteComponent_>;
/*Ωignore_endΩ*/export default ProviderCard__SvelteComponent_;