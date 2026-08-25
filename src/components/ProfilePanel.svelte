<script lang="ts">
	import type { ProjectData, SessionData } from '$types';

	let {
		userName,
		projects,
		selectedProjectId,
		selectedSessionId
	} = $props<{
		userName: string;
		projects: ProjectData[];
		selectedProjectId: string | null;
		selectedSessionId: string | null;
	}>();

	// Calculate real stats from projects
	let totalSessions = $derived(
		projects.reduce((acc, p) => acc + p.sessions.length, 0)
	);

	let totalGenerations = $derived(
		projects.reduce((acc, p) => acc + p.totalGenerations, 0)
	);

	let storageUsed = $derived(
		Math.round(projects.reduce((acc, p) => {
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
		flex: 1;
		overflow: hidden;
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
		overflow-y: auto;
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