<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke, isTauri } from '@tauri-apps/api/core';
	import Workspace from './components/Workspace.svelte';
	import Footer from './components/Footer.svelte';
	import ErrorHandler from './components/ErrorHandler.svelte';
	import WelcomeAccounts from './components/WelcomeAccounts.svelte';
	import WelcomeDeleteModal from './components/WelcomeDeleteModal.svelte';
	import { APP_CONSTANTS } from '$constants';
	
	// State declarations - explicit reactive state
	// Show the name card only when no name is persisted; otherwise the
	// "cookie-like" restoration (vm-username) lands the user straight in
	// the workspace so re-entering the app never asks for the name again.
	let userName = $state('');
	let showWelcome = $state(false);
	let selectedTheme = $state('jetbrains-dark');
	let layoutMode = $state('landscape');
	let error = $state<string | null>(null);
	let runtimeError = $state<Error | null>(null);

	// Welcome-page account list (desktop only; empty in the browser).
	let accounts = $state<any[]>([]);
	let deleteTarget = $state<any | null>(null);
	let deleting = $state(false);
	let notice = $state('');
	
	// Derived state - properly reactive
	let isNameEmpty = $derived(!userName.trim().length);
	let canLogin = $derived(userName.trim().length > 0);
	
	// Load saved data from localStorage
	function loadAppData() {
		try {
			const savedProjects = localStorage.getItem('vm-projects');
			if (savedProjects) {
				return JSON.parse(savedProjects);
			}
		} catch (e) {
			console.error('[App] Failed to load projects:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to load saved data');
		}
		return null;
	}
	
	// Functions
	function applyTheme(theme: string) {
		document.documentElement.setAttribute('data-theme', theme);
		localStorage.setItem('vm-theme', theme);
	}
	
	function handleLogin() {
		const name = userName.trim();
		if (!name) {
			error = 'Please enter your name';
			return;
		}
		showWelcome = false;
		try {
			localStorage.setItem('vm-username', name);
		} catch (e) {
			console.error('[App] Failed to save username:', e);
			error = 'Failed to save user data';
		}
	}
	
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleLogin();
		}
	}
	
	function handleLogout() {
		// Forget the persisted name so the next launch asks for it again.
		try {
			localStorage.removeItem('vm-username');
		} catch (e) {
			console.error('[App] Failed to clear username:', e);
		}
		userName = '';
		deleteTarget = null;
		notice = '';
		showWelcome = true;
	}
	
	function handleThemeChange(theme: string) {
		selectedTheme = theme;
		applyTheme(theme);
	}
	
	function handleLayoutChange(mode: string) {
		layoutMode = mode;
		try {
			localStorage.setItem('vm-layout', mode);
		} catch (e) {
			console.error('[App] Failed to save layout:', e);
		}
	}
	
	function handleProjectsUpdate(projects: any[]) {
		try {
			localStorage.setItem('vm-projects', JSON.stringify(projects));
		} catch (e) {
			console.error('[App] Failed to save projects:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to save projects');
		}
	}

	// ── Welcome-page accounts ────────────────────────────────────────────
	async function loadAccounts() {
		if (!isTauri()) {
			accounts = [];
			return;
		}
		try {
			accounts = (await invoke('list_accounts')) as any[];
		} catch (e) {
			console.error('[App] Failed to load accounts:', e);
			accounts = [];
		}
	}

	// Row click = auto-login as that account.
	function handleAccountClick(account: any) {
		notice = '';
		userName = account.name;
		handleLogin();
	}

	// × click: confirm via modal when the account owns data,
	// otherwise delete directly (nothing to lose).
	function handleDeleteAccountClick(account: any) {
		notice = '';
		if (account.has_data) {
			deleteTarget = account;
		} else {
			performAccountDelete(account, false);
		}
	}

	async function performAccountDelete(account: any, deleteAllData: boolean) {
		if (!isTauri()) return;
		deleting = true;
		try {
			const result = (await invoke('delete_account', {
				input: { profile_id: account.id, delete_all_data: deleteAllData },
			})) as any;
			deleteTarget = null;
			notice = result?.cache_folder
				? `Data saved to ${result.cache_folder}`
				: `Account “${account.name}” deleted`;
			// Don't auto-login into a name whose account no longer exists.
			if (localStorage.getItem('vm-username') === account.name) {
				localStorage.removeItem('vm-username');
			}
			await loadAccounts();
		} catch (e) {
			console.error('[App] Failed to delete account:', e);
			error = `Failed to delete account: ${e}`;
		} finally {
			deleting = false;
		}
	}
	
	// Lifecycle
	onMount(() => {
		try {
			// Restore from localStorage
			const savedName = localStorage.getItem('vm-username');
			if (savedName) {
				userName = savedName;
				// A persisted name means the user already went through
				// onboarding — skip the welcome screen entirely.
			} else {
				showWelcome = true;
			}
			
			const savedTheme = localStorage.getItem('vm-theme');
			if (savedTheme) {
				selectedTheme = savedTheme;
			}
			
			const savedLayout = localStorage.getItem('vm-layout');
			if (savedLayout) {
				layoutMode = savedLayout;
			}
			
			applyTheme(selectedTheme);
			loadAccounts();
		} catch (e) {
			console.error('[App] Failed to restore state:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to restore application state');
		}
	});
</script>

<ErrorHandler error={runtimeError}>
	{#if showWelcome}
		<div class="app">
			<header class="header">
				<div class="logo-section">
					<span class="logo-text">{APP_CONSTANTS.strings.appName}</span>
					<span class="version-badge">v{APP_CONSTANTS.strings.version}</span>
				</div>
				
				<div class="controls">
					<select class="theme-select" value={selectedTheme} onchange={(e) => applyTheme(e.currentTarget.value)}>
						{#each APP_CONSTANTS.themes as theme}
							<option value={theme.id}>{theme.name}</option>
						{/each}
					</select>
				</div>
			</header>

			{#if error}
				<div class="error-banner">
					<span>{error}</span>
				</div>
			{/if}

			<main class="main">
				{#if accounts.length > 0}
					<WelcomeAccounts
						{accounts}
						onAccountClick={handleAccountClick}
						onDeleteClick={handleDeleteAccountClick}
					/>
				{/if}
				<div class="welcome-card">
					<h1 class="welcome-title">{APP_CONSTANTS.strings.welcomeTitle}</h1>
					<p class="hint">{APP_CONSTANTS.strings.enterName}</p>
					
					<input 
						value={userName}
						oninput={(e) => userName = e.currentTarget.value}
						placeholder={APP_CONSTANTS.strings.namePlaceholder} 
						class="input"
						type="text"
						onkeydown={handleKeyDown}
					/>
					
					<button 
						class="btn btn-primary" 
						disabled={isNameEmpty}
						onclick={handleLogin}
					>
						{APP_CONSTANTS.strings.getStarted}
					</button>
				</div>
			</main>

			{#if notice}
				<div class="notice-banner" role="status">
					<span>{notice}</span>
					<button class="notice-dismiss" title="Dismiss" onclick={() => (notice = '')}>×</button>
				</div>
			{/if}

			<WelcomeDeleteModal
				account={deleteTarget}
				busy={deleting}
				onConfirm={(deleteAll: boolean) => deleteTarget && performAccountDelete(deleteAll, account)}
				onCancel={() => {
					if (!deleting) deleteTarget = null;
				}}
			/>

			<Footer />
		</div>
		{:else}
			<div id="workspace-container">
				<Workspace
					{userName}
					{selectedTheme}
					{layoutMode}
					showWelcome={showWelcome}
					onlogout={handleLogout}
					onthemeChange={handleThemeChange}
					onlayoutChange={handleLayoutChange}
					onprojectsupdate={handleProjectsUpdate}
				/>
			</div>
		{/if}
</ErrorHandler>

<style>
	* { margin: 0; padding: 0; box-sizing: border-box; }

	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		height: 100vh;
		width: 100%;
		background: var(--bg-primary);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		height: 60px;
		flex-shrink: 0;
	}

	.logo-section {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.logo-text {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}

	.version-badge {
		font-size: 0.7rem;
		padding: 2px 8px;
		background: var(--bg-tertiary);
		border-radius: 12px;
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.controls {
		display: flex;
		gap: 16px;
		align-items: center;
	}

	.theme-select {
		padding: 6px 12px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		font-family: inherit;
		transition: all var(--transition-fast);
	}

	.theme-select:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 32px;
		padding: 32px;
		overflow: auto;
		background: var(--bg-primary);
	}

	.welcome-card {
		text-align: center;
		max-width: 400px;
		width: 100%;
		padding: 40px;
		background: var(--bg-secondary);
		border-radius: 14px;
		border: 1px solid var(--border);
		box-shadow: var(--shadow-md);
	}

	.welcome-title {
		font-size: 1.8rem;
		margin-bottom: 16px;
		color: var(--text-primary);
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.hint {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin-bottom: 24px;
	}

	.input {
		width: 100%;
		padding: 12px 16px;
		margin-bottom: 16px;
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-primary);
		font-size: 1rem;
		font-family: inherit;
		transition: all var(--transition-fast);
	}

	.input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-glow);
	}

	.btn {
		padding: 12px 32px;
		font-size: 1rem;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		transition: all var(--transition-fast);
		border: none;
		font-family: inherit;
	}

	.btn-primary {
		background: var(--gradient-accent);
		color: #fff;
		box-shadow: 0 4px 16px var(--accent-glow);
	}

	.btn-primary:hover:not(:disabled) {
		box-shadow: 0 6px 24px var(--accent-glow);
		transform: translateY(-1px);
	}

	.btn-primary:active:not(:disabled) {
		transform: translateY(0);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.error-banner {
		padding: 12px;
		background: rgba(220, 38, 38, 0.1);
		color: #ff6b6b;
		text-align: center;
		border-bottom: 1px solid rgba(220, 38, 38, 0.3);
		font-size: 13px;
	}

	.notice-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		background: rgba(34, 197, 94, 0.1);
		color: #4ade80;
		border-top: 1px solid rgba(34, 197, 94, 0.3);
		font-size: 13px;
		flex-shrink: 0;
	}

	.notice-banner span {
		flex: 1;
		word-break: break-word;
		text-align: center;
	}

	.notice-dismiss {
		border: none;
		background: transparent;
		color: #4ade80;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.notice-dismiss:hover {
		color: #22c55e;
	}
</style>