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
	import SessionGenerateModal from './ComposerModals/SessionGenerateModal.svelte';
	import type { SessionGenerateStats } from './ComposerModals/SessionGenerateModal.svelte';
	import CompactPipesProgress from './ComposerModals/CompactPipesProgress.svelte';
	import SettingsModal from './Settings/SettingsModal.svelte';
	import type { ProjectData, SessionData, PipeRow, ComposerFocus, ProjectFile, GenerationTaskView, Settings, GenerationLogEntry, GenerationLogPiece, ResolutionPreset, Orientation } from '$types';
	import { getMaxFramesForResolution, RESOLUTION_DIMS } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { flashToast } from '$lib/flashToast';
	import { summarizePipe } from '$lib/promptEngine';
	import { collectRemoteUrls, checkRemoteUrls, type RefUrlTarget } from '$lib/refCheck';
	import { pollTask, isTerminalTaskStatus, type PollHandle } from '$lib/taskPoller';
	import { subscribeGenTask } from '$lib/generationEvents';
	import { isStaleGroup } from '$lib/compactPipes';
	import { startSessionGeneration, fetchGenerationGroup, fetchLatestGenerationGroupForSession, cancelSessionGeneration, subscribeGroupEvent, type FailurePolicy, type RunStats, type PipeParamOverride } from '$lib/composerStore/sessionGeneration';
	import { applyCompositionProgress, subscribeCompositionProgress } from '$lib/compositionProgress';
	import { refOutcomes } from '$lib/generationOutcome';
	import { toMediaUrl } from '$lib/mediaUrl';
	import { migratePipe, attachLastGeneration, markRefStatus, attachGeneratedImage } from '$lib/composerStore';
	import { hydrateSessions, setOnUpdate, loadSession, saveSession, sessions, composerStore, updateQ, updateC, updateFPS, updateResolution, updateOrientation, setMediaMode } from '$lib/composerStore';
		import { getSettings, loadSettings, setOnSettingsChange, unregisterSettingsChange, knownResolution, knownOrientation, logGeneration, getGenerationLog, getPreset, getModel, resolveSpecs, pipePrechecks, getProfileId, getProviderStatus, isSettingsLoading } from '$lib/settings';
		import { generationFailureMessage, stageErrorLines } from '$lib/generationErrors';
	import { computeSessionVideoLayout, localFrameForPipe as localFrameForPipeLib, pipeStartForPipe as pipeStartForPipeLib } from '$lib/sessionVideoLayout';
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
	/** The `userName` the current `userProfileId` was resolved for — a profile
	 *  switch (different userName) forces the id to re-resolve. */
	let lastLoadedProfile = $state<string | null>(null);
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
	// Restore the latest pipe preview after backend hydration. The preview is
	// scoped per session so switching away and back returns to the SAME pipe
	// the user last opened here (lastPreviewPipeBySession), not the first
	// pipe that happens to have a last-gen video.
	let lastPreviewPipeBySession = new Map<string, string>();
	// True when the top-panel preview shows the composed session video
	// (all pipes spliced) instead of a single pipe's last-gen clip. Drives
	// the frame bounds: a composed video spans the SUM of the pipes.
	let previewIsSessionVideo = $state(false);
	// Attach a composed session video to the top-panel preview AND mirror it
	// into the ToolsPanel's Preview section in one step. Returns false when the
	// media URL could not be resolved (path moved / not under a media root).
	// Fail fast if the active session changed while the media read was in
	// flight — a stale result must not clobber the preview the user just
	// attached on the NEW session (attachSessionVideo is async).
	async function attachSessionVideo(path: string, label: string): Promise<boolean> {
		const before = selectedSessionId;
		const url = await toMediaUrl(path).catch(() => null);
		if (url && before !== selectedSessionId) {
			// The user switched sessions mid-flight: only honor the attach when
			// it still targets the session that was selected at call time.
			return false;
		}
		if (!url) return false;
		previewIsSessionVideo = true;
		previewVideo = { url, label };
		previewMediaPath = path;
		toolsSessionVideo = { url, label };
		if (selectedSessionId) lastComposedSessionVideo = { sessionId: selectedSessionId, url, label, path };
		return true;
	}
	// Flip the top-panel ownership back off the session video when the user
	// deliberately picks a per-pipe preview. NOTE: lastComposedSessionVideo
	// (the record of the last composed session video) is intentionally KEPT —
	// the tool-panel "Open in preview" button uses it to re-attach the session
	// video to the top panel on demand.
	function detachSessionVideo() {
		previewIsSessionVideo = false;
	}
	// Last successfully composed session video, keyed to the session it was
	// composed for. Persists across top-panel preview switches so the
	// tool-panel "Open in preview" can re-attach it on demand.
	let lastComposedSessionVideo = $state<{ sessionId: string; url: string; label: string; path: string } | null>(null);
	// Re-attach the composed session video to the top panel (the tool-panel
	// "Open in preview" affordance). Restores the full-session frame space
	// after the user switched the top panel to a single pipe clip. No-op when
	// the top panel already shows it (avoids a needless blob reload).
	function openSessionPreview() {
		if (!lastComposedSessionVideo || lastComposedSessionVideo.sessionId !== selectedSessionId) return;
		if (previewVideo?.url === lastComposedSessionVideo.url) return;
		previewIsSessionVideo = true;
		previewVideo = { url: lastComposedSessionVideo.url, label: lastComposedSessionVideo.label };
		previewMediaPath = lastComposedSessionVideo.path;
		toolsSessionVideo = { url: lastComposedSessionVideo.url, label: lastComposedSessionVideo.label };
	}
	// 2f: a composed session video exists for the CURRENT session while the
	// top panel shows a single-pipe clip — surface the "Open in preview"
	// restore pill in the top panel (and keep the tool-panel button). A
	// record from another session must not light the pill: that is the
	// same cross-session leak the restore path guards against above.
	const sessionVideoDetached = $derived(
		!!lastComposedSessionVideo &&
		lastComposedSessionVideo.sessionId === selectedSessionId &&
		!previewIsSessionVideo
	);
	// Play outside (2a+): open the currently-attached preview's on-disk file
	// in the OS's default player. The backend command re-validates the path
	// against the media roots (same guard as read_media_file) and spawns the
	// platform opener. Browser/dev: no backend → affordance stays hidden.
	async function handlePlayOutside() {
		if (!isTauri() || !previewMediaPath) return;
		try {
			await invoke('open_media_in_player', { input: { path: previewMediaPath } });
			flashToast('Opened in system player', 'info');
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		}
	}
	async function restoreSelectedPreview(session: SessionData | null) {
		const sid = session?.id;
		if (!sid || !session) return;
		// A successfully composed session video (group auto-compose) is the
		// top-level preview target — the full session timeline, not a single
		// pipe clip. It takes precedence over any pipe's last-gen video. The
		// attach runs through attachSessionVideo so it is also mirrored into
		// the ToolsPanel preview section (see syncCompose / compose button).
		//
		// IMPORTANT: run this check for the CURRENT session, not just "some
		// session video is set". `groupSessionVideoPath`/`groupComposeState`
		// are armed by the last RESTORED group, which can belong to a DIFFERENT
		// session (the user just switched away from a composed one). Without the
		// sid guard a stale path from the previous session would re-attach that
		// session's video to the top panel — exactly the "preview doesn't change
		// when I switch sessions" bug. The path's owning session is implicit:
		// it is only ever armed for the session currently being restored.
		if (groupSessionVideoPath && groupComposeState === 'done') {
			// A composed session video owns the top panel even when a pipe
			// preview was attached earlier — always re-attach (refreshing
			// the tool-panel mirror too), never early-return.
			const ok = await attachSessionVideo(groupSessionVideoPath, `${session.name} — session video`);
			if (!ok) {
				// Media read failed (file missing / outside the media root):
				// leave whatever preview is showing rather than blanking it.
				return;
			}
			return;
		}
		// No session video for this session: clear whatever is attached so the
		// panels reflect the NEW session. This is the cross-session leak guard:
		// toolsSessionVideo / lastComposedSessionVideo can still hold the
		// PREVIOUS session's composed video (attachSessionVideo mirrors the
		// tool panel on the same attach), so without this the tool panel would
		// keep showing the other session's full video — exactly the "another
		// session's full video appears as the session preview" bug.
		if (previewIsSessionVideo || toolsSessionVideo || (lastComposedSessionVideo && lastComposedSessionVideo.sessionId !== sid)) {
			previewVideo = null;
			previewIsSessionVideo = false;
			previewMediaPath = null;
			toolsSessionVideo = null;
			lastComposedSessionVideo = null;
		}
		// Fall back to a single-pipe last-gen video only when nothing is
		// attached yet; a session video that's already showing wins. Note the
		// `previewIsSessionVideo` reset: single-pipe previews span only that
		// pipe's length, so the frame bounds must not stay on the composed sum.
		if (previewVideo) return;
		previewVideo = null;
		previewIsSessionVideo = false;
		previewMediaPath = null;
		const savedPipeId = lastPreviewPipeBySession.get(sid);
		// Prefer the previously-selected pipe (if it still has a video);
		// otherwise fall back to the first pipe with a last-gen video.
		const pipe =
			(savedPipeId
				? session.pipes.find((p) => p.id === savedPipeId && p.lastGeneration?.videoPath)
				: undefined) ??
			session.pipes.find((p) => p.lastGeneration?.videoPath);
		if (!pipe?.lastGeneration?.videoPath) return;
		const url = await toMediaUrl(pipe.lastGeneration.videoPath);
		if (url) {
			previewVideo = { url, label: pipe.name };
			previewMediaPath = pipe.lastGeneration.videoPath;
		}
	}

	$effect(() => {
		// Track the session AND the compose outcome so the preview re-renders
		// both when a group's auto-compose finishes/persists session_video_path
		// AND when the user switches to a session that has no composed video
		// (the clear-branch below must run on the session change itself).
		const session = selectedSession;
		void session; // effect dep: re-run when the selected session changes
		void groupComposeState; // effect dep: re-run when compose outcome changes
		void groupSessionVideoPath; // effect dep: re-run when the path lands
		void restoreSelectedPreview(session);
	});

	// the generated pieces (its own artifact length) — NOT a mechanical sum of
	// the pipes. Until that artifact is persisted (session-video entity, not
	// yet modeled), the placeholder is the longest pipe (answer 1c). Pipes are
	// 8n+1, so the max stays 8n+1.
	// A composed session video concatenates EVERY pipe, so its length is the
	// SUM of the pipes' frame counts — not the longest single pipe. When the
	// session video is the preview target, the carousel/frame bounds must span
	// the full timeline; otherwise they stay on the longest pipe (composer
	// editing mode, where the user is still shaping one pipe at a time).
	let totalFrames = $derived.by(() => {
		const pipeMax = pipes.length > 0 ? Math.max(...pipes.map(p => p?.lengthFrames ?? 0)) : 241;
		return previewIsSessionVideo && pipes.length > 0
			? pipes.reduce((sum, p) => sum + (p?.lengthFrames ?? 0), 0)
			: pipeMax;
	});
	let activePipe = $derived(selectedSession?.pipes[activePipeIdx ?? 0] ?? selectedSession?.pipes[0] ?? null);

	/** Video aspect ratio (width/height) for the current session — derived from
	 *  orientation + resolution via RESOLUTION_DIMS. Passed to Frame →
	 *  FrameCarousel so cards size to the true video aspect (no crop on
	 *  portrait sessions). null when no session is selected. */
	let videoAspect = $derived.by((): number | null => {
		const session = selectedSession;
		if (!session) return null;
		try {
			const res = (session.resolution ?? '720p') as ResolutionPreset;
			const ori = (session.orientation ?? 'horizontal') as Orientation;
			const dims = RESOLUTION_DIMS[res][ori];
			return dims.width / dims.height;
		} catch {
			return null;
		}
	});

	// ── Session-video frame space ─────────────────────────────────────────────
	// The composed session video splices every pipe clip back-to-back in
	// orderIndex order (the Rust compose core's concat order), so its global
	// frame space is the SUM of the pipes' frame counts. The mapping below is
	// the inverse of that sum: a global frame belongs to the pipe whose
	// cumulative range contains it, and every pipe's composer ruler offsets
	// the global playhead by that pipe's start — the same walk, read two ways.
	// The mapping math (starts / frameToPipe / local clamp / raw start) is
	// unit-tested in src/lib/sessionVideoLayout.ts; the deriveds below just
	// thread it through the session-video vs. composer-mode switch.
	const sessionVideoLayout = $derived.by(() =>
		previewIsSessionVideo ? computeSessionVideoLayout(pipes) : null
	);

	// Sliding the session-video carousel (or the top-panel frame step / arrow
	// keys) moves the GLOBAL playhead. When the spliced video is the preview
	// target, that move selects the pipe whose segment the frame lands in, so
	// the composer highlights the owning pipe as the user sweeps.
	let lastPinnedGlobalFrame = $state<number | null>(null);
	$effect(() => {
		if (!previewIsSessionVideo || !sessionVideoLayout) return;
		const f = selectedFrame;
		if (lastPinnedGlobalFrame === f) return; // only act on real moves
		lastPinnedGlobalFrame = f;
		activePipeIdx = sessionVideoLayout.frameToPipe(f);
	});

	// A per-pipe ruler renders its own frame space (0..pipe.lengthFrames). In
	// session-video mode the global playhead is offset by that pipe's start in
	// the spliced timeline, clamped to the pipe's bounds — so the pin sits at
	// the right local position on whichever pipe owns the current frame. null
	// = not in session-video mode (rulers take selectedFrame as-is).
	const localFrameForPipe = $derived.by(() => {
		if (!previewIsSessionVideo || !sessionVideoLayout) return null;
		return (pipeIdx: number): number =>
			localFrameForPipeLib(sessionVideoLayout, pipes, pipeIdx, selectedFrame);
	});

	// Sibling of the clamp above, WITHOUT it: the raw spliced start of pipe i,
	// passed to each ruler so a local-frame write-back (ruler click / element
	// drag) can be converted back to the GLOBAL session-video playhead.
	// 0 in plain composer mode.
	const pipeStartForPipe = $derived.by(() => {
		if (!previewIsSessionVideo || !sessionVideoLayout) return null;
		return (pipeIdx: number): number =>
			pipeStartForPipeLib(sessionVideoLayout, pipes, pipeIdx);
	});

	// Settings (Phase 2): live object + re-sync on store change. The store
	// replaces its object on every commit, so a plain reassignment re-renders.
	let settings = $state<Settings>(getSettings());
	// Provider status snapshot (P6): per-kind key presence + configured flag,
	// recomputed by the store on profile load and on every settings change.
	// The chip reads this instead of sniffing apiKey off the live settings.
	let providerStatus = $state(getProviderStatus());
	// Load-lifecycle flag (P6b): true while the active profile's settings are
	// still in flight. Re-read on every store notification (load settles →
	// false; a profile switch kicks off a new load → true), so the chip never
	// asserts key presence off the default-seeded snapshot.
	let providerLoading = $state(isSettingsLoading());
	// Named + kept: setOnSettingsChange is ADDITIVE (multi-listener store), so
	// this settings/providerStatus re-sync must coexist with the ffmpeg
	// re-probe listener below — and onDestroy removes exactly this one.
	const onSettingsChangeSync = () => {
		settings = getSettings();
		providerStatus = getProviderStatus();
		providerLoading = isSettingsLoading();
	};
	setOnSettingsChange(onSettingsChangeSync);

	// Profile change: Workspace stays mounted across account switches (App
	// keeps it in the {:else} branch), so onMount never re-runs and the
	// provider key snapshot would stay stale for the NEW profile. Watch
	// userName: when it changes, resolve the NEW profile's id and load
	// settings under THAT id (the provider key + settings live under the
	// hashed profile id, and loadProjects lazily re-resolves it on next
	// call). The store then recomputes providerStatus + notifies, refreshing
	// the chip. Skips the initial run (the onMount path already loaded).
	let lastLoadedUserName = $state(userName);
	$effect(() => {
		if (userName === lastLoadedUserName) return;
		lastLoadedUserName = userName;
		if (!isTauri() || !userName) return;
		void (async () => {
			// Resolve the backend profile id for this userName BEFORE loading,
			// so the store never loads under the previous profile's id.
			let id = userProfileId && lastLoadedProfile === userName ? userProfileId : null;
			if (!id) {
				const profileResult = await invoke('get_user_profile', { input: { userName } });
				id = profileResult as string;
				userProfileId = id;
				lastLoadedProfile = userName;
			}
			// The store's generation guard keeps a slow in-flight load from
			// clobbering a just-saved key.
			await loadSettings(id);
		})();
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
	// The on-disk path of the file currently attached to the top-panel preview
	// (the source of `previewVideo`'s blob URL). "Play outside" hands this to
	// the backend's default-player opener — the blob URL itself is useless to
	// an OS player, so the path travels alongside it. null = nothing attached
	// (or a non-file source) → the play-outside affordance is hidden.
	let previewMediaPath = $state<string | null>(null);
	// Portable generation log entry for the active task (Phase 4): the
	// progress modal shows WHICH model made each piece. Attached synchronously
	// when the watch starts, so the modal has the run's state from the moment
	// it opens; re-assigned on the terminal upsert; cleared when the watch ends.
	let activeLogEntry = $state<GenerationLogEntry | null>(null);
	// Last generate-params capture: models + seed from the most recent
	// `confirmGenerate`, kept so a "Reset generation" (stop this task + resend)
	// can replay the exact same run without re-opening the generate modal.
	let lastGenerateParams = $state<{ pipeId: string; models: ModelSelection; seed: number | null } | null>(null);
	let showSessionGenerateModal = $state(false);
	let activeGroupId = $state<string | null>(null);
	let groupUnlisten: (() => void) | null = null;
	let groupTaskId: string | null = null;
	let groupPipeTaskIds = $state<Record<string, string>>({});
	let groupTaskViews = $state<Record<string, GenerationTaskView>>({});
	let groupStatus = $state<string | null>(null);
	let groupStale = $state(false);
	// Session-composition outcome of the LAST finished group for this session.
	// Set from `fetchGenerationGroup` (restoration + compose-terminal poll) so
	// the group modal can show a persisted compose error / session video
	// instead of presenting completion as a silent success.
	let groupComposeState = $state<string | null>(null);
	let groupComposeError = $state<string | null>(null);
	let groupSessionVideoPath = $state<string | null>(null);
	// Overall group progress (0..=1, the backend's stage-count-weighted
	// average across the group's pipes) + the compose step's live phase,
	// shown in the group modal so a long run reads as progress, not a freeze.
	let groupProgress = $state(0);
	let groupComposePhase = $state<string | null>(null);
	let restoredGroupSessionId = $state<string | null>(null);
	// Live poll timer: while a group is running the per-pipe task views +
	// the group progress only move on terminal events, so the modal's bars
	// would sit at 0% for a whole pipe. A 2 s poll of the authoritative
	// group view (live in-memory, persisted fallback) keeps them accurate.
	let groupPollTimer: number | null = null;
	function stopGroupPoll() {
		if (groupPollTimer !== null) { window.clearInterval(groupPollTimer); groupPollTimer = null; }
	}
	function startGroupPoll() {
		stopGroupPoll();
		if (!isTauri()) return;
		groupPollTimer = window.setInterval(() => {
			const gid = activeGroupId;
			if (!gid || groupStale) { stopGroupPoll(); return; }
			void fetchGenerationGroup(gid).then((g) => {
				if (gid !== activeGroupId) return; // a new group took over
				groupProgress = g.progress ?? 0;
				// Merge the live per-pipe progress so the compact rows +
				// status chips track the exact stage state, not just terminals.
				const merged: Record<string, GenerationTaskView> = { ...groupTaskViews };
				for (const p of g.pipes) {
					if (!p?.pipeId) continue;
					const task = groupTaskViews[p.pipeId];
					if (task && p.taskId && p.taskId === task.taskId && p.progress !== undefined) {
						merged[p.pipeId] = { ...task, progress: p.progress };
					}
				}
				groupTaskViews = merged;
				// Keep the pill's live state fresh: mirror the merged pipe view
				// onto `activeTask` (the event stream only drives it while the
				// task watcher is armed — a closed/minimized modal would otherwise
				// show a frozen line while the group keeps running).
				if (activeTaskId) {
					const pid = Object.keys(groupPipeTaskIds).find((p) => groupPipeTaskIds[p] === activeTaskId);
					if (pid && merged[pid]) activeTask = merged[pid];
				}
				// Track the compose step's live phase ('running' = in flight,
				// 'done'/'error'/'cancelled' = terminal) so the modal can show
				// the exact stage instead of a frozen per-pipe bar.
				if (g.composeState !== undefined && g.composeState !== null) {
					groupComposePhase = g.composeState;
				}
				groupComposeState = g.composeState ?? groupComposeState;
				groupComposeError = g.composeError ?? groupComposeError;
				groupSessionVideoPath = g.sessionVideoPath ?? groupSessionVideoPath;
				// Group reached a terminal state — stop polling.
				if (!['running'].includes(g.status)) {
					stopGroupPoll();
					if (gid !== activeGroupId) return; // a new group took over mid-flight
					// Safety net: if the group-terminal event was lost (the
					// subscription dropped mid-session), the poller is the only
					// signal that the group ended — run the same cleanup as the
					// event handler so `activeGroupId` doesn't linger and the
					// session's Generate button silently no-ops forever.
					groupUnlisten?.(); groupUnlisten = null; activeGroupId = null; groupTaskId = null;
					groupStatus = g.status ?? 'done';
					if (progressMinimized) pillTerminal = (g.status ?? 'done') === 'done' ? 'done' : 'error';
					if (selectedSession) localStorage.removeItem(`visionmachine:generation-group:${selectedSession.id}`);
				}
			}).catch(() => {});
		}, 2000);
	}
	// Group event watcher (extracted from `confirmSessionGenerate` so the
	// session-restore path can re-arm the SAME callbacks after a session
	// switch dropped them — a live group without its terminal-event
	// subscription leaves `activeGroupId` set forever and silently no-ops
	// the session's Generate button). `logCtx` carries the per-run
	// generation-log params (models/seed): present only for a run confirmed
	// in this UI session; the restore path has no such context and skips
	// the log-start write.
	function subscribeGroupWatcher(gid: string, logCtx: { models: ModelSelection; seed: number | null } | null) {
		groupUnlisten?.();
		void subscribeGroupEvent(gid, (event) => {
			if (event.pipeId && event.taskId) {
				groupPipeTaskIds[event.pipeId] = event.taskId;
				void fetchGenerationTask(event.taskId).then((view) => { groupTaskViews[event.pipeId!] = view; }).catch(() => {});
			}
			if (event.kind === 'pipe-started' && event.pipeId && event.taskId) {
				groupTaskId = event.taskId;
				activeTaskId = event.taskId;
				const startedPipe = selectedSession?.pipes.find((p) => p.id === event.pipeId);
				if (startedPipe && logCtx) {
					const groupLog = buildGenerationLogEntry(event.taskId, selectedSession!.id, startedPipe, logCtx.models, Date.now(), logCtx.seed);
					groupLog.groupId = event.groupId;
					void writeGenerationLogStart(groupLog);
				}
				void fetchGenerationTask(event.taskId).then((view) => { activeTask = view; groupTaskViews[event.pipeId!] = view; }).catch(() => {});
			}
			if (event.kind === 'pipe-terminal' && event.taskId && event.pipeId) {
				void fetchGenerationTask(event.taskId).then((view) => {
					groupTaskViews[event.pipeId!] = view;
					if (view.taskId === activeTaskId) activeTask = view; // keep pill/modal live after the poller stopped
					void reconcileTerminal(view);
				}).catch(() => {});
			}
			if (event.kind === 'compose-terminal') {
				if (activeGroupId) {
					void fetchGenerationGroup(activeGroupId).then((g) => {
						groupComposeState = g.composeState ?? null;
						groupComposeError = g.composeError ?? null;
						groupSessionVideoPath = g.sessionVideoPath ?? null;
						if (progressMinimized) {
							if (g.composeState === 'error' || g.composeState === 'cancelled') pillTerminal = 'error';
							// Compose success must not mask a failed pipe: a
							// 'done_with_errors' group already marked the pill red, and a
							// subset session video is not "Generation complete".
							else if (g.composeState === 'done' && g.sessionVideoPath && pillTerminal !== 'error') pillTerminal = 'done';
						}
						if (g.composeState === 'done' && g.sessionVideoPath && selectedSession) {
							void attachSessionVideo(g.sessionVideoPath, `${selectedSession.name} — session video`);
						}
					}).catch(() => {});
				}
				return;
			}
			if (event.kind === 'group-terminal') {
				groupUnlisten?.(); groupUnlisten = null; activeGroupId = null; groupTaskId = null;
				groupStatus = event.status ?? 'done'; groupStale = false;
				// Final pill marker: green only on a clean 'done' — 'error'
				// (stop policy), 'done_with_errors' (continue policy) and
				// 'cancelled' all read as a failed run. A later compose-terminal
				// event can downgrade 'done' to 'error' when the compose itself
				// fails (it never upgrades 'error' back to 'done').
				if (progressMinimized) pillTerminal = (event.status ?? 'done') === 'done' ? 'done' : 'error';
				stopGroupPoll();
				groupProgress = 1;
				groupComposePhase = null;
				const syncCompose = () => {
					void fetchGenerationGroup(gid).then((g) => {
						groupComposeState = g.composeState ?? null;
						groupComposeError = g.composeError ?? null;
						groupSessionVideoPath = g.sessionVideoPath ?? null;
						if (g.composeState === 'done' && g.sessionVideoPath && selectedSession) {
							void attachSessionVideo(g.sessionVideoPath, `${selectedSession.name} — session video`);
						}
					}).catch(() => {});
				};
				syncCompose();
				setTimeout(syncCompose, 1500);
				if (selectedSession) localStorage.removeItem(`visionmachine:generation-group:${selectedSession.id}`);
			}
		}).then((unlisten) => { groupUnlisten = unlisten; });
	}
	const groupActive = $derived(activeGroupId !== null && !groupStale);
	const groupProgressVisible = $derived(groupActive || groupStale || Object.keys(groupTaskViews).length > 0);

	// The ToolsPanel's Preview section mirrors the top panel's session-video target:
	// a composed session video (group auto-compose OR the standalone compose button)
	// takes precedence over any per-pipe last-gen video.
	let toolsSessionVideo = $state<{ url: string; label: string } | null>(null);
	// Set by the standalone compose button's success path; the group auto-compose
	// path flows through groupSessionVideoPath below instead.

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
	// A live group keeps the UI actionable even when the per-task watcher was
	// closed (modal OK/X mid-run): a null `activeTask` must not read as
	// "nothing running" while the session group is still in flight.
	const groupLivenessActive = $derived(groupActive);
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
		// The user chose to keep the app open: disarm the backend's
		// force-close watchdog (it would otherwise cancel the live tasks
		// 60 s after the original X-click despite this explicit "stay"
		// choice).
		if (isTauri()) void invoke('close_dismissed').catch(() => {});
	}

	// Settings modal (Phase 3): opened from the profile panel (Defaults tab)
	// or, in Phase 4, the provider status chip (Providers tab).
	let showSettings = $state(false);
	let settingsTab = $state<'defaults' | 'providers' | 'tools'>('defaults');

	const anyTaskActive = $derived((activeTask !== null && !isTerminalTaskStatus(activeTask.status)) || groupLivenessActive);
	// Live engine-state line for the minimized pill (e.g. "queue full —
	// retry in 120 s"): the newest lastEvent, preferring IN-FLIGHT stages
	// (generating / rate-limited) over finished ones. The preference matters
	// for stability: "newest timestamp across ALL stages" can flip between
	// a finished stage's stale line and the active stage's current line on
	// consecutive polls — that flip was the pill's fast blink. Without any
	// in-flight event the pill shows the neutral "Running…" placeholder.
	const pillLiveLine = $derived.by(() => {
		if (!activeTask || !anyTaskActive) return null;
		let inFlight: { ev: string; at: number } | null = null;
		let newest: { ev: string; at: number } | null = null;
		for (const s of activeTask.stages) {
			if (!s.lastEvent || !s.lastEventAt) continue;
			const cand = { ev: s.lastEvent, at: s.lastEventAt };
			if (s.status === 'generating' || s.status === 'rate-limited') {
				if (!inFlight || cand.at > inFlight.at) inFlight = cand;
			}
			if (!newest || cand.at > newest.at) newest = cand;
		}
		return (inFlight ?? newest)?.ev ?? null;
	});
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

	// Per-pipe Q/C edits from the session-generation modal (any pipe, not just
	// the active one) — same store path as the panel above.
	async function handlePipeQValueChange(sessionId: string, pipeId: string, q: number) {
		const r = await updateQ(sessionId, pipeId, q);
		if (r.errors.length > 0) console.error('[Workspace] updateQ (modal):', r.errors);
	}

	async function handlePipeCValueChange(sessionId: string, pipeId: string, c: number) {
		const r = await updateC(sessionId, pipeId, c);
		if (r.errors.length > 0) console.error('[Workspace] updateC (modal):', r.errors);
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
			// Resolve the profile id only when the active profile changed: the
			// provider key + settings live under the hashed `profile_<hash>` id,
			// while `list_projects`/`get_or_create_profile` key off that same id.
			// Caching per `userName` keeps the lazy resolution stable across
			// repeated loads in one profile's lifetime.
			if (!userProfileId || lastLoadedProfile !== userName) {
				const profileResult = await invoke('get_user_profile', {
					input: { userName }
				});
				userProfileId = profileResult as string;
				lastLoadedProfile = userName;
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

	async function restoreSessionGenerationGroup(sessionId: string) {
		const key = `visionmachine:generation-group:${sessionId}`;
		const groupId = localStorage.getItem(key);
		// The localStorage key is only set for a run that STARTED in this
		// webview session, and is deleted the moment that group goes terminal.
		// So on a fresh launch (or after the last run finished) the key is
		// absent — and the composed session video would be unreachable. The DB
		// row is the source of truth that survives, so when the bridge is gone
		// fall back to the session's newest group row from the backend.
		let group: Awaited<ReturnType<typeof fetchGenerationGroup>> | null = null;
		if (groupId) {
			try {
				group = await fetchGenerationGroup(groupId);
			} catch {
				localStorage.removeItem(key);
			}
		}
		if (!group && isTauri()) {
			// Pure-read DB fallback: the session's most recent group row. Null
			// when the session has never run a group — nothing to restore.
			group = await fetchLatestGenerationGroupForSession(sessionId).catch(() => null);
		}
		if (!group) {
			// No group run for this session: drop the previous session's group
			// machinery (event watcher + poller + state). Otherwise a foreign
			// live `activeGroupId` survives the session switch, the group-
			// terminal event never clears it (its subscription is lost), and
			// this session's Generate button silently no-ops — the "I press
			// Generate and nothing happens" stuck state.
			activeGroupId = null;
			groupUnlisten?.();
			groupUnlisten = null;
			groupTaskId = null;
			groupStatus = null;
			groupStale = false;
			groupProgress = 0;
			groupComposePhase = null;
			groupTaskViews = {};
			groupPipeTaskIds = {};
			groupComposeState = null;
			groupComposeError = null;
			groupSessionVideoPath = null;
			stopGroupPoll();
			stopWatching();
			activeTask = null;
			activeTaskId = null;
			activeLogEntry = null;
			showProgressModal = false;
			progressMinimized = false;
			pillTerminal = null;
			restoredGroupSessionId = sessionId;
			return;
		}
		// A group that is LIVE (running with a task) owns the session — arm the
		// active-group machinery (poller, watcher, cancel guard, Generate block).
		// A TERMINAL group restored from the DB (the common cross-restart case)
		// must NOT: leaving activeGroupId set would make groupActive true and
		// silently no-op the session-level Generate button for that session.
		const isLiveGroup = group.live && group.status === 'running';
		if (isLiveGroup) {
			activeGroupId = group.groupId;
			// Re-arm the live-group machinery: a session switch stopped the
			// poller (and the no-group reset above drops the watcher), so a
			// still-live group must be re-subscribed + re-polled — without
			// the watcher its group-terminal event never arrives and
			// `activeGroupId` (the Generate guard) stays set forever.
			// `logCtx` is null: a restored run has no per-run generation-log
			// context (the log-start entry, if any, was written at confirm).
			subscribeGroupWatcher(group.groupId, null);
			startGroupPoll();
			stopWatching();
			activeTask = null;
			activeTaskId = null;
		} else {
			activeGroupId = null;
		}
		groupStatus = group.status;
		groupStale = isStaleGroup(group.status, group.live);
		groupTaskId = null;
		groupPipeTaskIds = isLiveGroup
			? Object.fromEntries(group.pipes.flatMap((pipe) => pipe.pipeId && pipe.taskId ? [[pipe.pipeId, pipe.taskId]] : []))
			: {};
		groupTaskViews = {};
		groupComposeState = group.composeState ?? null;
		groupComposeError = group.composeError ?? null;
		// The session video path is only meaningful when the compose SUCCEEDED.
		// A failed / cancelled latest compose must not leave a stale path from
		// another session attached — clear it so the preview can fall back (or
		// blank) rather than showing the previous session's video.
		groupSessionVideoPath = (group.composeState === 'done') ? (group.sessionVideoPath ?? null) : null;
		// The compose outcome landed but the video can't be attached: the file
		// is gone, or read_media_file rejected the path as outside every known
		// media root (a writer path whose root the reader doesn't allow — see
		// media_roots() in generation.rs). Used to be a silent no-op, which is
		// exactly the "placeholder + top panel never changes, no error" state;
		// surface the reason so the next run can tell which link broke.
		if (group.composeState === 'done' && group.sessionVideoPath) {
			const name = sessions.get(sessionId)?.name ?? 'Session';
			const path = group.sessionVideoPath;
			const ok = await attachSessionVideo(path, `${name} — session video`);
			if (!ok) {
				flashToast(`Session video unavailable: ${path} (missing file or outside media roots)`, 'error');
			}
		}
		stopWatching();
		// A stale (persisted, no live task) running group re-opens its
		// modal so the user can dismiss it; a LIVE group re-opens its
		// progress view too — without this the live group's compact panel
		// mounts but stays invisible (open=false), and the session shows
		// no progress UI at all.
		showProgressModal = (groupStale && group.live === false && group.status === 'running') || isLiveGroup;
		restoredGroupSessionId = sessionId;
	}

	$effect(() => {
		const sessionId = selectedSessionId;
		if (sessionId && restoredGroupSessionId !== sessionId) {
			stopGroupPoll();
			groupProgress = 0;
			groupComposePhase = null;
			void restoreSessionGenerationGroup(sessionId);
		}
	});

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
				// Default container with the profile layer:
				// <home>\VisionMachine\<profile>\Projects\<name>.
				const basePath = input.path || `${getHomeDir()}\\VisionMachine\\${sanitizeDirName(userName ?? '')}\\Projects`;
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
		const basePath = input.path || `${getHomeDir()}\\VisionMachine\\${sanitizeDirName(userName ?? '')}\\Projects`;
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

	// Copy a session: full duplicate (new id + name) carrying the DESIGN
	// only — layout, prompts, user-provided URLs. No media-tree copy and no
	// carried artifacts: the backend re-mints every piece id and blanks the
	// previews / last-gen state, so the copy's runs mint artifacts of its
	// own (nothing re-rooted from the source — the uuid flow stays
	// unambiguous). The name suffixes "(copy)" until it is unique among the
	// project's sessions; the busy guard (reuses the project `loading`
	// flag) covers the short backend call.
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
			// re-minted the piece ids with artifacts blanked; `loadSession`
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
		if (groupActive) { flashToast('Session generation is already in progress — open it from the pill, or wait for it to finish', 'info'); return; }
		showSessionGenerateModal = true;
	}

	async function confirmSessionGenerate(models: ModelSelection, seed: number | null, failurePolicy: FailurePolicy, autoCompose: boolean, _stats: SessionGenerateStats, runStats: RunStats | null, pipeParams: Record<string, PipeParamOverride> | null) {
		if (!selectedSession) return;
		if (groupActive) { flashToast('Session generation is already in progress', 'info'); return; }
		// Read-only (paid) model gate: the session flow's "continue" policy
		// tolerates per-pipe conflicts, but a paid-only model can never run —
		// block the whole run instead.
		const s = getSettings();
		const svp = getPreset(s.providers.video.preset);
		if (svp && getModel(svp, models.videoModel)?.readOnly) {
			flashToast('Video model is read-only (paid) — pick a generable model in Settings', 'error');
			return;
		}
		try {
			// Per-pipe prompts + profile + resolved specs, matching the per-pipe
			// `start_generation` flow — the provider engine REQUIRES the
			// resolved image/video specs, or every pipe's video stage fails
			// with "video stage has no resolved video spec".
			const pair = resolveSpecs(models.imageModel, models.videoModel);
			const prompts: Record<string, string> = {};
			for (const p of selectedSession.pipes) prompts[p.id] = summarizePipe(p, { fps: selectedSession?.fps ?? undefined });
			const result = await startSessionGeneration({ sessionId: selectedSession.id, imageModel: models.imageModel, videoModel: models.videoModel, seed, profileId: getProfileId() ?? undefined, failurePolicy, autoCompose, pipeIds: selectedSession.pipes.map((p) => p.id), prompts, imageSpec: pair.image?.spec ?? null, videoSpec: pair.video?.spec ?? null, runStats: runStats ?? null, pipeParams: pipeParams ?? null });
			showSessionGenerateModal = false;
			activeGroupId = result.groupId;
			localStorage.setItem(`visionmachine:generation-group:${selectedSession.id}`, result.groupId);
			restoredGroupSessionId = selectedSession.id;
			groupStatus = 'running';
			groupStale = false;
			groupProgress = 0;
			groupComposePhase = null;
			groupTaskId = result.firstTaskId;
			groupPipeTaskIds = { [result.firstView.pipeId]: result.firstTaskId };
			groupTaskViews = { [result.firstView.pipeId]: result.firstView };
			startGroupPoll();
			const firstPipe = selectedSession.pipes.find((p) => p.id === result.firstView.pipeId);
			if (firstPipe) {
				const startedAt = Date.now();
				const groupLog = buildGenerationLogEntry(result.firstTaskId, selectedSession.id, firstPipe, models, startedAt, seed);
				groupLog.groupId = result.groupId;
				activeLogEntry = groupLog;
				void writeGenerationLogStart(groupLog);
			}
			startWatchingTask(result.firstTaskId, result.firstView);
			groupComposeState = null;
			groupComposeError = null;
			groupSessionVideoPath = null;
			subscribeGroupWatcher(result.groupId, { models, seed });
		} catch (e) { flashToast(e instanceof Error ? e.message : String(e), 'error'); }
	}

	async function cancelSessionGenerationGroup() {
		if (!activeGroupId) return;
		stopGroupPoll();
		try { await cancelSessionGeneration(activeGroupId); } catch (e) { flashToast(e instanceof Error ? e.message : String(e), 'error'); }
	}

	// ── Session video composition (A5): splice the pipes' last-gen videos ──

	let composing = $state(false);
	let compositionWasCancelled = false;
	let compositionProgress = $state<{ phase: 'preparing' | 'copy' | 'reencode' | 'finalizing' | 'complete'; progress: number; detail?: string } | null>(null);
	let compositionUnlisten: (() => void) | null = null;
	let ffmpegCapability = $state<{ source: string; path: string } | null>(null);
	// Own settings-change listener for the ffmpeg re-probe (kept so onDestroy
	// can remove exactly this one — the settings store is multi-listener).
	let syncFfmpegReprobe: (() => void) | null = null;

	function compositionLabel(state: typeof compositionProgress): string {
		if (!state) return 'Composing…';
		const percent = Math.round(state.progress * 100);
		if (state.phase === 'preparing') return 'Preparing…';
		if (state.phase === 'copy') return percent > 0 ? `Copying ${percent}%` : 'Copying…';
		if (state.phase === 'reencode') return percent > 0 ? `Encoding ${percent}%` : 'Encoding…';
		if (state.phase === 'finalizing') return 'Finalizing…';
		return 'Finalizing…';
	}

	onMount(() => {
		void subscribeCompositionProgress((event) => {
			if (composing && event.sessionId === selectedSessionId) {
				compositionProgress = applyCompositionProgress(compositionProgress, event);
			}
		}).then((unlisten) => { compositionUnlisten = unlisten; });
		if (!isTauri()) return;
		const reprobe = () => {
			void invoke<{ source: string; path: string; versionLine: string }>('probe_ffmpeg')
				.then((r) => { ffmpegCapability = { source: r.source, path: r.path }; })
				.catch(() => { ffmpegCapability = null; });
		};
		reprobe(); // initial probe on mount
		// Re-probe when a settings commit lands (a user-set ffmpeg path takes
		// effect without a restart). Own listener — additive store, so it
		// coexists with the settings/providerStatus re-sync listener.
		syncFfmpegReprobe = () => { void reprobe(); };
		setOnSettingsChange(syncFfmpegReprobe);
	});

	function cancelSessionVideoComposition() {
		if (!selectedSession || !composing) return;
		void invoke<boolean>('cancel_session_video_composition', {
			input: { session_id: selectedSession.id }
		}).then((cancelled) => {
			if (cancelled) compositionWasCancelled = true;
		}).catch((e) => {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		});
	}

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
		compositionProgress = { phase: 'preparing', progress: 0, detail: 'Preparing sources' };
		invoke<{ outputPath: string; ffmpegSource: string; sourcePipes: string[] }>(
			'compose_session_video',
			{ input: { session_id: selectedSession.id, pipe_ids: null } },
		)
		.then((r) => {
			compositionProgress = { phase: 'complete', progress: 1, detail: 'Complete' };
			flashToast(APP_CONSTANTS.strings.composeSessionDone, 'success');
			// Point the top panel at the composed file (served via read_media_file).
			void attachSessionVideo(r.outputPath, `${selectedSession?.name ?? 'Session'} — video`);
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
	 *  low latency) AND keep a 5 s poll as a fallback in case an event is
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
		// Fallback-only poll (backend events are the primary signal): a 5 s
		// cadence is plenty for "did the event stream die" recovery, and it
		// stops the pill/modal re-rendering every second.
		poller = pollTask({
			taskId,
			fetchTask: fetchGenerationTask,
			onTick: onTaskTick,
			intervalMs: 5000,
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

	/** Fallback tick (5 s poll): drive `activeTask` the same way events do. */
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
			await attachLastGeneration(view.sessionId, view.pipeId, {
				taskId: view.taskId,
				videoPath: view.outputPath,
				generatedAt: Date.now(),
				status: 'done',
			});
			// The terminal event is the ownership boundary for the artifact.
			// Persist it before reporting success; the normal update debounce
			// can otherwise lose the path if the app restarts immediately.
			if (isTauri()) {
				const saved = await saveSession(view.sessionId);
				if (saved.errors.length > 0) {
					console.error('[Workspace] generated video persistence failed:', saved.errors);
					flashToast('Generated video was created but could not be saved', 'error');
				}
			}
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
		// A per-pipe terminal INSIDE a live group must NOT mark the pill: the
		// group moves on to the next pipe — only the GROUP terminal carries the
		// final outcome (the group handlers above set the marker; compose-
		// terminal can downgrade it on a compose failure). Single-task runs
		// (no active group) keep the per-task marker.
		if (progressMinimized && !activeGroupId) {
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
			stopGroupPoll();
			stopWatching();
			showProgressModal = false;
			progressMinimized = false;
			activeTask = null;
			activeLogEntry = null;
			groupTaskViews = {};
			groupPipeTaskIds = {};
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
	async function restoreProgressModal() {
		if (!activeTaskId && !activeTask) {
			// The modal was closed mid-group (OK/X drops the task watcher, and the
			// compact widget renders nothing while closed) — re-seed the task
			// views from the backend group so the modal is actionable again
			// instead of silently no-op'ing (the stuck "nothing I can click" UI).
			if (activeGroupId) {
				try {
					const g = await fetchGenerationGroup(activeGroupId);
					if (g.groupId !== activeGroupId) return; // a different group took over
					groupPipeTaskIds = Object.fromEntries(g.pipes.flatMap((p) => p.pipeId && p.taskId ? [[p.pipeId, p.taskId]] : []));
					let lastTaskId: string | null = null;
					for (const p of g.pipes) if (p.taskId) lastTaskId = p.taskId;
					if (lastTaskId) {
						activeTaskId = lastTaskId;
						activeTask = await fetchGenerationTask(lastTaskId).catch(() => null);
					}
					// Closing the modal stopped the group poller — re-arm the
					// terminal-detection safety net, so a lost event watcher can't
					// leave `activeGroupId` set (and the Generate button no-op'ing)
					// forever.
					startGroupPoll();
				} catch {
					// The group is gone (evicted/closed) — nothing to re-open.
				}
			}
			if (!activeTaskId && !activeTask) return;
		}
		showProgressModal = true;
		progressMinimized = false;
		if (activeTaskId) void refreshActiveTask(); // re-sync now that the user is back
	}

	/** ToolsPanel last-gen thumb → top-panel preview (D9, served via Phase E media command). */
	function openPreview(pipe: PipeRow) {
		// Remember which pipe the user opened for THIS session, so a
		// session switch away + back restores the same preview.
		const sid = selectedSessionId;
		if (sid) lastPreviewPipeBySession.set(sid, pipe.id);
		// Clear the current preview first: a fresh blob URL is about to take
		// over, and a stale/failed shell (0:00 <video>) must not linger in
		// the top panel while the new one loads.
		// A per-pipe preview hands the top panel back to the pipe's OWN frame
		// space — detach the session video so totalFrames drops from the
		// spliced SUM to the pipe's max. The tool-panel mirror is kept in sync
		// from lastComposedSessionVideo (the record that a session video exists
		// for this session — the "Open in preview" button re-attaches it).
		detachSessionVideo();
		// Mirror the tool panel ONLY from this session's own composed video.
		// When the record belongs to a different session (a cross-session
		// leak from a previous attach) it must be cleared, not re-shown —
		// otherwise the tool panel would display the OTHER session's full
		// video while the user is inspecting a pipe clip here.
		if (lastComposedSessionVideo?.sessionId === selectedSessionId) {
			toolsSessionVideo = { url: lastComposedSessionVideo.url, label: lastComposedSessionVideo.label };
		} else {
			toolsSessionVideo = null;
		}
		previewVideo = null;
		previewIsSessionVideo = false;
		previewMediaPath = null;
		toMediaUrl(pipe.lastGeneration?.videoPath ?? null)
			.then((url) => {
				if (url) {
					previewVideo = { url, label: pipe.name };
					previewMediaPath = pipe.lastGeneration?.videoPath ?? null;
				}
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

	/** Filesystem-safe directory layer for a profile name (spaces are fine,
	 *  Windows-reserved chars are not). Used for the media-container layer:
	 *  <home>\VisionMachine\<profile>\Projects. */
	function sanitizeDirName(name: string): string {
		const s = (name || '').replace(/[\\/:*?"<>|]+/g, '_').trim();
		return s || 'default';
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
			groupUnlisten?.();
			groupUnlisten = null;
			activeGroupId = null;
			groupTaskId = null;
			stopGroupPoll();
			stopWatching();
		// Remove BOTH settings listeners (the store is multi-listener — each
		// removal must pass the exact registered reference).
		unregisterSettingsChange(onSettingsChangeSync);
		if (syncFfmpegReprobe) unregisterSettingsChange(syncFfmpegReprobe);
	});
</script>

<div class={`workspace ${layoutMode}`}>
	<Frame
		{userName}
		{selectedTheme}
		{layoutMode}
		{showWelcome}
		video={previewVideo}
		fps={selectedSession?.fps ?? null}
		totalFrames={totalFrames}
		carouselFrame={selectedFrame ?? 0}
		videoAspect={videoAspect}
		isSessionVideo={previewIsSessionVideo}
		sessionVideoDetached={sessionVideoDetached}
		oncarouselSelect={(f) => (selectedFrame = f)}
		onframeSelect={(f) => (selectedFrame = f)}
		showRuler={showGlobalRuler}
		ruler={selectedSession ? { ticks: previewTicks, total: totalFrames, frame: selectedFrame ?? 0 } : null}
		onplayoutside={handlePlayOutside}
		onopensessionpreview={openSessionPreview}
		onlogout={handleLogout}
		onthemeChange={handleThemeChange}
		onlayoutChange={handleLayoutChange}
		providers={settings.providers}
		providerStatus={providerStatus}
		providerLoading={providerLoading}
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
					localFrameForPipe={localFrameForPipe}
					pipeStartForPipe={pipeStartForPipe}
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
				onopensessionpreview={openSessionPreview}
				oncomposesession={composeSessionVideo}
				ffmpegAvailable={ffmpegCapability ? ffmpegCapability.source !== 'none' : false}
				composing={composing}
				compositionLabel={compositionLabel(compositionProgress)}
				pipegenerating={anyTaskActive}
				groupActive={groupActive}
				onfpschange={handleFpsChange}
				onresolutionchange={handleResolutionChange}
				onorientationchange={handleOrientationChange}
				sessionVideo={toolsSessionVideo}
				/>
			{/if}

			<!-- ── Generation flow modals (pipe-level, D1–D9) ── -->
			{#if showSessionGenerateModal && selectedSession}
				<SessionGenerateModal
					bind:open={showSessionGenerateModal}
					session={selectedSession}
					pipes={selectedSession.pipes}
					onConfirm={confirmSessionGenerate}
					onFpsChange={handleFpsChange}
					onResolutionChange={handleResolutionChange}
					onOrientationChange={handleOrientationChange}
					onPipeQChange={(pipeId, q) => handlePipeQValueChange(selectedSession.id, pipeId, q)}
					onPipeCChange={(pipeId, c) => handlePipeCValueChange(selectedSession.id, pipeId, c)}
				/>
			{/if}
			{#if showGenerateModal && generatePipe && selectedSession}
				<GenerateModal
					pipe={generatePipe}
					session={selectedSession}
					bind:open={showGenerateModal}
					onConfirm={confirmGenerate}
				/>
			{/if}
			{#if groupProgressVisible && selectedSession}
				<CompactPipesProgress
					bind:open={showProgressModal}
					pipes={selectedSession.pipes}
					stale={groupStale}
					currentTaskId={activeTaskId}
					taskViews={Object.fromEntries(selectedSession.pipes.map((p) => [p.id, groupTaskViews[p.id] ?? null]).filter((entry): entry is [string, GenerationTaskView] => !!entry[1]))}
					taskIds={groupPipeTaskIds}
					busy={anyTaskActive}
					composeState={groupComposeState}
					composeError={groupComposeError}
					sessionVideoPath={groupSessionVideoPath}
					groupProgress={groupProgress}
					composePhase={groupComposePhase}
					onFetch={fetchGenerationTask}
					onLoaded={(view) => { groupTaskViews[view.pipeId] = view; }}
					onCancel={cancelSessionGenerationGroup}
					onClose={closeProgressModal}
					onMinimize={minimizeProgressModal}
				/>
			{:else}
			<GenerationProgressModal
				task={activeTask}
				busy={anyTaskActive}
				bind:open={showProgressModal}
				onCancel={groupActive ? cancelSessionGenerationGroup : cancelActiveTask}
				onClose={closeProgressModal}
				onMinimize={minimizeProgressModal}
				onRefresh={refreshActiveTask}
				logEntry={activeLogEntry}
				onReset={resetGeneration}
			/>
			{/if}

			<!-- D10 persistent pill: visible when the progress modal is minimized
			 (or the task just went terminal while it was), so the user can
			 return to the full modal with one click instead of hunting for it.
			 Terminal color (done = green, error = red) signals the outcome
			 without needing to re-open the modal. Also a last-resort fallback:
			 whenever a task is live but no progress modal is open (e.g. the
			 group modal never rendered), the pill keeps the run visible. -->
			{#if (activeTask || groupActive) && !showProgressModal && (progressMinimized || pillTerminal !== null || anyTaskActive)}
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
					{:else if activeTask && anyTaskActive}
						<!-- Compact, status-driven: the pill shows the live
						     request status (newest in-flight stage event —
						     "queue full — retry in 30 s", "rendering 42%"…),
						     not a raw task id (noise; the details live in
						     the progress modal). "Running…" until the engine
						     reports. Capped width, no reserved empty slot. -->
						<span
							class="gen-pill-live"
							class:gen-pill-live-idle={!pillLiveLine}
							title="Latest engine state — click to open the progress modal"
						>{pillLiveLine ?? 'Running…'}</span>
					{:else if groupActive}
						<span class="gen-pill-text">Session running</span>
					{:else if activeTask}
						<span class="gen-pill-text">Generation finished</span>
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
		animation: gen-pill-pulse 3s ease-in-out infinite;
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
	.gen-pill-live {
		font-size: 11px;
		color: var(--warning-color, var(--text-muted, #71717a));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		/* Content-sized with a cap: the pill hugs its (short) status text;
		   long 503 backoff lines clip with an ellipsis instead of
		   stretching the capsule. No reserved empty slot. */
		max-width: 160px;
	}
	/* The "Running…" placeholder (no engine event yet) reads neutral; a
	   real engine status keeps the warning tint. */
	.gen-pill-live-idle {
		color: var(--text-muted, #a1a1aa);
	}
	/* Slow, subtle breathing: the pill sits in the corner while the user
	   works — a fast blink reads like a fault indicator. 3s with a narrow
	   0.7↔1 range keeps "alive" without "blinking". */
	@keyframes gen-pill-pulse {
		0%, 100% { opacity: 0.7; }
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
		min-height: 0; /* let the body shrink inside the 100vh column */
	}

	.left-column {
		width: 240px;
		min-width: 200px;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		min-height: 0; /* needed so the ProjectsPanel child can shrink/scroll
		                 instead of pushing the ProfilePanel out of the viewport */
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

