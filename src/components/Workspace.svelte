<script lang="ts">
	import { onMount } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import type { ProjectData, SessionData } from '$types';

	console.log('[Workspace] Component ready');

	let {
		userName,
		selectedTheme,
		layoutMode,
		showWelcome,
		onlogout,
		onthemeChange,
		onlayoutChange,
		onprojectsupdate
	} = $props<{
		userName: string;
		selectedTheme: string;
		layoutMode: string;
		showWelcome: boolean;
		onlogout?: () => void;
		onthemeChange?: (theme: string) => void;
		onlayoutChange?: (mode: string) => void;
		onprojectsupdate?: (projects: ProjectData[]) => void;
	}>();

	// State - Using proper data models
	let projects = $state<ProjectData[]>([]);
	let selectedProjectId = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);
	let activeTool = $state<string | null>(null);
	let toolsCollapsed = $state(false);
	let storageUsed = $state(0);

	// Derived state - properly reactive
	let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);
	let selectedSession = $derived.by(() => {
		if (!selectedProject) {
			console.log('[Derived] selectedProject is null');
			return null;
		}
		const found = selectedProject.sessions.find(s => {
			const match = String(s.id) === String(selectedSessionId);
			if (!match) console.log(`[Derived] Session ${s.id} (type:${typeof s.id}) !== ${selectedSessionId} (type:${typeof selectedSessionId})`);
			return match;
		});
		console.log('[Derived] selectedSession:', found ? `Found ${found.id}` : 'Not found');
		return found || null;
	});

	// Load projects from localStorage on mount
	function loadProjects() {
		try {
			const saved = localStorage.getItem('vm-projects');
			if (saved) {
				const parsed = JSON.parse(saved) as ProjectData[];
				console.log('[Workspace] Loaded projects from localStorage:', parsed.length);
				projects = parsed;
				
				// Restore selection if exists
				const savedSelection = localStorage.getItem('vm-selected-project');
				if (savedSelection && projects.find(p => p.id === savedSelection)) {
					selectedProjectId = savedSelection;
					const savedSession = localStorage.getItem('vm-selected-session');
					if (savedSession && projects.find(p => p.id === savedSelection)?.sessions.find(s => s.id === savedSession)) {
						selectedSessionId = savedSession;
					}
				}
			}
		} catch (e) {
			console.error('[Workspace] Failed to load projects:', e);
		}
	}

	// Save projects to localStorage
	function saveProjects() {
		try {
			console.log('[Workspace] Saving projects to localStorage...');
			localStorage.setItem('vm-projects', JSON.stringify(projects));
			console.log('[Workspace] Projects saved, count:', projects.length);
			
			// Notify parent
			if (onprojectsupdate) {
				onprojectsupdate(projects);
			}
			
			// Save selection
			if (selectedProjectId) {
				localStorage.setItem('vm-selected-project', selectedProjectId);
				if (selectedSessionId) {
					localStorage.setItem('vm-selected-session', selectedSessionId);
				}
			}
		} catch (e) {
			console.error('[Workspace] Failed to save projects:', e);
		}
	}

	// Handle session update with proper reactivity (extracted to avoid stale closures)
	// Uses derived state which is always current, never stale
	function handleSessionUpdate(updatedSession: SessionData) {
		console.log('[Workspace] Session updated:', updatedSession.id);
		
		// Use derived state which is always current
		const currentProject = selectedProject;
		const currentSession = selectedSession;
		
		if (!currentProject || !currentSession) return;
		
		// Create new array reference to trigger reactivity
		const updatedSessions = currentProject.sessions.map(s =>
			s.id === updatedSession.id ? updatedSession : s
		);
		
		const updatedProject: ProjectData = {
			...currentProject,
			sessions: updatedSessions,
			updatedAt: Date.now(),
		};
		
		projects = projects.map(p =>
			p.id === currentProject.id ? updatedProject : p
		);
		saveProjects();
	}

	// Call load on mount
	onMount(() => {
		loadProjects();
	});

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

	function handleProjectSelect(projectId: string) {
		console.log('[Workspace] Project selected:', projectId);
		selectedProjectId = projectId;
		selectedSessionId = null;
		saveProjects();
	}

	function handleSessionSelect(sessionId: string) {
		console.log('[Workspace] Session clicked:', sessionId);
		console.log('[Workspace] Current state - project:', selectedProjectId, 'sessions:', projects.reduce((a, p) => a + p.sessions.length, 0));
		// Find and set both atomically
		const foundProject = projects.find(p => p.sessions.some(s => String(s.id) === String(sessionId)));
		if (!foundProject) {
			console.error('[Workspace] Session not found in any project');
			return;
		}
		selectedProjectId = foundProject.id;
		selectedSessionId = sessionId;
		console.log('[Workspace] State updated - project:', selectedProjectId, 'session:', selectedSessionId);
		saveProjects();
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
		saveProjects();
		console.log('[Workspace] Project created, total:', projects.length);
	}

	function handleDeleteProject(projectId: string) {
		console.log('[Workspace] Delete project:', projectId);
		projects = projects.filter(p => p.id !== projectId);
		if (selectedProjectId === projectId) {
			selectedProjectId = null;
			selectedSessionId = null;
		}
		saveProjects();
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
		
		const updatedProject: ProjectData = {
			...project,
			sessions: [...project.sessions, newSession],
		};
		
		projects = projects.map(p => 
			p.id === projectId ? updatedProject : p
		);
		
		selectedSessionId = newSession.id;
		saveProjects();
		console.log('[Workspace] Session created:', newSession.id);
	}

	function handleRenameSession(sessionId: string, newName: string) {
		console.log('[Workspace] Rename session:', sessionId, '->', newName);
		if (!selectedProject) return;
		
		const updatedSessions = selectedProject.sessions.map(s =>
			s.id === sessionId ? { ...s, name: newName, updatedAt: Date.now() } : s
		);
		
		const updatedProject: ProjectData = {
			...selectedProject,
			sessions: updatedSessions,
			updatedAt: Date.now(),
		};
		
		projects = projects.map(p =>
			p.id === selectedProject.id ? updatedProject : p
		);
		saveProjects();
	}

	function handleDeleteSession(projectId: string, sessionId: string) {
		console.log('[Workspace] Delete session:', sessionId);
		const project = projects.find(p => p.id === projectId);
		if (!project) return;
		
		const updatedSessions = project.sessions.filter(s => s.id !== sessionId);
		const updatedProject: ProjectData = {
			...project,
			sessions: updatedSessions,
			updatedAt: Date.now(),
		};
		
		projects = projects.map(p =>
			p.id === projectId ? updatedProject : p
		);
		
		if (selectedSessionId === sessionId) {
			selectedSessionId = null;
		}
		saveProjects();
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

<div class={`workspace ${layoutMode}`}>
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
					onselectsession={handleSessionSelect}
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
			{#if selectedSession && selectedProject}
				<ComposerPanel
					{selectedSession}
					onupdate={handleSessionUpdate}
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