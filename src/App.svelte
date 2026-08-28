<script lang="ts">
	import { onMount } from 'svelte';
	import Workspace from './components/Workspace.svelte';
	import ErrorHandler from './components/ErrorHandler.svelte';
	import { APP_CONSTANTS } from '$constants';
	
	// State declarations - explicit reactive state
	let userName = $state('');
	let showWelcome = $state(true);
	let selectedTheme = $state('jetbrains-dark');
	let layoutMode = $state('landscape');
	let error = $state<string | null>(null);
	let runtimeError = $state<Error | null>(null);
	
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
		userName = '';
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
	
	// Lifecycle
	onMount(() => {
		try {
			// Restore from localStorage
			const savedName = localStorage.getItem('vm-username');
			if (savedName) {
				userName = savedName;
				showWelcome = false;
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
		} catch (e) {
			console.error('[App] Failed to restore state:', e);
			runtimeError = e instanceof Error ? e : new Error('Failed to restore application state');
		}
	});
</script>

<ErrorHandler {runtimeError}>
	{#if showWelcome}
		<div class="app">
			<header class="header">
				<div class="logo-section">
					<span class="logo-text">{APP_CONSTANTS.strings.appName}</span>
					<span class="version-badge">v{APP_CONSTANTS.version}</span>
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
</style>