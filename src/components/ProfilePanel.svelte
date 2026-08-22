<script lang="ts">
	let {
		userName,
		userEmail,
		storageUsed,
		oncreateSession
	} = $props<{
		userName: string;
		userEmail?: string;
		storageUsed: number;
		oncreateSession?: () => void;
	}>();

	let sessions = $state<Array<{ id: string; name: string; status: string }>>([]);
	let showCreateSession = $state(false);
</script>

<aside class="profile-panel">
	<div class="profile-header">
		<h3>Profile</h3>
		<button class="session-btn" onclick={() => showCreateSession = !showCreateSession} title="Manage Sessions">
			🔗 Sessions
		</button>
	</div>

	<div class="profile-content">
		<div class="avatar-section">
			<div class="avatar">{userName?.charAt(0).toUpperCase() ?? '?'}</div>
			<div class="user-info">
				<div class="user-name">{userName || 'Guest'}</div>
				{#if userEmail}
					<div class="user-email">{userEmail}</div>
				{/if}
				<div class="user-status">
					<span class="status-dot"></span>
					<span>Online</span>
				</div>
			</div>
		</div>

		<div class="storage-section">
			<div class="storage-label">Storage Used</div>
			<div class="storage-bar">
				<div class="storage-fill" style="width: {Math.min(storageUsed * 10, 100)}%"></div>
			</div>
			<div class="storage-text">{storageUsed}GB / 10GB</div>
		</div>

		<!-- Sessions List -->
		{#if sessions.length > 0}
			<div class="sessions-section">
				<div class="section-header">
					<span>Active Sessions</span>
					<button class="add-session-btn" onclick={() => oncreateSession?.()}>+</button>
				</div>
				<div class="session-list">
					{#each sessions as session (session.id)}
						<div class="session-item {session.status}">
							<span class="session-name">{session.name}</span>
							<span class="session-status">{session.status}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Quick Actions -->
		<div class="actions">
			<button class="action-btn" title="Open Folder">📁</button>
			<button class="action-btn" title="Settings">⚙️</button>
			<button class="action-btn" title="Statistics">📊</button>
			<button class="action-btn" title="Help">❓</button>
		</div>
	</div>

	<!-- Create Session Modal -->
	{#if showCreateSession}
		<div class="create-session-modal">
			<div class="modal-content">
				<h4>Create New Session</h4>
				<input type="text" placeholder="Session name..." class="session-input" />
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => showCreateSession = false}>Cancel</button>
					<button class="btn-create" onclick={() => {
						const name = document.querySelector('.session-input')?.value;
						if (name) {
							sessions = [...sessions, { id: Date.now().toString(), name, status: 'active' }];
							oncreateSession?.();
							showCreateSession = false;
						}
					}}>Create</button>
				</div>
			</div>
		</div>
	{/if}
</aside>

<style>
	.profile-panel {
		display: flex;
		flex-direction: column;
		width: 240px;
		background: var(--bg-secondary, #3C3F46);
		border-left: 1px solid var(--border-color, #4E525A);
		flex-shrink: 0;
		position: relative;
	}

	.profile-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.profile-header h3 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-secondary, #BFBFBF);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.session-btn {
		padding: 4px 10px;
		background: var(--bg-tertiary, #4E525A);
		border: none;
		border-radius: 4px;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 0.75rem;
		transition: all 0.15s ease;
	}

	.session-btn:hover {
		background: var(--accent-primary, #59B5FF);
		color: white;
	}

	.profile-content {
		flex: 1;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		overflow-y: auto;
	}

	.avatar-section {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--accent-primary, #59B5FF), var(--accent-secondary, #BB88EE));
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.4rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.user-name {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-primary, #EEEEEE);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-email {
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-status {
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #4CAF50;
		display: inline-block;
		box-shadow: 0 0 6px rgba(76, 175, 80, 0.5);
	}

	.storage-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.storage-label {
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.storage-bar {
		height: 8px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 4px;
		overflow: hidden;
	}

	.storage-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent-primary, #59B5FF), var(--accent-secondary, #BB88EE));
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.storage-text {
		font-size: 0.75rem;
		color: var(--text-secondary, #BFBFBF);
	}

	.sessions-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.add-session-btn {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		border: none;
		color: white;
		cursor: pointer;
		font-size: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.add-session-btn:hover {
		background: var(--accent-primary-hover, #7EC8FF);
		transform: scale(1.1);
	}

	.session-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.session-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 6px;
		font-size: 0.8rem;
	}

	.session-item.active {
		border-left: 3px solid #4CAF50;
	}

	.session-item.paused {
		border-left: 3px solid #FF9800;
	}

	.session-name {
		color: var(--text-primary, #EEEEEE);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.session-status {
		font-size: 0.65rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
	}

	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		padding-top: 12px;
		border-top: 1px solid var(--border-color, #4E525A);
	}

	.action-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-tertiary, #4E525A);
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 1.1rem;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: var(--accent-primary, #59B5FF);
		transform: translateY(-2px);
	}

	/* Modal */
	.create-session-modal {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--bg-secondary, #3C3F46);
		border-top: 1px solid var(--border-color, #4E525A);
		padding: 16px;
		z-index: 100;
		animation: slideUp 0.2s ease;
	}

	@keyframes slideUp {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.modal-content h4 {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-primary, #EEEEEE);
	}

	.session-input {
		padding: 8px 12px;
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-primary, #EEEEEE);
		font-size: 0.875rem;
	}

	.session-input:focus {
		outline: none;
		border-color: var(--accent-primary, #59B5FF);
	}

	.modal-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.btn-cancel, .btn-create {
		padding: 6px 16px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s ease;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid var(--border-color, #4E525A);
		color: var(--text-muted, #808080);
	}

	.btn-cancel:hover {
		background: var(--bg-tertiary, #4E525A);
	}

	.btn-create {
		background: var(--accent-primary, #59B5FF);
		border: none;
		color: white;
	}

	.btn-create:hover {
		background: var(--accent-primary-hover, #7EC8FF);
	}
</style>