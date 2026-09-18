<script lang="ts">
	// Generation progress modal (decision D6): one dialog shows all stages
	// (sub-images first, then the final video), polled live. NO X button —
	// while the task is active, Esc/backdrop is ignored with a toast; the
	// dialog closes on terminal states or via "Cancel all".
	import type { GenerationLogEntry, GenerationLogPiece, GenerationTaskView } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { readMediaText } from '$lib/mediaUrl';
	import '../composer-modal.css';

	let {
		task,
		busy,
		open = $bindable(false),
		onCancel,
		onClose,
		logEntry = null,
	} = $props<{
		/** Latest polled task view (null = first tick pending) */
		task: GenerationTaskView | null;
		/** Task still active (queued/running) */
		busy: boolean;
		open: boolean;
		onCancel: () => void;
		onClose: () => void;
		/** Portable generation log entry (Phase 4): shows WHICH MODEL made
		 * each piece + the taskId, so a later re-generation knows what to
		 * match or swap. null until the log write lands. */
		logEntry?: GenerationLogEntry | null;
	}>();

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

	function tryClose() {
		if (busy) {
			flashToast(APP_CONSTANTS.strings.taskNotFinished, 'info');
			return;
		}
		onClose();
	}

	// Redacted request-log expander (E1): the engine writes keys masked to
	// [API_KEY] on disk, so fetching + showing it is safe.
	let logExpanded = $state(false);
	let logText = $state<string | null>(null);
	let logLoading = $state(false);
	async function toggleRequestLog() {
		logExpanded = !logExpanded;
		if (!logExpanded) return;
		if (logText) return;
		const path = task?.requestLog ?? null;
		if (!path) return;
		logLoading = true;
		try {
			logText = await readMediaText(path);
		} finally {
			logLoading = false;
		}
	}
</script>

{#if open && task}
	<div class="modal-overlay" onclick={tryClose} role="presentation">
		<div
			class="modal gen-progress-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && tryClose()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<h3>Generation — {task.pipeId.slice(0, 8)}</h3>
				<span class="modal-sub">Task {task.taskId.slice(0, 8)} · {statusLabel(task.status)}</span>
				{#if headerModels.length > 0}
					<span class="modal-sub gen-models-sub">{headerModels.join(' · ')}</span>
				{/if}
			</div>
			<div class="modal-body">
				<div class="gen-progress-bar" role="progressbar" aria-valuenow={Math.round(task.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
					<div class="gen-progress-fill" style={`width: ${Math.round(task.progress * 100)}%`}></div>
				</div>
				<ul class="gen-stage-list">
					{#each task.stages as stage (stage.id)}
						<li
							class="gen-stage"
							class:done={stage.status === 'done' || stage.status === 'ready'}
							class:error={stage.status === 'error'}
							class:cancelled={stage.status === 'cancelled'}
						>
							<span class="gen-stage-label">{stage.label}</span>
							<span class="gen-stage-status">
								{#if modelFor(stage)}
									<span class="gen-stage-model">{modelFor(stage)}</span>
								{/if}
								{stage.status}{stage.error ? ` · ${stage.error}` : ''}
							</span>
						</li>
					{/each}
				</ul>
				{#if task.error}
					<p class="gen-task-error" role="alert">{task.error}</p>
				{/if}
				{#if task.requestLog}
					<button class="gen-log-toggle" onclick={toggleRequestLog}>
						{logExpanded ? 'Hide request log' : 'Show request log (redacted)'}
					</button>
					{#if logExpanded}
						{#if logLoading}
							<span class="gen-log-loading">loading…</span>
						{:else if logText && logText.trim()}
							<pre class="gen-log-body">{logText}</pre>
						{:else}
							<span class="gen-log-loading">no request log yet</span>
						{/if}
					{/if}
				{/if}
			</div>
			<div class="modal-footer">
				{#if busy}
					<button class="btn-cancel gen-cancel-all" onclick={onCancel}>
						Cancel all
					</button>
				{:else}
					<button class="btn-confirm" onclick={onClose}>
						Close
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

	.gen-task-error {
		margin: 10px 0 0;
		font-size: 12px;
		color: #ef4444;
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
		margin-top: 8px;
		font-size: 11px;
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
	}
</style>
