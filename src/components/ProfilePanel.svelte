<script lang="ts">
	let {
		userName,
		storageUsed,
		oncreateSession
	} = $props<{
		userName: string;
		storageUsed: number;
		oncreateSession?: () => void;
	}>();

	function handleCreateSession() {
		oncreateSession?.();
	}

	function handleShortcut(toolId: string) {
		console.log(`[Profile] Quick tool shortcut: ${toolId}`);
	}
</script>

<div class="profile-panel" role="complementary" aria-label="User profile">
	<!-- User avatar and info -->
	<div class="profile-header">
		<div class="user-avatar">{userName.charAt(0).toUpperCase()}</div>
		<div class="user-info">
			<div class="user-name">{userName}</div>
			<div class="user-storage">Storage: {storageUsed} MB</div>
		</div>
	</div>

	<!-- Stats section -->
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

	<!-- Create session button -->
	<button class="btn-create-session" onclick={handleCreateSession}>
		Create Session
	</button>

	<!-- Diamond tool shortcuts at bottom -->
	<div class="shortcuts-diamonds">
		<button 
			class="diamond-shortcut" 
			onclick={() => handleShortcut('brush')}
			title="Quick Brush Tool"
		>
			◊
		</button>
		<button 
			class="diamond-shortcut" 
			onclick={() => handleShortcut('eraser')}
			title="Quick Eraser Tool"
		>
			◊
		</button>
		<button 
			class="diamond-shortcut" 
			onclick={() => handleShortcut('shape')}
			title="Quick Shape Tool"
		>
			◊
		</button>
	</div>
</div>

<style>
	.profile-panel {
		width: 100%;
		background: var(--bg-secondary, #3C3F46);
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px;
		border-top: 1px solid var(--border-color, #4E525A);
	}

	/* ── Header ── */
	.profile-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.user-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-storage {
		font-size: 0.65rem;
		color: var(--text-muted, #808080);
	}

	/* ── Sections ── */
	.profile-sections {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.section-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 10px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 4px;
	}

	.section-label {
		font-size: 0.75rem;
		color: var(--text-secondary, #BFBFBF);
	}

	.section-value {
		font-size: 0.8rem;
		color: var(--text-primary, #EEEEEE);
		font-weight: 500;
	}

	/* ── Create Session Button ── */
	.btn-create-session {
		padding: 8px;
		background: var(--accent-primary, #59B5FF);
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-create-session:hover {
		background: var(--accent-primary-hover, #7EC8FF);
	}

	/* ── Diamond Shortcuts ── */
	.shortcuts-diamonds {
		display: flex;
		justify-content: center;
		gap: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--border-color, #4E525A);
		margin-top: auto;
	}

	.diamond-shortcut {
		width: 32px;
		height: 32px;
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 4px;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.diamond-shortcut:hover {
		background: var(--accent-primary, #59B5FF);
		color: white;
		border-color: var(--accent-primary, #59B5FF);
		transform: rotate(45deg);
	}
</style>
