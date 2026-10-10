///<reference types="svelte" />
;
import {
		frameToPx,
		clientXToFrame,
		type FrameGeometry
	} from '$lib/frameGeometry';
import { TAG_SPECIFICATIONS, type TagType } from '$types';

;type $$ComponentProps = {
		totalFrames: number;
		selectedFrame?: number;
		onframeSelect?: (frame: number) => void;
		geometry: FrameGeometry | null;
		/** Optional legend strip (zone + global + tag color key). */
		legend?: { zone: string; global: string; sound?: string; tags: Array<{ name: string; color: string }> } | null;
		/** Session fps — enables the pin notice seconds readout (frame / fps). */
		fps?: number;
	};function $$render() {

	
	

	let {
		totalFrames,
		selectedFrame = 0,
		onframeSelect,
		geometry,
		legend = null,
		fps
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	const TAG_TYPES: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];

	// Default legend key (all tag types from TAG_SPECIFICATIONS) when the
	// caller enables the legend but passes no explicit tag list.
	let legendEntries = $derived(
		legend?.tags ??
		TAG_TYPES.map((t) => ({ name: TAG_SPECIFICATIONS[t].name, color: TAG_SPECIFICATIONS[t].color }))
	);
	let legendZone = $derived(legend?.zone ?? 'var(--accent-color)');
	let legendGlobal = $derived(legend?.global ?? '#59B5FF');
	let legendSound = $derived(legend?.sound ?? '#F5A623');

	let markers = $derived(
		geometry
			? Array.from(
					{ length: Math.floor(geometry.contentEndFrame / 8) + 1 },
					(_, i) => i * 8
				)
			: []
	);

	function selectFrame(frame: number) {
		onframeSelect?.(frame);
	}

	function onPointerDown(e: PointerEvent) {
		if (!geometry) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const frame = clientXToFrame(e.clientX, rect, geometry);
		onframeSelect?.(frame);
	}
;
async () => {

 { svelteHTML.createElement("div", { "class":`frame-ruler`,});
	if(legend){
		 { svelteHTML.createElement("div", {   "class":`ruler-legend`,"aria-label":`Timeline legend`,});
			 { svelteHTML.createElement("span", {   "class":`legend-item`,"title":`Zone segment (accent)`,}); { svelteHTML.createElement("span", {   "class":`legend-swatch`,"style":`background: ${legendZone}`,}); }  }
			 { svelteHTML.createElement("span", {   "class":`legend-item`,"title":`Global style range`,}); { svelteHTML.createElement("span", {   "class":`legend-swatch legend-swatch-global`,"style":`background: ${legendGlobal}`,}); }  }
			if(legend?.sound){
				 { svelteHTML.createElement("span", {   "class":`legend-item`,"title":`Sound range`,}); { svelteHTML.createElement("span", {   "class":`legend-swatch`,"style":`background: ${legendSound}`,}); }  }
			}
			   for(let entry of __sveltets_2_ensureArray(legendEntries)){entry.name;
				 { svelteHTML.createElement("span", {   "class":`legend-item`,"title":entry.name,}); { svelteHTML.createElement("span", {   "class":`legend-swatch`,"style":`background: ${entry.color}`,}); }entry.name; }
			}
		 }
	}
	 { svelteHTML.createElement("div", {     "class":`coordinate-space`,"onpointerdown":onPointerDown,});
		 { svelteHTML.createElement("div", { "class":`ruler-line`,}); }

		if(geometry){
			   for(let frame of __sveltets_2_ensureArray(markers)){frame;
				 { svelteHTML.createElement("button", {         "class":`marker`,"style":`left: ${frameToPx(frame, geometry)}px`,"onclick":() => selectFrame(frame),"aria-label":`Frame ${frame}`,});frame % 100 === 0;
					 { svelteHTML.createElement("span", { "class":`tick`,}); }
					if(frame % 100 === 0 && frame !== 0){
						 { svelteHTML.createElement("span", { "class":`label`,});frame; }
					}
				 }
			}

			 { svelteHTML.createElement("div", {    "class":`playhead`,"style":`left: ${frameToPx(selectedFrame, geometry)}px`,}); }

			
			if(fps && fps > 0){
				 { svelteHTML.createElement("div", {        "class":`pin-note`,"style":`left: ${frameToPx(selectedFrame, geometry)}px`,"aria-hidden":`true`,});selectedFrame <= 8;selectedFrame >= totalFrames - 9;
					selectedFrame;  (selectedFrame / fps).toFixed(1);
				 }
			}
		}
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const FrameRuler__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type FrameRuler__SvelteComponent_ = ReturnType<typeof FrameRuler__SvelteComponent_>;
/*Ωignore_endΩ*/export default FrameRuler__SvelteComponent_;