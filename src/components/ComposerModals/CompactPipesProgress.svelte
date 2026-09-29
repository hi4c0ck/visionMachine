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
    /** Overall group progress 0..=1 (stage-count-weighted across pipes). */
    groupProgress = 0,
    /** Live compose phase while the group's auto-compose is in flight. */
    composePhase = null,
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
    /** Overall group progress (0..=1) for the modal header bar. */
    groupProgress?: number;
    /** Compose phase while in flight ('running' → bar; null = idle/terminal). */
    composePhase?: string | null;
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
  // Overall group progress (0..=1, clamped) — the modal's header bar.
  const overall = $derived(Math.max(0, Math.min(1, Number(groupProgress) || 0)));
  const overallPct = $derived(Math.round(overall * 100));

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
</script>

{#if open}
  <div class="modal-overlay" role="presentation">
    <div class="modal gen-group-modal" role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-header">
        <h3>Session generation</h3>
        <span class="modal-sub">{pipes.length} pipes{busy ? ` · ${overallPct}%` : ''}</span>
      </div>
      {#if busy || composePhase === 'running'}
        <div class="gen-group-progress" aria-hidden="false">
          <div class="gen-group-progress-head" aria-hidden="true">
            <span class="gen-group-progress-label">Overall</span>
            <span class="gen-group-progress-pct">{overallPct}%</span>
          </div>
          <div class="gen-progress-track gen-progress-bar" role="progressbar" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}>
            <div class="gen-progress-fill" style={`width: ${overallPct}%`}></div>
          </div>
        </div>
      {/if}
      <div class="modal-body gen-group-body">
        {#each pipes as pipe (pipe.id)}
          {@const task = viewFor(pipe)}
          {@const taskId = taskIds[pipe.id] ?? task?.taskId}
          {@const isCurrent = taskId === currentTaskId}
          <section class="compact-pipe" class:current={isCurrent}>
            <button class="compact-pipe-header" aria-expanded={taskId ? !!expanded[taskId] : false} onclick={() => toggle(pipe)} disabled={!taskId || staleUi.readOnly}>
              <span class="compact-pipe-name">{pipe.name}</span>
              <span class="gen-progress-track" role="progressbar" aria-valuenow={Math.round((task?.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={pipe.name}><span class="gen-progress-track-fill" class:done={statusFor(pipe) === 'done'} style={`width: ${Math.round((task?.progress ?? 0) * 100)}%`}></span></span>
              <span class={statusClass(statusFor(pipe))}>{statusLabel(pipe)}</span>
              <span class="compact-pipe-chevron" aria-hidden="true">{taskId && expanded[taskId] ? '▾' : '▸'}</span>
            </button>
            {#if taskId && expanded[taskId]}
              <div class="compact-pipe-body">
                {#if loading[taskId] || !task}
                  <p class="gen-task-pending">Loading pipe stages…</p>
                {:else}
                  <div class="gen-progress-track gen-progress-bar" role="progressbar" aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div class="gen-progress-fill" style={`width: ${Math.round(task.progress * 100)}%`}></div>
                  </div>
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
        <div class="gen-stale-note" role="status"><span class="gen-stale-note-icon" aria-hidden="true">⚠</span>{staleUi.note}</div>
      {/if}
      {#if composeUi.visible}
        <div class="gen-compose-note" class:ok={composeUi.tone === 'ok'} class:warning={composeUi.tone === 'warning' || composeUi.tone === 'info'} class:error={composeUi.tone === 'error'} role={composeUi.tone === 'error' ? 'alert' : 'status'}>
          <span class="gen-compose-icon" aria-hidden="true">{composeUi.tone === 'ok' ? '✓' : composeUi.tone === 'error' ? '✕' : '◷'}</span>
          <div class="gen-compose-text">
            <span class="gen-compose-label">{composeUi.label}</span>
            {#if composeUi.detail}<span class="gen-compose-detail">{composeUi.detail}</span>{/if}
          </div>
        </div>
      {/if}
      <div class="modal-footer gen-group-footer">
        {#if staleUi.showCancel}<button class="btn-cancel" onclick={onCancel}>Cancel all</button>{/if}
        {#if onMinimize && busy}<button class="btn-minimize" onclick={onMinimize}>Minimize</button>{/if}
        <button class="btn-confirm" onclick={onClose} disabled={busy}>OK</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Modal shell: slightly wider than the default .modal (480px) so the compact
     pipe rows + per-row track read comfortably. Keeps the shared chrome vars. */
  .gen-group-modal { max-width: 560px; width: 94%; }

  /* ── Group header progress: labelled bar above the body ── */
  .gen-group-progress { display: flex; flex-direction: column; gap: 5px; padding: 12px 20px 0; }
  .gen-group-progress-head { display: flex; justify-content: space-between; align-items: baseline; }
  .gen-group-progress-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted, #71717a); }
  .gen-group-progress-pct { font-size: 0.72rem; font-variant-numeric: tabular-nums; color: var(--text-secondary, #a1a1aa); }

  /* Body: bounded scroll so a long pipe list doesn't stretch the modal. */
  .gen-group-body { max-height: min(46vh, 420px); overflow-y: auto; padding: 14px 20px; }

  /* ── Compact pipe row ── */
  .compact-pipe { border: 1px solid var(--border-color, #3f3f46); border-radius: 8px; margin-bottom: 8px; overflow: hidden; background: var(--bg-tertiary, #27272a); transition: border-color 0.15s ease; }
  .compact-pipe:last-child { margin-bottom: 0; }
  .compact-pipe.current { border-color: var(--accent-color, #ff3e00); box-shadow: 0 0 0 1px var(--accent-color, #ff3e00) inset; }
  .compact-pipe-header { width: 100%; display: grid; grid-template-columns: minmax(90px, 1fr) minmax(100px, 120px) minmax(64px, 72px) 18px; align-items: center; gap: 10px; padding: 10px 12px; border: 0; background: transparent; color: var(--text-primary, #fff); text-align: left; cursor: pointer; transition: background 0.15s ease; }
  .compact-pipe-header:hover:not(:disabled) { background: var(--bg-hover, rgba(255, 255, 255, 0.04)); }
  .compact-pipe-header:focus-visible { outline: 2px solid var(--accent-color, #ff3e00); outline-offset: -2px; }
  .compact-pipe-header:disabled { cursor: default; opacity: 0.55; }
  .compact-pipe-header .gen-progress-track { width: 100%; }
  .compact-pipe-name { font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .compact-pipe-chevron { color: var(--text-muted, #a1a1aa); font-size: 0.8rem; text-align: center; }
  .compact-pipe-body { border-top: 1px solid var(--border-color, #3f3f46); padding: 10px 12px; background: var(--bg-secondary, #14141f); }

  /* Per-row status chip (shared .gen-status-chip owns the color classes). */
  .compact-pipe-header .gen-status-chip { justify-self: end; }

  /* ── Expanded per-pipe stage body (shared .gen-stage-* owns list anatomy) ── */
  .compact-pipe-body .gen-progress-bar { margin-bottom: 10px; }

  /* ── Notes: tinted, icon-led, full-width bands ── */
  .gen-stale-note { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 9px 12px; border: 1px solid var(--warning-color, #fbbf24); border-radius: 7px; color: var(--warning-color, #fbbf24); background: color-mix(in srgb, var(--warning-color, #fbbf24) 8%, transparent); font-size: 12px; line-height: 1.45; }
  .gen-stale-note-icon { flex: none; }

  .gen-compose-note { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 9px 12px; border: 1px solid var(--border-color, #3f3f46); border-radius: 7px; font-size: 12px; line-height: 1.45; }
  .gen-compose-icon { flex: none; font-weight: 700; }
  .gen-compose-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .gen-compose-note.ok { color: var(--success-color, #4ade80); border-color: color-mix(in srgb, var(--success-color, #4ade80) 40%, transparent); background: color-mix(in srgb, var(--success-color, #4ade80) 8%, transparent); }
  .gen-compose-note.warning, .gen-compose-note.info { color: var(--warning-color, #fbbf24); border-color: color-mix(in srgb, var(--warning-color, #fbbf24) 40%, transparent); background: color-mix(in srgb, var(--warning-color, #fbbf24) 8%, transparent); }
  .gen-compose-note.error { color: var(--error-color, #f87171); border-color: color-mix(in srgb, var(--error-color, #f87171) 40%, transparent); background: color-mix(in srgb, var(--error-color, #f87171) 8%, transparent); }
  .gen-compose-detail { font: 11px 'JetBrains Mono', monospace; opacity: 0.85; overflow-wrap: anywhere; }

  /* ── Footer: consistent with the shared modal-footer button sizing ── */
  .gen-group-footer { padding: 14px 20px; gap: 10px; }

  /* ── Local overrides for the shared gen-progress-* geometry ── */
  .gen-progress-fill { height: 100%; background: var(--accent-color, #ff3e00); transition: width 0.25s ease; }
  .gen-progress-bar { height: 7px; border-radius: 4px; }
  .gen-progress-bar .gen-progress-fill { height: 100%; border-radius: 4px; }
  .gen-progress-track-fill { height: 100%; }
  .gen-progress-track-fill.done { background: var(--success-color, #4ade80); }

  /* Minimize button (D10) — matches GenerationProgressModal's affordance. */
  .btn-minimize { padding: 10px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; border: 1px solid var(--border-color, #3f3f46); background: var(--bg-tertiary, rgba(255, 255, 255, 0.04)); color: var(--text-secondary, #a1a1aa); }
  .btn-minimize:hover { border-color: var(--accent-color, #ff3e00); color: var(--text-primary, #fff); }
</style>
