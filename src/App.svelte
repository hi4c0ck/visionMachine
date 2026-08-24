<script lang="ts">
	import { createCanvas } from './canvas.js';
	import Workspace from './components/Workspace.svelte';
	import ProjectsPanel from './components/ProjectsPanel.svelte';
	import ComposerPanel from './components/ComposerPanel.svelte';
	import ToolsPanel from './components/ToolsPanel.svelte';
	import ProfilePanel from './components/ProfilePanel.svelte';
	import App from './App.ts';
	
	let { onNavigate }: { onNavigate?: () => void } = $props();
	
	// App instance is NOT wrapped in $state - it manages its own reactivity via localStorage
	let app = new App();
	let canvasElement = $state<HTMLCanvasElement | null>(null);
	
	$effect(() => {
		const el = document.getElementById('canvas') as HTMLCanvasElement | null;
		if (!el) return;
		
		canvasElement = el;
		const ctx = el.getContext('2d');
		if (!ctx) return;
		
		createCanvas(el, app);
		
		// Apply theme colors based on detected platform
		try {
			const platform = (import.meta.env as Record<string, string>).TAURI_PLATFORM;
			if (platform === 'windows') {
				document.documentElement.style.setProperty('--sidebar-bg', '#2a2a2a');
				document.documentElement.style.setProperty('--sidebar-border', '#3a3a3a');
			} else if (platform === 'linux') {
				document.documentElement.style.setProperty('--sidebar-bg', '#2e2e2e');
				document.documentElement.style.setProperty('--sidebar-border', '#444');
			}
		} catch {
			// ignore platform detection errors in browser
		}
	});
</script>

<svelte:head>
	<title>VisionMachine</title>
</svelte:head>

<div class="frame" role="application" aria-label="VisionMachine application">
	<aside class="project-panel-sidebar" aria-label="Projects panel">
		<ProjectsPanel {app} />
	</aside>

	<main class="main-content">
		<div id="canvas-container">
			<canvas id="canvas"></canvas>
		</div>
		<Workspace {app} />
	</main>

	<div class="right-sidebar" aria-label="Tools panel">
		<ToolsPanel 
			tools={[]} 
			activeTool="brush" 
			onToolChange={() => {}} 
			onColorChange={() => {}} 
			onBrushSizeChange={() => {}} 
			onImportFile={() => {}} 
		/>
		<ComposerPanel {app} />
		<ProfilePanel 
			user={app.user} 
			onUserNameChange={(name) => { app.user.displayName = name; }}
			onThemeChange={(theme) => { app.user.theme = theme; }}
			onExportProject={() => {}}
			onImportProject={() => {}}
		/>
	</div>
</div>

<style>
	/* Global styles */
	.frame {
		display: flex;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
		position: relative;
		font-family: 'Inter', sans-serif;
		color: #f5f5f5;
		background: #1e1e1e;
	}

	.project-panel-sidebar {
		width: 280px;
		min-width: 200px;
		max-width: 400px;
		background: var(--sidebar-bg, #2c2c2c);
		border-right: 1px solid var(--sidebar-border, #444);
		display: flex;
		flex-direction: column;
		resize: horizontal;
		overflow: hidden;
		min-height: 100vh;
	}

	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: #1e1e1e;
	}

	#canvas-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #252525;
		min-height: 400px;
		overflow: auto;
		padding: 20px;
	}

	#canvas {
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		border-radius: 4px;
		max-width: 100%;
		max-height: 100%;
	}

	.right-sidebar {
		width: 320px;
		min-width: 250px;
		max-width: 450px;
		background: var(--sidebar-bg, #2c2c2c);
		border-left: 1px solid var(--sidebar-border, #444);
		display: flex;
		flex-direction: column;
		resize: horizontal;
		overflow: hidden;
		min-height: 100vh;
	}

	@media (max-width: 768px) {
		.project-panel-sidebar {
			display: none;
		}
		.right-sidebar {
			display: none;
		}
	}
</style>
