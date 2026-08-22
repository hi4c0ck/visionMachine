<script lang="ts">
	import { onMount } from 'svelte';
	import Workspace from './components/Workspace.svelte';
	
	// State declarations
	let userName = $state('');
	let isNameEmpty = $derived(!userName.trim());
	let showWelcome = $state(true);
	let selectedTheme = $state('jetbrains-dark');
	let layoutMode = $state('landscape');
	let appInfo = $state<{ appName: string; version: string } | null>(null);
	let error = $state<string | null>(null);
	
	// Constants
	const themes = [
		{ id: 'jetbrains-dark', name: 'JetBrains Dark' },
		{ id: 'steel-dark', name: 'Steel Machinery Dark' },
		{ id: 'light', name: 'Light' },
	];
	
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
		localStorage.setItem('vm-username', name);
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
		localStorage.setItem('vm-layout', mode);
	}
	
	function handleInputChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		userName = target.value;
		error = null;
	}
	
	// Lifecycle
	onMount(() => {
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
		
		appInfo = { appName: 'VisionMachine', version: '0.1.0' };
		applyTheme(selectedTheme);
	});
</script>

{#if showWelcome}
	<div class="app">
		<header class="header">
			<div class="logo-section">
				<span class="logo-text">VisionMachine</span>
				{#if appInfo}
					<span class="version-badge">v{appInfo.version}</span>
				{/if}
			</div>
			
			<div class="controls">
				<select class="theme-select" value={selectedTheme} onchange={(e) => applyTheme(e.currentTarget.value)}>
					{#each themes as theme}
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
				<h1 class="welcome-title">Welcome to VisionMachine</h1>
				<p class="hint">Enter your name to continue</p>
				<input 
					value={userName}
					placeholder="Your name..." 
					class="input"
					type="text"
					onkeydown={handleKeyDown}
					oninput={handleInputChange}
				/>
				<button 
					class="btn btn-primary" 
					disabled={isNameEmpty} 
					onclick={handleLogin}
				>
					Get Started
				</button>
			</div>
		</main>
	</div>
{:else}
	<Workspace
		{userName}
		{selectedTheme}
		{layoutMode}
		showWelcome={showWelcome}
		onlogout={handleLogout}
		onthemeChange={handleThemeChange}
		onlayoutChange={handleLayoutChange}
	/>
{/if}

<style>
	* { margin: 0; padding: 0; box-sizing: border-box; }
	
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		height: 100vh;
		width: 100%;
		background: var(--bg-primary, #2B2B2B);
	}
	
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		background: var(--bg-secondary, #3C3F46);
		border-bottom: 1px solid var(--border-color, #4E525A);
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
		font-weight: bold;
		color: var(--text-primary, #EEEEEE);
	}
	
	.version-badge {
		font-size: 0.75rem;
		padding: 2px 8px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 12px;
		color: var(--text-muted, #808080);
	}
	
	.controls {
		display: flex;
		gap: 16px;
		align-items: center;
	}
	
	.theme-select {
		padding: 8px 12px;
		background: var(--bg-tertiary, #4E525A);
		color: var(--text-primary, #EEEEEE);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}
	
	.main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px;
		overflow: auto;
		background: var(--bg-primary, #2B2B2B);
	}
	
	.welcome-card {
		text-align: center;
		max-width: 400px;
		width: 100%;
		padding: 40px;
		background: var(--bg-secondary, #3C3F46);
		border-radius: 12px;
		border: 1px solid var(--border-color, #4E525A);
	}
	
	.welcome-title {
		font-size: 2rem;
		margin-bottom: 16px;
		color: var(--text-primary, #EEEEEE);
	}
	
	.hint {
		font-size: 0.9rem;
		color: var(--text-muted, #808080);
		margin-bottom: 24px;
	}
	
	.input {
		width: 100%;
		padding: 12px 16px;
		margin-bottom: 16px;
		background: var(--bg-primary, #2B2B2B);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-primary, #EEEEEE);
		font-size: 1rem;
	}
	
	.input:focus {
		outline: none;
		border-color: var(--accent-primary, #59B5FF);
	}
	
	.btn {
		padding: 12px 32px;
		font-size: 1rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		border: none;
	}
	
	.btn-primary {
		background: var(--accent-primary, #59B5FF);
		color: var(--text-inverse, #FFFFFF);
	}
	
	.btn-primary:hover:not(:disabled) {
		background: var(--accent-primary-hover, #7EC8FF);
		transform: translateY(-1px);
	}
	
	.btn-primary:active:not(:disabled) {
		transform: translateY(0);
	}
	
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
	
	.error-banner {
		padding: 12px;
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
		text-align: center;
		border-bottom: 1px solid rgba(220, 38, 38, 0.3);
	}
</style>
