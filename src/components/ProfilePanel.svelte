<script lang="ts">
	import type { ProjectData } from '$types';

	let {
		userName,
		projects,
		onopensettings,
		onlogout,
	} = $props<{
		userName: string;
		projects: ProjectData[];
		/** Opens the settings modal (defaults tab). */
		onopensettings?: () => void;
		/** Sign the user out (moved here from the top bar — the profile row
		 *  is the single sign-out entry point, next to Settings). */
		onlogout?: () => void;
	}>();

	// Compact stats: one mono strip at the bottom, derived from projects.
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
	<!-- Profile row: avatar + name + the two account actions (Settings is the
	     NOTABLE one — accent-tinted; Logout sits right next to it). -->
	<div class="profile-row">
		<div class="user-avatar" aria-hidden="true">{userName.charAt(0).toUpperCase()}</div>
		<div class="user-name" title={userName}>{userName}</div>
		<div class="profile-actions">
			<button
				type="button"
				class="profile-icon settings"
				onclick={onopensettings}
				title="Settings"
				aria-label="Open settings">
				<!-- Feather "settings" gear, stroke 1.6 (Atlas language) -->
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
			</button>
			<button
				type="button"
				class="profile-icon logout"
				onclick={onlogout}
				title="Log out"
				aria-label="Log out">
				<!-- Feather "log-out", stroke 1.6 -->
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Compact stats strip: S/P/G + storage on ONE muted mono line. -->
	<div class="profile-stats" aria-label="Workspace stats">
		<span title="Sessions"><b>{totalSessions}</b> S</span>
		<span class="dot" aria-hidden="true">·</span>
		<span title="Projects"><b>{projects.length}</b> P</span>
		<span class="dot" aria-hidden="true">·</span>
		<span title="Generations"><b>{totalGenerations}</b> G</span>
		<span class="dot" aria-hidden="true">·</span>
		<span title="Storage used">{storageUsed} MB</span>
	</div>
</div>

<style>
	/* Compact bottom block of the left column. Two rows: the profile row
	   (avatar + name + account icons) and a one-line stats strip. */
	.profile-panel {
		width: 100%;
		background: var(--bg-secondary, #14141f);
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		border-top: 1px solid var(--border-color, #2a2a3a);
		/* Pin at the bottom of the left column at its natural height: the
		   projects panel above absorbs free space + scrolls internally. */
		flex-shrink: 0;
		margin-top: auto;
		overflow: hidden;
	}

	/* ── Profile row ── */
	.profile-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.user-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent, #59b5ff);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.user-name {
		flex: 1;
		min-width: 0;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-primary, #ffffff);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.profile-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.profile-icon {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		background: transparent;
		border: 1px solid var(--border-color, #2a2a3a);
		color: var(--text-secondary, #bfbfbf);
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background 0.15s ease,
			box-shadow 0.15s ease;
	}

	.profile-icon svg {
		width: 16px;
		height: 16px;
	}

	/* Settings = the NOTABLE account action: accent-tinted so it reads as
	   the primary "go somewhere" control of this block. */
	.profile-icon.settings {
		color: var(--accent, #59b5ff);
		border-color: color-mix(in srgb, var(--accent, #59b5ff) 45%, var(--border-color, #2a2a3a));
		background: color-mix(in srgb, var(--accent, #59b5ff) 10%, transparent);
	}
	.profile-icon.settings:hover {
		border-color: var(--accent, #59b5ff);
		box-shadow: 0 0 10px var(--accent-glow, rgba(89, 181, 255, 0.35));
	}

	/* Logout = destructive-ish, but quiet: plain, only warms on hover. */
	.profile-icon.logout:hover {
		color: var(--text-primary, #ffffff);
		border-color: var(--text-muted, #6b6b80);
		background: var(--bg-tertiary, #27272a);
	}

	/* ── Compact stats strip ── */
	.profile-stats {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted, #6b6b80);
		white-space: nowrap;
		overflow: hidden;
	}

	.profile-stats b {
		color: var(--text-secondary, #bfbfbf);
		font-weight: 600;
	}

	.profile-stats .dot {
		opacity: 0.5;
	}
</style>
