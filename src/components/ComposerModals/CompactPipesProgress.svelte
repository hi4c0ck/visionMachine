<script lang="ts">
  import type { GenerationTaskView, PipeRow } from '$types';
  import { groupStaleUiState, groupComposeUiState } from '$lib/compactPipes';
  import '../composer-modal.css';

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
    onFetch,
    onLoaded,
    onCancel,
    onClose,
    onMinimize,
  } = $props<{
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
    onFetch: (taskId: string) => Promise<GenerationTaskView>;
    onLoaded?: (view: GenerationTaskView) => void;
    onCancel: () => void;
    onClose: () => void;
    onMinimize?: () => void;
  }>();

  // A group "done" with a compose error must NOT be presented as a clean
  // success — surface the persisted compose state explicitly, and only treat
  // compose as successful when a real session.mp4 path exists (pure helper,
  // unit-tested in tests/unit/compactPipes.test.ts).
  const composeUi = $derived(groupComposeUiState(busy, composeState, composeError, sessionVideoPath));

  let expanded = $state<Record<string, boolean>>({});
  let loading = $state<Record<string, boolean>>({});
  const staleUi = $derived(groupStaleUiState(stale, busy));

  $effect(() => {
    if (currentTaskId) expanded[currentTaskId] = true;
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
</script>

{#if open}
  <div class="modal-overlay" role="presentation">
    <div class="modal gen-group-modal" role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-header">
        <h3>Session generation</h3>
        <span class="modal-sub">{pipes.length} pipes</span>
      </div>
      <div class="modal-body">
        {#each pipes as pipe (pipe.id)}
          {@const task = viewFor(pipe)}
          {@const taskId = taskIds[pipe.id] ?? task?.taskId}
          {@const isCurrent = taskId === currentTaskId}
          <section class="compact-pipe" class:current={isCurrent}>
            <button class="compact-pipe-header" aria-expanded={taskId ? !!expanded[taskId] : false} onclick={() => toggle(pipe)} disabled={!taskId || staleUi.readOnly}>
              <span class="compact-pipe-name">{pipe.name}</span>
              <span class="compact-pipe-progress"><span style={`width: ${Math.round((task?.progress ?? 0) * 100)}%`}></span></span>
              <span class="compact-pipe-status">{statusFor(pipe)}</span>
              <span class="compact-pipe-chevron" aria-hidden="true">{taskId && expanded[taskId] ? '▾' : '▸'}</span>
            </button>
            {#if taskId && expanded[taskId]}
              <div class="compact-pipe-body">
                {#if loading[taskId] || !task}
                  <p class="gen-task-pending">Loading pipe stages…</p>
                {:else}
                  <div class="gen-progress-bar"><div class="gen-progress-fill" style={`width: ${Math.round(task.progress * 100)}%`}></div></div>
                  <ul class="gen-stage-list">
                    {#each task.stages as stage (stage.id + ':' + stage.label)}
                      <li class="gen-stage" class:done={stage.status === 'done' || stage.status === 'ready'} class:error={stage.status === 'error'} class:cancelled={stage.status === 'cancelled'} class:ratelimited={stage.status === 'rate-limited'}>
                        <span class="gen-stage-label">{stage.label}</span>
                        <span class="gen-stage-status">{stage.status}{stage.error ? ` · ${stage.error}` : ''}</span>
                        {#if stage.lastEvent}<span class="gen-stage-lastevent">{stage.lastEvent}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </section>
        {/each}
      </div>
      {#if staleUi.stale}
        <p class="gen-stale-note" role="status">{staleUi.note}</p>
      {/if}
      {#if composeUi.visible}
        <div class="gen-compose-note" class:ok={composeUi.tone === 'ok'} class:warning={composeUi.tone === 'warning' || composeUi.tone === 'info'} class:error={composeUi.tone === 'error'} role={composeUi.tone === 'error' ? 'alert' : 'status'}>
          <span class="gen-compose-label">{composeUi.label}</span>
          {#if composeUi.detail}<span class="gen-compose-detail">{composeUi.detail}</span>{/if}
        </div>
      {/if}
      <div class="modal-footer">
        {#if staleUi.showCancel}<button class="btn-cancel" onclick={onCancel}>Cancel all</button>{/if}
        {#if onMinimize && busy}<button class="btn-minimize" onclick={onMinimize}>Minimize</button>{/if}
        <button class="btn-confirm" onclick={onClose} disabled={busy}>OK</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .compact-pipe { border: 1px solid var(--border-color, #3f3f46); border-radius: 7px; margin-bottom: 8px; overflow: hidden; }
  .compact-pipe.current { border-color: var(--accent-color, #ff3e00); }
  .compact-pipe-header { width: 100%; display: grid; grid-template-columns: minmax(90px, 1fr) 120px 72px 18px; align-items: center; gap: 10px; padding: 9px 10px; border: 0; background: transparent; color: var(--text-primary, #fff); text-align: left; cursor: pointer; }
  .compact-pipe-header:disabled { cursor: default; }
  .compact-pipe-progress { height: 5px; background: var(--bg-tertiary, #27272a); border-radius: 3px; overflow: hidden; }
  .compact-pipe-progress span { display: block; height: 100%; background: var(--accent-color, #ff3e00); }
  .compact-pipe-status { color: var(--text-muted, #a1a1aa); font: 11px 'JetBrains Mono', monospace; text-align: right; }
  .compact-pipe-chevron { color: var(--text-muted, #a1a1aa); }
  .compact-pipe-body { border-top: 1px solid var(--border-color, #3f3f46); padding: 9px; }
  .gen-stale-note { margin: 0; padding: 9px 10px; border-top: 1px solid var(--border-color, #3f3f46); color: var(--warning-color, #fbbf24); background: var(--bg-tertiary, #27272a); }
  .gen-compose-note { margin: 0; padding: 9px 10px; border-top: 1px solid var(--border-color, #3f3f46); font-size: 12px; line-height: 1.45; display: flex; flex-direction: column; gap: 2px; }
  .gen-compose-note.ok { color: var(--success-color, #4ade80); background: var(--bg-tertiary, #27272a); }
  .gen-compose-note.warning, .gen-compose-note.info { color: var(--warning-color, #fbbf24); background: var(--bg-tertiary, #27272a); }
  .gen-compose-note.error { color: var(--error-color, #f87171); background: var(--bg-tertiary, #27272a); }
  .gen-compose-detail { font: 11px 'JetBrains Mono', monospace; opacity: 0.85; overflow-wrap: anywhere; }
</style>
