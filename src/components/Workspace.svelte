<script lang="ts">
	import { onMount } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import type { ProjectData, SessionData, PipeRow } from '$types';

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

	// State
	let projects = $state<ProjectData[]>([]);
	let selectedProjectId = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);
	let activeTool = $state<string | null>(null);
	let error = $state<string | null>(null);

	// Helper to ensure pipes exist - called everywhere
	function ensurePipes(session: SessionData): SessionData {
		if (!session?.pipes || !Array.isArray(session.pipes) || session.pipes.length === 0) {
			const defaultPipe: PipeRow = {
				id: crypto.randomUUID(),
				lengthFrames: 121,
				keyframes: [],
				qValue: 18,
				cValue: 7,
				segments: [],
			};
			return { ...session, pipes: [defaultPipe] };
		}
		return session;
	}

	// Derived state - SIMPLE, correct Svelte 5 syntax
	let selectedProject = $derived(
		projects.find(p => p.id === selectedProjectId) || null
	);
	
	let selectedSession = $derived(() => {
		// GUARANTEED to return a valid session with pipes or null
		if (!selectedProject || !selectedSessionId) return null;
		const sess = selectedProject.sessions.find(s => s.id === selectedSessionId);
		if (!sess) return null;
		return ensurePipes(sess);
	});

	// Load projects from localStorage on mount
	function loadProjects() {
		try {
			const saved = localStorage.getItem('vm-projects');
			if (saved) {
				const parsed: ProjectData[] = JSON.parse(saved);
				// MIGRATE: ensure ALL sessions have pipes on load
				const migrated = parsed.map(p => ({
					...p,
					sessions: p.sessions.map(s => ensurePipes(s))
				}));
				projects = migrated;
				
				// Restore selection
				const savedProject = localStorage.getItem('vm-selected-project');
				const savedSession = localStorage.getItem('vm-selected-session');
				
				if (savedProject && projects.length > 0) {
					const found = projects.find(p => p.id === savedProject);
					if (found) {
						selectedProjectId = savedProject;
						if (savedSession) {
							selectedSessionId = savedSession;
						}
					}
				}
				console.log('[Workspace] Loaded', projects.length, 'projects');
			}
		} catch (e) {
			console.error('[Workspace] Failed to load projects:', e);
		}
	}

	// Save projects to localStorage
	function saveProjects() {
		try {
			localStorage.setItem('vm-projects', JSON.stringify(projects));
			if (onprojectsupdate) {
				onprojectsupdate(projects);
			}
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

	// Handle session update
	function handleSessionUpdate(updatedSession: SessionData) {
		if (!selectedProject || !selectedSession) {
			console.error('[Workspace] Cannot update: missing data');
			return;
		}
		
		const updatedSessions = selectedProject.sessions.map(s =>
			s.id === updatedSession.id ? updatedSession : s
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

	// Call load on mount
	onMount(() => {
		loadProjects();
	});

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
		
		console.log('[Workspace] Found project:', foundProject?.id || 'NOT FOUND');
		
		if (foundProject) {
			selectedProjectId = foundProject.id;
			selectedSessionId = sessionId;
			saveProjects();
			console.log('[Workspace] Selection set - project:', selectedProjectId, 'session:', selectedSessionId);
		} else {
			console.error('[Workspace] Project not found for session:', sessionId);
		}
	}

	function handleCreateProject(input: { name: string; path?: string }) {
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
		if (!project) {
			console.error('[Workspace] Cannot create session: project not found');
			return;
		}
		
		const sessionName = `Session ${project.sessions.length + 1}`;
		const folderName = `session_${Date.now()}`;
		const sessionPath = `${project.directoryPath}\\${folderName}`;
		
		const defaultPipe: PipeRow = {
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
			pipes: [defaultPipe],
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
		console.log('[Workspace] Session created with pipe:', newSession.id);
	}

	function handleRenameSession(sessionId: string, newName: string) {
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
		activeTool = id;
	}

	function handleGenerate() {
		console.log('[Workspace] Generate button clicked');
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
			<!-- SAFE CHECK: both must exist AND session must have pipes -->
			{#if selectedSession && selectedProject && selectedSession.pipes && selectedSession.pipes.length > 0}
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
