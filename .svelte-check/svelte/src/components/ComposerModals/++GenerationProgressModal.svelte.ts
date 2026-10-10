///<reference types="svelte" />
;// Generation progress modal (D6): one dialog shows all stages
// (sub-images first, then the final video), polled live. The modal is
// NOT closable by backdrop click or Esc — only the footer button dismisses
// it: "Cancel all" while the task is active, "OK" on a terminal state.

import type { GenerationLogEntry, GenerationLogPiece, GenerationTaskView } from '$types';
import { readMediaText } from '$lib/mediaUrl';
import { generationFailureMessage } from '$lib/generationErrors';
import '../composer-modal.css';

;type $$ComponentProps = {
		/** Latest polled task view (null = first tick pending) */
		task: GenerationTaskView | null;
		/** Task still active (queued/running) */
		busy: boolean;
		open: boolean;
		onCancel: () => void;
		onClose: () => void;
		/** Hide the modal but keep the task watcher running — the user can
		 *  return to the workspace and get back to the modal via the
		 *  persistent pill. No-op when the task is terminal (use onClose). */
		onMinimize?: () => void;
		/** Manual re-sync: pull the authoritative view from the backend cache
		 *  (the "am I on the latest?" gesture — also triggered on window focus). */
		onRefresh: () => void;
		/** Stop this task and start a fresh one (used by the "load looks
		 *  broken" reset notice). */
		onReset?: () => void;
		/** Portable generation log entry (Phase 4): shows WHICH MODEL made
		 * each piece + the taskId, so a later re-generation knows what to
		 * match or swap. null until the log write lands. */
		logEntry?: GenerationLogEntry | null;
	};function $$render() {

	
	
	
	
	
	
	
	

	let {
		task,
		busy,
		open = $bindable(false),
		onCancel,
		onClose,
		onMinimize,
		onRefresh,
		onReset,
		logEntry = null,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

	// ── Provider-overload notice ──────────────────────────────────────────────
	// A video stage stuck in the 503/429 backoff band for longer than this is
	// a bad sign the provider queue is effectively broken (the provider's
	// queue cap is ~45 min, so >6 min of sustained saturation is worth
	// offering a reset instead of making the user wait it out).
	const SATURATION_WARN_MS = 6 * 60 * 1000;
	const videoSaturated = $derived.by(() => {
		if (!task || !busy) return false;
		const video = task.stages.find((s: GenerationTaskView['stages'][number]) => s.kind === 'video');
		if (!video?.saturatedSince) return false;
		return now - video.saturatedSince >= SATURATION_WARN_MS;
	});

	// ── Live elapsed timer + "last activity" (drives the user's "is it alive?"
	//    question during long provider queue-full waits) ─────────────────────
	let now = $state(Date.now());
	$effect(() => {
		if (!task || task.status === 'running') {
			const id = setInterval(() => (now = Date.now()), 1000);
			return () => clearInterval(id);
		}
	});
	function formatElapsed(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
	}
	const elapsed = $derived(
		task && task.startedAt ? formatElapsed(now - task.startedAt) : null
	);

	// "Last activity" = the most recent stage event timestamp + its line, so
	// the user sees e.g. "queue full — retry in 120 s · 2 min ago" instead of
	// a frozen progress bar.
	const lastActivity = $derived.by(() => {
		if (!task) return null;
		const active = task.stages.find((s: GenerationTaskView['stages'][number]) => s.lastEventAt);
		if (!active?.lastEvent) return null;
		const secsAgo = Math.max(0, Math.floor((now - (active.lastEventAt ?? 0)) / 1000));
		const when =
			secsAgo < 10 ? `${secsAgo}s ago` : secsAgo < 60 ? `${Math.floor(secsAgo / 60)} min ago` : `${Math.floor(secsAgo / 60)} min ago`;
		return { text: active.lastEvent, when };
	});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function statusLabel(status: GenerationTaskView['status']): string {
		return status === 'running' ? 'running…' : status;
	}

	// Model actually used for one stage (from the log entry, P4).
	function modelFor(stage: GenerationTaskView['stages'][number]): string | null {
		if (!logEntry) return null;
		const piece = logEntry.pieces.find(
			(p: GenerationLogPiece) => p.kind === stage.sourceKind && p.refId === stage.sourceId,
		);
		return piece ? piece.model : null;
	}

	// Distinct models for the header line: image pieces + video piece.
	const headerModels = $derived.by(() => {
		if (!logEntry) return [];
		const img = logEntry.pieces.find((p: GenerationLogPiece) => p.kind !== 'video');
		const vid = logEntry.pieces.find((p: GenerationLogPiece) => p.kind === 'video');
		const out: string[] = [];
		if (img) out.push(`img ${img.model}`);
		if (vid) out.push(`video ${vid.model}`);
		return out;
	});

		// The modal is NOT closable by any means other than the footer button:
		// no X, no backdrop click, no Esc. While the task is active the footer
		// offers "Cancel all"; on a terminal state it offers "OK" so the user
		// explicitly acknowledges the outcome. This is a generation task, not a
		// form — an accidental click outside must not dismiss it.

	// Redacted request-log expander (E1): the engine writes keys masked to
	// [API_KEY] on disk, so fetching + showing it is safe.
	let logExpanded = $state(false);
	let logText = $state<string | null>(null);
	let logLoading = $state(false);
	// Which task's requestLog the cached text belongs to. The modal is mounted
	// for the whole Workspace (only the DOM is gated on `open`), so this local
	// state survives across tasks — without the tag, task B would inherit task
	// A's cached text (or, if the first fetch was empty, never re-fetch at all).
	let logTextForTask = $state<string | null>(null);
	async function toggleRequestLog() {
		logExpanded = !logExpanded;
		if (!logExpanded) return;
		const taskId = task?.taskId ?? null;
		// "We know this log is empty" only when we read it FOR THIS task. The
		// task-scoped reset effect (below) runs before the next render, but the
		// click handler is synchronous — without this predicate the UI could
		// show the task-scoped "entries land as each stage runs" copy while the
		// fetch decision still saw the previous task's cached text.
		const logKnown = logTextForTask === taskId;
		const logEmpty = logKnown && (!logText || !logText.trim());
		if (logKnown && !logEmpty) return; // current task's log already loaded
		const path = task?.requestLog ?? null;
		if (!path) return;
		logLoading = true;
		try {
			logText = await readMediaText(path);
			logTextForTask = taskId;
		} finally {
			logLoading = false;
		}
	}
	// When a new task takes over, drop the previous task's cached log so the
	// expander reads the new task's request.log (and re-fetches if empty).
	$effect(() => {
		if (logTextForTask && task?.taskId && logTextForTask !== task.taskId) {
			logText = null;
			logTextForTask = null;
			logExpanded = false;
		}
	});
;
async () => {

if(open){
	 { svelteHTML.createElement("div", {   "class":`modal-overlay`,"role":`presentation`,});
		 { svelteHTML.createElement("div", {           "class":`modal gen-progress-modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
			 { svelteHTML.createElement("div", { "class":`modal-header`,});
				 { svelteHTML.createElement("h3", {}); task ? `— ${task.pipeId.slice(0, 8)}` : ''; }
				if(task){
					 { svelteHTML.createElement("span", { "class":`modal-sub`,}); task.taskId.slice(0, 8);  statusLabel(task.status); }
					if(headerModels.length > 0){
						 { svelteHTML.createElement("span", { "class":`modal-sub gen-models-sub`,});headerModels.join(' · '); }
					}
				}
			 }
			 { svelteHTML.createElement("div", { "class":`modal-body`,});
				if(task){
					 { svelteHTML.createElement("div", {         "class":`gen-progress-bar`,"role":`progressbar`,"aria-valuenow":Math.round(task.progress * 100),"aria-valuemin":0,"aria-valuemax":100,});
						 { svelteHTML.createElement("div", {   "class":`gen-progress-fill`,"style":`width: ${Math.round(task.progress * 100)}%`,}); }
					 }
					if(videoSaturated){
						 { svelteHTML.createElement("div", {   "class":`gen-overload`,"role":`alert`,});
							 { svelteHTML.createElement("p", {});                     }
							if(onReset){
								 { svelteHTML.createElement("button", {   "class":`btn-confirm gen-reset`,"onclick":onReset,});  }
							}
						 }
					}
					 { svelteHTML.createElement("ul", { "class":`gen-stage-list`,});
						
						   for(let stage of __sveltets_2_ensureArray(task.stages)){stage.id + ':' + stage.label;
							 { svelteHTML.createElement("li", {       "class":`gen-stage`,});stage.status === 'done' || stage.status === 'ready';stage.status === 'error';stage.status === 'cancelled';stage.status === 'rate-limited';
								 { svelteHTML.createElement("span", { "class":`gen-stage-label`,});stage.label; }
								 { svelteHTML.createElement("span", { "class":`gen-stage-status`,});
									if(modelFor(stage)){
										 { svelteHTML.createElement("span", { "class":`gen-stage-model`,});modelFor(stage); }
									}
									if(stage.status === 'rate-limited'){
										 { svelteHTML.createElement("span", {   "class":`gen-stage-ratehint`,"aria-live":`polite`,});      }
									}else{
										stage.status;stage.error ? ` · ${stage.error}` : '';
									}
									
									if(stage.lastEvent){
										 { svelteHTML.createElement("span", {   "class":`gen-stage-lastevent`,"aria-live":`polite`,});stage.lastEvent; }
									}
								 }
							 }
						}
					 }
					
					if(task.status === 'error'){
						const errText = task.error?.trim() || generationFailureMessage(task) || 'Generation failed';
						 { svelteHTML.createElement("p", {   "class":`gen-task-error`,"role":`alert`,});errText; }
					} else if (task.status === 'cancelled'){
						 { svelteHTML.createElement("p", {   "class":`gen-task-cancelled`,"role":`status`,});  }
					}
					if(task.requestLog){
						const logKnown = logTextForTask === task.taskId;
						const logEmpty = logKnown && (!logText || !logText.trim());
						 { svelteHTML.createElement("button", {   "class":`gen-log-toggle`,"onclick":toggleRequestLog,});
							logExpanded ? 'Hide request log' : 'Show request log (redacted)';
						 }
						if(logExpanded){
							if(logLoading){
								 { svelteHTML.createElement("span", { "class":`gen-log-loading`,});  }
							} else if (logText && logText.trim()){
								 { svelteHTML.createElement("pre", { "class":`gen-log-body`,});logText; }
							}else{
								if(logEmpty){
									 { svelteHTML.createElement("span", { "class":`gen-log-loading`,});            }
								}else{
									 { svelteHTML.createElement("span", { "class":`gen-log-loading`,});    }
								}
							}
						}
					}else{
						
						 { svelteHTML.createElement("button", {    "class":`gen-log-toggle`,"onclick":toggleRequestLog,"disabled":true,});
							     
						 }
					}
				}else{
					
					 { svelteHTML.createElement("p", {   "class":`gen-task-pending`,"role":`status`,});        }
				}
			 }
			 { svelteHTML.createElement("div", { "class":`modal-footer`,});
				
				 { svelteHTML.createElement("button", {     "class":`gen-refresh`,"onclick":onRefresh,"title":`Refresh current state`,});
					
				 }
				if(busy && elapsed){
					 { svelteHTML.createElement("span", {   "class":`gen-elapsed`,"title":`Elapsed since the task started`,}); elapsed; }
				}
				if(lastActivity && busy){
					 { svelteHTML.createElement("span", {   "class":`gen-lastactivity`,"title":`Most recent engine state line`,}); lastActivity.text;  lastActivity.when; }
				}
				if(busy){
					 { svelteHTML.createElement("button", {     "class":`btn-cancel gen-cancel-all`,"onclick":onCancel,"disabled":!task,});
						 
					 }
					if(onMinimize){
						 { svelteHTML.createElement("button", {     "class":`btn-minimize`,"onclick":onMinimize,"title":`Hide the modal — the task keeps running in the background; click the pill to come back`,});
							 { svelteHTML.createElement("span", {   "class":`btn-minimize-icon`,"aria-hidden":`true`,});  } 
						 }
					}
				}else{
					
					const okEnabled = task === null || ['done', 'error', 'cancelled'].includes(task.status);
					 { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":onClose,"disabled":!okEnabled,});
						
					 }
				}
			 }
		 }
	 }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const GenerationProgressModal__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type GenerationProgressModal__SvelteComponent_ = ReturnType<typeof GenerationProgressModal__SvelteComponent_>;
/*Ωignore_endΩ*/export default GenerationProgressModal__SvelteComponent_;