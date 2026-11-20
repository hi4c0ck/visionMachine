<script lang="ts">
	// Error modal — shows generation error details with expandable text,
	// copy button, and close. Used for healed/interrupted tasks and
	// transport errors. The error is acknowledged (hidden) on close.

	let {
		open = false,
		title = 'Generation Error',
		message = '',
		onclose,
	} = $props<{
		open?: boolean;
		title?: string;
		message?: string;
		onclose?: () => void;
	}>();

	let expanded = $state(false);
	let copied = $state(false);

	function handleCopy() {
		navigator.clipboard.writeText(message).then(() => {
			copied = true;
			setTimeout(() => (copied = false), 2000);
		});
	}

	function handleClose() {
		expanded = false;
		copied = false;
		onclose?.();
	}
</script>

{#if open}
	<div class="modal-overlay" role="presentation" onclick={handleClose}>
		<div
			class="modal error-modal"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-header">
				<h3>{title}</h3>
				<button class="modal-close" onclick={handleClose} aria-label="Close">×</button>
			</div>
			<div class="modal-body">
				{#if expanded}
					<pre class="error-text expanded">{message}</pre>
				{:else}
					<pre class="error-text">{message}</pre>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn btn-secondary" onclick={() => (expanded = !expanded)}>
					{expanded ? 'Collapse' : 'Expand'}
				</button>
				<button class="btn btn-secondary" onclick={handleCopy}>
					{copied ? 'Copied!' : 'Copy'}
				</button>
				<button class="btn btn-primary" onclick={handleClose}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.error-modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		max-width: 480px;
		width: 90%;
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 12px;
		border-bottom: 1px solid var(--border);
	}
	.modal-header h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	.modal-close {
		background: none;
		border: none;
		font-size: 18px;
		cursor: pointer;
		color: var(--text-muted);
		padding: 0;
		width: 24px;
		height: 24px;
		line-height: 1;
		flex-shrink: 0;
	}
	.modal-close:hover {
		color: var(--text-primary);
	}
	.modal-body {
		padding: 12px;
		overflow: auto;
		flex: 1;
	}
	.error-text {
		background: var(--bg-tertiary);
		padding: 8px;
		border-radius: 4px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 120px;
		overflow: auto;
		margin: 0;
		color: var(--text-secondary);
	}
	.error-text.expanded {
		max-height: 40vh;
	}
	.modal-footer {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
	}
	.btn {
		padding: 6px 12px;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-primary);
		cursor: pointer;
		font-size: 12px;
	}
	.btn-primary {
		background: var(--accent-color);
		color: white;
		border-color: var(--accent-color);
	}
	.btn:hover {
		opacity: 0.9;
	}
</style>
