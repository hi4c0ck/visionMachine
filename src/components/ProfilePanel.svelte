<script lang="ts">
	import type { UserProfile } from '$types/app';

	interface Props {
		user: UserProfile;
		onUserNameChange: (name: string) => void;
		onThemeChange: (theme: string) => void;
		onExportProject: () => void;
		onImportProject: () => void;
	}

	let {
		user,
		onUserNameChange,
		onThemeChange,
		onExportProject,
		onImportProject,
	}: Props = $props();

	// Use $derived to keep displayName and currentTheme reactive to user prop changes
	let displayName = $derived(user.displayName);
	let currentTheme = $derived(user.theme);

	function handleUserNameChange(event: Event) {
		const target = event.target as HTMLInputElement;
		onUserNameChange(target.value);
	}

	function handleThemeChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		onThemeChange(target.value);
		applyTheme(target.value);
	}

	function applyTheme(theme: string) {
		document.documentElement.setAttribute('data-theme', theme);
	}

	function handleExport() {
		onExportProject();
	}

	function handleImport() {
		onImportProject();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			onUserNameChange(displayName);
		}
	}
</script>

<div class="profile-panel" role="region" aria-label="Profile panel">
	<div class="profile-header">
		<div class="avatar" aria-hidden="true">
			<span class="material-symbols-outlined">person</span>
		</div>
		<div class="user-info">
			<input
				type="text"
				value={displayName}
				oninput={handleUserNameChange}
				onkeydown={handleKeyDown}
				class="username-input"
				placeholder="Enter your name"
				aria-label="Display name"
			/>
			<div class="user-stats">
				<span>{user.projectsCreated} Projects</span>
				<span>{user.sessionTime}h Session</span>
			</div>
		</div>
	</div>

	<div class="settings-section">
		<label for="theme-select">Theme</label>
		<select
			id="theme-select"
			value={currentTheme}
			onchange={handleThemeChange}
			class="theme-select"
			aria-label="Select theme"
		>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
			<option value="jetbrains-dark">JetBrains Dark</option>
			<option value="github-light">GitHub Light</option>
		</select>
	</div>

	<div class="action-buttons">
		<button onclick={handleExport} class="btn-export" aria-label="Export project">
			<span class="material-symbols-outlined" aria-hidden="true">download</span>
			Export Project
		</button>
		<button onclick={handleImport} class="btn-import" aria-label="Import project">
			<span class="material-symbols-outlined" aria-hidden="true">upload</span>
			Import Project
		</button>
	</div>

	<div class="quick-actions">
		<button class="action-btn" aria-label="Settings">
			<span class="material-symbols-outlined" aria-hidden="true">settings</span>
			Settings
		</button>
		<button class="action-btn" aria-label="Help">
			<span class="material-symbols-outlined" aria-hidden="true">help</span>
			Help
		</button>
		<button class="action-btn" aria-label="About">
			<span class="material-symbols-outlined" aria-hidden="true">info</span>
			About
		</button>
	</div>
</div>

<style>
	.profile-panel {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 16px;
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--sidebar-border, #444);
	}

	.avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--accent-color, #4CAF50);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar .material-symbols-outlined {
		font-size: 28px;
		color: white;
	}

	.user-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.username-input {
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--border-color, #555);
		color: var(--text-primary, #f5f5f5);
		font-size: 16px;
		font-weight: 600;
		padding: 4px 0;
		width: 100%;
	}

	.username-input:focus {
		outline: none;
		border-bottom-color: var(--accent-color, #4CAF50);
	}

	.user-stats {
		display: flex;
		gap: 12px;
		font-size: 12px;
		color: var(--text-secondary, #aaa);
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.settings-section label {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.theme-select {
		padding: 8px 12px;
		background: var(--input-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
		cursor: pointer;
	}

	.action-buttons {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.btn-export,
	.btn-import {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-export:hover,
	.btn-import:hover {
		background: var(--button-hover, #4a4a4a);
		transform: translateY(-1px);
	}

	.btn-export span,
	.btn-import span {
		font-size: 18px;
	}

	.quick-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.action-btn {
		flex: 1;
		min-width: 80px;
		padding: 8px 12px;
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 12px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		transition: all 0.2s ease;
	}

	.action-btn:hover {
		background: var(--button-hover, #4a4a4a);
	}

	.action-btn .material-symbols-outlined {
		font-size: 20px;
	}
</style>
