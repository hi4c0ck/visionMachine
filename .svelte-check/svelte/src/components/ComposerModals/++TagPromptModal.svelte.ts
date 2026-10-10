///<reference types="svelte" />
;// Tag prompt editor with a camera-"viewport" icon ring: the atlas marks
// (src/lib/promptIcons.ts) float around the prompt textarea, each on the
// side of the frame it describes. Hovering a mark lifts it and shows how
// the tag is written in the reference ("pan left — Horizontal rotation
// to the left").

import type { TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';
import { updateTagPrompt as updateTagPromptAction } from '$lib/composerStore';
import { ICONS_BY_TAG_TYPE, SLOT_CLASS, type AtlasIcon } from '$lib/promptIcons';
import PromptIcon from '../PromptIcon.svelte';
import '../composer-modal.css';

;type $$ComponentProps = {
		sessionId: string | undefined;
		pipeId: string;
		segmentId: string;
		tagId: string;
		tagType: TagType;
		prompt: string;
		open: boolean;
		onConfirm: (prompt: string) => void;
	};function $$render() {

	
	
	
	
	
	
	
	
	
	
	

	let {
		sessionId,
		pipeId,
		segmentId,
		tagId,
		tagType = 'scene',
		prompt,
		open = $bindable(false),
		onConfirm,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	let tagPrompt = $state('');

	// Normalize the runtime tagType against the atlas/spec maps (unknown tag
	// types fall back to the scene set).
	const safeTagType: TagType = $derived(
		(Object.keys(TAG_SPECIFICATIONS) as TagType[]).includes(tagType) ? tagType : 'scene'
	);
	const icons: AtlasIcon[] = $derived(
		(ICONS_BY_TAG_TYPE as Record<string, AtlasIcon[]>)[safeTagType] ?? ICONS_BY_TAG_TYPE.scene
	);
	const specName = $derived(TAG_SPECIFICATIONS[safeTagType].name);
	// The tag-type palette color themes the ring: glyph + tile accents.
	const tagColor = $derived(TAG_SPECIFICATIONS[safeTagType].color);

	// On a light background, pale-yellow glyphs can't be read (camera tag's
	// #FFE66D is nearly white). Compute an adjusted color with contrast
	// ratio ≥ 2.5:1 against --bg-elevated, falling back to the raw color.
	function tagColorContrast(base: string, bg: string): string {
		const hx = (hex: string) => {
			const m = hex.match(/^#?([0-9a-f]{6})$/i);
			if (!m) return null;
			const n = parseInt(m[1], 16);
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
		};
		const lum = ([r, g, b]: readonly [number, number, number]) => {
			const f = (v: number) => {
				const s = v / 255;
				return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const ratio = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
		const c = hx(base), b = hx(bg);
		if (!c || !b) return base;
		const l1 = lum(c), l2 = lum(b);
		if (ratio(l1, l2) >= 2.5) return base;
		// dark bg → brighten, light bg → darken
		const target = l2 > 0.5 ? [0, 0, 0] : [255, 255, 255];
		// binary search t for contrast >= 3:1
		let lo = 0, hi = 1;
		const mix = (t: number) => c.map((v, i) => Math.round(v + (target[i] - v) * t));
		while (lo < hi - 0.001) {
			const mid = (lo + hi) / 2;
			if (ratio(lum(mix(mid) as [number, number, number]), l2) >= 3) hi = mid;
			else lo = mid;
		}
		return '#' + mix(hi).map((v) => v.toString(16).padStart(2, '0')).join('');
	}

	const themeBg = $derived(
		(typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated') : '').trim() || '#252538'
	);
	const tagColorSafe = $derived(tagColorContrast(tagColor, themeBg));

	// Seed from the panel-provided prompt when the modal opens
	$effect(() => {
		if (!open) return;
		tagPrompt = prompt;
	});

	// Insert a mark's tag phrase into the prompt, ";-separated", and keep the
	// focus position sane for further editing.
	function insertTag(ic: AtlasIcon) {
		const t = tagPrompt.replace(/[\s;]+$/, '');
		tagPrompt = (t.length > 0 ? t + ' ; ' : '') + ic.tag;
	}

	async function confirm() {
		if (!sessionId) return;
		const result = await updateTagPromptAction(sessionId, pipeId, segmentId, tagId, tagPrompt);
		if (result.errors.length > 0) {
			console.error('[TagPromptModal] confirm:', result.errors);
			return;
		}
		onConfirm(tagPrompt);
		open = false;
	}
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {     "class":`modal-overlay`,"onclick":() => open = false,"role":`presentation`,});
		
		 { svelteHTML.createElement("div", {   "class":`tpm-frame`,"onclick":(e) => e.stopPropagation(),});
			   for(let ic of __sveltets_2_ensureArray(icons)){ic.id;
				 { svelteHTML.createElement("button", {          "class":`tpm-icon`,"type":`button`,"aria-label":ic.tag + ' — ' + ic.meaning,"onclick":() => insertTag(ic),});SLOT_CLASS[ic.pos];
					 { const $$_nocItpmorP3C = __sveltets_2_ensureComponent(PromptIcon); new $$_nocItpmorP3C({ target: __sveltets_2_any(), props: {        "id":ic.id,"size":24,"color":tagColorSafe,"ariaLabel":ic.tag,}});}
					 { svelteHTML.createElement("span", {   "class":`tpm-icon-tip`,"aria-hidden":`true`,});
						 { svelteHTML.createElement("b", {});ic.tag; }
						ic.meaning;
					 }
				 }
			}
			 { svelteHTML.createElement("div", {       "class":`tpm-center`,"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
				 { svelteHTML.createElement("div", {   "class":`modal tpm-modal`,"style":`--tag-color: ${tagColor}; --tag-color-safe: ${tagColorSafe};`,});
					 { svelteHTML.createElement("div", { "class":`modal-header`,});
						 { svelteHTML.createElement("h3", {}); specName;  }
					 }
					 { svelteHTML.createElement("div", { "class":`modal-body`,});
						 { svelteHTML.createElement("textarea", {           "id":`tag-prompt-area`,"bind:value":tagPrompt,"placeholder":`Describe this ${specName.toLowerCase()}…`,"class":`modal-textarea tpm-textarea`,"aria-label":specName + ' prompt',});/*Ωignore_startΩ*/() => tagPrompt = __sveltets_2_any(null);/*Ωignore_endΩ*/ }
					 }
					 { svelteHTML.createElement("div", { "class":`modal-footer`,});
						 { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":() => (open = false),});  }
						 { svelteHTML.createElement("button", {   "class":`btn-confirm`,"onclick":confirm,});  }
					 }
				 }
			 }
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const TagPromptModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type TagPromptModal__SvelteComponent_ = ReturnType<typeof TagPromptModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default TagPromptModal__SvelteComponent_;