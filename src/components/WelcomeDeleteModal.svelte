<script lang="ts">
	// Delete-account confirmation: shows the data stats, and the
	// unchecked-by-default "Delete all data" checkbox. Unchecked =
	// generated data is preserved in the user cache folder first.
	//
	// Uses the shared modal chrome (composer-modal.css) so it follows the
	// same design flow as every other dialog: .modal-overlay / .modal /
	// .modal-header / .modal-body / .modal-footer with btn-cancel + a
	// danger-tinted btn-confirm (the destructive action, so it reads red
	// via the theme tokens instead of a hardcoded hex).
	import './composer-modal.css';

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
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label="Delete {account.name}"
			onpointerdown={(e) => e.stopPropagation()}
		>
			<div class="modal-header">
				<h3>Delete “{account.name}”?</h3>
				<span class="modal-sub">
					This account still has generated data. Unchecking “Delete all data”
					saves it to your cache folder before the account is removed.
				</span>
			</div>

			<div class="modal-body">
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
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" disabled={busy} onclick={onCancel}>
					Cancel
				</button>
				<button
					class="btn-confirm btn-confirm-danger"
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
	/* Body-only chrome: the overlay, dialog shell, header/footer and the
	   action buttons all come from the shared composer-modal.css. */
	.delete-stats {
		display: flex;
		gap: 10px;
	}

	.stat {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 10px 6px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
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
		margin: 0;
	}

	.delete-all {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-primary);
		cursor: pointer;
		margin: 0;
	}

	.delete-all input {
		width: 16px;
		height: 16px;
		accent-color: var(--accent-color);
		cursor: pointer;
	}
</style>
