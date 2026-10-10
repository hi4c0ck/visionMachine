///<reference types="svelte" />
;// Settings "Tools" tab: local tooling overrides. v1 = the ffmpeg path
// (tiny-variant escape hatch). The path is probed with `-version` only
// (probe_ffmpeg_path allowlists the ffmpeg/ffprobe basename), and on Save
// the settings store mirrors it into the backend locator chain.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { flashToast } from '$lib/flashToast';
import '../composer-modal.css';

;type $$ComponentProps = {
		draft: { tools: { ffmpegPath: string } };
		ondraftchange: (m: (d: any) => void) => void;
	};function $$render() {

	
	
	
	
	
	
	

	let {
		draft,
		ondraftchange,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	let testing = $state(false);
	let probeStatus = $state<'idle' | 'ok' | 'none'>('idle');
	let probeLabel = $state('');

	function setFfmpegPath(v: string) {
		probeStatus = 'idle';
		probeLabel = '';
		ondraftchange((d: any) => {
			d.tools = { ...d.tools, ffmpegPath: v };
		});
	}

	async function testPath() {
		const p = draft.tools.ffmpegPath.trim();
		if (!p) {
			probeStatus = 'idle';
			probeLabel = 'Enter a path to test';
			return;
		}
		if (!isTauri()) {
			probeStatus = 'idle';
			probeLabel = 'Desktop only';
			return;
		}
		testing = true;
		try {
			const r = (await invoke('probe_ffmpeg_path', { path: p })) as {
				source: string;
				path: string;
				versionLine: string;
			};
			if (r.source === 'none') {
				probeStatus = 'none';
				probeLabel = 'Not a working ffmpeg executable';
			} else {
				probeStatus = 'ok';
				probeLabel = r.versionLine || 'ok';
			}
		} catch (e) {
			probeStatus = 'none';
			probeLabel = String(e);
		} finally {
			testing = false;
		}
	}

	function clearPath() {
		ondraftchange((d: any) => {
			d.tools = { ...d.tools, ffmpegPath: '' };
		});
		probeStatus = 'idle';
		probeLabel = '';
		flashToast('ffmpeg path cleared', 'info');
	}
;
async () => {

 { svelteHTML.createElement("div", { "class":`tools-settings`,});
	 { svelteHTML.createElement("div", { "class":`tools-header`,});
		 { svelteHTML.createElement("h4", { "class":`tools-title`,});  }
		 { svelteHTML.createElement("span", { "class":`tools-sub`,});
			               
		 }
	 }

	 { svelteHTML.createElement("label", {   "class":`form-label`,"for":`ffmpeg-path`,});   }
	 { svelteHTML.createElement("div", { "class":`ffmpeg-row`,});
		 { svelteHTML.createElement("input", {               "id":`ffmpeg-path`,"type":`text`,"class":`modal-input ffmpeg-input`,"value":draft.tools.ffmpegPath,"oninput":(e) => setFfmpegPath(e.currentTarget.value),"placeholder":`e.g. C:\\Tools\\ffmpeg\\bin\\ffmpeg.exe`,"spellcheck":`false`,});}
		 { svelteHTML.createElement("button", {     "class":`btn-test`,"onclick":testPath,"disabled":testing,});
			testing ? 'Testing…' : 'Test';
		 }
		if(draft.tools.ffmpegPath){
			 { svelteHTML.createElement("button", {     "class":`btn-clear`,"onclick":clearPath,"title":`Clear path`,});  }
		}
	 }

	if(probeStatus === 'ok'){
		 { svelteHTML.createElement("div", {   "class":`probe-line probe-ok`,"aria-live":`polite`,}); probeLabel; }
	} else if (probeStatus === 'none'){
		 { svelteHTML.createElement("div", {   "class":`probe-line probe-err`,"aria-live":`polite`,}); probeLabel; }
	} else if (probeLabel){
		 { svelteHTML.createElement("div", {   "class":`probe-line`,"aria-live":`polite`,});probeLabel; }
	}
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ToolsSettings__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ToolsSettings__SvelteComponent_ = ReturnType<typeof ToolsSettings__SvelteComponent_>;
/*Ωignore_endΩ*/export default ToolsSettings__SvelteComponent_;