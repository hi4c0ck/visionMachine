<script lang="ts">
	// Left-side account list on the welcome page. Row = auto-login,
	// × = delete (modal flow when the account owns data).
	let {
		accounts = [],
		onAccountClick,
		onDeleteClick,
	} = $props<{
		accounts: Array<{
			id: string;
			name: string;
			sessions: number;
			images: number;
			videos: number;
			has_data: boolean;
		}>;
		onAccountClick: (account: (typeof accounts)[0]) => void;
		onDeleteClick: (account: (typeof accounts)[0]) => void;
	}>();

	function initial(name: string) {
		return (name.trim().charAt(0) || '?').toUpperCase();
	}
</script>

<aside class="accounts-panel" aria-label="Accounts">
	<h2 class="accounts-title">Accounts</h2>
	<div class="accounts-list">
		{#each accounts as account (account.id)}
			<div
				class="account-row"
				role="button"
				tabindex="0"
				title="Continue as {account.name}"
				onclick={() => onAccountClick(account)}
				onkeydown={(e) => e.key === 'Enter' && onAccountClick(account)}>
				<span class="account-avatar">{initial(account.name)}</span>
				<span class="account-name">{account.name}</span>
				{#if account.has_data}
					<span class="account-stats"
						>{account.sessions + account.images + account.videos} items</span
					>
				{/if}
				<button
					class="account-delete"
					title="Delete {account.name}"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={(e) => {
						e.stopPropagation();
						onDeleteClick(account);
					}}>×</button>
			</div>
		{/each}
	</div>
</aside>

<style>
	.accounts-panel {
		width: 260px;
		max-height: 420px;
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 16px;
		box-shadow: var(--shadow-md);
	}

	.accounts-title {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.accounts-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
	}

	.account-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.account-row:hover,
	.account-row:focus-visible {
		background: var(--bg-tertiary);
		border-color: var(--border);
		outline: none;
	}

	.account-avatar {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.9rem;
		background: var(--accent-glow);
		color: var(--accent);
	}

	.account-name {
		flex: 1;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.account-stats {
		font-size: 0.7rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.account-delete {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.85rem;
		cursor: pointer;
		opacity: 0;
		transition: all var(--transition-fast);
	}

	.account-row:hover .account-delete,
	.account-delete:focus-visible {
		opacity: 1;
	}

	.account-delete:hover {
		background: rgba(220, 38, 38, 0.25);
		color: #ff6b6b;
	}
</style>
