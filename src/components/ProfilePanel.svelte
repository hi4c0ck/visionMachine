<script lang="ts">
	import type { ProjectData, SessionData } from '$types';

	let {
		userName,
		projects,
		selectedProjectId,
		selectedSessionId,
		onopensettings,
	} = $props<{
		userName: string;
		projects: ProjectData[];
		selectedProjectId: string | null;
		selectedSessionId: string | null;
		/** Opens the settings modal (defaults tab). */
		onopensettings?: () => void;
	}>();

	// Calculate real stats from projects
	let totalSessions = $derived(
		projects.reduce((acc: number, p: ProjectData) => acc + p.sessions.length, 0)
	);

	let totalGenerations = $derived(
		projects.reduce((acc: number, p: ProjectData) => acc + p.totalGenerations, 0)
	);

	let storageUsed = $derived(
		Math.round(projects.reduce((acc: number, p: ProjectData) => {
			// Rough estimate: each project/session metadata is ~1KB
			return acc + (1 + p.sessions.length) * 1;
		}, 0))
	);
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
			<span class="section-value">{totalSessions}</span>
		</div>
		<div class="section-item">
			<span class="section-label">Projects</span>
			<span class="section-value">{projects.length}</span>
		</div>
		<div class="section-item">
			<span class="section-label">Generations</span>
			<span class="section-value">{totalGenerations}</span>
		</div>
	</div>

	<!-- Settings entry point (Phase 3): per-profile settings + providers -->
	<button class="settings-entry" onclick={onopensettings}>
		<span>Settings</span>
		<span class="settings-entry-chev">›</span>
	</button>
</div>

<style>
	.profile-panel {
		width: 100%;
		background: var(--bg-secondary, #3C3F46);
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		border-top: 1px solid var(--border-color, #4E525A);
		flex-shrink: 0;
		/* Sit compact at the bottom of the left column; the projects list
			   above absorbs the free space. Also pins correctly in 'single'
			   layout mode where the profile is the only child. */
		margin-top: auto;
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

	.settings-entry {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 7px 10px;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text-secondary, #BFBFBF);
		background: transparent;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.settings-entry:hover {
		background: var(--bg-tertiary, #4E525A);
		color: var(--text-primary, #EEEEEE);
	}

	.settings-entry-chev {
		color: var(--text-muted, #808080);
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
</style>