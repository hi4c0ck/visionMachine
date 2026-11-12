<script lang="ts">
	// SessionView — the trunk of the session hierarchy.
	//
	// Sits directly under `{#key selectedSessionId}` in Workspace.svelte.
	// Svelte destroys the old subtree (this component's onDestroy) BEFORE
	// it creates the new one (this component's onMount), giving us a
	// structural mount/destroy log endpoint per session swing:
	//
	//   [SV] destroy <oldId>  →  [SV] mount <newId> epoch=N  →  ready
	//
	// Children:
	//   ComposerPanel  (only when tab === 'pipes')
	//   DirectorPanel  (always mounted; hidden via display:none when pipes)
	//
	// The component itself holds NO $state — it is purely a structural
	// boundary with visible lifecycle endpoints. All reactive state
	// (composerTab, directorRunning, tabMeta, etc.) lives in Workspace
	// and flows down as props; child→parent events flow up.

	import { logComponentEndpoint } from '$lib/pipelineDiag';
	import ComposerPanel from './ComposerPanel.svelte';
	import DirectorPanel from './Director/DirectorPanel.svelte';
	import { logSignal, type DirectorTab } from '$lib/directorStore';
	import ChromeIcon from './ChromeIcon.svelte';
	import type {
		ProjectData,
		SessionData,
		ComposerFocus,
		ModelSpec,
	} from '$types';

	let {
		session,
		project,
		epoch,
		composerTab,
		directorRunning,
		tabMeta,
		totalFrames,
		selectedFrame,
		activePipeIdx = $bindable(null),
		focus = $bindable({ level: 'project' } as ComposerFocus),
		onframechange,
		localFrameForPipe,
		pipeStartForPipe,
		brokenRefs,
		workingRefs,
		onRefSaved,
		videoModel = null,
		onmediamodechange,
		onRunningChange,
		onMetaChange,
		onApplied,
	} = $props<{
		session: SessionData | null;
		project: ProjectData | null;
		/** Monotonic epoch (bumped on every handleSessionSelect) — logged
		 * at the endpoint so the trace shows which switch transaction
		 * this mount/destroy belongs to. */
		epoch: number;
		composerTab: DirectorTab;
		directorRunning: boolean;
		tabMeta: { extractSections: number; stale: boolean };
		totalFrames: number;
		selectedFrame: number;
		activePipeIdx: number | null;
		focus: ComposerFocus;
		onframechange: (frame: number) => void;
		localFrameForPipe: ((pipeIdx: number) => number) | null;
		pipeStartForPipe: ((pipeIdx: number) => number) | null;
		brokenRefs: Set<string>;
		workingRefs: Set<string>;
		onRefSaved: (pipeId: string, refId: string) => void;
		videoModel: ModelSpec | null;
		onmediamodechange: (pipeId: string, mode: 'keyframes' | 'reference') => void;
		// child → parent events
		onRunningChange: (running: boolean) => void;
		onMetaChange: (meta: { extractSections: number; stale: boolean }) => void;
		onApplied: (sessionId: string) => void;
	}>();

	const sessionId = $derived(session?.id ?? null);

	// LAYER-2: SessionView is permanently mounted — no onMount/onDestroy
	// endpoints. Instead, log the in-place session switch via $effect so the
	// pipeline ledger still shows [SV] switch <old> → <new> epoch=N. This is a
	// no-op the first render (prev is null) and fires once per switch.
	let lastSwitchedSession: string | null = null; // plain let — not $state, no re-entry
	$effect(() => {
		const id = sessionId;
		const prev = lastSwitchedSession;
		lastSwitchedSession = id; // plain write: not tracked, no loop
		if (prev !== null && prev !== id) {
			logComponentEndpoint(`[SV] switch ${prev} → ${id} epoch=${epoch}`);
		}
	});
</script>

{#if session && project}
	{#if composerTab === 'pipes'}
		<ComposerPanel
			{session}
			{totalFrames}
			{selectedFrame}
			bind:activePipeIdx
			bind:focus
			{onframechange}
			{localFrameForPipe}
			{pipeStartForPipe}
			{brokenRefs}
			{workingRefs}
			{onRefSaved}
			{videoModel}
			{onmediamodechange}
		/>
	{/if}
	<div class="harness-mount" class:harness-hidden={composerTab === 'pipes'}>
		<DirectorPanel
			activeTab={composerTab}
			{session}
			sessionId={session.id}
			sessionName={session.name}
			pipeCount={session.pipes.length}
			onLogSignal={(kind: 'edit_diff' | 'accept' | 'reject' | 'rate', targetSpan: string, note?: string) =>
				logSignal(session.id, kind, targetSpan, note)}
			{onRunningChange}
			{onMetaChange}
			{onApplied}
		/>
	</div>
{:else}
	<div class="composer-empty">
		<div class="empty-icon"><ChromeIcon id="proj-reel" size={40} /></div>
		<h2>Select a Session</h2>
		<p>Create a project and add a session to start editing</p>
	</div>
{/if}

<style>
	/* The harness panel stays mounted (state survives Pipes → back); when
	   Pipes is active it is display:none. `contents` when visible keeps the
	   wrapper layout-transparent so .director-root sizes exactly as before. */
	.harness-mount {
		display: contents;
	}
	.harness-hidden {
		display: none;
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
