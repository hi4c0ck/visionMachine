///<reference types="svelte" />
;// Defaults tab (docs/settings-provider-tasks.md, Phase 3): the user's
// generation defaults + display name. These seed NEW sessions; existing
// sessions keep their own values. Stateless: parent owns the draft.

import type { Settings } from '$types';

;type $$ComponentProps = {
		draft: Settings;
		/** Apply a mutator to the parent's draft (deep $state).
		 * NOTE: not named `onchange` — Svelte 5 reserves on<dom-event> prop
		 * names for event listeners, which breaks $props typing. */
		ondraftchange: (mutator: (d: Settings) => void) => void;
	};function $$render() {

	
	
	
	

	let {
		draft,
		ondraftchange,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	const g = $derived(draft.generationDefaults);

	// Flexible fps list: base options + the current value if it isn't one
	// (same rule as the tools-panel FPS select).
	const fpsOptions = $derived.by(() => {
		const base = [18, 24, 30, 48, 60];
		const cur = g.fps;
		const list = Number.isFinite(cur) && cur > 0 && !base.includes(cur) ? [...base, cur] : base;
		return [...list].sort((a, b) => a - b);
	});

	function setG(patch: Partial<Settings['generationDefaults']>) {
		ondraftchange((d: Settings) => Object.assign(d.generationDefaults, patch));
	}
;
async () => {

 { svelteHTML.createElement("section", { "class":`settings-defaults`,});
	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "for":`sd-displayname`,});  }
		 { svelteHTML.createElement("input", {           "id":`sd-displayname`,"type":`text`,"placeholder":`Shown in logs and exports`,"value":draft.profile.displayName,"oninput":(e) => ondraftchange((d: Settings) => (d.profile.displayName = e.currentTarget.value)),});}
	 }

	 { svelteHTML.createElement("div", { "class":`field-row`,});
		 { svelteHTML.createElement("div", { "class":`field`,});
			 { svelteHTML.createElement("label", { "for":`sd-fps`,});  }
			 { svelteHTML.createElement("select", {     "id":`sd-fps`,"value":String(g.fps),"onchange":(e) => setG({ fps: Number(e.currentTarget.value) }),});
				   for(let opt of __sveltets_2_ensureArray(fpsOptions)){opt;
					 { svelteHTML.createElement("option", { "value":String(opt),});opt;  }
				}
			 }
		 }
		 { svelteHTML.createElement("div", { "class":`field`,});
			 { svelteHTML.createElement("label", { "for":`sd-res`,});  }
			 { svelteHTML.createElement("select", {     "id":`sd-res`,"value":g.resolution,"onchange":(e) => setG({ resolution: e.currentTarget.value }),});
				 { svelteHTML.createElement("option", { "value":`480p`,});  }
				 { svelteHTML.createElement("option", { "value":`720p`,});  }
				 { svelteHTML.createElement("option", { "value":`1080p`,});  }
			 }
		 }
		 { svelteHTML.createElement("div", { "class":`field`,});
			 { svelteHTML.createElement("label", { "for":`sd-orient`,});  }
			 { svelteHTML.createElement("select", {     "id":`sd-orient`,"value":g.orientation,"onchange":(e) => setG({ orientation: e.currentTarget.value }),});
				 { svelteHTML.createElement("option", { "value":`horizontal`,});  }
				 { svelteHTML.createElement("option", { "value":`vertical`,});  }
			 }
		 }
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "for":`sd-q`,});    g.qValue; }
		 { svelteHTML.createElement("input", {               "id":`sd-q`,"type":`range`,"min":`5`,"max":`30`,"step":`1`,"value":g.qValue,"oninput":(e) => setG({ qValue: Number(e.currentTarget.value) }),});}
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "for":`sd-c`,});    g.cValue; }
		 { svelteHTML.createElement("input", {               "id":`sd-c`,"type":`range`,"min":`0.5`,"max":`15`,"step":`0.5`,"value":g.cValue,"oninput":(e) => setG({ cValue: Number(e.currentTarget.value) }),});}
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("label", { "class":`check-row`,});
			 { svelteHTML.createElement("input", {         "id":`sd-newseed`,"type":`checkbox`,"checked":g.alwaysNewSeed,"onchange":() => setG({ alwaysNewSeed: !g.alwaysNewSeed }),});}
			 { svelteHTML.createElement("span", {});           }
		 }
		 { svelteHTML.createElement("span", { "class":`note`,});              }
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("span", { "class":`field-label`,});  }
		 { svelteHTML.createElement("div", {     "class":`radio-row`,"role":`radiogroup`,"aria-label":`Generation order`,});
			 { svelteHTML.createElement("label", {});
				 { svelteHTML.createElement("input", {        "type":`radio`,"name":`sd-concurrency`,"checked":g.concurrency === 'sequential',"onchange":() => setG({ concurrency: 'sequential' }),});}
				      
			 }
			 { svelteHTML.createElement("label", {});
				 { svelteHTML.createElement("input", {        "type":`radio`,"name":`sd-concurrency`,"checked":g.concurrency === 'parallel',"onchange":() => setG({ concurrency: 'parallel' }),});}
				    
			 }
		 }
	 }

	 { svelteHTML.createElement("div", { "class":`field`,});
		 { svelteHTML.createElement("span", { "class":`field-label`,});     }
		 { svelteHTML.createElement("div", {     "class":`radio-row`,"role":`radiogroup`,"aria-label":`Segment length units`,});
			 { svelteHTML.createElement("label", {});
				 { svelteHTML.createElement("input", {         "type":`radio`,"name":`sd-seglen`,"checked":g.segmentLengthUnit === 'frames',"onchange":() => setG({ segmentLengthUnit: 'frames' }),});}
				      
			 }
			 { svelteHTML.createElement("label", {});
				 { svelteHTML.createElement("input", {         "type":`radio`,"name":`sd-seglen`,"checked":g.segmentLengthUnit === 'seconds',"onchange":() => setG({ segmentLengthUnit: 'seconds' }),});}
				       
			 }
		 }
		 { svelteHTML.createElement("span", { "class":`note`,});        }
	 }

	 { svelteHTML.createElement("p", { "class":`note`,});            }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const SettingsDefaults__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SettingsDefaults__SvelteComponent_ = ReturnType<typeof SettingsDefaults__SvelteComponent_>;
/*Ωignore_endΩ*/export default SettingsDefaults__SvelteComponent_;