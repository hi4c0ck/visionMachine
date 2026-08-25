<script lang="ts">
	import { onMount } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import type { ProjectData, SessionData } from '$types';

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
	let error = $state<string | null>(null);

	// Derived state
	let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);
	let selectedSession = $derived(selectedProject?.sessions.find(s => s.id === selectedSessionId) || null);

	// Load projects from localStorage on mount
	function loadProjects() {
		try {
			const saved = localStorage.getItem('vm-projects');
			if (saved) {
				const parsed = JSON.parse(saved) as ProjectData[];
				projects = parsed.map(p => ({
    ...p,
    sessions: p.sessions.map(s => ({
      ...s,
      pipes: s.pipes && s.pipes.length > 0 ? s.pipes : [{
        id: crypto.randomUUID(),
        lengthFrames: 121,
        keyframes: [],
        qValue: 18,
        cValue: 7,
        segments: [],
      }],
    })),
  }));
				
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
			error = 'Failed to load saved projects';
		}
	}

	// Save projects to localStorage
	function saveProjects() {
		try {
			localStorage.setItem('vm-projects', JSON.stringify(projects));
			
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
			error = 'Failed to save projects';
		}
	}

	// Handle session update with proper reactivity
	function handleSessionUpdate(updatedSession: SessionData) {
		const currentProject = selectedProject;
		const currentSession = selectedSession;
		
		console.log('[Workspace] handleSessionUpdate called', {
			hasProject: !!currentProject,
			hasSession: !!currentSession,
			sessionId: updatedSession.id,
			currentSessionId: currentSession?.id
		});
		
		if (!currentProject || !currentSession) {
			console.error('[Workspace] Cannot update session - project or session missing');
			return;
		}
		
		try {
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
		} catch (e) {
			console.error('[Workspace] Failed to update session:', e);
			error = 'Failed to update session';
		}
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
		onlogout?.();
	}

	function handleThemeChange(theme: string) {
		onthemeChange?.(theme);
	}

	function handleLayoutChange(mode: string) {
		onlayoutChange?.(mode);
	}

	function handleProjectSelect(projectId: string) {
		selectedProjectId = projectId;
		selectedSessionId = null;
		saveProjects();
	}

	function handleSessionSelect(sessionId: string) {
		console.log('[Workspace] Session clicked:', sessionId);
		
		// Find the project containing this session
		const foundProject = projects.find(p => 
			p.sessions.some(s => s.id === sessionId)
		);
		
		console.log('[Workspace] Found project:', foundProject ? foundProject.id : 'NOT FOUND');
		
		if (foundProject) {
			// Set project first, then session
			selectedProjectId = foundProject.id;
			selectedSessionId = sessionId;
			saveProjects();
			console.log('[Workspace] Selection set - project:', selectedProjectId, 'session:', selectedSessionId);
			console.log('[Workspace] selectedSession:', selectedSession ? selectedSession.id : 'null');
		} else {
			console.error('[Workspace] Project not found for session:', sessionId);
		}
	}

	function handleCreateProject(input: { name: string; path?: string }) {
		const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
		const projectPath = `${basePath}\\${input.name}`;
		
		try {
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
		} catch (e) {
			console.error('[Workspace] Failed to create project:', e);
			error = 'Failed to create project';
		}
	}

	function handleDeleteProject(projectId: string) {
		projects = projects.filter(p => p.id !== projectId);
		if (selectedProjectId === projectId) {
			selectedProjectId = null;
			selectedSessionId = null;
		}
		saveProjects();
	}

	function handleCreateSession(projectId: string) {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;
		
		try {
			const sessionName = `Session ${project.sessions.length + 1}`;
			const folderName = `session_${Date.now()}`;
			const sessionPath = `${project.directoryPath}\\${folderName}`;
			
			const newPipe: PipeRow = {
				id: crypto.randomUUID(),
				lengthFrames: 121,
				keyframes: [],
				qValue: 18,
				cValue: 7,
				segments: [],
			};
			
			const newSession: SessionData = {
				id: crypto.randomUUID(),
				name: sessionName,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				directoryPath: sessionPath,
				pipes: [newPipe],
				fps: 24,
				resolution: '720p',
				orientation: 'horizontal',
				totalGeneratedFrames: 0,
			};
			
			console.log('[Workspace] Created session with pipe:', newSession.id, 'pipes:', newSession.pipes?.length);
			
			const updatedProject: ProjectData = {
				...project,
				sessions: [...project.sessions, newSession],
			};
			
			projects = projects.map(p => 
				p.id === projectId ? updatedProject : p
			);
			
			selectedSessionId = newSession.id;
			saveProjects();
		} catch (e) {
			console.error('[Workspace] Failed to create session:', e);
			error = 'Failed to create session';
		}
	}

	function handleRenameSession(sessionId: string, newName: string) {
		if (!selectedProject) return;
		
		try {
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
		} catch (e) {
			console.error('[Workspace] Failed to rename session:', e);
			error = 'Failed to rename session';
		}
	}

	function handleDeleteSession(projectId: string, sessionId: string) {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;
		
		try {
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
		} catch (e) {
			console.error('[Workspace] Failed to delete session:', e);
			error = 'Failed to delete session';
		}
	}

	function handleToolSelect(id: string) {
		activeTool = id;
	}

	function handleGenerate() {
		// TODO: Implement generation logic
		console.log('[Workspace] Generate button clicked');
	}

	function handleFPSChange(fps: number) {
		if (!selectedSession || !selectedProject) return;
		const updatedSession = { ...selectedSession, fps };
		handleSessionUpdate(updatedSession);
	}

	function handleResolutionChange(resolution: string) {
		if (!selectedSession || !selectedProject) return;
		const updatedSession = { ...selectedSession, resolution: resolution as any };
		handleSessionUpdate(updatedSession);
	}

	function handleOrientationChange(orientation: string) {
		if (!selectedSession || !selectedProject) return;
		const updatedSession = { ...selectedSession, orientation: orientation as any };
		handleSessionUpdate(updatedSession);
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
				{projects}
				{selectedProjectId}
				{selectedSessionId}
			/>
		</div>

		<!-- Center: Composer (fills available space) -->
		<div class="composer-area">
			{#if selectedSession && selectedProject}
				{#if selectedSession?.pipes && selectedSession.pipes.length > 0}
					<ComposerPanel
						{selectedSession}
						onupdate={handleSessionUpdate}
					/>
				{:else}
					<div class="composer-empty">
						<div class="empty-icon">⚠️</div>
						<h2>Session Has No Pipes</h2>
						<p>This session was created without any pipes. Please create a new session.</p>
					</div>
				{/if}
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
				onfpschange={handleFPSChange}
				onresolutionchange={handleResolutionChange}
				onorientationchange={handleOrientationChange}
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