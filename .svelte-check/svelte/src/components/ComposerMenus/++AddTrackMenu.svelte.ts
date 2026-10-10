///<reference types="svelte" />
;
;type $$ComponentProps = {
		open: boolean;
		x: number;
		y: number;
		onAddTimeline: () => void;
		onAddGlobal: () => void;
		onAddSound: () => void;
	};function $$render() {

	// [+] add-track dropdown — pure chrome. The panel owns position + the
	// store calls (handleAddTimeline / handleAddGlobal); this only renders.
	let {
		open,
		x,
		y,
		onAddTimeline,
		onAddGlobal,
		onAddSound,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {           "class":`dropdown-menu`,"role":`menu`,"tabindex":-1,"style":`left: ${x}px; top: ${y}px;`,"onclick":(e) => e.stopPropagation(),"onkeydown":(e) => e.stopPropagation(),});
		 { svelteHTML.createElement("button", {   "class":`dropdown-item`,"onclick":onAddTimeline,});
			 { svelteHTML.createElement("span", { "class":`dropdown-icon`,});  } 
		 }
		 { svelteHTML.createElement("button", {   "class":`dropdown-item`,"onclick":onAddGlobal,});
			 { svelteHTML.createElement("span", { "class":`dropdown-icon`,});  } 
		 }
		 { svelteHTML.createElement("button", {   "class":`dropdown-item`,"onclick":onAddSound,});
			 { svelteHTML.createElement("span", { "class":`dropdown-icon`,});  } 
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const AddTrackMenu__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type AddTrackMenu__SvelteComponent_ = ReturnType<typeof AddTrackMenu__SvelteComponent_>;
/*Ωignore_endΩ*/export default AddTrackMenu__SvelteComponent_;