<script lang="ts">
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import type { SceneData, ProjectData, SessionData } from '$types';

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

	// State - Using proper data models
	let projects = $state<ProjectData[]>([]);
	let selectedProjectId = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);
	let activeTool = $state<string | null>(null);
	let toolsCollapsed = $state(false);
	let storageUsed = $state(0);

	// Derived state
	let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);
	let selectedSession = $derived(
		selectedProject?.sessions.find(s => s.id === selectedSessionId) || null
	);

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

	// Event handlers - Fixed to match ProjectsPanel events
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

	function handleProjectSelect(projectId: string) {
		console.log('[Workspace] Project selected:', projectId);
		selectedProjectId = projectId;
		selectedSessionId = null;
	}

	function handleCreateProject(input: { name: string; path?: string }) {
		console.log('[Workspace] Create project:', input.name);
		const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
		const projectPath = `${basePath}\\${input.name}`;
		
		const newProject: ProjectData = {
			id: crypto.randomUUID(),
			name: input.name,
			createdAt: Date.now(),
			directoryPath: projectPath,
			sessions: [],
			totalGenerations: 0,
		};
		
		projects = [...projects, newProject];
		selectedProjectId = newProject.id;
		console.log('[Workspace] Project created, total:', projects.length);
	}

	function handleDeleteProject(projectId: string) {
		console.log('[Workspace] Delete project:', projectId);
		projects = projects.filter(p => p.id !== projectId);
		if (selectedProjectId === projectId) {
			selectedProjectId = null;
			selectedSessionId = null;
		}
	}

	function handleCreateSession(projectId: string) {
		console.log('[Workspace] Create session for project:', projectId);
		const project = projects.find(p => p.id === projectId);
		if (!project) return;
		
		const sessionName = `Session ${project.sessions.length + 1}`;
		const folderName = `session_${Date.now()}`;
		const sessionPath = `${project.directoryPath}\\${folderName}`;
		
		const newSession: SessionData = {
			id: crypto.randomUUID(),
			name: sessionName,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			directoryPath: sessionPath,
			pipes: [],
			fps: 24,
			resolution: '720p',
			orientation: 'horizontal',
			totalGeneratedFrames: 0,
		};
		
		const updatedProject = {
			...project,
			sessions: [...project.sessions, newSession],
		};
		
		projects = projects.map(p => 
			p.id === projectId ? updatedProject : p
		);
		
		selectedSessionId = newSession.id;
		console.log('[Workspace] Session created:', newSession.id);
	}

	function handleRenameSession(sessionId: string, newName: string) {
		console.log('[Workspace] Rename session:', sessionId, '->', newName);
		if (!selectedProject) return;
		
		const updatedSessions = selectedProject.sessions.map(s =>
			s.id === sessionId ? { ...s, name: newName } : s
		);
		
		const updatedProject = {
			...selectedProject,
			sessions: updatedSessions,
		};
		
		projects = projects.map(p =>
			p.id === selectedProject.id ? updatedProject : p
		);
	}

	function handleDeleteSession(projectId: string, sessionId: string) {
		console.log('[Workspace] Delete session:', sessionId);
		const project = projects.find(p => p.id === projectId);
		if (!project) return;
		
		const updatedSessions = project.sessions.filter(s => s.id !== sessionId);
		const updatedProject = {
			...project,
			sessions: updatedSessions,
		};
		
		projects = projects.map(p =>
			p.id === projectId ? updatedProject : p
		);
		
		if (selectedSessionId === sessionId) {
			selectedSessionId = null;
		}
	}

	function handleToolSelect(id: string) {
		console.log('[Workspace] Tool selected:', id);
		activeTool = id;
	}

	function handleGenerate() {
		console.log('[Workspace] Generate clicked');
		// TODO: Implement generation logic
	}

	function getHomeDir(): string {
		if (typeof window !== 'undefined') {
			const user = (window as any).userName || userName || 'User';
			return `C:\\Users\\${user}`;
		}
		return 'C:\\Users';
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
					{selectedSessionId}
					onselectproject={handleProjectSelect}
					oncreateproject={handleCreateProject}
					ondeleteproject={handleDeleteProject}
					oncreatesession={handleCreateSession}
					onrenamesession={handleRenameSession}
					ondeletesession={handleDeleteSession}
				/>
			{/if}

			<!-- Profile panel at bottom-left -->
			<ProfilePanel
				{userName}
				{storageUsed}
			/>
		</div>

		<!-- Center: Composer (fills available space) -->
		<div class="composer-area">
			{#if selectedSession}
				<ComposerPanel
					{selectedSession}
					onupdate={(session) => {
						if (!selectedProject) return;
						const updatedSessions = selectedProject.sessions.map(s =>
							s.id === session.id ? session : s
						);
						const updatedProject = { ...selectedProject, sessions: updatedSessions };
						projects = projects.map(p =>
							p.id === selectedProject.id ? updatedProject : p
						);
					}}
				/>
			{:else}
				<div class="composer-empty">
					<div class="empty-icon">🎬</div>
					<h2>Select a Session</h2>
					<p>Create a project and add a session to start editing</p>
				</div>
			{/if}
		</div>

		<!-- Right: Tools -->
		{#if layoutMode === 'landscape'}
			<ToolsPanel
				{selectedSession}
				{selectedProject}
				{activeTool}
				onselect={handleToolSelect}
				ongenerate={handleGenerate}
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
		flex-shrink: 0;
	}

	.composer-area {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.composer-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		color: var(--text-muted, #808080);
	}

	.composer-empty .empty-icon {
		font-size: 64px;
		opacity: 0.5;
	}

	.composer-empty h2 {
		font-size: 24px;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
	}

	.composer-empty p {
		font-size: 14px;
		max-width: 400px;
		text-align: center;
		line-height: 1.5;
	}
</style>
