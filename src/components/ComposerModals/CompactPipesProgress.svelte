<script lang="ts">
  // Session-generation progress modal — REDESIGNED (bug batch nov19, item 5,
  // approved mockup progress-redesign-mock/A.png). The old flat list buried
  // the active pipe in a 420px scroll box with every predecessor expanded.
  // Now: a PINNED "now" strip above the scroll area (active pipe + stage +
  // elapsed, always visible), an Overall band that PERSISTS through compose,
  // a single-expand accordion (predecessor auto-collapses on advance), the
  // current row auto-scrolls into view, and per-row meta chips keep collapsed
  // rows informative. Contracts kept: D6 OK-gate, D10 minimize, stale
  // read-only, compose outcome band, lazy stage fetch on expand.
  import type { GenerationTaskView, GenerationStageView, PipeRow } from '$types';
  import {
    groupStaleUiState, groupComposeUiState, stageStatusWord, stageStateClass,
    fmtElapsed, nextExpandedId,
  } from '$lib/compactPipes';
  import '../composer-modal.css';
  import ChromeIcon from '../ChromeIcon.svelte';

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

  // ── Single-expand accordion (item 5): ONE taskId open at a time. ──
  let expandedId = $state<string | null>(null);
  let loading = $state<Record<string, boolean>>({});
  const staleUi = $derived(groupStaleUiState(stale, busy));
  const overall = $derived(Math.max(0, Math.min(1, Number(groupProgress) || 0)));
  const overallPct = $derived(Math.round(overall * 100));

  // ── Pinned "now" strip inputs ──
  const composing = $derived(composePhase === 'running');
  const currentPipe = $derived(
    pipes.find((p: PipeRow) => (taskIds[p.id] ?? taskViews[p.id]?.taskId) === currentTaskId) ?? null,
  );
  const currentView = $derived(currentPipe ? taskViews[currentPipe.id] ?? null : null);
  const activeStage = $derived(
    currentView?.stages.find((s: GenerationStageView) => s.status === 'generating' || s.status === 'rate-limited')?.label ?? 'video',
  );
  const nowPct = $derived(Math.round((currentView?.progress ?? 0) * 100));
  // Date.now() re-reads on every poll-driven view update (~2s) — the elapsed
  // chip ticks with the poll cadence, no extra timer needed.
  const nowElapsed = $derived(currentView?.startedAt ? fmtElapsed(currentView.startedAt, Date.now()) : '');
  const doneCount = $derived(pipes.filter((p: PipeRow) => statusFor(p) === 'done').length);
  const phaseChip = $derived(
    composing ? 'composing' : busy ? 'generating' : composeUi.tone === 'ok' ? 'done' : 'idle',
  );

  // Auto-expand + scroll the CURRENT row into view when the run advances.
  // prevCurrent is a plain (untracked) let so the effect fires only on an
  // actual pipe change — a manual collapse of the current row sticks until
  // the run moves on.
  let prevCurrent: string | null = null;
  let rowEls = $state<(HTMLElement | null)[]>([]);
  const currentIdx = $derived(currentPipe ? pipes.indexOf(currentPipe) : -1);
  $effect(() => {
    if (currentTaskId !== prevCurrent) {
      prevCurrent = currentTaskId;
      if (currentTaskId) {
        expandedId = currentTaskId;
        // Scroll after the DOM settles the new current row.
        requestAnimationFrame(() => rowEls[currentIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
    }
  });

  async function toggle(pipe: PipeRow) {
    const taskId = taskIds[pipe.id] ?? taskViews[pipe.id]?.taskId;
    if (!taskId) return;
    const next = nextExpandedId(expandedId, taskId);
    expandedId = next;
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
  // states carry the live percentage so the row shows WHERE the pipe is.
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
  // Elapsed chip: only while running with a known start (done rows have no
  // completedAt in the view model — a growing "elapsed" there would lie).
  function rowElapsed(pipe: PipeRow): string {
    const v = viewFor(pipe);
    if (!v || !v.startedAt) return '';
    const s = statusFor(pipe);
    if (s !== 'running' && s !== 'generating') return '';
    return fmtElapsed(v.startedAt, Date.now());
  }
</script>

{#if open}
  <div class="modal-overlay" role="presentation">
    <div class="modal gen-group-modal" role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-header">
        <h3>Session generation</h3>
        <span class="modal-sub">{pipes.length} pipes · sequential</span>
      </div>

      <!-- ── Pinned "now" strip (item 5): ABOVE the scroll area, always
           visible while the run is live — generating OR composing. ── -->
      {#if busy || composing}
        <div class="now-strip" class:composing role="status">
          <div class="now-top">
            <span class="now-tag">{composing ? 'Now composing' : 'Now generating'}</span>
            {#if composing}
              <span class="now-name">session video</span>
              <span class="now-stage">ffmpeg · {pipes.length} clips</span>
            {:else if currentPipe}
              <span class="now-name">{currentPipe.name}</span>
              <span class="now-stage">{activeStage}{nowPct > 0 ? ` · ${nowPct}%` : ''}</span>
              {#if nowElapsed}<span class="now-elapsed">{nowElapsed}</span>{/if}
            {/if}
          </div>
          <div class="gen-progress-track now-bar" role="progressbar" aria-valuenow={composing ? 0 : nowPct} aria-valuemin={0} aria-valuemax={100}>
            <div class="gen-progress-fill" class:indeterminate={composing} style={composing ? '' : `width: ${nowPct}%`}></div>
          </div>
        </div>
      {/if}

      <!-- ── Overall band (item 5): PERSISTS through compose (the old
           busy-only gate made it vanish mid-compose). ── -->
      <div class="gen-group-progress">
        <div class="gen-group-progress-head">
          <span class="gen-group-progress-label">Overall · {doneCount}/{pipes.length} done</span>
          <span class="gen-group-progress-pct">{overallPct}%</span>
          <span class="phase-chip" class:active={busy || composing}>{phaseChip}</span>
        </div>
        <div class="gen-progress-track gen-progress-bar" role="progressbar" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}>
          <div class="gen-progress-fill" style={`width: ${overallPct}%`}></div>
        </div>
      </div>

      <div class="modal-body gen-group-body">
        {#each pipes as pipe, i (pipe.id)}
          {@const task = viewFor(pipe)}
          {@const taskId = taskIds[pipe.id] ?? task?.taskId}
          {@const isCurrent = taskId === currentTaskId}
          {@const isOpen = !!taskId && expandedId === taskId}
          {@const elapsed = rowElapsed(pipe)}
          <section class="compact-pipe" class:current={isCurrent} bind:this={rowEls[i]}>
            <button class="compact-pipe-header" aria-expanded={isOpen} onclick={() => toggle(pipe)} disabled={!taskId || staleUi.readOnly}>
              <span class="compact-pipe-idx" aria-hidden="true">{i + 1}</span>
              <span class="compact-pipe-name">{pipe.name}</span>
              <span class="compact-pipe-meta">
                <span class="meta-chip">{pipe.lengthFrames}f</span>
                {#if elapsed}<span class="meta-chip">{elapsed}</span>{/if}
              </span>
              <span class={statusClass(statusFor(pipe))}>{statusLabel(pipe)}</span>
              <span class="compact-pipe-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
            </button>
            {#if isOpen}
              <div class="compact-pipe-body">
                {#if loading[taskId] || !task}
                  <p class="gen-task-pending">Loading pipe stages…</p>
                {:else}
                  <div class="gen-progress-track gen-progress-bar" role="progressbar" aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div class="gen-progress-fill" style={`width: ${Math.round(task.progress * 100)}%`}></div>
                  </div>
                  <ul class="gen-stage-list">
                    {#each task.stages as stage (stage.id + ':' + stage.label)}
                      {@const stateCls = stageStateClass(stage.status)}
                      <li class="gen-stage {stateCls ?? ''}" data-stage-status={stage.status}>
                        <span class="gen-stage-dot" aria-hidden="true"></span>
                        <div class="gen-stage-main">
                          <span class="gen-stage-label">{stage.label}</span>
                          {#if stage.error}<span class="gen-stage-error">{stage.error}</span>{/if}
                          {#if stage.lastEvent}<span class="gen-stage-lastevent">{stage.lastEvent}</span>{/if}
                        </div>
                        <span class="gen-stage-status">{stageStatusWord(stage.status)}</span>
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
        <div class="gen-stale-note" role="status"><span class="gen-stale-note-icon" aria-hidden="true"><ChromeIcon id="warning" size={14} /></span>{staleUi.note}</div>
      {/if}
      {#if composeUi.visible}
        <div class="gen-compose-note" class:ok={composeUi.tone === 'ok'} class:warning={composeUi.tone === 'warning' || composeUi.tone === 'info'} class:error={composeUi.tone === 'error'} role={composeUi.tone === 'error' ? 'alert' : 'status'}>
          <span class="gen-compose-icon" aria-hidden="true">
            {#if composeUi.tone === 'ok'}
              <ChromeIcon id="success" size={14} />
            {:else if composeUi.tone === 'error'}
              <ChromeIcon id="error" size={14} />
            {:else}
              <ChromeIcon id="spinner" size={14} />
            {/if}
          </span>
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
  /* Modal shell: 600px (was 560) — the meta-chip rows + pinned strip read
     comfortably; keeps the shared chrome vars. */
  .gen-group-modal { max-width: 600px; width: 94%; }

  /* ── Pinned "now" strip (item 5): outside the scroll area ── */
  .now-strip { margin: 12px 20px 0; padding: 10px 12px; border: 1px solid var(--accent-color, #59B5FF); border-radius: 8px; background: var(--accent-bg, rgba(89, 181, 255, 0.12)); }
  .now-strip.composing { border-color: var(--border-light, #3a3a4a); background: var(--bg-tertiary, #1e1e2e); }
  .now-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .now-tag { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent-color, #59B5FF); white-space: nowrap; }
  .now-strip.composing .now-tag { color: var(--text-secondary, #a0a0b0); }
  .now-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .now-stage { font-size: 11px; color: var(--text-secondary, #a0a0b0); margin-left: auto; white-space: nowrap; }
  .now-elapsed { font-size: 10px; color: var(--text-muted, #6b6b80); font-variant-numeric: tabular-nums; }
  .now-bar { margin-top: 8px; }
  .gen-progress-fill.indeterminate { width: 100%; opacity: 0.35; animation: now-pulse 1.4s ease-in-out infinite; }
  @keyframes now-pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.5; } }

  /* ── Overall band: always rendered (persists through compose) ── */
  .gen-group-progress { display: flex; flex-direction: column; gap: 5px; padding: 10px 20px 0; }
  .gen-group-progress-head { display: flex; align-items: center; gap: 8px; }
  .gen-group-progress-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted, #71717a); }
  .gen-group-progress-pct { font-size: 0.72rem; font-variant-numeric: tabular-nums; color: var(--text-secondary, #a1a1aa); margin-left: auto; }
  .phase-chip { font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-color, #3f3f46); color: var(--text-muted, #71717a); }
  .phase-chip.active { border-color: var(--accent-color, #59B5FF); color: var(--accent-color, #59B5FF); }

  /* Body: taller scroll budget (was min(46vh, 420px)) — 8 collapsed rows fit
     without burying the active pipe; the pinned strip covers the rest. */
  .gen-group-body { max-height: 60vh; overflow-y: auto; padding: 12px 20px; }

  /* ── Compact pipe row: idx · name · meta chips · status · chevron ── */
  .compact-pipe { border: 1px solid var(--border-color, #3f3f46); border-radius: 8px; margin-bottom: 6px; overflow: hidden; background: var(--bg-tertiary, #27272a); transition: border-color 0.15s ease; }
  .compact-pipe:last-child { margin-bottom: 0; }
  .compact-pipe.current { border-color: var(--accent-color, #59B5FF); box-shadow: 0 0 0 1px var(--accent-glow, rgba(89, 181, 255, 0.35)); }
  .compact-pipe-header { width: 100%; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto auto 16px; align-items: center; gap: 8px; padding: 9px 12px; border: 0; background: transparent; color: var(--text-primary, #fff); text-align: left; cursor: pointer; transition: background 0.15s ease; }
  .compact-pipe-header:hover:not(:disabled) { background: var(--bg-hover, rgba(255, 255, 255, 0.04)); }
  .compact-pipe-header:focus-visible { outline: 2px solid var(--accent-color, #59B5FF); outline-offset: -2px; }
  .compact-pipe-header:disabled { cursor: default; opacity: 0.55; }
  .compact-pipe-idx { font-size: 10px; color: var(--text-muted, #6b6b80); }
  .compact-pipe-name { font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .compact-pipe-meta { display: flex; gap: 4px; }
  .meta-chip { font-size: 9px; color: var(--text-muted, #6b6b80); border: 1px solid var(--border-color, #3f3f46); border-radius: 999px; padding: 1px 7px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .compact-pipe-chevron { color: var(--text-muted, #a1a1aa); font-size: 0.8rem; text-align: center; }
  .compact-pipe-body { border-top: 1px solid var(--border-color, #3f3f46); padding: 10px 12px; background: var(--bg-secondary, #14141f); }

  /* Per-row status chip (shared .gen-status-chip owns the color classes). */
  .compact-pipe-header .gen-status-chip { justify-self: end; }

  /* ── Expanded per-pipe stage body (shared .gen-stage-* owns list anatomy) ── */
  .compact-pipe-body .gen-progress-bar { margin-bottom: 10px; }

  /* ── Notes: tinted, icon-led, full-width bands ── */
  .gen-stale-note { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 9px 12px; border: 1px solid var(--warning-color, #fbbf24); border-radius: 7px; color: var(--warning-color, #fbbf24); background: color-mix(in srgb, var(--warning-color, #fbbf24) 8%, transparent); font-size: 12px; line-height: 1.45; }
  .gen-stale-note-icon { flex: none; display: flex; align-items: center; }

  .gen-compose-note { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 9px 12px; border: 1px solid var(--border-color, #3f3f46); border-radius: 7px; font-size: 12px; line-height: 1.45; }
  .gen-compose-icon { flex: none; font-weight: 700; display: flex; align-items: center; }
  .gen-compose-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .gen-compose-note.ok { color: var(--success-color, #4ade80); border-color: color-mix(in srgb, var(--success-color, #4ade80) 40%, transparent); background: color-mix(in srgb, var(--success-color, #4ade80) 8%, transparent); }
  .gen-compose-note.warning, .gen-compose-note.info { color: var(--warning-color, #fbbf24); border-color: color-mix(in srgb, var(--warning-color, #fbbf24) 40%, transparent); background: color-mix(in srgb, var(--warning-color, #fbbf24) 8%, transparent); }
  .gen-compose-note.error { color: var(--error-color, #f87171); border-color: color-mix(in srgb, var(--error-color, #f87171) 40%, transparent); background: color-mix(in srgb, var(--error-color, #f87171) 8%, transparent); }
  .gen-compose-detail { font: 11px var(--font-mono, 'JetBrains Mono', monospace); opacity: 0.85; overflow-wrap: anywhere; }

  /* ── Footer: consistent with the shared modal-footer button sizing ── */
  .gen-group-footer { padding: 14px 20px; gap: 10px; }
</style>