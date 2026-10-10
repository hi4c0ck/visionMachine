///<reference types="svelte" />
;
import type { PipeRow } from '$types';

;type $$ComponentProps = {
		pipe: PipeRow;
		idx: number;
		pipeCount: number;
		onMove: (dir: -1 | 1) => void;
		onDuplicate: () => void;
		onRemove: () => void;
		/** Quick set: apply a specific frame count directly. */
		onLengthChange: (raw: number) => void;
		/** Open the length editor modal (frames ↔ seconds + trim warnings). */
		onLengthEdit: () => void;
		/** Session fps — lets the header show the equivalent duration. */
		fps?: number;
	};function $$render() {

	

	// Pipe header row — pure chrome. The panel owns pipe ordering/length
	// store actions; this component just renders and fires callbacks.
	let {
		pipe,
		idx,
		pipeCount,
		onMove,
		onDuplicate,
		onRemove,
		onLengthChange,
		onLengthEdit,
		fps,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	// The bare <input type=number> spinners were the old path for the pipe
	// length — nudging was too fiddly and gave no way to reason in seconds.
	// The field now displays the value; clicking it (or the edit affordance)
	// opens the length-editor modal where the user sets a concrete frame or
	// seconds value and is warned about any segments/tags that would be
	// trimmed.
	function handleLenInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const raw = Number(input.value);
		if (Number.isFinite(raw) && raw >= 41) {
			onLengthChange(raw);
		}
		// Otherwise keep the stored value (invalid/out-of-range edits don't
		// propagate; the modal is the precise path).
		input.value = String(pipe.lengthFrames);
	}

	const durationSec = fps ? pipe.lengthFrames / fps : null;
;
async () => {

 { svelteHTML.createElement("div", { "class":`pipe-header`,});
	 { svelteHTML.createElement("span", { "class":`pipe-label`,}); idx + 1; }
	 { svelteHTML.createElement("span", { "class":`pipe-meta`,});pipe.lengthFrames; durationSec !== null ? ` · ${durationSec.toFixed(2)}s` : ''; }
	 { svelteHTML.createElement("span", { "class":`pipe-ops`,});
		 { svelteHTML.createElement("button", {       "class":`btn-icon`,"onclick":() => onMove(-1),"disabled":idx === 0,"title":`Move pipe up`,});  }
		 { svelteHTML.createElement("button", {       "class":`btn-icon`,"onclick":() => onMove(1),"disabled":idx === pipeCount - 1,"title":`Move pipe down`,});  }
		 { svelteHTML.createElement("button", {     "class":`btn-icon`,"onclick":onDuplicate,"title":`Duplicate pipe`,});  }
		 { svelteHTML.createElement("label", {   "class":`pipe-len`,"title":`Pipe length in frames (min 41) — click to edit`,});
			 { svelteHTML.createElement("span", {});  }
			 { svelteHTML.createElement("input", {            "type":`number`,"min":`41`,"step":`8`,"value":pipe.lengthFrames,"onchange":handleLenInput,"onfocus":() => onLengthEdit(),});}
		 }
		 { svelteHTML.createElement("button", {     "class":`btn-icon`,"onclick":onLengthEdit,"title":`Edit length (frames / seconds)`,});  }
		 { svelteHTML.createElement("button", {     "class":`btn-icon pipe-del`,"onclick":onRemove,"title":`Remove pipe`,});  }
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const PipeHeader__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type PipeHeader__SvelteComponent_ = ReturnType<typeof PipeHeader__SvelteComponent_>;
/*Ωignore_endΩ*/export default PipeHeader__SvelteComponent_;