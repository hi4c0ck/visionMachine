<script lang="ts">
	import { onMount } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import type { ProjectData, SessionData, PipeRow } from '$types';
	import { getMaxFramesForResolution } from '$types';
import { migratePipe } from '$lib/composerStore';
import { hydrateSessions, setOnUpdate, loadSession, sessions, composerStore } from '$lib/composerStore';
	import { invoke, isTauri } from '@tauri-apps/api/core';
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

	// User profile
	let userProfileId = $state<string | null>(null);
	let userProjectsFiles = $state<Record<string, ProjectFile[]>>({});

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

	// Keyboard navigation for playhead
	let selectedFrame = $state<number>(0);
	let totalFrames = $state(241);
	let pipes = $derived(selectedSession?.pipes ?? []);
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			selectedFrame = Math.max(0, (selectedFrame || 0) - 8);
		} else if (e.key === 'ArrowRight') {
			selectedFrame = Math.min(totalFrames, (selectedFrame || 0) + 8);
		}
	}

	// Load projects from backend
	async function loadProjects() {
		try {
			loading = true;
			error = null;

			// Check if we're in Tauri environment
			if (!isTauri()) {
				console.warn('[Workspace] Not running in Tauri, skipping backend load');
				return;
			}

			// Get user profile first
			if (!userProfileId) {
				const profileResult = await invoke('get_user_profile', {
					input: { userName }
				});
				userProfileId = profileResult as string;
			}

			// Call backend to get projects with profile_id
			const result = await invoke('list_projects', {
				input: { profile_id: userProfileId }
			});
			const backendProjectsResult = result as any[];

			// Convert backend format to frontend format
			let backendProjects = (backendProjectsResult || []).map((p: any) => ({
				id: p.id,
				name: p.name,
				createdAt: new Date(p.created_at).getTime(),
				directoryPath: p.directory_path || '',
				sessions: [], // Will be populated below
				totalGenerations: 0,
				updatedAt: Date.now(),
				profileId: p.profile_id || ''
			})) as ProjectData[];

			// Fetch sessions for each project
			for (const proj of backendProjects) {
				try {
					const sessionsResult = await invoke('list_sessions', {
						input: { project_id: proj.id }
					});
					const backendSessions = (sessionsResult as any[]).map((s: any) => ({
						id: s.id,
						name: s.name,
						createdAt: s.created_at ? new Date(s.created_at).getTime() : Date.now(),
						updatedAt: s.updated_at ? new Date(s.updated_at).getTime() : Date.now(),
						directoryPath: s.directory_path || '',
						pipes: [], // Pipes loaded via get_composer when session is selected
						fps: s.fps || 24,
						resolution: s.resolution || '720p',
						orientation: s.orientation || 'horizontal',
						totalGeneratedFrames: s.total_generated_frames || 0
					}));
					proj.sessions = backendSessions;
				} catch (e) {
					console.error(`[Workspace] Failed to load sessions for project ${proj.id}:`, e);
				}
			}

			projects = backendProjects;

			// Fetch files for each project
			for (const proj of projects) {
				try {
					const filesResult = await invoke('list_project_files', {
						input: { project_id: proj.id }
					});
					const files = (filesResult as any[]).map((f: any) => ({
						id: f.id,
						fileName: f.file_name,
						filePath: f.file_path,
						fileType: f.file_type,
						fileSize: f.file_size,
						addedAt: new Date(f.added_at).getTime()
					}));
					userProjectsFiles = { ...userProjectsFiles, [proj.id]: files };
				} catch (e) {
					console.error(`[Workspace] Failed to load files for project ${proj.id}:`, e);
				}
			}

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
					let parsed: any = JSON.parse(saved);
					// Ensure parsed is an array
					if (!Array.isArray(parsed)) {
						console.error('[Workspace] Invalid projects format in localStorage, resetting');
						parsed = [];
					}
					// Migrate old globalPrompt -> globalNodes format for each pipe in each session
					parsed = parsed.map((project: any) => ({
						...project,
						sessions: (project.sessions || []).map((session: any) => ({
							...session,
							pipes: (session.pipes || []).map((p: any) => migratePipe(p))
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

	// Register store update callback - reload session from backend when changed
	setOnUpdate(async (sessionId) => {
		if (selectedSessionId === sessionId && selectedProject) {
			// Update the project's session data with loaded pipes
			const freshSession = sessions.get(sessionId);
			if (freshSession) {
				const updatedProjects = (projects || []).map((p: any) => {
					if (p.id !== selectedProject.id) return p;
					return {
						...p,
						sessions: (p.sessions || []).map((s: any) =>
							s.id === sessionId ? { ...freshSession } : s
						)
					};
				});
				projects = updatedProjects;
				saveProjects();
			}
		}
	});

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

	async function handleSessionSelect(sessionId: string) {
		const foundProject = projects.find(p =>
			p.sessions.some(s => s.id === sessionId)
		);

		if (foundProject) {
			selectedProjectId = foundProject.id;
			selectedSessionId = sessionId;

			// Load fresh data from backend
			const loadResult = await loadSession(sessionId);

			// Update the project's session data with loaded pipes
			if (loadResult.errors.length === 0) {
				const loadedSession = sessions.get(sessionId);
				if (loadedSession) {
					// Update the project's session with loaded data
						const updatedProjects = (projects || []).map((p: any) => {
							if (p.id !== foundProject.id) return p;
							return {
								...p,
								sessions: (p.sessions || []).map((s: any) =>
									s.id === sessionId ? { ...s, ...loadedSession } : s
								)
							};
						});
					projects = updatedProjects;
					saveProjects();
				}
			}
		}
	}

	async function handleCreateProject(input: { name: string; path?: string }) {
			try {
				loading = true;
				const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
				const projectPath = `${basePath}\\${input.name}`;

				// Get user profile if not loaded
				if (!userProfileId) {
					const profileResult = await invoke('get_user_profile', {
						input: { userName }
					});
					userProfileId = profileResult as string;
				}

				// Create via backend
					const result = await invoke('create_project', {
						input: {
							name: input.name,
							directory_path: projectPath,
							profile_id: userProfileId
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
					profileId: userProfileId || ''
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
		hydrateSessions((projects || []).flatMap((p: any) => p.sessions || []));
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
				elements: [{
					id: crypto.randomUUID(),
					tag: 'timeline',
					segments: [],
				}],
			};

			const sessionName = `Session ${project.sessions.length + 1}`;

			// Auto-include project files in session
			const projectFiles = userProjectsFiles[projectId] || [];
			const filesMetadata = projectFiles.map(f => ({
				id: f.id,
				fileName: f.fileName,
				filePath: f.filePath,
				fileType: f.fileType,
				fileSize: f.fileSize
			}));

			const pipesJson = JSON.stringify([defaultPipe]);
			const result = await invoke('create_session', {
				input: {
					project_id: projectId,
					name: sessionName,
					pipes_json: pipesJson,
					files_metadata: filesMetadata.length > 0 ? JSON.stringify(filesMetadata) : null
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
			
			projects = (projects || []).map((p: any) =>
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
			elements: [{
				id: crypto.randomUUID(),
				tag: 'timeline',
				segments: [],
			}],
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

		projects = (projects || []).map((p: any) =>
			p.id === projectId ? updatedProject : p
		);

		selectedSessionId = newSession.id;
		saveProjects();
	}

	function handleRenameSession(sessionId: string, newName: string) {
		if (!selectedProject) return;
		
		const updatedSessions = (selectedProject?.sessions || []).map((s: any) =>
			s.id === sessionId ? { ...s, name: newName, updatedAt: Date.now() } : s
		);

		const updatedProject: ProjectData = {
			...selectedProject,
			sessions: updatedSessions,
			updatedAt: Date.now(),
		};

		projects = (projects || []).map((p: any) =>
			p.id === selectedProject.id ? updatedProject : p
		);
		saveProjects();
	}

	async function handleDeleteSession(projectId: string, sessionId: string) {
		try {
			// Delete via backend
				await invoke('delete_session', {
					input: { session_id: sessionId }
				});
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

		projects = (projects || []).map((p: any) =>
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
		const updatedProjects = (projects || []).map((p: any) => {
			if (p.id !== selectedProject.id) return p;
			return {
				...p,
				sessions: (p.sessions || []).map((s: any) =>
					s.id === updatedSession.id ? updatedSession : s
				)
			};
		});
		
		projects = updatedProjects;
		
		// Also try to persist to backend
			try {
				invoke('update_session', {
					input: {
						session_id: updatedSession.id,
						updates: {
							name: updatedSession.name,
							fps: updatedSession.fps,
							resolution: updatedSession.resolution,
							orientation: updatedSession.orientation,
							pipes_json: JSON.stringify(updatedSession.pipes),
							total_generated_frames: updatedSession.totalGeneratedFrames
						}
					}
				}).catch(e => console.error('[Workspace] Backend update failed:', e));
			} catch (e) {
				console.error('[Workspace] Failed to update session backend:', e);
			}
		
		saveProjects();
	}

	function handleGenerate() {
		if (!selectedSession || !selectedSession.pipes?.length) return;
		console.log('[Workspace] Generating video for session:', selectedSession.id);
		// TODO: Implement actual generation logic
	}

	function handleFpsChange(fps: number) {
		if (!selectedSession) return;
		selectedSession.fps = fps;
		handleSessionUpdate(selectedSession);
	}

	function handleResolutionChange(res: string) {
		if (!selectedSession) return;
		selectedSession.resolution = res;
		handleSessionUpdate(selectedSession);
	}

	function handleToolSelect(id: string) {
		activeTool = id;
	}

	function getHomeDir(): string {
		return typeof window !== 'undefined' 
			? (window as any).navigator?.userContext?.homeDirectory || 'C:\\Users\\user'
			: 'C:\\Users\\user';
	}

	onMount(async () => {
		// Wait for Tauri to be ready before loading projects
		await new Promise(resolve => setTimeout(resolve, 100));
		await loadProjects();
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

	{#if selectedSession && selectedProject}
	<div class="preview-area">
		<div class="preview-canvas">
			<div class="preview-playhead" style={`left: ${((selectedFrame || 0) / totalFrames) * 100}%`}>
				<div class="playhead-tip"></div>
				<div class="playhead-line"></div>
			</div>
			<div class="preview-frames">
				{#each [0, 8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240] as frame}
					{#if frame <= totalFrames}
					<div class="preview-tick" style={`left: ${(frame / (totalFrames - 1)) * 100}%`}>
						{#if frame % 32 === 0}<span class="tick-label">{frame}</span>{/if}
					</div>
					{/if}
				{/each}
			</div>
		</div>
		<div class="preview-meta">
			<span class="frame-indicator">Frame: <strong>{selectedFrame ?? 0}</strong> / {totalFrames}</span>
			<span class="pipe-count">{pipes.length} pipe{(pipes.length !== 1 ? 's' : '')}</span>
		</div>
	</div>
	{/if}

	<div class="workspace-body" onkeydown={handleKeyDown} role="main" tabindex="0">
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
					{totalFrames}
					{selectedFrame}
					onUpdate={handleSessionUpdate}
					onframechange={(f) => selectedFrame = f}
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
				unsynced={selectedSession ? (composerStore.unsynced.has(selectedSession.id) ?? false) : false}
				onselect={handleToolSelect}
				ongenerate={handleGenerate}
				onfpschange={handleFpsChange}
				onresolutionchange={handleResolutionChange}
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
		background: var(--bg-primary);
	}

	/* ── Full-Width Preview ── */
	.preview-area {
		height: 120px;
		background: var(--bg-secondary, #14141f);
		border-bottom: 1px solid var(--border, #2a2a3a);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.preview-canvas {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: linear-gradient(180deg, var(--bg-tertiary, #1e1e2e) 0%, var(--bg-secondary, #14141f) 100%);
	}

	.preview-playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--accent, #59B5FF);
		box-shadow: 0 0 8px var(--accent-glow, rgba(89, 181, 255, 0.5));
		z-index: 10;
		pointer-events: none;
	}

	.preview-playhead .playhead-tip {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 5px solid transparent;
		border-right: 5px solid transparent;
		border-top: 6px solid var(--accent, #59B5FF);
		filter: drop-shadow(0 0 4px var(--accent, #59B5FF));
	}

	.preview-frames {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.preview-tick {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border-light, #3a3a4a);
		transform: translateX(-50%);
	}

	.tick-label {
		position: absolute;
		bottom: 4px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		color: var(--text-muted, #6b6b80);
		white-space: nowrap;
	}

	.preview-meta {
		height: 24px;
		background: var(--bg-primary, #0a0a0f);
		border-top: 1px solid var(--border, #2a2a3a);
		display: flex;
		align-items: center;
		padding: 0 12px;
		gap: 16px;
	}

	.frame-indicator {
		font-size: 11px;
		color: var(--text-secondary, #a0a0b0);
	}

	.frame-indicator strong {
		color: var(--accent, #59B5FF);
		font-weight: 600;
	}

	.pipe-count {
		font-size: 10px;
		color: var(--text-muted, #6b6b80);
		margin-left: auto;
	}

	.workspace-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.left-column {
		width: 240px;
		min-width: 200px;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #14141f);
		border-right: 1px solid var(--panel-left-border, rgba(255, 215, 0, 0.35));
		box-shadow: var(--shadow-panel-left, inset 0 0 40px rgba(255, 215, 0, 0.03));
	}

	.composer-area {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: var(--panel-center-bg, rgba(255, 70, 70, 0.05));
		border-left: 1px solid var(--panel-center-border, rgba(255, 70, 70, 0.3));
		border-right: 1px solid var(--panel-right-border, rgba(255, 120, 190, 0.35));
	}

	.composer-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted, #6b6b80);
		gap: 16px;
	}

	.empty-icon {
		font-size: 64px;
		opacity: 0.4;
		filter: drop-shadow(0 0 20px var(--accent-glow, rgba(89, 181, 255, 0.35)));
	}

	.empty-icon h2 {
		font-size: 22px;
		font-weight: 600;
		color: var(--text-primary, #ffffff);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.empty-icon p {
		font-size: 13px;
		color: var(--text-secondary, #a0a0b0);
		max-width: 280px;
		text-align: center;
		line-height: 1.5;
	}
</style>

