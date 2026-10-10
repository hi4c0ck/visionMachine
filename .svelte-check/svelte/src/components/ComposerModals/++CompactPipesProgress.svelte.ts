///<reference types="svelte" />
;
import type { GenerationTaskView, PipeRow } from '$types';
import { groupStaleUiState, groupComposeUiState } from '$lib/compactPipes';
import '../composer-modal.css';

;type $$ComponentProps = {
    open: boolean;
    pipes: PipeRow[];
    stale?: boolean;
    currentTaskId: string | null;
    taskViews: Record<string, GenerationTaskView>;
    taskIds: Record<string, string>;
    busy: boolean;
    /** Persisted compose outcome: 'running' | 'done' | 'error' | 'cancelled' | 'skipped' | null. */
    composeState?: string | null;
    /** Persisted compose failure detail (only when composeState === 'error'). */
    composeError?: string | null;
    /** Path of the composed session video (only when composeState === 'done'). */
    sessionVideoPath?: string | null;
    /** Overall group progress (0..=1) for the modal header bar. */
    groupProgress?: number;
    /** Compose phase while in flight ('running' → bar; null = idle/terminal). */
    composePhase?: string | null;
    onFetch: (taskId: string) => Promise<GenerationTaskView>;
    onLoaded?: (view: GenerationTaskView) => void;
    onCancel: () => void;
    onClose: () => void;
    onMinimize?: () => void;
  };function $$render() {

  
  
  

  let {
    open = $bindable(false),
    pipes,
    stale = false,
    currentTaskId,
    taskViews,
    taskIds,
    busy,
    composeState,
    composeError,
    sessionVideoPath,
    /** Overall group progress 0..=1 (stage-count-weighted across pipes). */
    groupProgress = 0,
    /** Live compose phase while the group's auto-compose is in flight. */
    composePhase = null,
    onFetch,
    onLoaded,
    onCancel,
    onClose,
    onMinimize,
  } = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;open;/*Ωignore_endΩ*/;

  // A group "done" with a compose error must NOT be presented as a clean
  // success — surface the persisted compose state explicitly, and only treat
  // compose as successful when a real session.mp4 path exists (pure helper,
  // unit-tested in tests/unit/compactPipes.test.ts).
  const composeUi = $derived(groupComposeUiState(busy, composeState, composeError, sessionVideoPath));

  let expanded = $state<Record<string, boolean>>({});
  let loading = $state<Record<string, boolean>>({});
  const staleUi = $derived(groupStaleUiState(stale, busy));
  // Overall group progress (0..=1, clamped) — the modal's header bar.
  const overall = $derived(Math.max(0, Math.min(1, Number(groupProgress) || 0)));
  const overallPct = $derived(Math.round(overall * 100));

  $effect(() => {
    // Auto-expand the current pipe. Guarded: writing a state key inside the
    // effect that reads it is a re-entrancy footgun — only write when the
    // value actually flips, so the effect can never re-trigger itself.
    if (currentTaskId && !expanded[currentTaskId]) expanded[currentTaskId] = true;
  });

  async function toggle(pipe: PipeRow) {
    const taskId = taskIds[pipe.id] ?? taskViews[pipe.id]?.taskId;
    if (!taskId) return;
    const next = !expanded[taskId];
    expanded[taskId] = next;
    if (next && !taskViews[pipe.id] && !loading[taskId]) {
      loading[taskId] = true;
      try {
        const view = await onFetch(taskId);
        onLoaded?.(view);
      } finally {
        loading[taskId] = false;
      }
    }
  }

  function viewFor(pipe: PipeRow) {
    return taskViews[pipe.id] ?? null;
  }
  function statusFor(pipe: PipeRow) {
    const task = viewFor(pipe);
    if (task) return task.status;
    return pipe.id === currentTaskId ? 'running' : 'queued';
  }
  // Exact per-pipe progress label: terminal states read as the word, in-flight
  // states carry the live percentage so the row shows WHERE the pipe is, not
  // just that it's running (a running pipe's exact bar is the poll-driven one).
  function statusLabel(pipe: PipeRow): string {
    const s = statusFor(pipe);
    if (s === 'done') return 'done';
    if (s === 'error') return 'error';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'rate-limited') return 'rate-limited';
    if (s === 'queued') return 'queued';
    const p = viewFor(pipe);
    if (p) return `running ${Math.round(p.progress * 100)}%`;
    return 'running';
  }
  function statusClass(status: string): string {
    switch (status) {
      case 'done':
        return 'gen-status-chip done';
      case 'error':
        return 'gen-status-chip error';
      case 'cancelled':
      case 'rate-limited':
        return 'gen-status-chip cancelled';
      case 'running':
      case 'generating':
        return 'gen-status-chip running';
      default:
        return 'gen-status-chip';
    }
  }
;
async () => {

if(open){
   { svelteHTML.createElement("div", {   "class":`modal-overlay`,"role":`presentation`,});
     { svelteHTML.createElement("div", {       "class":`modal gen-group-modal`,"role":`dialog`,"aria-modal":`true`,"tabindex":-1,});
       { svelteHTML.createElement("div", { "class":`modal-header`,});
         { svelteHTML.createElement("h3", {});  }
         { svelteHTML.createElement("span", { "class":`modal-sub`,});pipes.length; busy ? ` · ${overallPct}%` : ''; }
       }
      if(busy || composePhase === 'running'){
         { svelteHTML.createElement("div", {   "class":`gen-group-progress`,"aria-hidden":`false`,});
           { svelteHTML.createElement("div", {   "class":`gen-group-progress-head`,"aria-hidden":`true`,});
             { svelteHTML.createElement("span", { "class":`gen-group-progress-label`,});  }
             { svelteHTML.createElement("span", { "class":`gen-group-progress-pct`,});overallPct;  }
           }
           { svelteHTML.createElement("div", {         "class":`gen-progress-track gen-progress-bar`,"role":`progressbar`,"aria-valuenow":overallPct,"aria-valuemin":0,"aria-valuemax":100,});
             { svelteHTML.createElement("div", {   "class":`gen-progress-fill`,"style":`width: ${overallPct}%`,}); }
           }
         }
      }
       { svelteHTML.createElement("div", { "class":`modal-body gen-group-body`,});
           for(let pipe of __sveltets_2_ensureArray(pipes)){pipe.id;
          const task = viewFor(pipe);
          const taskId = taskIds[pipe.id] ?? task?.taskId;
          const isCurrent = taskId === currentTaskId;
           { svelteHTML.createElement("section", {  "class":`compact-pipe`,});isCurrent;
             { svelteHTML.createElement("button", {       "class":`compact-pipe-header`,"aria-expanded":taskId ? !!expanded[taskId] : false,"onclick":() => toggle(pipe),"disabled":!taskId || staleUi.readOnly,});
               { svelteHTML.createElement("span", { "class":`compact-pipe-name`,});pipe.name; }
               { svelteHTML.createElement("span", {           "class":`gen-progress-track`,"role":`progressbar`,"aria-valuenow":Math.round((task?.progress ?? 0) * 100),"aria-valuemin":0,"aria-valuemax":100,"aria-label":pipe.name,}); { svelteHTML.createElement("span", {    "class":`gen-progress-track-fill`,"style":`width: ${Math.round((task?.progress ?? 0) * 100)}%`,});statusFor(pipe) === 'done'; } }
               { svelteHTML.createElement("span", { "class":statusClass(statusFor(pipe)),});statusLabel(pipe); }
               { svelteHTML.createElement("span", {   "class":`compact-pipe-chevron`,"aria-hidden":`true`,});taskId && expanded[taskId] ? '▾' : '▸'; }
             }
            if(taskId && expanded[taskId]){
               { svelteHTML.createElement("div", { "class":`compact-pipe-body`,});
                if(loading[taskId] || !task){
                   { svelteHTML.createElement("p", { "class":`gen-task-pending`,});   }
                }else{
                   { svelteHTML.createElement("div", {         "class":`gen-progress-track gen-progress-bar`,"role":`progressbar`,"aria-valuenow":Math.round(task.progress * 100),"aria-valuemin":0,"aria-valuemax":100,});
                     { svelteHTML.createElement("div", {   "class":`gen-progress-fill`,"style":`width: ${Math.round(task.progress * 100)}%`,}); }
                   }
                   { svelteHTML.createElement("ul", { "class":`gen-stage-list`,});
                       for(let stage of __sveltets_2_ensureArray(task.stages)){stage.id + ':' + stage.label;
                       { svelteHTML.createElement("li", {     "class":`gen-stage`,});stage.status === 'done' || stage.status === 'ready';stage.status === 'error';stage.status === 'cancelled';stage.status === 'rate-limited';
                         { svelteHTML.createElement("span", { "class":`gen-stage-label`,});stage.label; }
                         { svelteHTML.createElement("span", { "class":`gen-stage-status`,});stage.status;stage.error ? ` · ${stage.error}` : ''; }
                        if(stage.lastEvent){ { svelteHTML.createElement("span", { "class":`gen-stage-lastevent`,});stage.lastEvent; }}
                       }
                    }
                   }
                }
               }
            }
           }
        }
       }
      if(staleUi.stale){
         { svelteHTML.createElement("div", {   "class":`gen-stale-note`,"role":`status`,}); { svelteHTML.createElement("span", {   "class":`gen-stale-note-icon`,"aria-hidden":`true`,});  }staleUi.note; }
      }
      if(composeUi.visible){
         { svelteHTML.createElement("div", {      "class":`gen-compose-note`,"role":composeUi.tone === 'error' ? 'alert' : 'status',});composeUi.tone === 'ok';composeUi.tone === 'warning' || composeUi.tone === 'info';composeUi.tone === 'error';
           { svelteHTML.createElement("span", {   "class":`gen-compose-icon`,"aria-hidden":`true`,});composeUi.tone === 'ok' ? '✓' : composeUi.tone === 'error' ? '✕' : '◷'; }
           { svelteHTML.createElement("div", { "class":`gen-compose-text`,});
             { svelteHTML.createElement("span", { "class":`gen-compose-label`,});composeUi.label; }
            if(composeUi.detail){ { svelteHTML.createElement("span", { "class":`gen-compose-detail`,});composeUi.detail; }}
           }
         }
      }
       { svelteHTML.createElement("div", { "class":`modal-footer gen-group-footer`,});
        if(staleUi.showCancel){ { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":onCancel,});  }}
        if(onMinimize && busy){ { svelteHTML.createElement("button", {   "class":`btn-minimize`,"onclick":onMinimize,});  }}
         { svelteHTML.createElement("button", {     "class":`btn-confirm`,"onclick":onClose,"disabled":busy,});  }
       }
     }
   }
}


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('open'), slots: {}, events: {} }}
const CompactPipesProgress__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type CompactPipesProgress__SvelteComponent_ = ReturnType<typeof CompactPipesProgress__SvelteComponent_>;
/*Ωignore_endΩ*/export default CompactPipesProgress__SvelteComponent_;