<script lang="ts">
	import { onMount } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import type { ProjectData, SessionData, PipeRow } from '$types';
	import { getMaxFramesForResolution, migratePipeToTwoLayer } from '$types';
	import { hydrateSessions } from '$lib/composerStore';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';

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
	let loading = $state(false);

	// Derived state
	let selectedProject = $derived(
		projects.find(p => p.id === selectedProjectId) || null
	);
	
	let selectedSession = $derived.by(() => {
		if (!selectedProject || !selectedSessionId) return null;
		const sess = selectedProject.sessions.find(s => s.id === selectedSessionId);
		return sess || null;
	});

	// Load projects from backend
	async function loadProjects() {
		try {
			loading = true;
			error = null;
			
			// Call backend to get projects (note: needs profile_id for real app)
			// For now, we use a simplified approach
			const result = await invoke('list_projects');
			const backendProjects = result as any[];
			
			// Convert backend format to frontend format
			projects = backendProjects.map((p: any) => ({
				id: p.id,
				name: p.name,
				createdAt: new Date(p.created_at).getTime(),
				directoryPath: p.directory_path || '',
				sessions: [],
				totalGenerations: 0,
				updatedAt: Date.now(),
				profileId: p.profile_id || ''
			})) as ProjectData[];
			
			// Try to restore selection from localStorage (migration path)
			const savedProject = localStorage.getItem(`vm-selected-project-${userName}`);
			const savedSession = localStorage.getItem(`vm-selected-session-${userName}`);
			
			if (savedProject && projects.length > 0) {
				const found = projects.find(p => p.id === savedProject);
				if (found) {
					selectedProjectId = savedProject;
					if (savedSession) {
						selectedSessionId = savedSession;
					}
				}
			}
			
			if (onprojectsupdate) {
				onprojectsupdate(projects);
			}
		} catch (e) {
			console.error('[Workspace] Failed to load projects:', e);
			error = `Failed to load projects: ${e}`;
			// Fallback to localStorage if backend fails
			await loadFromLocalStorage();
		} finally {
			loading = false;
		}
	}

	// Fallback: Load from localStorage (for migration)
	async function loadFromLocalStorage() {
		try {
			const saved = localStorage.getItem(`vm-projects-${userName}`);
			if (saved) {
				let parsed: ProjectData[] = JSON.parse(saved);
				// Migrate old globalPrompt -> globalNodes format for each pipe in each session
				parsed = parsed.map(project => ({
					...project,
					sessions: project.sessions.map(session => ({
						...session,
						pipes: (session.pipes || []).map(p => migratePipeToTwoLayer(p))
					}))
				}));
				projects = parsed;
				hydrateSessions(parsed.flatMap(p => p.sessions));
				
				const savedProject = localStorage.getItem(`vm-selected-project-${userName}`);
				const savedSession = localStorage.getItem(`vm-selected-session-${userName}`);
				
				if (savedProject && projects.length > 0) {
					const found = projects.find(p => p.id === savedProject);
					if (found) {
						selectedProjectId = savedProject;
						if (savedSession) {
							selectedSessionId = savedSession;
						}
					}
				}
				
				if (onprojectsupdate) {
					onprojectsupdate(projects);
				}
			}
		} catch (e) {
			console.error('[Workspace] Failed to load from localStorage:', e);
		}
	}

	// Save projects to backend and localStorage (hybrid approach)
	async function saveProjects() {
		try {
			// Save to backend
			// Note: This would need a proper backend command that handles full project update
			// For now, we'll just save to localStorage as fallback
			localStorage.setItem(`vm-projects-${userName}`, JSON.stringify(projects));
			
			if (selectedProjectId) {
				localStorage.setItem(`vm-selected-project-${userName}`, selectedProjectId);
				if (selectedSessionId) {
					localStorage.setItem(`vm-selected-session-${userName}`, selectedSessionId);
				}
			}
			
			if (onprojectsupdate) {
				onprojectsupdate(projects);
			}
		} catch (e) {
			console.error('[Workspace] Failed to save projects:', e);
		}
	}

	function handleLogout() {
		if (onlogout) {
			onlogout();
		}
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
			const foundProject = projects.find(p =>
				p.sessions.some(s => s.id === sessionId)
			);

			if (foundProject) {
				selectedProjectId = foundProject.id;
				selectedSessionId = sessionId;
				hydrateSessions(foundProject.sessions);
				saveProjects();
			}
		}

	async function handleCreateProject(input: { name: string; path?: string }) {
		try {
			loading = true;
			const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
			const projectPath = `${basePath}\\${input.name}`;
			
			// Create via backend
			const result = await invoke('create_project', {
				input: {
					name: input.name,
					directory_path: projectPath
				}
			});
			
			const newProjectId = result as string;
			
			// Add to local state
			const newProject: ProjectData = {
				id: newProjectId,
				name: input.name,
				createdAt: Date.now(),
				directoryPath: projectPath,
				sessions: [],
				totalGenerations: 0,
				updatedAt: Date.now(),
				profileId: '' // Would come from backend
			};
			
			projects = [...projects, newProject];
			selectedProjectId = newProject.id;
			await saveProjects();
		} catch (e) {
			console.error('[Workspace] Failed to create project:', e);
			error = `Failed to create project: ${e}`;
			// Fallback
			handleCreateProjectFallback(input);
		} finally {
			loading = false;
		}
	}

	function handleCreateProjectFallback(input: { name: string; path?: string }) {
		const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
		const projectPath = `${basePath}\\${input.name}`;
		
		const newProject: ProjectData = {
			id: crypto.randomUUID(),
			name: input.name,
			createdAt: Date.now(),
			directoryPath: projectPath,
			sessions: [],
			totalGenerations: 0,
			updatedAt: Date.now(),
			profileId: ''
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
		// Clear store for deleted project's sessions
		hydrateSessions(projects.flatMap(p => p.sessions));
		saveProjects();
	}

	async function handleCreateSession(projectId: string) {
		try {
			loading = true;
			const project = projects.find(p => p.id === projectId);
			if (!project) return;

			const maxFrames = getMaxFramesForResolution('720p');
			const defaultPipe: PipeRow = {
				id: crypto.randomUUID(),
				lengthFrames: maxFrames,
				keyframes: [],
				qValue: 18,
				cValue: 7,
				elements: [],
			};

			const sessionName = `Session ${project.sessions.length + 1}`;
			
			// Create via backend
			const pipesJson = JSON.stringify([defaultPipe]);
			const result = await invoke('create_session', {
				input: {
					project_id: projectId,
					name: sessionName,
					pipes_json: pipesJson
				}
			});
			
			const newSessionId = result as string;
			
			const newSession: SessionData = {
				id: newSessionId,
				name: sessionName,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				directoryPath: `${project.directoryPath}\\session_${Date.now()}`,
				pipes: [defaultPipe],
				fps: 24,
				resolution: '720p',
				orientation: 'horizontal',
				totalGeneratedFrames: 0,
			};
			
			const updatedProject: ProjectData = {
				...project,
				sessions: [...project.sessions, newSession],
				updatedAt: Date.now(),
			};
			
			projects = projects.map(p => 
				p.id === projectId ? updatedProject : p
			);
			
			selectedSessionId = newSession.id;
			hydrateSessions([newSession]);
			await saveProjects();
		} catch (e) {
			console.error('[Workspace] Failed to create session:', e);
			// Fallback
			createSessionFallback(projectId);
		} finally {
			loading = false;
		}
	}

	function createSessionFallback(projectId: string) {
		const project = projects.find(p => p.id === projectId);
		if (!project) return;
		
		const maxFrames = getMaxFramesForResolution('720p');
		const defaultPipe: PipeRow = {
			id: crypto.randomUUID(),
			lengthFrames: maxFrames,
			keyframes: [],
			qValue: 18,
			cValue: 7,
			elements: [],
		};
		
		const newSession: SessionData = {
			id: crypto.randomUUID(),
			name: `Session ${project.sessions.length + 1}`,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			directoryPath: `${project.directoryPath}\\session_${Date.now()}`,
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

	async function handleDeleteSession(projectId: string, sessionId: string) {
		try {
			// Delete via backend
			await invoke('delete_session', { session_id: sessionId });
		} catch (e) {
			console.error('[Workspace] Failed to delete session:', e);
		}
		
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
		// Remove deleted session from store
		hydrateSessions(updatedSessions);
		saveProjects();
	}

	// Handle session update from ComposerPanel
	function handleSessionUpdate(updatedSession: SessionData) {
		if (!selectedProject || !selectedSession) {
			return;
		}
		
		// Update locally
		const updatedProjects = projects.map(p => {
			if (p.id !== selectedProject.id) return p;
			return {
				...p,
				sessions: p.sessions.map(s => 
					s.id === updatedSession.id ? updatedSession : s
				)
			};
		});
		
		projects = updatedProjects;
		
		// Also try to persist to backend
		try {
			invoke('update_session', {
				session_id: updatedSession.id,
				updates: {
					name: updatedSession.name,
					fps: updatedSession.fps,
					resolution: updatedSession.resolution,
					orientation: updatedSession.orientation,
					pipes_json: JSON.stringify(updatedSession.pipes),
					total_generated_frames: updatedSession.totalGeneratedFrames
				}
			}).catch(e => console.error('[Workspace] Backend update failed:', e));
		} catch (e) {
			console.error('[Workspace] Failed to update session backend:', e);
		}
		
		saveProjects();
	}

	function handleToolSelect(id: string) {
		activeTool = id;
	}

	function getHomeDir(): string {
		return typeof window !== 'undefined' 
			? (window as any).navigator?.userContext?.homeDirectory || 'C:\\Users\\user'
			: 'C:\\Users\\user';
	}

	onMount(() => {
		loadProjects();
	});
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

			<ProfilePanel
				{userName}
				{projects}
				{selectedProjectId}
				{selectedSessionId}
			/>
		</div>

		<div class="composer-area">
			<!-- SAFE: Check session exists AND has project -->
			{#if selectedSession && selectedProject}
				<ComposerPanel
					session={selectedSession}
					onUpdate={handleSessionUpdate}
				/>
			{:else}
				<div class="composer-empty">
					<div class="empty-icon">🎬</div>
					<h2>Select a Session</h2>
					<p>Create a project and add a session to start editing</p>
				</div>
			{/if}
		</div>

		{#if layoutMode === 'landscape'}
			<ToolsPanel
				{selectedSession}
				{selectedProject}
				{activeTool}
				onselect={handleToolSelect}
				ongenerate={() => {}}
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
	}

	.left-column {
		width: 280px;
		min-width: 200px;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #252526);
		border-right: 1px solid var(--border-color, #3c3c3c);
	}

	.composer-area {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: var(--bg-primary, #1a1a1a);
	}

	.composer-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted, #808080);
		gap: 12px;
	}

	.empty-icon {
		font-size: 64px;
		opacity: 0.5;
	}

	.empty-icon h2 {
		font-size: 24px;
		font-weight: 600;
		color: var(--text-primary, #ffffff);
		margin: 0;
	}

	.empty-icon p {
		font-size: 14px;
		margin: 0;
	}
</style>

