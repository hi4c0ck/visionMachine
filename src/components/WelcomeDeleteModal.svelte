<script lang="ts">
	// Delete-account confirmation: shows the data stats, and the
	// unchecked-by-default "Delete all data" checkbox. Unchecked =
	// generated data is preserved in the user cache folder first.
	let {
		account = null,
		busy = false,
		onConfirm,
		onCancel,
	} = $props<{
		account: {
			id: string;
			name: string;
			sessions: number;
			images: number;
			videos: number;
		} | null;
		busy?: boolean;
		onConfirm: (deleteAllData: boolean) => void;
		onCancel: () => void;
	}>();

	// Default: keep the data (save to cache folder) — user must opt in
	// to a full delete.
	let deleteAllData = $state(false);

	$effect(() => {
		// Every (re)open for an account starts unchecked.
		account?.id;
		if (account) deleteAllData = false;
	});
</script>

{#if account}
	<div
		class="modal-overlay"
		role="presentation"
		onpointerdown={() => !busy && onCancel()}
	>
		<div
			class="delete-modal"
			role="dialog"
			aria-modal="true"
			aria-label="Delete {account.name}"
			onpointerdown={(e) => e.stopPropagation()}
		>
			<h3 class="modal-title">Delete “{account.name}”?</h3>
			<p class="modal-sub">
				This account still has generated data. Unchecking “Delete all data”
				saves it to your cache folder before the account is removed.
			</p>

			<div class="delete-stats">
				<div class="stat">
					<span class="stat-value">{account.videos}</span>
					<span class="stat-label">videos</span>
				</div>
				<div class="stat">
					<span class="stat-value">{account.images}</span>
					<span class="stat-label">images</span>
				</div>
				<div class="stat">
					<span class="stat-value">{account.sessions}</span>
					<span class="stat-label">sessions</span>
				</div>
			</div>

			<p class="confirm-line">Are you sure you want to complete delete session?</p>

			<label class="delete-all">
				<input

					type="checkbox"

					checked={deleteAllData}

					disabled={busy}

					onchange={(e) => (deleteAllData = (e.target as HTMLInputElement).checked)}

				/>
				<span>Delete all data</span>
			</label>

			<div class="modal-actions">
				<button class="action-btn cancel" disabled={busy} onclick={onCancel}>
					Cancel
				</button>
				<button
					class="action-btn confirm"
					disabled={busy}
					onclick={() => onConfirm(deleteAllData)}
				>
					{busy ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.55);
	}

	.delete-modal {
		width: 380px;
		max-width: calc(100vw - 32px);
		padding: 24px;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-md);
		text-align: left;
	}

	.modal-title {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: 8px;
	}

	.modal-sub {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 18px;
		line-height: 1.4;
	}

	.delete-stats {
		display: flex;
		gap: 10px;
		margin-bottom: 16px;
	}

	.stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 10px 6px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.stat-value {
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.confirm-line {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 12px;
	}

	.delete-all {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-primary);
		cursor: pointer;
		margin-bottom: 20px;
	}

	.delete-all input {
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.action-btn {
		padding: 9px 20px;
		border-radius: 8px;
		font-size: 0.9rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		border: 1px solid var(--border);
		transition: all var(--transition-fast);
	}

	.action-btn.cancel {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.action-btn.cancel:hover:not(:disabled) {
		border-color: var(--text-muted);
	}

	.action-btn.confirm {
		background: #dc2626;
		border-color: #dc2626;
		color: #fff;
	}

	.action-btn.confirm:hover:not(:disabled) {
		background: #b91c1c;
		border-color: #b91c1c;
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
