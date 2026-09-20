<script lang="ts">
	// Generation progress modal (D6): one dialog shows all stages
	// (sub-images first, then the final video), polled live. The modal is
	// NOT closable by backdrop click or Esc — only the footer button dismisses
	// it: "Cancel all" while the task is active, "OK" on a terminal state.
	import type { GenerationLogEntry, GenerationLogPiece, GenerationTaskView } from '$types';
	import { readMediaText } from '$lib/mediaUrl';
	import { generationFailureMessage } from '$lib/generationErrors';
	import '../composer-modal.css';

	let {
		task,
		busy,
		open = $bindable(false),
		onCancel,
		onClose,
		onMinimize,
		onRefresh,
		logEntry = null,
	} = $props<{
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
		/** Portable generation log entry (Phase 4): shows WHICH MODEL made
		 * each piece + the taskId, so a later re-generation knows what to
		 * match or swap. null until the log write lands. */
		logEntry?: GenerationLogEntry | null;
	}>();

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
</script>

{#if open}
	<div class="modal-overlay" role="presentation">
		<div
			class="modal gen-progress-modal"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<h3>Generation {task ? `— ${task.pipeId.slice(0, 8)}` : ''}</h3>
				{#if task}
					<span class="modal-sub">Task {task.taskId.slice(0, 8)} · {statusLabel(task.status)}</span>
					{#if headerModels.length > 0}
						<span class="modal-sub gen-models-sub">{headerModels.join(' · ')}</span>
					{/if}
				{/if}
			</div>
			<div class="modal-body">
				{#if task}
					<div class="gen-progress-bar" role="progressbar" aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
						<div class="gen-progress-fill" style={`width: ${Math.round(task.progress * 100)}%`}></div>
					</div>
					<ul class="gen-stage-list">
						<!-- Key on id + label so the list stays collision-free even for
							 previously-persisted task rows whose stage ids predate the
							 unique-id fix (multiple keyframes shared one id). -->
						{#each task.stages as stage (stage.id + ':' + stage.label)}
							<li
								class="gen-stage"
								class:done={stage.status === 'done' || stage.status === 'ready'}
								class:error={stage.status === 'error'}
								class:cancelled={stage.status === 'cancelled'}
								class:ratelimited={stage.status === 'rate-limited'}
							>
								<span class="gen-stage-label">{stage.label}</span>
								<span class="gen-stage-status">
									{#if modelFor(stage)}
										<span class="gen-stage-model">{modelFor(stage)}</span>
									{/if}
									{#if stage.status === 'rate-limited'}
										<span class="gen-stage-ratehint" aria-live="polite">rate-limited — waiting for provider window…</span>
									{:else}
										{stage.status}{stage.error ? ` · ${stage.error}` : ''}
									{/if}
									<!-- Live engine state line (lastEvent): the terse "what it's
									     doing now" (e.g. "queue full — retry in 30 s", "rendering
									     42%") so a long provider wait reads as alive, not stuck.
									     Full detail stays in the redacted request log below. -->
									{#if stage.lastEvent}
										<span class="gen-stage-lastevent" aria-live="polite">{stage.lastEvent}</span>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
					<!-- Task-level error (if any) always shown; when missing on an
						     error terminal state, fall back to the concrete per-stage
						     summary so the user sees WHY it failed, not nothing. -->
					{#if task.status === 'error'}
						{@const errText = task.error?.trim() || generationFailureMessage(task) || 'Generation failed'}
						<p class="gen-task-error" role="alert">{errText}</p>
					{:else if task.status === 'cancelled'}
						<p class="gen-task-cancelled" role="status">Generation cancelled</p>
					{/if}
					{#if task.requestLog}
						{@const logKnown = logTextForTask === task.taskId}
						{@const logEmpty = logKnown && (!logText || !logText.trim())}
						<button class="gen-log-toggle" onclick={toggleRequestLog}>
							{logExpanded ? 'Hide request log' : 'Show request log (redacted)'}
						</button>
						{#if logExpanded}
							{#if logLoading}
								<span class="gen-log-loading">loading…</span>
							{:else if logText && logText.trim()}
								<pre class="gen-log-body">{logText}</pre>
							{:else}
								{#if logEmpty}
									<span class="gen-log-loading">no request log entries yet — entries land as each stage runs</span>
								{:else}
									<span class="gen-log-loading">no request log yet</span>
								{/if}
							{/if}
						{/if}
					{:else}
						<!-- No backend log path (DB-fallback row or browser dev):
						     keep the expander visible so the user can see the
						     state instead of a silently-missing feature. -->
						<button class="gen-log-toggle" onclick={toggleRequestLog} disabled>
							request log unavailable (live view required)
						</button>
					{/if}
				{:else}
					<!-- First poll tick pending: the task exists server-side but the
					     view has not been fetched yet. Show a loading line instead of
					     an empty modal so the user knows the start was registered. -->
					<p class="gen-task-pending" role="status">Task started — waiting for first progress report…</p>
				{/if}
			</div>
			<div class="modal-footer">
				<!-- Manual re-sync: re-pull the authoritative view so a
					 throttled/dropped event stream can't leave the modal stale. -->
				<button class="gen-refresh" onclick={onRefresh} title="Refresh current state">
					Refresh
				</button>
				{#if busy && elapsed}
					<span class="gen-elapsed" title="Elapsed since the task started">⏱ {elapsed}</span>
				{/if}
				{#if lastActivity && busy}
					<span class="gen-lastactivity" title="Most recent engine state line">last: {lastActivity.text} · {lastActivity.when}</span>
				{/if}
				{#if busy}
					<button class="btn-cancel gen-cancel-all" onclick={onCancel} disabled={!task}>
						Cancel all
					</button>
					{#if onMinimize}
						<button class="btn-minimize" onclick={onMinimize} title="Hide the modal — the task keeps running in the background; click the pill to come back">
							Minimize
						</button>
					{/if}
				{:else}
					<!-- Terminal state (or first poll pending): OK is enabled only
						 when the task has actually reached a terminal state, so the
						 user acknowledges the real outcome before the modal closes.
						 Backdrop click and Esc are disabled (the overlay carries no
						 handler) — this modal is not closable by any other means. -->
					{@const okEnabled = task !== null && ['done', 'error', 'cancelled'].includes(task.status)}
					<button class="btn-confirm" onclick={onClose} disabled={!okEnabled}>
						{!okEnabled ? '…' : 'OK'}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.gen-progress-bar {
		height: 6px;
		border-radius: 3px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.06));
		overflow: hidden;
		margin-bottom: 12px;
	}

	.gen-progress-fill {
		height: 100%;
		background: var(--accent-color, #ff3e00);
		transition: width 0.3s ease;
	}

	.gen-stage-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.gen-stage {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 7px 10px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		font-size: 12px;
	}

	.gen-stage-label {
		color: var(--text-primary, #fff);
		font-weight: 500;
	}

	.gen-stage-status {
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		text-align: right;
	}

	.gen-stage.done {
		border-color: rgba(34, 197, 94, 0.5);
	}

	.gen-stage.done .gen-stage-status {
		color: #22c55e;
	}

	.gen-stage.error {
		border-color: rgba(239, 68, 68, 0.5);
	}

	.gen-stage.error .gen-stage-status {
		color: #ef4444;
	}

	.gen-stage.cancelled .gen-stage-status {
		color: var(--text-muted, #71717a);
	}

	.gen-stage.ratelimited {
		border-color: rgba(245, 158, 11, 0.5);
		background: rgba(245, 158, 11, 0.08);
	}

	.gen-stage.ratelimited .gen-stage-status {
		color: #f59e0b;
	}

	.gen-stage-ratehint {
		display: inline-block;
		font-size: 10px;
		color: #f59e0b;
		font-family: 'JetBrains Mono', monospace;
		animation: pulse-rl 1.2s ease-in-out infinite;
	}

	.gen-stage-lastevent {
		display: block;
		font-size: 10px;
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
		margin-top: 2px;
		font-style: italic;
	}

	.gen-stage.ratelimited .gen-stage-lastevent {
		color: #f59e0b;
	}

	@keyframes pulse-rl {
		0%, 100% { opacity: 0.55; }
		50% { opacity: 1; }
	}

	.gen-task-error {
		margin: 10px 0 0;
		font-size: 12px;
		color: #ef4444;
	}

	.gen-task-pending {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--text-muted, #71717a);
	}

	.gen-task-cancelled {
		margin: 10px 0 0;
		font-size: 12px;
		color: var(--text-muted, #71717a);
	}

	.gen-models-sub {
		display: block;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--text-muted, #71717a);
		margin-top: 4px;
	}

	.gen-stage-model {
		display: block;
		font-size: 10px;
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
	}

	.gen-cancel-all {
		border: 1px solid rgba(239, 68, 68, 0.4);
	}

	.gen-cancel-all:hover {
		background: rgba(239, 68, 68, 0.12);
	}

	.gen-elapsed {
		margin-left: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: var(--text-muted, #71717a);
	}

	.gen-lastactivity {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		color: var(--text-muted, #71717a);
		opacity: 0.8;
	}

	.btn-minimize {
		background: none;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		color: var(--text-muted, #71717a);
		font-size: 11px;
		font-family: 'JetBrains Mono', monospace;
		padding: 5px 10px;
		cursor: pointer;
	}

	.btn-minimize:hover {
		color: var(--text-primary, #fff);
		border-color: var(--text-muted, #71717a);
		background: rgba(255, 255, 255, 0.08);
	}

	.gen-log-toggle {
		margin-top: 10px;
		background: none;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		color: var(--text-muted, #71717a);
		font-size: 11px;
		font-family: 'JetBrains Mono', monospace;
		padding: 5px 10px;
		cursor: pointer;
	}

	.gen-log-toggle:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.gen-log-toggle:hover {
		color: var(--text-primary, #fff);
		border-color: var(--text-muted, #71717a);
	}

	.gen-log-body {
		margin: 8px 0 0;
		max-height: 180px;
		overflow: auto;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 10px;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted, #71717a);
		white-space: pre-wrap;
		word-break: break-all;
	}

	.gen-log-loading {
		display: block;
		margin-top: 10px;
		font-size: 11px;
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
	}

	.gen-refresh {
		background: none;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		color: var(--text-muted, #71717a);
		font-size: 11px;
		font-family: 'JetBrains Mono', monospace;
		padding: 5px 10px;
		cursor: pointer;
	}

	.gen-refresh:hover {
		color: var(--text-primary, #fff);
		background: rgba(255, 255, 255, 0.08);
	}
</style>
