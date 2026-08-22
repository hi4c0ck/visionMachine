<script lang="ts">
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';

	console.log('[Workspace] Component ready');

	let {
		userName,
		selectedTheme,
		layoutMode,
		showWelcome,
		onlogout,
		onthemeChange,
		onlayoutChange
	} = $props<{
		userName: string;
		selectedTheme: string;
		layoutMode: string;
		showWelcome: boolean;
		onlogout?: () => void;
		onthemeChange?: (theme: string) => void;
		onlayoutChange?: (mode: string) => void;
	}>();

	// State
	let projects = $state<Array<{ id: string; name: string; thumbnail?: string; sessionId?: string }>>([]);
	let selectedProjectId = $state<string | null>(null);
	let activeTool = $state<string | null>(null);
	let toolsCollapsed = $state(false);
	let storageUsed = $state(0);

	const defaultTools = [
		{ id: 'select', label: 'Select', icon: '🔍', hotkey: 'V' },
		{ id: 'brush', label: 'Brush', icon: '🖌', hotkey: 'B' },
		{ id: 'eraser', label: 'Eraser', icon: '🧹', hotkey: 'E' },
		{ id: 'text', label: 'Text', icon: '📝', hotkey: 'T' },
		{ id: 'shape', label: 'Shape', icon: '⬜', hotkey: 'S' },
		{ id: 'camera', label: 'Camera', icon: '📷', hotkey: 'C' },
		{ id: 'gen', label: 'Generate', icon: '✨', hotkey: 'G' },
		{ id: 'settings', label: 'Settings', icon: '⚙️', hotkey: ',' },
	];

	// Event handlers
	function handleLogout() {
		console.log('[Workspace] Logout');
		onlogout?.();
	}

	function handleThemeChange(theme: string) {
		console.log('[Workspace] Theme:', theme);
		onthemeChange?.(theme);
	}

	function handleLayoutChange(mode: string) {
		console.log('[Workspace] Layout:', mode);
		onlayoutChange?.(mode);
	}

	function handleProjectSelect(id: string) {
		console.log('[Workspace] Project selected:', id);
		selectedProjectId = id;
	}

	function handleProjectNew() {
		console.log('[Workspace] Create new project');
		const newProject = {
			id: Date.now().toString(),
			name: `Project ${projects.length + 1}`,
			sessionId: undefined
		};
		projects = [...projects, newProject];
		selectedProjectId = newProject.id;
	}

	function handleProjectDelete(id: string) {
		console.log('[Workspace] Delete project:', id);
		projects = projects.filter(p => p.id !== id);
		if (selectedProjectId === id) {
			selectedProjectId = null;
		}
	}

	function handleToolSelect(id: string) {
		console.log('[Workspace] Tool selected:', id);
		activeTool = id;
	}

	function handleCreateSession() {
		console.log('[Workspace] Session created');
		if (selectedProjectId) {
			projects = projects.map(p => 
				p.id === selectedProjectId 
					? { ...p, sessionId: Date.now().toString() }
					: p
			);
		}
	}
</script>

<div class="workspace {layoutMode}">
	<Frame 
		{userName}
		{selectedTheme}
		{layoutMode}
		{showWelcome}
		onlogout={handleLogout}
		onthemeChange={handleThemeChange}
		onlayoutChange={handleLayoutChange}
	/>

	<div class="workspace-body">
		<!-- Left column: Projects + Profile -->
		<div class="left-column">
			{#if layoutMode !== 'single'}
				<ProjectsPanel 
					{projects}
					{selectedProjectId}
					onselect={handleProjectSelect}
					onnew={handleProjectNew}
					ondelete={handleProjectDelete}
				/>
			{/if}
			
			<!-- Profile panel at bottom-left -->
			<ProfilePanel 
				{userName}
				{storageUsed}
				oncreateSession={handleCreateSession}
			/>
		</div>

		<!-- Center: Composer (fills available space) -->
		<ComposerPanel />

		<!-- Right: Tools -->
		{#if layoutMode === 'landscape'}
			<ToolsPanel 
				tools={defaultTools}
				{activeTool}
				collapsed={toolsCollapsed}
				onselect={handleToolSelect}
			/>
		{/if}
	</div>
</div>

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100%;
		overflow: hidden;
		background: var(--bg-primary, #2B2B2B);
	}

	.workspace-body {
		display: flex;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}

	.left-column {
		display: flex;
		flex-direction: column;
		width: 240px;
		min-width: 200px;
		max-width: 320px;
		border-right: 1px solid var(--border-color, #4E525A);
		overflow: hidden;
	}
</style>
