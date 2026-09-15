<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import GenerateModal from './ComposerModals/GenerateModal.svelte';
	import GenerationProgressModal from './ComposerModals/GenerationProgressModal.svelte';
	import type { ProjectData, SessionData, PipeRow, ComposerFocus, ProjectFile, GenerationTaskView } from '$types';
	import { getMaxFramesForResolution } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { summarizePipe } from '$lib/promptEngine';
	import { collectRemoteUrls, checkRemoteUrls, type RefUrlTarget } from '$lib/refCheck';
	import { pollTask, isTerminalTaskStatus, type PollHandle } from '$lib/taskPoller';
	import { refOutcomes } from '$lib/generationOutcome';
	import { toMediaUrl } from '$lib/mediaUrl';
	import { migratePipe, attachLastGeneration, markRefStatus } from '$lib/composerStore';
	import { hydrateSessions, setOnUpdate, loadSession, saveSession, sessions, composerStore, updateQ, updateC, updateFPS, updateResolution, updateOrientation } from '$lib/composerStore';
	import { getComposerUiVariant, setComposerUiVariant, type ComposerUiVariant } from '$lib/composerUiVariant';
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
	let activePipeIdx = $state<number | null>(null);
	let pipes = $derived(selectedSession?.pipes ?? []);

	// A/B composer presentation variant (Current / Fixed). Same store,
	// services, data model, and frame geometry power both — only the
	// ComposerPanel presentation differs. Persisted per browser.
	let composerUiVariant = $state<ComposerUiVariant>(getComposerUiVariant());
	function toggleComposerUiVariant(next: ComposerUiVariant) {
		composerUiVariant = next;
		setComposerUiVariant(next);
	}
	// Context-sensitive tool-panel focus. The ComposerPanel is the source of
	// truth (it refines focus as the user works: session → pipe → tag).
	// Project level = summary only; session = video settings + generation.
	let focus = $state<ComposerFocus>({ level: 'project' });
	$effect(() => {
		// No active session → project summary view.
		if (!selectedSession) {
			focus = { level: 'project' };
			return;
		}
		// With a session, the panel drives session/pipe/tag; on session
		// change, fall back to the session level until the panel refines it.
		if (focus.level === 'project' || (focus.level === 'session' && focus.id !== selectedSession.id)) {
			focus = { level: 'session', id: selectedSession.id };
		}
	});
	// Session preview ruler frame count. The session video is the *result* of
	// the generated pieces (its own artifact length) — NOT a mechanical sum of
	// the pipes. Until that artifact is persisted (session-video entity, not
	// yet modeled), the placeholder is the longest pipe (answer 1c). Pipes are
	// 8n+1, so the max stays 8n+1.
	let totalFrames = $derived(
		pipes.length > 0 ? Math.max(...pipes.map(p => p?.lengthFrames ?? 0)) : 241
	);
	let activePipe = $derived(selectedSession?.pipes[activePipeIdx ?? 0] ?? selectedSession?.pipes[0] ?? null);

	// ── Generation flow state (pipe-level, decisions D1–D9) ─────────────────
	// brokenRefs: `${pipeId}:${refId}` of references whose URL failed the
	// accessibility check (D5) — chips are red-out until re-validated.
	let brokenRefs = $state<Set<string>>(new Set());
	let generateModalPipeId = $state<string | null>(null);
	let showGenerateModal = $state(false);
	let showProgressModal = $state(false);
	let activeTask = $state<GenerationTaskView | null>(null);
	let poller: PollHandle | null = null;
	let previewVideo = $state<{ url: string; label: string } | null>(null);

	const anyTaskActive = $derived(activeTask !== null && !isTerminalTaskStatus(activeTask.status));
	const generatePipe = $derived.by(() => {
		if (!generateModalPipeId || !selectedSession) return null;
		return selectedSession.pipes.find((p) => p.id === generateModalPipeId) ?? null;
	});
	// Session-ruler tick strip, generated to the (placeholder) session length
	// instead of a hardcoded [0..240] array that assumes 720p.
	// Ruler tick strip, generated to the (placeholder) session length.
	// Fed to the tiny global ruler overlay in the top-panel Frame strip.
	let previewTicks = $derived.by(() => {
		const ticks: number[] = [];
		const last = totalFrames - 1;
		for (let f = 0; f <= last; f += 8) ticks.push(f);
		return ticks;
	});

	// The global frame ruler overlay is disabled by default — it opts into a
	// special mode in future development. No UI toggle ships today.
	let showGlobalRuler = $state(false);

	// Reset composer-local UI state whenever the active session changes so a
	// stale activePipeIdx / selectedFrame from the previous session never
	// points at a pipe that doesn't exist in the new one (which would break
	// totalFrames + ruler alignment). Keyed on selectedSessionId: the effect
	// body only *reads* that value, so it re-runs exactly on session change.
	$effect(() => {
		const id = selectedSessionId; // read-only: re-runs when the session changes
		if (id !== undefined) {
			activePipeIdx = 0;
			selectedFrame = 0;
		}
	});
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			selectedFrame = Math.max(0, (selectedFrame || 0) - 8);
		} else if (e.key === 'ArrowRight') {
			selectedFrame = Math.min(totalFrames - 1, (selectedFrame || 0) + 8);
		}
	}

	// Quality / Creativity edits target the ACTIVE pipe (per-pipe fields)
	async function handleQValueChange(q: number) {
		if (!selectedSession || !activePipe) return;
		const r = await updateQ(selectedSession.id, activePipe.id, q);
		if (r.errors.length > 0) console.error('[Workspace] updateQ:', r.errors);
	}

	async function handleCValueChange(c: number) {
		if (!selectedSession || !activePipe) return;
		const r = await updateC(selectedSession.id, activePipe.id, c);
		if (r.errors.length > 0) console.error('[Workspace] updateC:', r.errors);
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
				hydrateSessions(parsed.flatMap((p: any) => p.sessions));
				
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

	// Register store update callback.
	// Two jobs:
	//  1. Re-sync the mutated store session back into `projects` so
	//     selectedSession -> ComposerPanel re-renders (store mutates in place).
	//  2. Persist composer mutations to SQLite via saveSession (debounced).
	//     SQLite is the source of truth; no longer routes through saveProjects.
	const saveTimers = new Map<string, number>();
	setOnUpdate((sessionId) => {
		// 1) UI re-sync - only for the session the user is currently viewing
		if (selectedSessionId === sessionId && selectedProject) {
			const freshSession = sessions.get(sessionId);
			if (freshSession) {
				projects = (projects || []).map((p: any) => {
					if (p.id !== selectedProject.id) return p;
					return {
						...p,
						sessions: (p.sessions || []).map((s: any) =>
							s.id === sessionId ? { ...freshSession } : s
						)
					};
				});
			}
		}

		// 2) Persistence - debounced per session
		const pending = saveTimers.get(sessionId);
		if (pending !== undefined) window.clearTimeout(pending);
		saveTimers.set(sessionId, window.setTimeout(() => {
			saveTimers.delete(sessionId);
			if (!isTauri()) {
				// Browser dev mode: no backend - keep the legacy local path
				saveProjects();
				return;
			}
			saveSession(sessionId).then((r) => {
				if (r.errors.length > 0) console.error('[Workspace] saveSession:', r.errors);
			});
		}, 800));
	});

	// Persist UI selection + (browser-only) project snapshot.
	// In Tauri, SQLite is the source of truth for projects/sessions/composers,
	// so the localStorage project blob is intentionally NOT written - it would
	// be a shadow copy that can silently diverge. Selection prefs are harmless
	// UI state and stay in localStorage in both modes.
	async function saveProjects() {
		try {
			if (!isTauri()) {
				// Browser dev mode: localStorage is the only persistence available
				localStorage.setItem(`vm-projects-${userName}`, JSON.stringify(projects));
			}

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

			if (loadResult.errors.length === 0) {
				const loadedSession = sessions.get(sessionId);
				if (loadedSession) {
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
			} else {
				// Backend load failed (no Tauri backend in browser/E2E mode, or the
				// composer row doesn't exist yet). Fall back to the local projects
				// copy so the composer store always has the session's real data
				// instead of a blank phantom.
				if (!sessions.get(sessionId)) {
					const local = foundProject.sessions.find((s: any) => s.id === sessionId);
					if (local) hydrateSessions([local as any]);
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

	async function handleDeleteProject(projectId: string) {
		// Delete via backend cascade (sessions, composers, generated_frames, files)
		if (isTauri()) {
			try {
				await invoke('delete_project', {
					input: { project_id: projectId }
				});
			} catch (e) {
				console.error('[Workspace] Failed to delete project in backend:', e);
				return;
			}
		}
		// Capture the project's session ids BEFORE filtering so we can
		// cancel their pending saves and evict them from the store Map.
		const removedProject = projects.find(p => p.id === projectId);
		const removedSessionIds = (removedProject?.sessions ?? []).map((s: any) => s.id);
		for (const sid of removedSessionIds) {
			const pending = saveTimers.get(sid);
			if (pending !== undefined) {
				window.clearTimeout(pending);
				saveTimers.delete(sid);
			}
			sessions.delete(sid);
		}
		projects = projects.filter(p => p.id !== projectId);
		if (selectedProjectId === projectId) {
			selectedProjectId = null;
			selectedSessionId = null;
		}
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
				name: 'Pipe 1',
				lengthFrames: maxFrames,
				keyframes: [],
				qValue: 18,
				cValue: 7,
				subjectReferences: [],
				elements: [{
					id: crypto.randomUUID(),
					tag: 'timeline',
					segments: [],
				}],
				orderIndex: 0,
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
			name: 'Pipe 1',
			lengthFrames: maxFrames,
			keyframes: [],
			qValue: 18,
			cValue: 7,
			subjectReferences: [],
			elements: [{
				id: crypto.randomUUID(),
				tag: 'timeline',
				segments: [],
			}],
			orderIndex: 0,
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
		// Register the fallback session in the composer store so composer
		// mutations don't hit a missing-session error (browser/dev mode has no
		// backend to create it server-side).
		hydrateSessions([newSession]);
		saveProjects();
		}

	async function handleRenameSession(sessionId: string, newName: string) {
		if (!selectedProject || !newName.trim()) return;

		// Persist the rename to SQLite (sessions.name)
		if (isTauri()) {
			try {
				await invoke('update_session', {
					input: { session_id: sessionId, updates: { name: newName } }
				});
			} catch (e) {
				console.error('[Workspace] Failed to rename session in backend:', e);
				return;
			}
		}

		// Sync the store's in-memory copy so the next saveSession writes the new name
		const storeSession = sessions.get(sessionId);
		if (storeSession) {
			storeSession.name = newName;
		}

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
		// Delete via backend cascade (composers, session_settings, generated_frames)
		if (isTauri()) {
			try {
				await invoke('delete_session', {
					input: { session_id: sessionId }
				});
			} catch (e) {
				console.error('[Workspace] Failed to delete session:', e);
				return;
			}
		}

		// Cancel any pending debounced save for this session - it no longer exists
		const pending = saveTimers.get(sessionId);
		if (pending !== undefined) {
			window.clearTimeout(pending);
			saveTimers.delete(sessionId);
		}
		// Remove from the store's in-memory Map (hydrateSessions only adds)
		sessions.delete(sessionId);

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
		hydrateSessions(updatedSessions);
		saveProjects();
	}

	// Settings (FPS / resolution / orientation) mutate through the
	// composerStore (updateFPS / updateResolution / updateOrientation), which
	// notifies onUpdate → UI re-sync + debounced saveSession() → SQLite.
	// There is no separate session-persistence path in this component.

	function handleGenerate() {
		if (!selectedSession || !selectedSession.pipes?.length) return;
		// Session-level "generate all pipes" is a future task (D3): make the
		// button honest instead of a silent no-op.
		flashToast(APP_CONSTANTS.strings.sessionGenRoadmap, 'info');
	}

	// ── Pipe-level generation flow (D1–D9) ──────────────────────────────────

	function openGenerateModal(pipeId: string) {
		if (!isTauri() || !selectedSession) return;
		generateModalPipeId = pipeId;
		showGenerateModal = true;
	}

	function markBrokenRefs(pipeId: string, broken: RefUrlTarget[]) {
		const prefix = `${pipeId}:`;
		brokenRefs = new Set(
			[...brokenRefs].filter((k) => !k.startsWith(prefix)).concat(broken.map((t) => `${pipeId}:${t.refId}`)),
		);
	}

	/** D5 gate: unreachable reference → no task, red-out chips, keep the modal open. */
	async function confirmGenerate() {
		if (!generatePipe || !selectedSession) return;
		const pipe = generatePipe;
		const broken = await checkRemoteUrls(collectRemoteUrls(pipe));
		if (broken.length > 0) {
			markBrokenRefs(pipe.id, broken);
			flashToast(`${APP_CONSTANTS.strings.refNotAccessible}: ${broken[0].url}`, 'error');
			return;
		}
		try {
			const res = await invoke<{ task_id: string }>('start_generation', {
				input: { session_id: selectedSession.id, pipe_id: pipe.id, prompt: summarizePipe(pipe) },
			});
			showGenerateModal = false;
			startWatchingTask(res.task_id);
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
			showGenerateModal = false;
		}
	}

	/** Re-validate one reference after its modal save; clears the red-out on success. */
	async function recheckRef(pipeId: string, refId: string) {
		const pipe = pipes.find((p) => p.id === pipeId);
		if (!pipe) return;
		const targets = collectRemoteUrls(pipe).filter((t) => t.refId === refId);
		const broken = await checkRemoteUrls(targets);
		if (broken.length === 0) {
			const key = `${pipeId}:${refId}`;
			brokenRefs = new Set([...brokenRefs].filter((k) => k !== key));
		} else {
			markBrokenRefs(pipeId, broken);
		}
	}

	async function fetchGenerationTask(taskId: string): Promise<GenerationTaskView> {
		return (await invoke('get_generation_task', { task_id: taskId })) as GenerationTaskView;
	}

	function startWatchingTask(taskId: string) {
		stopPoller();
		activeTask = null;
		showProgressModal = true;
		poller = pollTask({
			taskId,
			fetchTask: fetchGenerationTask,
			onTick: onTaskTick,
		});
	}

	function stopPoller() {
		poller?.stop();
		poller = null;
	}

	function onTaskTick(view: GenerationTaskView) {
		activeTask = view;
		if (isTerminalTaskStatus(view.status)) {
			stopPoller();
			handleTaskTerminal(view);
		}
	}

	/** Terminal state: flip reference statuses + attach the artifact (D1/D4). */
	function handleTaskTerminal(view: GenerationTaskView) {
		for (const o of refOutcomes(view)) {
			void markRefStatus(view.sessionId, view.pipeId, o.kind, o.refId, o.status);
		}
		if (view.status === 'done' && view.outputPath) {
			void attachLastGeneration(view.sessionId, view.pipeId, {
				taskId: view.taskId,
				videoPath: view.outputPath,
				generatedAt: Date.now(),
				status: 'done',
			});
			flashToast(APP_CONSTANTS.strings.generationComplete, 'success');
		} else if (view.status === 'cancelled') {
			flashToast(APP_CONSTANTS.strings.generationCancelled, 'info');
		} else {
			flashToast(view.error ?? APP_CONSTANTS.strings.generationFailed, 'error');
		}
		showProgressModal = false;
		activeTask = null;
	}

	async function cancelActiveTask() {
		if (!activeTask) return;
		try {
			await invoke('cancel_generation', { task_id: activeTask.taskId });
			// the poller's next tick sees the terminal cancelled state
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	function closeProgressModal() {
		stopPoller();
		showProgressModal = false;
		activeTask = null;
	}

	/** ToolsPanel last-gen thumb → top-panel preview (D9). */
	function openPreview(pipe: PipeRow) {
		const url = toMediaUrl(pipe.lastGeneration?.videoPath ?? null);
		if (!url) return;
		previewVideo = { url, label: pipe.name };
	}

	function handleFpsChange(fps: number) {
		if (!selectedSession) return;
		// Canonical path: mutate the store session, then notifyUpdate() drives
		// the UI re-sync + debounced saveSession() → SQLite. Never mutate
		// selectedSession directly — that diverges from the store and lets a
		// later composer mutation overwrite the setting with a stale value.
		updateFPS(selectedSession.id, fps);
	}

	function handleResolutionChange(res: string) {
		if (!selectedSession) return;
		updateResolution(selectedSession.id, res);
	}

	function handleOrientationChange(orientation: string) {
		if (!selectedSession) return;
		// Size (resolution) is an INDEPENDENT session-level setting — the user
		// owns the size selector; changing orientation never rewrites it.
		updateOrientation(selectedSession.id, orientation);
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

	onDestroy(() => stopPoller());
</script>

<div class={`workspace ${layoutMode}`}>
	<Frame
		{userName}
		{selectedTheme}
		{layoutMode}
		{showWelcome}
		video={previewVideo}
		showRuler={showGlobalRuler}
		ruler={selectedSession ? { ticks: previewTicks, total: totalFrames, frame: selectedFrame ?? 0 } : null}
		onlogout={handleLogout}
		onthemeChange={handleThemeChange}
		onlayoutChange={handleLayoutChange}
	/>

	{#if selectedSession && selectedProject}
	<div class="preview-area">
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
			<!-- ═══ DEV: A/B composer presentation variant ═══
			     Same store/services/data model/geometry; only the
			     ComposerPanel layout differs. Persisted per browser. -->
			<div class="composer-ui-variant" role="radiogroup" aria-label="Composer UI variant">
				<span class="variant-label">Composer UI</span>
				<button
					class="variant-opt" class:active={composerUiVariant === 'current'}
					role="radio" aria-checked={composerUiVariant === 'current'}
					onclick={() => toggleComposerUiVariant('current')}>○ Current</button>
				<button
					class="variant-opt" class:active={composerUiVariant === 'fixed'}
					role="radio" aria-checked={composerUiVariant === 'fixed'}
					onclick={() => toggleComposerUiVariant('fixed')}>● Fixed</button>
			</div>

			<!-- SAFE: Check session exists AND has project -->
			{#if selectedSession && selectedProject}
				<ComposerPanel
					session={selectedSession}
					{totalFrames}
					{selectedFrame}
					bind:activePipeIdx
					bind:focus
					onframechange={(f) => selectedFrame = f}
					uiVariant={composerUiVariant}
					brokenRefs={brokenRefs}
					onRefSaved={recheckRef}
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
				session={selectedSession}
				project={selectedProject}
				{activeTool}
				{focus}
				unsynced={selectedSession ? (composerStore.unsynced.has(selectedSession.id) ?? false) : false}
				qValue={activePipe?.qValue}
				cValue={activePipe?.cValue}
				onqvaluechange={handleQValueChange}
				oncvaluechange={handleCValueChange}
				onselect={handleToolSelect}
				ongenerate={handleGenerate}
				ongeneratepipe={openGenerateModal}
				onopenpreview={openPreview}
				pipegenerating={anyTaskActive}
				onfpschange={handleFpsChange}
				onresolutionchange={handleResolutionChange}
				onorientationchange={handleOrientationChange}
				/>
			{/if}

			<!-- ── Generation flow modals (pipe-level, D1–D9) ── -->
			{#if showGenerateModal && generatePipe && selectedSession}
				<GenerateModal
					pipe={generatePipe}
					session={selectedSession}
					bind:open={showGenerateModal}
					onConfirm={confirmGenerate}
				/>
			{/if}
			<GenerationProgressModal
				task={activeTask}
				busy={anyTaskActive}
				bind:open={showProgressModal}
				onCancel={cancelActiveTask}
				onClose={closeProgressModal}
			/>
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

	/* ── Session meta row (the global frame ruler now overlays the
	   top-panel Frame strip instead of a full-width canvas here) ── */
	.preview-area {
		height: 24px;
		background: var(--bg-secondary, #14141f);
		border-bottom: 1px solid var(--border, #2a2a3a);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.preview-meta {
		height: 24px;
		background: var(--bg-primary, #0a0a0f);
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
		overflow-y: auto;
		overflow-x: hidden;
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

	/* DEV: A/B composer variant switch (Current / Fixed). Floats over the
	   top of the composer column; purely presentation, no layout impact. */
	.composer-ui-variant {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		margin: 8px 8px 0;
		background: rgba(20, 20, 31, 0.85);
		backdrop-filter: blur(4px);
		border: 1px solid var(--border, #2a2a3a);
		border-radius: 8px;
		align-self: flex-start;
	}

	.composer-area .composer-ui-variant {
		margin: 8px;
	}

	.composer-ui-variant .variant-label {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted, #6b6b80);
	}

	.composer-ui-variant .variant-opt {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		color: var(--text-secondary, #a0a0b0);
		font-size: 12px;
		cursor: pointer;
		padding: 2px 8px;
		border-radius: 4px;
	}

	.composer-ui-variant .variant-opt.active {
		color: var(--accent, #59B5FF);
	}

	.composer-ui-variant .variant-opt:hover {
		background: var(--bg-tertiary, #1e1e2e);
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

