<script lang="ts">
	// Generation progress modal (decision D6): one dialog shows all stages
	// (sub-images first, then the final video), polled live. NO X button —
	// while the task is active, Esc/backdrop is ignored with a toast; the
	// dialog closes on terminal states or via "Cancel all".
	import type { GenerationTaskView } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import '../composer-modal.css';

	let {
		task,
		busy,
		open = $bindable(false),
		onCancel,
		onClose,
	} = $props<{
		/** Latest polled task view (null = first tick pending) */
		task: GenerationTaskView | null;
		/** Task still active (queued/running) */
		busy: boolean;
		open: boolean;
		onCancel: () => void;
		onClose: () => void;
	}>();

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	function statusLabel(status: GenerationTaskView['status']): string {
		return status === 'running' ? 'running…' : status;
	}

	function tryClose() {
		if (busy) {
			flashToast(APP_CONSTANTS.strings.taskNotFinished, 'info');
			return;
		}
		onClose();
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
								{stage.status}{stage.error ? ` · ${stage.error}` : ''}
							</span>
						</li>
					{/each}
				</ul>
				{#if task.error}
					<p class="gen-task-error" role="alert">{task.error}</p>
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

	.gen-cancel-all {
		border: 1px solid rgba(239, 68, 68, 0.4);
	}

	.gen-cancel-all:hover {
		background: rgba(239, 68, 68, 0.12);
	}
</style>
