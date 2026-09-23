<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Frame from './Frame.svelte';
	import ProjectsPanel from './ProjectsPanel.svelte';
	import ComposerPanel from './ComposerPanel.svelte';
	import ProfilePanel from './ProfilePanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import GenerateModal from './ComposerModals/GenerateModal.svelte';
	import type { ModelSelection } from './ComposerModals/GenerateModal.svelte';
	import GenerationProgressModal from './ComposerModals/GenerationProgressModal.svelte';
	import SettingsModal from './Settings/SettingsModal.svelte';
	import type { ProjectData, SessionData, PipeRow, ComposerFocus, ProjectFile, GenerationTaskView, Settings, GenerationLogEntry, GenerationLogPiece } from '$types';
	import { getMaxFramesForResolution } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { summarizePipe } from '$lib/promptEngine';
	import { collectRemoteUrls, checkRemoteUrls, type RefUrlTarget } from '$lib/refCheck';
	import { pollTask, isTerminalTaskStatus, type PollHandle } from '$lib/taskPoller';
	import { subscribeGenTask } from '$lib/generationEvents';
	import { refOutcomes } from '$lib/generationOutcome';
	import { toMediaUrl } from '$lib/mediaUrl';
	import { migratePipe, attachLastGeneration, markRefStatus, attachGeneratedImage } from '$lib/composerStore';
	import { hydrateSessions, setOnUpdate, loadSession, saveSession, sessions, composerStore, updateQ, updateC, updateFPS, updateResolution, updateOrientation, setMediaMode } from '$lib/composerStore';
		import { getSettings, loadSettings, setOnSettingsChange, knownResolution, knownOrientation, logGeneration, getGenerationLog, getPreset, getModel, resolveSpecs, pipePrechecks, getProfileId } from '$lib/settings';
		import { generationFailureMessage, stageErrorLines } from '$lib/generationErrors';
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

	// Settings (Phase 2): live object + re-sync on store change. The store
	// replaces its object on every commit, so a plain reassignment re-renders.
	let settings = $state<Settings>(getSettings());
	setOnSettingsChange(() => {
		settings = getSettings();
	});

	// Media-mode UI driver (docs/agnes-model-catalog.md, Q7): the configured
	// video model spec carries the row-visibility rules for the pipe UI.
	const videoModelSpec = $derived.by(() => {
		const p = getPreset(settings.providers.video.preset);
		return p ? (getModel(p, settings.providers.video.model) ?? null) : null;
	});

	// ── Generation flow state (pipe-level, decisions D1–D9) ─────────────────
	// brokenRefs: `${pipeId}:${refId}` of references whose URL failed the
	// accessibility check (D5) — chips are red-out until re-validated.
	let brokenRefs = $state<Set<string>>(new Set());
	// Last task's terminal view, kept after the active watch ends so a later
	// refresh on the SAME task (focus / refresh button) still works: the
	// in-memory registry drops terminal tasks once it sees them, so the
	// backend fallback (DB row) no longer carries requestLog — re-seeding
	// from the cached view keeps the expander functional across re-syncs.
	let lastTaskView = $state<GenerationTaskView | null>(null);
	let generateModalPipeId = $state<string | null>(null);
	let showGenerateModal = $state(false);
	let showProgressModal = $state(false);
	let activeTask = $state<GenerationTaskView | null>(null);
	let activeTaskId = $state<string | null>(null);
	let poller: PollHandle | null = null;
	let genUnlisten: (() => void) | null = null;
	// Tasks whose terminal state we've already processed, so a live event + an
	// on-demand refresh (focus / refresh button) + the fallback poll don't
	// double-apply the terminal side-effects.
	let terminalHandled = new Set<string>();
	let previewVideo = $state<{ url: string; label: string } | null>(null);
	// Portable generation log entry for the active task (Phase 4): the
	// progress modal shows WHICH model made each piece. Attached synchronously
	// when the watch starts, so the modal has the run's state from the moment
	// it opens; re-assigned on the terminal upsert; cleared when the watch ends.
	let activeLogEntry = $state<GenerationLogEntry | null>(null);
	// Last generate-params capture: models + seed from the most recent
	// `confirmGenerate`, kept so a "Reset generation" (stop this task + resend)
	// can replay the exact same run without re-opening the generate modal.
	let lastGenerateParams = $state<{ pipeId: string; models: ModelSelection; seed: number | null } | null>(null);

	// Minimized progress modal (D10): the user hides the modal to keep working
	// while the task watcher (poller + event stream) stays live. A persistent
	// pill in the top panel shows the active task so the user can return to the
	// full modal with one click. Distinct from `closeProgressModal` (which stops
	// watching) — this only toggles the DOM visibility.
	let progressMinimized = $state(false);
	// The pill's terminal marker (D10): when a task finishes while the modal is
	// minimized, the pill flips to done/error so the outcome is visible in the
	// top panel even without re-opening the modal. Reset on the next task.
	let pillTerminal = $state<'done' | 'error' | null>(null);
	// Close-app guard (D10): the backend blocks a window close while a
	// generation task is live (closing would cancel the provider job) and
	// emits `close-blocked` with the active count. Show a confirm dialog; on
	// "close anyway" the user cancels the task(s) first, then re-issues the
	// close (which now finds 0 active tasks and succeeds). "Keep working"
	// just dismisses the dialog.
	let closeBlocked = $state(false);
	let closeBlockedCount = $state(0);
	let closeBlockedUnlisten: (() => void) | null = null;
	// "Cancel task & close" is in progress: cancel-all was issued, but the
	// engine hasn't reached its terminal state yet (cooperative cancel — it
	// notices between poll ticks). The guard stays open showing this state
	// so the user isn't stuck with no feedback; the close re-issue happens
	// only once the backend confirms 0 active tasks.
	let closeCancelling = $state(false);

	/** "Close anyway": cancel ALL active tasks, wait for the terminal
	 *  transition (the engine is cooperative — cancel is observed between
	 *  poll ticks, up to 10 s, or up to the 503 backoff hold), then re-issue
	 *  the window close. The backend finds 0 active tasks and allows it. */
	async function closeAnyway() {
		if (closeCancelling) return; // already in flight
		if (!isTauri()) return;
		closeCancelling = true;
		stopWatching();
		try {
			await invoke('cancel_all_generation');
			// Wait for the cooperative cancel to land (tasks reach terminal
			// `cancelled` → active count drops to 0). Bounded so a stuck
			// engine can't wedge the quit flow forever; on timeout we still
			// re-issue the close and let the backend guard decide.
			const deadline = Date.now() + 30_000;
			while (Date.now() < deadline) {
				const active = await invoke<number>('generation_active_task_count');
				if (active === 0) break;
				await new Promise((r) => setTimeout(r, 250));
			}
		} catch (e) {
			console.warn('[Workspace] cancel-all on close-anyway failed:', e);
		}
		closeCancelling = false;
		closeBlocked = false;
		// The backend re-checks the active count on the next close request.
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().close();
	}

	/** "Keep working": dismiss the dialog, the app stays open. */
	function keepWorking() {
		if (closeCancelling) return; // cancel-all in flight: don't dismiss
		closeBlocked = false;
	}

	// Settings modal (Phase 3): opened from the profile panel (Defaults tab)
	// or, in Phase 4, the provider status chip (Providers tab).
	let showSettings = $state(false);
	let settingsTab = $state<'defaults' | 'providers' | 'tools'>('defaults');

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
						// 0009: the session's own media dir wins; fall back to the
						// project's dir when the session has none set.
						directoryPath: s.directory_path || s.project_directory_path || '',
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

			// New sessions inherit the user's generation defaults (Phase 2);
			// free-form settings strings are coerced into known values.
			const d = getSettings().generationDefaults;
			const defaultResolution = knownResolution(d.resolution);
			const defaultOrientation = knownOrientation(d.orientation);
			const maxFrames = getMaxFramesForResolution(defaultResolution);
			const defaultPipe: PipeRow = {
				id: crypto.randomUUID(),
				name: 'Pipe 1',
				lengthFrames: maxFrames,
				keyframes: [],
				qValue: d.qValue,
				cValue: d.cValue,
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
				fps: d.fps,
				resolution: defaultResolution,
				orientation: defaultOrientation,
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
		
		const d = getSettings().generationDefaults;
		const defaultResolution = knownResolution(d.resolution);
		const defaultOrientation = knownOrientation(d.orientation);
		const maxFrames = getMaxFramesForResolution(defaultResolution);
		const defaultPipe: PipeRow = {
			id: crypto.randomUUID(),
			name: 'Pipe 1',
			lengthFrames: maxFrames,
			keyframes: [],
			qValue: d.qValue,
			cValue: d.cValue,
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
			fps: d.fps,
			resolution: defaultResolution,
			orientation: defaultOrientation,
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

	// ── Open folder (project / session media dir, 0009) ───────────────────────

	async function handleOpenProjectFolder(projectId: string) {
		if (!isTauri()) return;
		// Backend resolves the project's media root (or errors when unset) and
		// reveals it in the OS explorer — not a picker. *nix builds reuse the
		// same helper (platform-appropriate opener in Rust).
		try {
			const dir = await invoke<string>('reveal_media_folder', { scope: 'project', id: projectId });
			flashToast(`Opened project folder: ${dir}`, 'info');
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	async function handleOpenSessionFolder(sessionId: string) {
		if (!isTauri()) return;
		try {
			const dir = await invoke<string>('reveal_media_folder', { scope: 'session', id: sessionId });
			flashToast(`Opened session folder: ${dir}`, 'info');
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	// ── Copy session (full duplicate, new name + id) ──────────────────────────

	// Copy a session: full duplicate (new id + name) with the source's media
	// tree (last-state images/videos) + last-generation state carried over
	// (backend does the heavy lift — Pipe::rekeyed re-mints ids, re-roots
	// artifact paths, and copies the media dir). The name suffixes "(copy)"
	// until it is unique among the project's sessions, and a lightweight
	// busy guard (reuses the project `loading` flag) covers the media copy,
	// which can take a moment for a dozen+ MB of artifacts.
	async function handleCopySession(sessionId: string) {
		if (!isTauri()) return;
		const src = (projects || []).flatMap((p: any) => p.sessions || []).find((s: any) => s.id === sessionId);
		const projectId = (projects || []).find((p: any) =>
			(p.sessions || []).some((s: any) => s.id === sessionId)
		)?.id;
		if (!src || !projectId) return;
		const baseName = src.name || 'Session';

		// "(copy)" → "(copy copy)" → … until unique within the project.
		const siblingNames = new Set(
			(projects || []).find((p: any) => p.id === projectId)?.sessions?.map((s: any) => s.name) ?? []
		);
		let newName = `${baseName} (copy)`;
		while (siblingNames.has(newName)) {
			newName = `${newName} (copy)`;
		}

		loading = true;
		try {
			const newId = await invoke<string>('duplicate_session', {
				input: { session_id: sessionId, new_name: newName },
			});
			if (!newId) return;

			// Deep-clone the pipes so the copy's in-memory snapshot is fully
			// independent of the source (no shared array refs). The backend
			// re-minted the piece ids + re-rooted the last-gen paths; `loadSession`
			// below pulls that authoritative copy into the store.
			const clonePipe = (p: any) => JSON.parse(JSON.stringify(p));
			const copySession: any = {
				...src,
				id: newId,
				name: newName,
				pipes: (src.pipes ?? []).map(clonePipe),
			};
			projects = (projects || []).map((p: any) =>
				p.id === projectId ? { ...p, sessions: [...p.sessions, copySession] } : p
			);
			// Select the copy immediately so it opens without a second click, and
			// load the backend's rekeyed + re-rooted composer.
			selectedSessionId = newId;
			selectedProjectId = projectId;
			const loadResult = await loadSession(newId);
			if (loadResult.errors.length === 0) {
				const loaded = sessions.get(newId);
				if (loaded) {
					projects = (projects || []).map((p: any) =>
						p.id === projectId
							? { ...p, sessions: p.sessions.map((s: any) => s.id === newId ? { ...s, ...loaded } : s) }
						: p
					);
				}
			}
			hydrateSessions((projects || []).flatMap((p: any) => p.sessions || []));
			flashToast(`Copied as "${newName}"`, 'success');
		} catch (e) {
			console.error('[Workspace] copy session:', e);
			flashToast('Failed to copy session', 'error');
		} finally {
			loading = false;
		}
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

	// ── Session video composition (A5): splice the pipes' last-gen videos ──

	let composing = $state(false);
	let ffmpegCapability = $state<{ source: string; path: string } | null>(null);

	onMount(() => {
		if (!isTauri()) return;
		const reprobe = () => {
			void invoke<{ source: string; path: string; versionLine: string }>('probe_ffmpeg')
				.then((r) => { ffmpegCapability = { source: r.source, path: r.path }; })
				.catch(() => { ffmpegCapability = null; });
		};
		reprobe();
		// Re-probe when a settings commit lands (a user-set ffmpeg path takes
		// effect without a restart).
		setOnSettingsChange(() => {
			void reprobe();
		});
	});

	function composeSessionVideo() {
		if (!selectedSession || composing) return;
		const hasSources = selectedSession.pipes?.some((p: any) => p.lastGeneration?.videoPath);
		if (!hasSources) {
			flashToast(APP_CONSTANTS.strings.composeSessionNoSources, 'info');
			return;
		}
		if (ffmpegCapability?.source === 'none') {
			flashToast(APP_CONSTANTS.strings.composeSessionNoFfmpeg, 'error');
			return;
		}
		composing = true;
		invoke<{ outputPath: string; ffmpegSource: string; sourcePipes: string[] }>(
			'compose_session_video',
			{ input: { session_id: selectedSession.id, pipe_ids: null } },
		)
		.then((r) => {
			flashToast(APP_CONSTANTS.strings.composeSessionDone, 'success');
			// Point the top panel at the composed file (served via read_media_file).
			previewVideo = null;
			void toMediaUrl(r.outputPath).then((url) => {
				if (url) previewVideo = { url, label: `${selectedSession?.name ?? 'Session'} — video` };
			});
		})
		.catch((e) => {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		})
		.finally(() => { composing = false; });
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
	async function confirmGenerate(models: ModelSelection, seed: number | null = null) {
		if (!generatePipe || !selectedSession) return;
		const pipe = generatePipe;
		// Pass the video media spec so collectRemoteUrls can skip subjects
		// when the model is in plain keyframe mode (subjects are inert there).
		const videoSpecForCheck = getPreset(settings.providers.video.preset) ?
			getModel(getPreset(settings.providers.video.preset)!, models.videoModel) : undefined;
		const videoMedia = videoSpecForCheck?.media;
		const broken = await checkRemoteUrls(collectRemoteUrls(pipe, videoMedia));
		if (broken.length > 0) {
			markBrokenRefs(pipe.id, broken);
			flashToast(`${APP_CONSTANTS.strings.refNotAccessible}: ${broken[0].url}`, 'error');
			return;
		}
		// Read-only (paid) model gate (Q3): visible in Settings, never generable.
		const vp = getPreset(settings.providers.video.preset);
		const vidSpec = vp ? getModel(vp, models.videoModel) : undefined;
		if (vidSpec?.readOnly) {
			flashToast('Video model is read-only (paid) — pick a generable model in Settings', 'error');
			return;
		}
		// Phase A: resolve the model specs and run the concrete pre-checks
		// (E4/E6). Any conflict blocks generation with its specific message.
		const pair = resolveSpecs(models.imageModel, models.videoModel);
		const conflicts = pipePrechecks(pipe, selectedSession, pair.image?.spec ?? null, pair.video?.spec ?? null);
		if (conflicts.length > 0) {
			for (const c of conflicts) flashToast(c.message, 'error');
			return;
		}
		try {
			const startedAt = Date.now();
			// 10 s guard: `start_generation` should resolve in < 1 s normally
			// (DB lock + registry start). A hang means the backend is stuck —
			// surface it rather than leaving the button on “Starting…” forever.
			const res = await Promise.race([
				invoke<{ task_id: string; view?: GenerationTaskView }>('start_generation', {
					input: {
						session_id: selectedSession.id,
						pipe_id: pipe.id,
						prompt: summarizePipe(pipe, { fps: selectedSession?.fps ?? undefined }),
						// Per-run model override (Phase 4): recorded in the log now,
						// consumed by the provider engine when it lands.
						image_model: models.imageModel,
						video_model: models.videoModel,
						seed: seed ?? undefined,
						// Phase A: profile + resolved specs travel with the task.
						profile_id: getProfileId() ?? undefined,
						image_spec: pair.image?.spec ?? undefined,
						video_spec: pair.video?.spec ?? undefined,
					},
				}),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('start_generation timed out after 10 s — backend is stuck')), 10000),
				),
			]);
			showGenerateModal = false;
			// Capture the exact run params so a later "Reset generation" can
			// replay this same run (same models + seed) without re-picking.
			lastGenerateParams = { pipeId: pipe.id, models, seed: seed ?? null };
			startWatchingTask(res.task_id, res.view ?? null);
			// Portable generation log: which model made which piece (P4/P5).
			// Built AFTER startWatchingTask (which resets the entry) so the
			// progress modal shows the run's state (models + full stage list)
			// from the moment it opens.
			const entry = buildGenerationLogEntry(res.task_id, selectedSession.id, pipe, models, startedAt, seed);
			activeLogEntry = entry;
			void writeGenerationLogStart(entry);
		} catch (e) {
			// start_generation rejected (or timed out): log the concrete reason
			// so a failed start is diagnosable, then keep the modal open — the
			// user can read the toast and re-try (a broken modal would hide it).
			console.error('[Workspace] start_generation failed:', e);
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	// ── Portable generation log (P4/P5) ──────────────────────────────
	/** One piece per keyframe / subject + the video stage; models as chosen. */
	function buildGenerationLogEntry(
		taskId: string,
		sessionId: string,
		pipe: PipeRow,
		models: ModelSelection,
		startedAt: number,
		seed: number | null = null,
	): GenerationLogEntry {
		const s = getSettings();
		const sess = selectedSession;
		const params = {
			fps: sess?.fps ?? s.generationDefaults.fps,
			resolution: sess?.resolution ?? s.generationDefaults.resolution,
			q: pipe.qValue,
			c: pipe.cValue,
			seed: seed ?? undefined,
		};
		const pieces: GenerationLogPiece[] = [
			...pipe.keyframes.map((k): GenerationLogPiece => ({
				kind: 'keyframe',
				refId: k.id,
				provider: s.providers.image.preset,
				model: models.imageModel,
				status: 'pending',
				params,
			})),
			...(pipe.subjectReferences ?? []).map((r): GenerationLogPiece => ({
				kind: 'subject',
				refId: r.id,
				provider: s.providers.image.preset,
				model: models.imageModel,
				status: 'pending',
				params,
			})),
			{
				kind: 'video',
				refId: pipe.id,
				provider: s.providers.video.preset,
				model: models.videoModel,
				status: 'pending',
				params,
			},
		];
		return {
			taskId,
			sessionId,
			pipeId: pipe.id,
			startedAt,
			status: 'running',
			pieces,
		};
	}

	/** Persist the start entry (redacted before it leaves the process, P5). */
	async function writeGenerationLogStart(entry: GenerationLogEntry) {
		try {
			await logGeneration(entry);
		} catch (e) {
			console.error('[Workspace] log_generation (start):', e);
		}
	}

	/** Terminal state: upsert the entry with per-piece results + finishedAt. */
	async function updateGenerationLog(view: GenerationTaskView) {
		try {
			const existing = await getGenerationLog(view.taskId);
			if (!existing) return;
			for (const stage of view.stages) {
				const piece = existing.pieces.find(
					(p) => p.kind === stage.sourceKind && p.refId === stage.sourceId,
				);
				if (!piece) continue;
				if (stage.status === 'done' || stage.status === 'ready') piece.status = 'done';
				else if (stage.status === 'error') piece.status = 'error';
				else piece.status = 'cancelled';
				if (stage.imageOutput) piece.outputRef = stage.imageOutput;
				if (stage.error) piece.error = stage.error;
			}
			if (view.status === 'done' && view.outputPath) {
				const videoPiece = existing.pieces.find((p) => p.kind === 'video');
				if (videoPiece) videoPiece.outputRef = view.outputPath;
			}
			existing.status = view.status === 'done' ? 'done' : view.status === 'cancelled' ? 'cancelled' : 'error';
			existing.finishedAt = Date.now();
			if (activeLogEntry?.taskId === view.taskId) activeLogEntry = existing;
			await logGeneration(existing);
		} catch (e) {
			console.error('[Workspace] log_generation (terminal):', e);
		}
	}

	/** Re-validate one reference after its modal save; clears the red-out on success. */
	async function recheckRef(pipeId: string, refId: string) {
		const pipe = pipes.find((p) => p.id === pipeId);
		if (!pipe) return;
		const vs = getPreset(settings.providers.video.preset);
		const vm = vs?.models.find((m) => m.id === settings.providers.video.model)?.media;
		const targets = collectRemoteUrls(pipe, vm).filter((t) => t.refId === refId);
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

	/** Apply the terminal side-effects exactly once per task. A live event + an
	 *  on-demand refresh (focus / refresh button) + the fallback poll can all see
	 *  the terminal state; this dedups so the effects run once. */
	async function reconcileTerminal(view: GenerationTaskView) {
		if (terminalHandled.has(view.taskId)) return;
		terminalHandled.add(view.taskId);
		// Cache the terminal view so the requestLog path (absent on DB-fallback
		// rows on pre-0007 DBs, always dropped by the evicted-registry path)
		// survives later re-syncs of the same task.
		if (view.requestLog) lastTaskView = view;
		await handleTaskTerminal(view);
	}

	/** Watch a task: subscribe to the backend state-machine events (primary,
	 *  low latency) AND keep the 1 s poll as a fallback in case an event is
	 *  dropped (webview reloaded, tab backgrounded). Both drive the same
	 *  `activeTask` view; terminal side-effects apply once via `reconcileTerminal`. */
	function startWatchingTask(taskId: string, initialView?: GenerationTaskView | null) {
		stopWatching();
		lastTaskView = initialView ?? null;
		activeTaskId = taskId;
		activeTask = initialView ?? null;
		activeLogEntry = null;
		showProgressModal = true;
		// A fresh task: clear the previous task's terminal marker + minimize
		// flag so the pill reads as a new running task, not a stale outcome.
		pillTerminal = null;
		progressMinimized = false;
		// Seed with the authoritative view right now (the machine may already be
		// ahead of the first event / tick), then follow the live stream.
		// The `start_generation` command returns the initial view so the modal
		// has state (stage list + progress) from the moment it opens instead of
		// waiting for the first refresh/event round-trip.
		void refreshActiveTask();
		poller = pollTask({
			taskId,
			fetchTask: fetchGenerationTask,
			onTick: onTaskTick,
		});
		subscribeGenTask((ev) => {
			if (ev.taskId !== activeTaskId) return;
			activeTask = ev.view;
			if (ev.view.requestLog) lastTaskView = ev.view;
			if (ev.kind === 'terminal') void reconcileTerminal(ev.view);
		}).then((unlisten) => {
			genUnlisten = unlisten;
		});
	}

	function stopWatching() {
		stopPoller();
		genUnlisten?.();
		genUnlisten = null;
		activeTaskId = null;
	}

	function stopPoller() {
		poller?.stop();
		poller = null;
	}

	/** Fallback tick (1 s poll): drive `activeTask` the same way events do. */
	function onTaskTick(view: GenerationTaskView) {
		activeTask = view;
		if (view.requestLog) lastTaskView = view;
		if (isTerminalTaskStatus(view.status)) {
			stopPoller();
			void reconcileTerminal(view);
		}
	}

	/** On-demand refresh: re-read the authoritative view from the backend cache
	 *  (registry / DB fallback). Triggered by the modal's refresh button and by
	 *  window focus — the user's "am I on the latest?" gesture. The DB fallback
	 *  row drops `requestLog`, so re-seed it from the cached view when we have
	 *  one for this task: the expander must stay usable on re-syncs, not just
	 *  on the initial event stream. */
	async function refreshActiveTask() {
		if (!activeTaskId) return;
		try {
			const view = await fetchGenerationTask(activeTaskId);
			if (view.taskId !== activeTaskId) return; // task changed mid-fetch
			if (!view.requestLog && lastTaskView?.taskId === activeTaskId && lastTaskView.requestLog) {
				view.requestLog = lastTaskView.requestLog;
			}
			activeTask = view;
			if (isTerminalTaskStatus(view.status)) await reconcileTerminal(view);
		} catch (e) {
			console.error('[Workspace] refreshActiveTask:', e);
		}
	}

	/** Window focus may have let events be coalesced/throttled; re-sync. */
	function onWindowFocus() {
		if (activeTaskId && activeTask && !isTerminalTaskStatus(activeTask.status)) {
			void refreshActiveTask();
		}
	}

	/** Terminal state: flip reference statuses + attach the artifact (D1/D4). */
	async function handleTaskTerminal(view: GenerationTaskView) {
		await updateGenerationLog(view);
		for (const o of refOutcomes(view)) {
			await markRefStatus(view.sessionId, view.pipeId, o.kind, o.refId, o.status);
		}
		// Link every completed image stage back to its keyframe/subject so the
		// chip shows the thumbnail and the next video run can prefer the
		// fetchable remote URL. Await each attach so the in-memory session is
		// fully updated before the forced save below persists it to SQLite —
		// the 800 ms notifyUpdate debounce alone is not enough: the user can
		// close the app before it fires, and the recovery backfill (session
		// load) has to re-do the work on every start.
		for (const stage of view.stages) {
			if (
				stage.imageOutput &&
				(stage.status === 'done' || stage.status === 'ready') &&
				stage.sourceKind !== 'video'
			) {
				await attachGeneratedImage(
					view.sessionId,
					view.pipeId,
					stage.sourceKind === 'keyframe' ? 'keyframe' : 'subject',
					stage.sourceId,
					stage.imageOutput,
					stage.imageRemoteUrl ?? undefined,
				);
			}
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
			// Terminal task error (or missing error): surface the concrete
			// reason (task-level error, else the failing stage's message).
			const reason = generationFailureMessage(view) ?? APP_CONSTANTS.strings.generationFailed;
			console.error('[Workspace] generation task failed:', {
				taskId: view.taskId,
				status: view.status,
				reason,
				stages: stageErrorLines(view),
			});
			flashToast(reason, 'error');
		}
		// D10 notification-on-terminal: when the user minimized the modal to
		// keep working, the toast above is the only in-app signal — the pill
		// (top panel) flips to the terminal color so it's visible even without
		// watching the modal. If the modal is open the user already sees the
		// outcome (OK footer), so no extra noise.
		if (progressMinimized) {
			pillTerminal = view.status === 'done' ? 'done' : 'error';
		}
		// Force-persist the just-mutated session (ref statuses + preview
		// paths + last-generation artifact) so it survives an immediate app
		// close; the 800 ms notifyUpdate debounce is not guaranteed to fire.
		void saveSession(view.sessionId);
		// Keep the modal open on terminal state: the user must click OK to
		// acknowledge the outcome (success / error / cancel). Auto-closing hid
		// the result before the user could read it, especially when a task
		// failed fast right after start.
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

	/** "Reset generation" (long 503/429 saturation): stop the current task and
	 *  immediately resend the same run. The cancel resolves to the terminal
	 *  `cancelled` state via the existing watcher; once the slot is free the
	 *  re-fired `confirmGenerate` starts a fresh task with identical params
	 *  (models + seed captured at the last confirm). Guarded against a double
	 *  click racing the terminal event. */
	async function resetGeneration() {
		const cancelledId = activeTaskId;
		if (!cancelledId || !anyTaskActive || !lastGenerateParams) return;
		const params = lastGenerateParams;
		try {
			await invoke('cancel_generation', { task_id: cancelledId });
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
			return;
		}
		// Wait until the cancelled task reaches its terminal state so the
		// sequential engine slot is free for the re-send, then replay.
		const reSend = () => {
			if (cancelledId === activeTaskId || anyTaskActive) {
				// Terminal not seen yet (or a different task took over) — poll.
				setTimeout(reSend, 250);
				return;
			}
			const pipe = selectedSession?.pipes.find((p) => p.id === params.pipeId);
			if (!pipe) {
				flashToast('Reset: pipe no longer available', 'error');
				return;
			}
			void confirmGenerate(params.models, params.seed ?? undefined);
		};
		reSend();
	}

	function closeProgressModal() {
			const closedId = activeTaskId;
			stopWatching();
			showProgressModal = false;
			progressMinimized = false;
			activeTask = null;
			activeLogEntry = null;
			// No longer watching: drop the cached view too (a fresh task re-seeds it).
			lastTaskView = null;
			// The task ended + the user acknowledged it; the dedup record is no
			// longer needed (a regenerate starts a fresh task id).
			if (closedId) terminalHandled.delete(closedId);
		}

	/** "Close app" is NOT offered from the generation progress modal footer —
	 *  after "Cancel all" the task simply reaches terminal `cancelled` and the
	 *  user dismisses with OK. The app-close guard modal owns the quit path
	 *  (its own cancel-all + settle + window close).
	 */

	/** Minimize the modal (D10): hide the DOM, keep the watcher (poller +
	 *  event stream) running so the task keeps advancing and the terminal
	 *  side-effects still fire. The persistent pill re-opens the modal. */
	function minimizeProgressModal() {
		if (!anyTaskActive) return; // terminal: just close it instead
		showProgressModal = false;
		progressMinimized = true;
	}

	/** Re-open the modal from the pill (D10). */
	function restoreProgressModal() {
		if (!activeTaskId) return;
		showProgressModal = true;
		progressMinimized = false;
		void refreshActiveTask(); // re-sync now that the user is back
	}

	/** ToolsPanel last-gen thumb → top-panel preview (D9, served via Phase E media command). */
	function openPreview(pipe: PipeRow) {
		// Clear the current preview first: a fresh blob URL is about to take
		// over, and a stale/failed shell (0:00 <video>) must not linger in
		// the top panel while the new one loads.
		previewVideo = null;
		toMediaUrl(pipe.lastGeneration?.videoPath ?? null)
			.then((url) => {
				if (url) previewVideo = { url, label: pipe.name };
			})
			.catch((e) => {
				// Media read failed (path moved / not under a media root): keep
				// the top panel on its empty state instead of a dead <video>,
				// and surface why so the user knows it's not a silent no-op.
				console.error('[Workspace] openPreview:', e);
				flashToast('Could not load the generated video preview', 'error');
			});
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
		// Settings follow the active profile (Tauri) or the username
		// (browser dev fallback); a failed load falls back to defaults.
		void loadSettings(userProfileId || userName);
		// On-demand re-sync: if the window regains focus while a task is live,
		// the event stream may have been throttled / the webview backgrounded —
		// pull the authoritative view so the modal catches up.
		window.addEventListener('focus', onWindowFocus);
		// Close-app guard (D10): the backend blocks a window close while a
		// generation task is live and tells us via `close-blocked`. Show the
		// confirm dialog so the user can cancel the task(s) and close for real.
		if (isTauri()) {
			void listen('close-blocked', (e) => {
				// A cancel-all is already in flight: the close re-issue is coming
				// as soon as the backend confirms 0 active tasks — don't re-open
				// the guard dialog on a close attempt that lands mid-cancel.
				if (closeCancelling) return;
				closeBlockedCount = (e.payload as number) ?? 0;
				closeBlocked = true;
			}).then((un) => closeBlockedUnlisten = un);
		}
	});

	onDestroy(() => {
		window.removeEventListener('focus', onWindowFocus);
		closeBlockedUnlisten?.();
		stopWatching();
		setOnSettingsChange(null);
	});
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
		providers={settings.providers}
		onopenprovidersettings={() => {
			settingsTab = 'providers';
			showSettings = true;
		}}
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
					onopenprojectfolder={handleOpenProjectFolder}
					onopensessionfolder={handleOpenSessionFolder}
					oncopysession={handleCopySession}
				/>
			{/if}

			<ProfilePanel
				{userName}
				{projects}
				{selectedProjectId}
				{selectedSessionId}
				onopensettings={() => {
					settingsTab = 'defaults';
					showSettings = true;
				}}
			/>
		</div>

		<div class="composer-area">
		<!-- SAFE: Check session exists AND has project -->
			{#if selectedSession && selectedProject}
				<ComposerPanel
					session={selectedSession}
					{totalFrames}
					{selectedFrame}
					bind:activePipeIdx
					bind:focus
					onframechange={(f) => selectedFrame = f}
					brokenRefs={brokenRefs}
					onRefSaved={recheckRef}
					videoModel={videoModelSpec}
					onmediamodechange={(pipeId, mode) => {
						if (selectedSession) void setMediaMode(selectedSession.id, pipeId, mode);
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
				oncomposesession={composeSessionVideo}
				ffmpegAvailable={ffmpegCapability ? ffmpegCapability.source !== 'none' : false}
				composing={composing}
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
				onMinimize={minimizeProgressModal}
				onRefresh={refreshActiveTask}
				logEntry={activeLogEntry}
				onReset={resetGeneration}
			/>

			<!-- D10 persistent pill: visible when the progress modal is minimized
			     (or the task just went terminal while it was), so the user can
			     return to the full modal with one click instead of hunting for it.
			     Terminal color (done = green, error = red) signals the outcome
			     without needing to re-open the modal. -->
			{#if (progressMinimized || (pillTerminal !== null && !showProgressModal)) && activeTask}
				<button
					class="gen-pill"
					class:gen-pill-done={pillTerminal === 'done'}
					class:gen-pill-error={pillTerminal === 'error'}
					onclick={restoreProgressModal}
					title="Generation task — click to open the progress modal"
				>
					<span class="gen-pill-dot" aria-hidden="true"></span>
					{#if pillTerminal === 'done'}
						<span class="gen-pill-text">Generation complete</span>
					{:else if pillTerminal === 'error'}
						<span class="gen-pill-text">Generation failed</span>
					{:else if anyTaskActive}
						<span class="gen-pill-text">Generation running · {activeTask.taskId.slice(0, 8)}</span>
					{:else}
						<span class="gen-pill-text">Generation finished · {activeTask.taskId.slice(0, 8)}</span>
					{/if}
				</button>
			{/if}

			<!-- D10 close-app guard: the backend blocked a window close while a
			     task was live. "Close anyway" cancels the task(s) then re-issues
			     the close; "Keep working" dismisses. -->
			{#if closeBlocked || closeCancelling}
				<div class="modal-overlay" role="presentation">
					<div class="modal close-guard-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
						<div class="modal-header">
							<h3>{closeCancelling ? 'Cancelling generation…' : `Running generation task${closeBlockedCount > 1 ? 's' : ''}`}</h3>
						</div>
						<div class="modal-body">
							{#if closeCancelling}
								<p>
									Cancelling {closeBlockedCount} generation task{closeBlockedCount > 1 ? 's' : ''}.
									The app will close as soon as the running stage finishes
									its current step — this can take up to a minute if the
									provider is mid-backoff.
								</p>
							{:else}
							<p>
									You have {closeBlockedCount} generation task{closeBlockedCount > 1 ? 's are' : ' is'} still running.
									Closing the app now will cancel them — the provider jobs will be
									aborted and any in-progress stage will be lost.
								</p>
							{/if}
						</div>
						<div class="modal-footer">
							{#if closeCancelling}
								<button class="btn-cancel" disabled>Waiting…</button>
							{:else}
								<button class="btn-cancel" onclick={keepWorking}>Keep working</button>
								<button class="btn-confirm" onclick={closeAnyway}>Cancel task &amp; close</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<SettingsModal bind:open={showSettings} initialTab={settingsTab} />
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

	/* ── D10 generation pill (minimized progress modal) ── */
	.gen-pill {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid var(--border-color, #3f3f46);
		background: var(--bg-secondary, #1f1f2e);
		color: var(--text-primary, #fff);
		font-size: 12px;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		transition: border-color 0.2s, background 0.2s;
	}
	.gen-pill:hover {
		border-color: var(--accent-color, #ff3e00);
	}
	.gen-pill-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-color, #ff3e00);
		animation: gen-pill-pulse 1.4s ease-in-out infinite;
	}
	.gen-pill-done .gen-pill-dot {
		background: #22c55e;
		animation: none;
	}
	.gen-pill-error .gen-pill-dot {
		background: #ef4444;
		animation: none;
	}
	.gen-pill-text {
		color: var(--text-muted, #a1a1aa);
	}
	@keyframes gen-pill-pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
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

