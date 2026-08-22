<script lang="ts">
	let { userName, storageUsed, oncreateSession } = $props<{
		userName: string;
		storageUsed: number;
		oncreateSession?: () => void;
	}>();

	function handleCreateSession() {
		oncreateSession?.();
	}
</script>

<div class="profile-panel" role="complementary" aria-label="User profile">
	<div class="profile-header">
		<div class="user-avatar">{userName.charAt(0).toUpperCase()}</div>
		<div class="user-info">
			<div class="user-name">{userName}</div>
			<div class="user-storage">Storage: {storageUsed} MB</div>
		</div>
	</div>

	<div class="profile-sections">
		<div class="section-item">
			<span class="section-label">Sessions</span>
			<span class="section-value">3</span>
		</div>
		<div class="section-item">
			<span class="section-label">Projects</span>
			<span class="section-value">5</span>
		</div>
	</div>

	<button class="btn-create-session" onclick={handleCreateSession}>
		Create Session
	</button>
</div>

<style>
	.profile-panel {
		width: 200px;
		min-width: 180px;
		max-width: 240px;
		background: var(--bg-secondary, #3C3F46);
		border-left: 1px solid var(--border-color, #4E525A);
		display: flex;
		flex-direction: column;
		padding: 12px;
		gap: 16px;
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.user-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-storage {
		font-size: 0.7rem;
		color: var(--text-muted, #808080);
	}

	.profile-sections {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 10px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 4px;
	}

	.section-label {
		font-size: 0.8rem;
		color: var(--text-secondary, #BFBFBF);
	}

	.section-value {
		font-size: 0.85rem;
		color: var(--text-primary, #EEEEEE);
		font-weight: 500;
	}

	.btn-create-session {
		padding: 10px;
		background: var(--accent-primary, #59B5FF);
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		margin-top: auto;
	}

	.btn-create-session:hover {
		background: var(--accent-primary-hover, #7EC8FF);
	}
</style>
