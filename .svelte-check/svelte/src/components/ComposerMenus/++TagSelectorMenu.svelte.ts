///<reference types="svelte" />
;
import type { TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';

;type $$ComponentProps = {
		open: boolean;
		x: number;
		y: number;
		/** Target zones to attach the new tag to (each renders as "Zone N"). */
		segments: Array<{ id: string; index: number }>;
		/** Zone pre-selected as the attach target (e.g. the invoking zone). */
		defaultSegmentId?: string;
		/** Tag types already present on the target zone, listed greyed but still
		 *  clickable so a zone can hold more than one of the same type when it
		 *  has room. Undeclared types are the normal, primary options. */
		declaredTypes?: TagType[];
		/** Tag types the target zone physically cannot host one more of (no
		 *  free slot and too small to resplit) — disabled with a hint. */
		unavailableTypes?: TagType[];
		onConfirm: (type: TagType, segmentId: string) => void;
		/** "+ New segment" item — opens the zone (gap-pick) modal, choice (ii). */
		onNewSegment?: () => void;
		onClose: () => void;
		/** Incremented when the menu re-opens; forces re-seeding so the menu
		 *  always opens with the INVOKING zone pre-selected (a fresh menu each
		 *  time, not a persisted sticky choice). */
		menuVersion: number;
	};function $$render() {

	
	

	// Tag-type selector dropdown — pure chrome. Renders the tag list +
	// Add/Cancel; the panel owns the store call (confirmTagSelector) via
	// onConfirm and keeps selectedSegmentId as the add target.
	let {
		open,
		x,
		y,
		segments,
		defaultSegmentId,
		/** Tag types already declared on the target zone — listed greyed (choice A). */
		declaredTypes = [],
		unavailableTypes = [],
		onConfirm,
		onNewSegment,
		menuVersion,
		onClose,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	const TAG_TYPES: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];
	function isDeclared(t: TagType) {
		return declaredTypes.includes(t);
	}
	function isUnavailable(t: TagType) {
		return unavailableTypes.includes(t);
	}
	// Target zone. The menu attaches to the INVOKING zone only (the zone
	// pill that opened it). Picking a tag type adds it immediately — the
	// intermediate "Add" button was removed as a redundant step.
	let selectedSegId = $state<string>(defaultSegmentId ?? segments[0]?.id ?? '');
	$effect(() => {
		// Touch menuVersion so re-opens re-run the seeding.
		menuVersion;
		const ids: string[] = segments.map((s: { id: string }) => s.id);
		if (!open) return;
		selectedSegId = ids.includes(defaultSegmentId ?? '')
			? (defaultSegmentId as string)
			: (ids[0] ?? '');
	});

	// Add the tag of this type to the target zone and close the menu.
	async function addTag(type: TagType) {
		if (!selectedSegId) return;
		await onConfirm(type, selectedSegId);
		onClose();
	}
;
async () => {

	if(open){
		 { svelteHTML.createElement("div", {           "class":`dropdown-menu tag-menu`,"role":`menu`,"tabindex":-1,"style":`left: ${x}px; top: ${y}px;`,"onclick":(e) => e.stopPropagation(),"onkeydown":(e) => e.stopPropagation(),});
			 { svelteHTML.createElement("div", { "class":`tag-menu-body`,});
				 { svelteHTML.createElement("div", { "class":`dropdown-label`,});  }
				   for(let tagType of __sveltets_2_ensureArray(TAG_TYPES)){tagType;
					 { svelteHTML.createElement("button", {          "class":`dropdown-item tag-item`,"disabled":isUnavailable(tagType),"onclick":() => addTag(tagType),"title":isUnavailable(tagType)
								? `Zone too small for another ${TAG_SPECIFICATIONS[tagType].name} tag — extend the zone first`
							: isDeclared(tagType)
							? 'Already in this zone — a new one shares the space evenly'
							: undefined,});isDeclared(tagType);isUnavailable(tagType);
						 { svelteHTML.createElement("span", {   "class":`tag-dot`,"style":`background: ${TAG_SPECIFICATIONS[tagType].color}`,}); }
						 { svelteHTML.createElement("span", {});TAG_SPECIFICATIONS[tagType].name; }
						if(isDeclared(tagType)){ { svelteHTML.createElement("span", { "class":`tag-item-badge`,});  }}
					 }
				}
				if(onNewSegment){
					 { svelteHTML.createElement("div", { "class":`dropdown-section-divider`,}); }
					 { svelteHTML.createElement("button", {   "class":`dropdown-item new-segment-item`,"onclick":onNewSegment,});
						 { svelteHTML.createElement("span", {});   }
					 }
				}
			 }
		 }
	}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const TagSelectorMenu__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type TagSelectorMenu__SvelteComponent_ = ReturnType<typeof TagSelectorMenu__SvelteComponent_>;
/*Ωignore_endΩ*/export default TagSelectorMenu__SvelteComponent_;