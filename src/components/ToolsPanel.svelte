<script lang="ts">
	import type { SessionData, ProjectData, ComposerFocus, PipeRow, Segment, TagElement, TimelineElement, CropMode, ModelSpec } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { compilePrompt } from '$lib/compiler';
	import { toMediaUrl } from '$lib/mediaUrl';
	import { effectiveTargetDims } from '$types';
	import { getPreset, modelsFor } from '$lib/settings/catalog';
	import { availableResolutionsForModel, videoRatiosForOrientation, effectiveVideoAspect } from '$lib/settings/mediaMode';
	import { getSettings, setOnSettingsChange, unregisterSettingsChange } from '$lib/settings/store';
	import { onMount } from 'svelte';
	import ChromeIcon from './ChromeIcon.svelte';

	let {
		session,
		project,
		activeTool,
		focus = { level: 'project' } as ComposerFocus,
		onselect,
		ongenerate,
		ongeneratepipe,
		onopenpreview,
		oncomposesession,
		ffmpegAvailable = false,
		composing = false,
		compositionLabel = '',
		pipegenerating = false,
		groupActive = false,
		onfpschange,
		onresolutionchange,
		onorientationchange,
		oncropmodechange,
		onvideoratiochange,
		sessionVideoStale = false,
		qValue,
		cValue,
		onqvaluechange,
		oncvaluechange,
		unsynced = false,
		sessionVideo = null,
		onopensessionpreview,
		onfocuschange
	} = $props<{
		session: SessionData | null;
		project: ProjectData | null;
		activeTool: string | null;
		/** Context-sensitive focus driving which inspector the panel shows. */
		focus?: ComposerFocus;
		onselect: (toolId: string) => void;
		/** Session-level generate (future "generate all" — D3). */
		ongenerate: () => void;
		/** Pipe-level generate (opens the confirm modal, decision D3). */
		ongeneratepipe?: (pipeId: string) => void;
		/** Hand the pipe's last generated video to the top-panel preview (D9). */
		onopenpreview?: (pipe: PipeRow) => void;
		/** Splice the session's pipe videos into one session video (A5). */
		oncomposesession?: () => void;
		/** ffmpeg present? false → the compose button is disabled w/ hint. */
		ffmpegAvailable?: boolean;
		/** Compose is in flight — button shows live progress. */
		composing?: boolean;
		compositionLabel?: string;
		/** A generation task is active — the pipe generate button is disabled. */
		pipegenerating?: boolean;
		groupActive?: boolean;
		onfpschange?: (fps: number) => void;
		onresolutionchange?: (resolution: string) => void;
		onorientationchange?: (orientation: string) => void;
		/** 0012: session video-normalization crop mode. */
		oncropmodechange?: (cropMode: string) => void;
		/** 0012: session video aspect-ratio override (a model limits.ratios
		 *  entry, e.g. "21:9"; null = reset to orientation-derived default). */
		onvideoratiochange?: (ratio: string | null) => void;
		/** 0012 G8: the session video was composed with a different target/crop
		 *  than the session currently has — flag it for re-compose. */
		sessionVideoStale?: boolean;
		/** Quality (inference steps) of the active pipe */
		qValue?: number;
		/** Creativity (cfg scale) of the active pipe */
		cValue?: number;
		onqvaluechange?: (q: number) => void;
		oncvaluechange?: (c: number) => void;
		unsynced?: boolean;
		/** Composed session video to show in the Output section. null = none. */
		sessionVideo?: { url: string; label: string } | null;
		/** Point the top-panel preview back at the session video. */
		onopensessionpreview?: () => void;
		/** Move the focus up one level (click a breadcrumb ancestor). */
		onfocuschange?: (focus: ComposerFocus) => void;
	}>();

	let showModal = $state(false);
	let newSessionName = $state('');
	// The compiled prompt is a reference/debug view — keep it collapsed so it
	// never eats the panel's prime vertical space.
	let promptOpen = $state(false);

	// Svelte's select matcher compares the option value (a string) against the
	// passed value STRICTLY — a numeric fps (24) never matches option "24".
	// Coerce both sides to strings, and mirror a non-standard session fps into
	// the option list so any flexible fps value the session carries is visible.
	const BASE_FPS_OPTIONS = [18, 24, 30, 48, 60];
	let fpsOptions = $derived.by(() => {
		const cur = Number(session?.fps);
		const list = Number.isFinite(cur) && cur > 0 && !BASE_FPS_OPTIONS.includes(cur)
			? [...BASE_FPS_OPTIONS, cur]
			: [...BASE_FPS_OPTIONS];
		return list.sort((a, b) => a - b);
	});
	let fpsValue = $derived.by(() => {
		const cur = Number(session?.fps);
		return Number.isFinite(cur) && cur > 0 ? String(cur) : '24';
	});

	// The preview video's aspect follows the SESSION TARGET — a vertical/square
	// session previews in its own shape instead of a letterboxed 16:9 box.
	const targetAspectCss = $derived.by(() => {
		if (!session) return '16 / 9';
		const d = effectiveTargetDims(
			session.resolution,
			session.orientation,
			session.customWidth,
			session.customHeight,
		);
		return `${d.width} / ${d.height}`;
	});

	// The session resolution dropdown offers ONLY the presets whose own tier
	// the active VIDEO model can actually emit. settingsRev re-bounds the
	// options when the user switches the video model in Settings.
	let settingsRev = $state(0);
	const activeVideoModel = $derived.by((): ModelSpec | null => {
		void settingsRev;
		const s = getSettings();
		const vp = getPreset(s.providers.video.preset);
		const models = (vp ? modelsFor(vp, 'video') : []).filter((m) => !m.readOnly);
		const id = s.providers.video.model;
		const m = models.find((mm) => mm.id === id) ?? models.find((mm) => !mm.pending) ?? null;
		return m;
	});
	const resOptions = $derived.by(
		() => availableResolutionsForModel(activeVideoModel, session?.resolution ?? '720p'),
	);

	// The VIDEO aspect-ratio options the active model emits, filtered by the
	// current Orientation (a FILTER, not a concrete instruction).
	const ratioOptions = $derived.by(
		() => videoRatiosForOrientation(activeVideoModel, session?.orientation ?? 'horizontal'),
	);

	// The EXACT aspect_ratio the video request will carry — mirrors the Rust
	// shaper so the user sees the concrete value instead of guessing.
	const effectiveAspect = $derived.by(
		() =>
			effectiveVideoAspect(
				activeVideoModel,
				session?.orientation ?? 'horizontal',
				session?.videoRatio ?? null,
			),
	);

	const onPanelSettingsSync = () => {
		settingsRev++;
	};
	setOnSettingsChange(onPanelSettingsSync);
	onMount(() => () => unregisterSettingsChange(onPanelSettingsSync));

	function openNewSessionModal() {
		if (!project) return;
		newSessionName = '';
		showModal = true;
	}

	function closeNewSessionModal() {
		showModal = false;
	}

	function confirmNewSession() {
		if (!newSessionName.trim() || !project) return;
		console.log('[ToolsPanel] Create session:', newSessionName);
		closeNewSessionModal();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			confirmNewSession();
		}
	}

	function getStats() {
		if (!session) {
			return {
				sessions: project?.sessions.length || 0,
				pipes: 0,
				frames: 0,
				generations: project?.totalGenerations || 0,
			};
		}
		return {
			sessions: project?.sessions.length || 0,
			pipes: session?.pipes?.length ?? 0,
			frames: (session?.pipes ?? []).reduce((acc: number, p: PipeRow) => acc + (p?.lengthFrames || 0), 0),
			generations: session.totalGeneratedFrames,
		};
	}

	const stats = $derived(getStats());

	// ── Focus → entity resolution for the context-sensitive inspector ────
	// The focus model only carries ids; the panel holds the live session, so
	// we resolve each level to its concrete entity here. (Declared before the
	// compiled-prompt derived below, which reads `focusedPipe`.)
	function findPipe(pipeId?: string): PipeRow | null {
		if (!session?.pipes?.length || !pipeId) return null;
		return session.pipes.find((p: PipeRow) => p.id === pipeId) ?? null;
	}
	function findTimeline(pipe: PipeRow | null): TimelineElement | null {
		if (!pipe) return null;
		return (pipe.elements.find((e: any) => e.tag === 'timeline') as TimelineElement | undefined) ?? null;
	}
	function findSegment(pipe: PipeRow | null, segmentId?: string): Segment | null {
		if (!segmentId) return null;
		return findTimeline(pipe)?.segments.find((s) => s.id === segmentId) ?? null;
	}
	function findTag(pipe: PipeRow | null, segmentId: string | undefined, tagId: string): TagElement | null {
		return findSegment(pipe, segmentId)?.tags.find((t) => t.id === tagId) ?? null;
	}

	const focusedPipe = $derived(findPipe(focus.level === 'project' ? undefined : (focus as any).pipeId));
	const focusedSegment = $derived(
		focus.level === 'segment' ? findSegment(focusedPipe, (focus as any).segmentId) :
		focus.level === 'tag' ? findSegment(focusedPipe, (focus as any).segmentId) : null
	);
	const focusedTag = $derived(
		focus.level === 'tag' ? findTag(focusedPipe, (focus as any).segmentId, (focus as any).tagId) : null
	);

	// P3: remember the most-recently-active pipe so that after the user browses
	// UP to session level (breadcrumb), the last pipe is still available both
	// as a dimmed jump-back crumb in the "Session / Pipe" row and as a quiet
	// "Back to <pipe>" link in the context card — a one-click return.
	let lastPipeId = $state<string | null>(null);
	$effect(() => {
		const fp = focusedPipe?.id ?? null;
		if (fp) lastPipeId = fp; // only capture; keep the memory when we go up
	});
	const lastPipeExists = $derived(
		!!lastPipeId && (session?.pipes?.some((p: PipeRow) => p.id === lastPipeId) ?? false),
	);
	const lastPipeName = $derived(
		session?.pipes?.find((p: PipeRow) => p.id === lastPipeId)?.name ?? 'last pipe',
	);
	function resumeLastPipe() {
		if (lastPipeId) onfocuschange?.({ level: 'pipe', pipeId: lastPipeId });
	}

	// Breadcrumb of the focus path — gives orientation without a big header.
	// Each ancestor is a real ComposerFocus you can click to MOVE UP a level
	// (the user "can't deselect a pipe" today; the session crumb fixes that).
	// P3: at SESSION level we still append the LAST pipe as a dimmed,
	// clickable crumb so the "Session / Pipe" row stays structurally stable
	// (always two chips) — it never shrinks to a single chip and jumps height.
	const focusPath = $derived.by((): { label: string; target: ComposerFocus; current: boolean }[] => {
		const sid = (focus as ComposerFocus & { id?: string }).id ?? session?.id ?? '';
		const sessionF: ComposerFocus = { level: 'session', id: sid };
		const p: { label: string; target: ComposerFocus; current: boolean }[] = [];
		if (focus.level === 'project') {
			p.push({ label: 'Project', target: { level: 'project' }, current: true });
			return p;
		}
		const pipeTarget: ComposerFocus = { level: 'pipe', pipeId: focusedPipe?.id ?? lastPipeId ?? '' };
		if (focus.level === 'session') {
			// Session level: the session crumb is current; append the last pipe
			// as a dimmed jump-back crumb (only if one exists & is valid).
			p.push({ label: session?.name ?? 'Session', target: sessionF, current: true });
			if (lastPipeExists) p.push({ label: lastPipeName, target: pipeTarget, current: false });
			return p;
		}
		p.push({ label: session?.name ?? 'Session', target: sessionF, current: false });
		if (focusedPipe) p.push({ label: focusedPipe.name || 'Pipe', target: { level: 'pipe', pipeId: focusedPipe.id }, current: focus.level === 'pipe' });
		if (focus.level === 'pipe') return p;
		if (focusedSegment) p.push({ label: `Seg ${focusedSegment.frameStart}–${focusedSegment.frameEnd}`, target: { level: 'segment', pipeId: focusedPipe!.id, segmentId: focusedSegment.id }, current: focus.level === 'segment' });
		if (focus.level === 'segment') return p;
		if (focusedTag) p.push({ label: focusedTag.tag, target: { level: 'tag', pipeId: focusedPipe!.id, segmentId: focusedSegment!.id, tagId: focusedTag.id }, current: true });
		return p;
	});

	// Click a breadcrumb ancestor to move the focus up to that level.
	function goToFocus(level: number) {
		const crumb = focusPath[level];
		if (!crumb || crumb.current) return; // the current crumb is a no-op
		onfocuschange?.(crumb.target);
	}

	// Busy state for the pipe-level Generate button (drives the inline
	// progress shimmer). `groupActive` = a group generate is already running.
	const genBusy = $derived(!!(pipegenerating || groupActive));

	// T6: compiled prompt. Only the focused pipe (or the first pipe when the
	// focus is above pipe level) is compiled — a reference view, not the
	// source of truth for every pipe at once.
	const compiledPipe = $derived(focusedPipe ?? session?.pipes?.[0] ?? null);
	const compiledOutput = $derived.by(() => {
		if (!compiledPipe?.length) return '';
		return compilePrompt(compiledPipe);
	});
	const compiledLines = $derived(compiledOutput ? compiledOutput.split('\n').length : 0);

	// Last-gen preview (D9): served through read_media_file (Phase E).
	let lastVideoUrl = $state<string | null>(null);
	// True while lastVideoUrl is in flight — the <video> is then hidden so a
	// stale/failed 0:00 shell can't sit in the panel.
	let lastVideoLoading = $state(false);
	$effect(() => {
		let cancelled = false;
		const path = focusedPipe?.lastGeneration?.videoPath ?? null;
		if (!path) {
			lastVideoUrl = null;
			lastVideoLoading = false;
			return;
		}
		lastVideoUrl = null;
		lastVideoLoading = true;
		toMediaUrl(path).then((url) => {
			if (cancelled) return;
			lastVideoUrl = url;
			lastVideoLoading = false;
		}).catch(() => {
			if (cancelled) return;
			lastVideoUrl = null;
			lastVideoLoading = false;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="tools-panel">

	<!-- ═══ HERO: focus breadcrumb + one smart action row ═══════════════ -->
	<section class="tp-hero">
		<div class="hero-crumbs" aria-label="Focus path">
			{#each focusPath as crumb, i (i + crumb.label)}
				{#if i > 0}<span class="crumb-sep" aria-hidden="true">/</span>{/if}
				{#if crumb.current}
					<span class="crumb crumb-current">{crumb.label}</span>
				{:else}
					<button
						class="crumb crumb-link crumb-dim"
						onclick={() => goToFocus(i)}
						title={crumb.label}
						aria-label="Go to {crumb.label} level">
						{crumb.label}
						<span class="crumb-up" aria-hidden="true">↑</span>
					</button>
				{/if}
			{/each}
		</div>

		<div class="hero-body">
			<!-- One action row: Generate (scope follows focus) + Compose
			     (always session-level). Flat buttons in a single row; the
			     scope captions beneath each answer "what exactly will run?"
			     Segment/tag focus stays in pipe scope — generate never
			     disappears while we're inside a pipe. -->
			{#if session && focus.level !== 'project'}
				<div class="hero-actions">
					<div class="hero-actions-row">
						{#if focus.level === 'session'}
							<button
								class="act-btn act-primary"
								onclick={ongenerate}
								disabled={!session.pipes?.length}
								title={session.pipes?.length ? APP_CONSTANTS.strings.sessionGenerateHint : 'Add a pipe first'}>
								<svg class="act-ico" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<rect x="5" y="7" width="18" height="14" rx="2"/>
									<path d="M8.5 7v2.2M12.2 7v2.2M15.8 7v2.2M19.5 7v2.2" opacity="0.9"/>
									<path d="M8.5 21v-2.2M12.2 21v-2.2M15.8 21v-2.2M19.5 21v-2.2" opacity="0.5"/>
									<path d="M14 10.4l1 2.1 2.1 1-2.1 1-1 2.1-1-2.1-2.1-1 2.1-1z" fill="currentColor" stroke="none"/>
								</svg>
								<span>{APP_CONSTANTS.strings.generate}</span>
							</button>
						{:else}
							<button
								class="act-btn act-primary act-scope-pipe"
								class:busy={genBusy}
								onclick={() => focusedPipe && ongeneratepipe?.(focusedPipe.id)}
								disabled={genBusy || !focusedPipe}
								title={genBusy ? APP_CONSTANTS.strings.generationInProgress : (focusedPipe ? 'Generate this pipe' : 'No pipe selected')}>
								{#if genBusy}
									<span class="act-progress" aria-hidden="true"></span>
									<span>Generating…</span>
								{:else}
									<svg class="act-ico" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<rect x="5" y="7" width="18" height="14" rx="2"/>
										<path d="M8.5 7v2.2M12.2 7v2.2M15.8 7v2.2M19.5 7v2.2" opacity="0.9"/>
										<path d="M8.5 21v-2.2M12.2 21v-2.2M15.8 21v-2.2M19.5 21v-2.2" opacity="0.5"/>
										<path d="M14 10.4l1 2.1 2.1 1-2.1 1-1 2.1-1-2.1-2.1-1 2.1-1z" fill="currentColor" stroke="none"/>
									</svg>
									<span>{APP_CONSTANTS.strings.generate}</span>
								{/if}
							</button>
						{/if}
						<button
							class="act-btn act-secondary"
							class:busy={composing}
							onclick={() => oncomposesession?.()}
							disabled={!ffmpegAvailable || composing}
							title={ffmpegAvailable
								? APP_CONSTANTS.strings.composeSessionVideoHint
								: APP_CONSTANTS.strings.composeSessionNoFfmpeg}>
							{#if composing}<span class="act-progress act-progress-accent" aria-hidden="true"></span>{/if}
							<svg class="act-ico" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<rect x="7" y="3.5" width="14" height="8" rx="1.5"/>
								<path d="M10.5 3.5v8M14 3.5v8M17.5 3.5v8" opacity="0.45"/>
								<rect x="7" y="16.5" width="14" height="8" rx="1.5" opacity="0.5"/>
								<path d="M14 11.5v3.8M12.4 13.9L14 16.5L15.6 13.9"/>
							</svg>
							<span>{composing ? (compositionLabel || 'Composing…') : 'Compose'}</span>
						</button>
					</div>
					<div class="hero-scopes" aria-hidden="true">
						<span>
							{focus.level === 'session'
								? `all ${session.pipes?.length ?? 0} pipes · ${stats.frames}f`
								: `${focusedPipe?.name ?? 'pipe'} · ${focusedPipe?.lengthFrames ?? 0}f`}
						</span>
						<span>→ session video</span>
					</div>
				</div>
			{:else if focus.level === 'project'}
				<p class="hero-hint">Select a session to configure video settings &amp; pipes.</p>
			{/if}

			<!-- Per-level context block: a FIXED-HEIGHT card so the hero
			     never jumps between levels (P2). The card is always 84px;
			     each level just fills that same box with its content. -->
			{#if focus.level !== 'project'}
				<div class="hero-card">
					{#if focus.level === 'pipe' && focusedPipe}
						{#if lastVideoUrl}
							<video
								class="pipe-video"
								src={lastVideoUrl}
								muted
								loop
								autoplay
								playsinline
								aria-label="Last generation preview"></video>
							<button class="pipe-open" onclick={() => onopenpreview?.(focusedPipe)}>
								{APP_CONSTANTS.strings.openInPreview}
							</button>
						{:else}
							<span class="pipe-empty">{lastVideoLoading ? '…' : APP_CONSTANTS.strings.noPreview}</span>
						{/if}
					{:else if focus.level === 'segment'}
						{#if focusedSegment}
							<p class="ctx-line">f{focusedSegment.frameStart}–{focusedSegment.frameEnd} · {focusedSegment.tags.length} tag{(focusedSegment.tags.length !== 1 ? 's' : '')}</p>
						{:else}
							<p class="hero-hint">No segment selected.</p>
						{/if}
					{:else if focus.level === 'tag'}
						{#if focusedTag}
							<div class="tag-wrap">
								<p class="ctx-line">{focusedTag.tag} · f{focusedTag.frameStart}–{focusedTag.frameEnd}</p>
								{#if focusedTag.prompt}
									<div class="tag-prompt">{focusedTag.prompt}</div>
								{/if}
							</div>
						{:else}
							<p class="hero-hint">No tag selected.</p>
						{/if}
					{:else}
						<!-- session level (P3): a quiet, clearly-labelled jump-back
						     link to the last pipe — NOT the video preview, so it can't
						     be mistaken for output. Hidden when nothing was ever active. -->
						{#if lastPipeExists}
							<button class="resume-link" onclick={resumeLastPipe} title="Jump back to this pipe">
								<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M10 8.5L5 14l5 5.5M5 14h18M18 9l3 5-3 5"/>
								</svg>
								<span>Back to {lastPipeName}</span>
							</button>
						{:else}
							<p class="hero-hint">Session level · settings below</p>
						{/if}
					{/if}
				</div>
			{:else}
				<div class="proj-nums">
					<span>{project?.sessions.length ?? 0} sessions</span>
					<span>{project?.totalGenerations ?? 0} generations</span>
				</div>
			{/if}
		</div>
	</section>

	<!-- ═══ VIDEO SETTINGS (dense 2×2 field grid) ═══════════════════════ -->
	<section class="tp-sec">
		<div class="sec-head"><span class="sec-title">{APP_CONSTANTS.strings.settings}</span></div>

		{#if session}
			<div class="set-body">
				<div class="set-grid">
					<label class="set-field">
						<span class="set-lab">FPS</span>
						<select
							class="set-select"
							value={fpsValue}
							onchange={(e) => onfpschange?.(Number(e.currentTarget.value))}>
							{#each fpsOptions as opt (opt)}
								<option value={String(opt)}>{opt}</option>
							{/each}
						</select>
					</label>

					<label class="set-field">
						<span class="set-lab">Resolution</span>
						<select
							class="set-select"
							value={session.resolution}
							onchange={(e) => onresolutionchange?.(e.currentTarget.value)}>
							{#each resOptions as r (r)}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</label>

					<label class="set-field">
						<span class="set-lab">Orientation</span>
						<select
							class="set-select"
							value={session.orientation}
							onchange={(e) => onorientationchange?.(e.currentTarget.value)}>
							<option value="horizontal">Horizontal</option>
							<option value="vertical">Vertical</option>
							<option value="square">Square (1:1)</option>
						</select>
					</label>

					{#if ratioOptions.length}
						<label class="set-field" title="Video aspect-ratio sent to the provider for this session">
							<span class="set-lab">Video size</span>
							<select
								class="set-select"
								value={session.videoRatio ?? ''}
								onchange={(e) => onvideoratiochange?.(e.currentTarget.value === '' ? null : e.currentTarget.value)}>
								<option value="">{session.videoRatio ? `Default (${session.videoRatio})` : 'Default'}</option>
								{#each ratioOptions as r (r)}
									<option value={r}>{r}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>

				{#if ratioOptions.length}
					<div class="set-size-hint">sends <b>{effectiveAspect ?? 'auto'}</b></div>
				{/if}

				<label class="set-field set-field-full">
					<span class="set-lab">Crop method</span>
					<select
						class="set-select"
						value={session.cropMode ?? 'center'}
						onchange={(e) => oncropmodechange?.(e.currentTarget.value as CropMode)}>
						<option value="center">Center crop</option>
						<option value="fit">Fit (letterbox)</option>
						<option value="top">Top crop</option>
						<option value="bottom">Bottom crop</option>
						<option value="exact">Exact (stretch)</option>
						<option value="none">Auto (center if mixed)</option>
					</select>
				</label>

				<div class="set-slider">
					<span class="set-lab">Quality</span>
					<input type="range" min="5" max="30" step="1" value={qValue ?? 18} class="set-range"
						onchange={(e) => onqvaluechange?.(Number(e.currentTarget.value))} />
					<b class="set-val">{qValue ?? 18}</b>
				</div>
				<div class="set-slider">
					<span class="set-lab">Creativity</span>
					<input type="range" min="0.5" max="15" step="0.5" value={cValue ?? 7} class="set-range"
						onchange={(e) => oncvaluechange?.(Number(e.currentTarget.value))} />
					<b class="set-val">{cValue ?? 7}</b>
				</div>
			</div>
		{:else}
			<p class="set-empty">Select a session to configure settings.</p>
		{/if}
	</section>

	<!-- ═══ OUTPUT (composed session video) ════════════════════════════ -->
	<section class="tp-sec">
		<div class="sec-head">
			<span class="sec-title">Output</span>
			{#if session}<span class="out-meta">{session?.pipes?.length ?? 0}p · {stats.frames}f</span>{/if}
		</div>
		<div class="out-body">
			{#if session && sessionVideo}
				<div class="out-video-frame">
					<video
						src={sessionVideo.url}
						class="out-video"
						style={`aspect-ratio: ${targetAspectCss}`}
						muted
						loop
						autoplay
						playsinline
						controls></video>
					<button class="out-open" onclick={() => onopensessionpreview?.()}>
						{APP_CONSTANTS.strings.openInPreview}
					</button>
				</div>
				{#if sessionVideoStale}
					<div class="stale-badge" title="The session size/crop changed after this video was composed — re-compose to apply the current settings">
						<span>Re-compose (size changed)</span>
						{#if oncomposesession && ffmpegAvailable}
							<button class="btn-icon" type="button" title="Re-compose with the current size/crop"
								onclick={() => oncomposesession?.()}><ChromeIcon id="regen" size={16} /></button>
						{/if}
					</div>
				{/if}
			{:else if session}
				<div class="out-empty">
					<span class="out-empty-title">{session.name}</span>
					<span>Nothing composed yet</span>
					{#if unsynced}<span class="unsynced-badge">Unsynced</span>{/if}
				</div>
			{:else}
				<div class="out-empty"><span>Select a session to see output.</span></div>
			{/if}
		</div>
	</section>

	<!-- ═══ PROMPT (collapsible compiled view) ═════════════════════════ -->
	<section class="tp-sec">
		<button class="sec-toggle" onclick={() => promptOpen = !promptOpen} aria-expanded={promptOpen}>
			<span class="sec-title">
				Prompt
				{#if compiledLines > 0}<span class="prompt-count">· {compiledLines} lines</span>{/if}
			</span>
			<span class="chev" aria-hidden="true">{promptOpen ? '▾' : '▸'}</span>
		</button>
		{#if promptOpen}
			<div class="prompt-body">
				{#if compiledOutput}
					<div class="prompt-output">{compiledOutput}</div>
				{:else}
					<div class="prompt-empty">No pipes to compile.</div>
				{/if}
			</div>
		{/if}
	</section>

	<!-- ═══ STATS STRIP (inline, pinned to the bottom) ═════════════════ -->
	<footer class="stats-strip" aria-label="Statistics">
		<span class="stat"><b>{stats.sessions}</b><span>Sessions</span></span>
		<span class="stat"><b>{stats.pipes}</b><span>Pipes</span></span>
		<span class="stat"><b>{stats.frames}</b><span>Frames</span></span>
		<span class="stat"><b>{stats.generations}</b><span>Generated</span></span>
	</footer>

	<!-- Modal for new session -->
	{#if showModal && project}
		<div class="modal-backdrop" onclick={closeNewSessionModal} role="presentation">
			<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-session-title">
				<div class="modal-header">
					<span class="modal-title" id="new-session-title">{APP_CONSTANTS.strings.createSessionModal}</span>
					<button class="modal-close" onclick={closeNewSessionModal} aria-label="Close">×</button>
				</div>

				<div class="modal-body">
					<label class="form-label">Session Name</label>
					<input
						type="text"
						class="modal-input"
						bind:value={newSessionName}
						placeholder="Enter session name..."
						onkeydown={handleKeyDown}
					/>
				</div>

				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeNewSessionModal}>{APP_CONSTANTS.strings.cancel}</button>
					<button
						class="btn-confirm"
						disabled={!newSessionName.trim()}
						onclick={confirmNewSession}
					>
						{APP_CONSTANTS.strings.create}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.tools-panel {
		display: flex;
		flex-direction: column;
		width: 264px;
		min-width: 232px;
		max-width: 300px;
		border-left: 1px solid var(--panel-right-border);
		background: var(--panel-right-bg);
		overflow-x: hidden;
		overflow-y: auto;
	}

	/* ── HERO: focus breadcrumb + smart actions ─────────────────────── */
	.tp-hero {
		border-bottom: 1px solid var(--panel-right-border);
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--accent, #ff3e00) 9%, transparent), transparent 70%);
	}

	/* Breadcrumb chips: the current level is the accent, the ancestors are
	   muted — a glance tells you exactly where the focus sits. */
	.hero-crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
		padding: 10px 12px 8px;
	}
	/* Base crumb box — IDENTICAL geometry for active (span) and inactive
	   (button): same display/line-height/padding/font-weight. The ONLY thing
	   that differs between levels is the tint, so chips never look like one
	   is "bigger" than the other. */
	.crumb {
		display: inline-flex;
		align-items: center;
		font-size: 11px;
		font-weight: 500;
		line-height: 1;
		color: var(--text-secondary);
		padding: 4px 8px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--bg-tertiary, #27272a) 60%, transparent);
		border: 1px solid var(--panel-right-border);
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Ancestor crumbs are real buttons — navigate UP the focus hierarchy.
	   Geometry + font come ENTIRELY from .crumb (do NOT use `font: inherit`
	   here — that would override .crumb's 11px with the inherited parent size
	   and make the inactive chip bigger than the active one). */
	.crumb-link {
		appearance: none;
		cursor: pointer;
		transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
	}
	.crumb-link:hover {
		color: var(--text-primary);
		border-color: color-mix(in srgb, var(--accent, #ff3e00) 50%, var(--panel-right-border));
		background: color-mix(in srgb, var(--accent, #ff3e00) 9%, var(--bg-tertiary, #27272a));
	}
	.crumb-link:focus-visible {
		outline: none;
		border-color: var(--accent, #ff3e00);
		box-shadow: 0 0 0 3px var(--accent-glow);
	}
	/* The little up-arrow: signals "this is a level you can jump back to".
	   Absolutely positioned so it NEVER changes the chip's box/size. */
	.crumb {
		position: relative;
	}
	.crumb-up {
		display: none;
		position: absolute;
		left: 100%;
		top: 50%;
		transform: translate(4px, -50%);
		font-size: 9px;
		color: var(--accent, #ff3e00);
	}
	.crumb-link:hover .crumb-up,
	.crumb-link:focus-visible .crumb-up {
		display: block;
	}
	/* CURRENT level crumb — clearly emphasized: accent text, bold, full accent
	   border. The "you are here" signal. Same size as the dim one, but much
	   more visually active (color/weight/border, not dimensions). */
	.crumb-current {
		color: var(--accent, #ff3e00);
		font-weight: 700;
		background: color-mix(in srgb, var(--accent, #ff3e00) 18%, var(--bg-tertiary, #27272a));
		border-color: var(--accent, #ff3e00);
	}
	/* INACTIVE "previous pipe" crumb at SESSION level — same box size, but
	   visually recessed: regular weight, plain border, muted text, slight
	   opacity drop. Reads as "you were here, click to go back". */
	.crumb-dim {
		color: var(--text-muted);
		font-weight: 500;
		background: transparent;
		border-color: var(--panel-right-border);
		opacity: 0.75;
	}
	.crumb-dim:hover {
		color: var(--text-primary);
		border-color: color-mix(in srgb, var(--accent, #ff3e00) 50%, var(--panel-right-border));
		opacity: 1;
	}
	.crumb-sep {
		font-size: 11px;
		color: var(--text-muted);
	}

	.hero-body {
		padding: 2px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.hero-hint {
		margin: 0;
		font-size: 11px;
		line-height: 1.45;
		color: var(--text-secondary);
	}
	.proj-nums {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.ctx-line {
		margin: 0;
		font-size: 11px;
		color: var(--text-secondary);
		font-family: var(--font-mono, monospace);
	}
	.tag-prompt {
		margin: 4px 0 0;
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-primary);
		background: var(--bg-primary);
		border: 1px solid var(--panel-right-border);
		border-radius: 6px;
		padding: 7px 9px;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 96px;
		overflow-y: auto;
	}

	/* One action row: a dominant Generate + a quiet Compose, both FLAT (icon
	   sits beside the label — no stacked icon-above-text, no 3D puff). The
	   scope captions beneath each button answer "what exactly will run?" in
	   one compact mono line, instead of inflating the button height. */
	.hero-actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.hero-actions-row {
		display: flex;
		gap: 8px;
	}
	.act-btn {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 40px;
		padding: 0 12px;
		overflow: hidden;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.02em;
		white-space: nowrap;
		cursor: pointer;
		transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.12s ease, box-shadow 0.2s ease;
	}
	.act-btn:active:not(:disabled) {
		transform: translateY(0);
	}
	.act-btn:disabled {
		cursor: not-allowed;
	}
	.act-ico {
		width: 20px;
		height: 20px;
		flex: 0 0 auto;
	}

	/* Generate = primary: filled accent, the star of the panel. Flat — the
	   weight comes from the solid fill + a soft glow, not a 3D shadow. */
	.act-primary {
		color: #fff;
		background: var(--gradient-btn);
		border: none;
		box-shadow: 0 2px 10px var(--accent-glow);
	}
	.act-primary:hover:not(:disabled) {
		background: var(--gradient-btn-hover);
		box-shadow: 0 4px 16px var(--accent-glow);
	}
	.act-primary:disabled {
		filter: saturate(0.4) brightness(0.9);
		box-shadow: none;
	}

	/* P4: pipe-level Generate — SAME icon/text as the session button, but with
	   a visible corner NOTCH (light "L" bracket at top-left) + a slightly
	   softer fill + the scope caption beneath. The notch is the only foreign
	   visual — subtle, not a foreign icon. */
	.act-scope-pipe {
		filter: saturate(0.85);
		box-shadow: 0 1px 5px var(--accent-glow);
	}
	.act-scope-pipe:hover:not(:disabled) {
		box-shadow: 0 2px 9px var(--accent-glow);
	}
	/* The corner "notch" — a light L-bracket at top-left. Light (not accent)
	   so it actually reads on the filled accent button. Signals "pipe-scoped". */
	.act-scope-pipe::before {
		content: "";
		position: absolute;
		top: 5px;
		left: 5px;
		width: 12px;
		height: 12px;
		border-left: 2px solid rgba(255, 255, 255, 0.9);
		border-top: 2px solid rgba(255, 255, 255, 0.9);
		border-radius: 3px 0 0 0;
		opacity: 0.9;
		pointer-events: none;
	}
	.act-scope-pipe:disabled::before {
		opacity: 0.35;
	}
	.act-scope-pipe:hover:not(:disabled)::before {
		opacity: 1;
	}

	/* Compose = secondary: equal-width slot, quieter. Same flat language —
	   outline + a hair of accent on hover, so it's equally present but reads
	   as the follow-through step, not the primary trigger. */
	.act-secondary {
		color: var(--text-primary, #fff);
		background: color-mix(in srgb, var(--bg-tertiary, #27272a) 55%, transparent);
		border: 1px solid var(--border-color, #3f3f46);
	}
	.act-secondary .act-ico {
		opacity: 0.85;
	}
	.act-secondary:hover:not(:disabled) {
		border-color: var(--accent, #ff3e00);
		background: color-mix(in srgb, var(--accent, #ff3e00) 8%, transparent);
	}
	.act-secondary:disabled {
		opacity: 0.45;
	}

	/* In-flight progress: a thin animated bar riding the button's bottom edge
	   (the button stays in place; no separate progress box). */
	.act-progress {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 3px;
		width: 100%;
		background: repeating-linear-gradient(90deg, rgba(255,255,255,0.95) 0 14px, rgba(255,255,255,0.35) 14px 28px);
		background-size: 200% 100%;
		animation: genSlide 0.9s linear infinite;
	}
	.act-progress-accent {
		background: repeating-linear-gradient(90deg, var(--accent, #ff3e00) 0 14px, color-mix(in srgb, var(--accent, #ff3e00) 40%, transparent) 14px 28px);
	}
	@keyframes genSlide {
		from { background-position: 0 0; }
		to { background-position: 28px 0; }
	}

	/* The "what will run?" captions — one under each button, mono, muted. */
	.hero-scopes {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 0 2px;
	}
	.hero-scopes span {
		flex: 1 1 0;
		min-width: 0;
		font-size: 9px;
		font-family: var(--font-mono, monospace);
		letter-spacing: 0.02em;
		color: var(--text-muted);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* P1: a STABLE-HEIGHT context card so the hero never jumps between
	   session and pipe levels. Pipe = a cropped last-gen video band; session
	   = a "Continue on <pipe>" resume chip (P3) — both live in the same
	   fixed-height frame, so switching levels swaps content, not size. */
	/* P2: a STRICT fixed height — the card is always 84px, no min/max. Every
	   level fills the same 84px box, so the hero row height is identical
	   whether the focus is a session, a pipe, a segment, or a tag. */
	.hero-card {
		position: relative;
		height: 84px;
		border: 1px solid var(--panel-right-border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--bg-tertiary, #1a1a1e);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pipe-video {
		width: 100%;
		height: 100%;
		object-fit: cover; /* cropped 84px band — stable regardless of aspect */
		display: block;
		background: #000;
	}
	.pipe-open {
		position: absolute;
		right: 5px;
		bottom: 5px;
		padding: 3px 9px;
		font-size: 10px;
		font-weight: 600;
		background: rgba(0, 0, 0, 0.75);
		color: var(--text-primary);
		border: 1px solid var(--panel-right-border);
		border-radius: 10px;
		cursor: pointer;
		transition: border-color var(--transition-fast);
	}
	.pipe-open:hover {
		border-color: var(--accent, #ff3e00);
	}
	.pipe-empty {
		display: block;
		padding: 16px;
		text-align: center;
		font-size: 10px;
		color: var(--text-muted);
	}
	/* session-level context lines fit comfortably inside the 84px card */
	.hero-card .ctx-line,
	.hero-card .hero-hint {
		margin: 0;
	}
	/* the tag level: a compact 2-line block that still fits in 84px */
	.tag-wrap {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 0 10px;
		width: 100%;
	}
	.tag-prompt {
		max-height: 40px;
		overflow: hidden;
	}

	/* P3: a quiet, clearly-optional jump-back LINK (not a button, not a video
	   preview) so it can never be mistaken for output. Shown at session level. */
	.resume-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 4px;
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 500;
		cursor: pointer;
		transition: color 0.15s ease;
	}
	.resume-link svg {
		width: 14px;
		height: 14px;
		flex: 0 0 auto;
	}
	.resume-link:hover {
		color: var(--accent, #ff3e00);
	}

	/* ── Section header (shared) ────────────────────────────────────── */
	.tp-sec {
		border-bottom: 1px solid var(--panel-right-border);
	}
	.sec-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 9px 12px;
	}
	.sec-title {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--panel-right-text);
	}
	.out-meta {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--text-muted);
		letter-spacing: 0.02em;
	}

	/* ── VIDEO SETTINGS: dense 2×2 field grid ───────────────────────── */
	.set-body {
		padding: 4px 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.set-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 9px;
	}
	.set-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.set-field-full {
		width: 100%;
	}
	.set-lab {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* The "sends 16:9" echo — one line, value in the accent mono. */
	.set-size-hint {
		margin-top: -3px;
		font-size: 10px;
		color: var(--text-muted);
	}
	.set-size-hint b {
		color: var(--accent, #ff3e00);
		font-family: var(--font-mono, monospace);
		font-weight: 700;
	}

	/* Polished field: soft rounded surface, a custom chevron, accent hover +
	   focus glow — the settings read as one crafted kit, not raw form rows. */
	.set-select {
		width: 100%;
		height: 36px;
		padding: 0 30px 0 10px;
		font-size: 12px;
		font-family: inherit;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 9px;
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
		transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
		box-sizing: border-box;
		background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%23a1a1aa' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
		background-repeat: no-repeat;
		background-position: right 11px center;
	}
	.set-select:hover {
		border-color: color-mix(in srgb, var(--accent, #ff3e00) 55%, var(--border-color, #3f3f46));
	}
	.set-select:focus {
		outline: none;
		border-color: var(--accent, #ff3e00);
		box-shadow: 0 0 0 3px var(--accent-glow);
	}

	/* Sliders: label · track · value. A satisfying tactile thumb. */
	.set-slider {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.set-slider .set-lab {
		min-width: 58px;
		font-size: 9px;
	}
	.set-val {
		min-width: 22px;
		text-align: right;
		font-size: 12px;
		font-family: var(--font-mono, monospace);
		color: var(--text-secondary);
	}
	.set-range {
		flex: 1;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--bg-tertiary);
		border-radius: 3px;
		outline: none;
	}
	.set-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent, #ff3e00);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ff3e00) 22%, transparent), 0 2px 6px var(--accent-glow);
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.15s ease;
	}
	.set-range::-webkit-slider-thumb:hover {
		transform: scale(1.18);
	}
	.set-range:active::-webkit-slider-thumb {
		transform: scale(1.25);
		box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent, #ff3e00) 30%, transparent), 0 2px 8px var(--accent-glow);
	}
	.set-range::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: none;
		border-radius: 50%;
		background: var(--accent, #ff3e00);
		cursor: pointer;
	}
	.set-empty {
		margin: 0;
		padding: 14px 12px;
		text-align: center;
		font-size: 11px;
		font-style: italic;
		color: var(--text-muted);
	}

	/* ── OUTPUT (composed session video) ────────────────────────────── */
	.out-body {
		padding: 10px 12px 12px;
	}
	.out-video-frame {
		position: relative;
		border: 1px solid var(--panel-right-border);
		border-radius: 8px;
		overflow: hidden;
		background: #000;
	}
	.out-video {
		width: 100%;
		display: block;
		object-fit: contain;
		background: #000;
	}
	.out-open {
		position: absolute;
		right: 5px;
		bottom: 5px;
		padding: 3px 10px;
		font-size: 10px;
		font-weight: 600;
		background: rgba(0, 0, 0, 0.75);
		color: var(--text-primary);
		border: 1px solid var(--panel-right-border);
		border-radius: 10px;
		cursor: pointer;
		transition: border-color var(--transition-fast);
	}
	.out-open:hover {
		border-color: var(--accent, #ff3e00);
	}
	.out-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		padding: 20px 12px;
		text-align: center;
		font-size: 11px;
		color: var(--text-muted);
		border: 1px dashed var(--panel-right-border);
		border-radius: 8px;
	}
	.out-empty-title {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}
	.stale-badge {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-top: 9px;
		padding: 5px 9px;
		border: 1px solid var(--accent, #ff3e00);
		border-radius: 8px;
		background: color-mix(in srgb, var(--accent, #ff3e00) 9%, var(--bg-tertiary, #27272a));
		font-size: 10px;
		font-weight: 600;
		color: var(--accent, #ff3e00);
	}
	.stale-badge .btn-icon {
		padding: 0 2px;
		background: transparent;
		border: none;
		color: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.stale-badge .btn-icon:hover {
		transform: rotate(180deg);
		transition: transform 0.3s ease;
	}
	.unsynced-badge {
		display: inline-block;
		padding: 2px 8px;
		background: #fbbf24;
		color: #000;
		font-size: 10px;
		font-weight: 700;
		border-radius: 5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* ── PROMPT (collapsible compiled view) ─────────────────────────── */
	.sec-toggle {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 9px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.sec-toggle:hover {
		background: color-mix(in srgb, var(--bg-tertiary, #27272a) 40%, transparent);
	}
	.prompt-count {
		margin-left: 5px;
		font-weight: 500;
		font-family: var(--font-mono, monospace);
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-muted);
	}
	.chev {
		font-size: 11px;
		color: var(--text-muted);
	}
	.prompt-body {
		padding: 0 12px 12px;
	}
	.prompt-output {
		font-family: 'JetBrains Mono', 'Fira Code', monospace;
		font-size: 10px;
		line-height: 1.5;
		color: var(--text-secondary);
		white-space: pre-wrap;
		word-break: break-word;
		background: var(--bg-primary);
		border: 1px solid var(--border, #2a2a33);
		border-radius: 8px;
		padding: 9px 10px;
		max-height: 200px;
		overflow-y: auto;
	}
	.prompt-empty {
		padding: 10px;
		text-align: center;
		font-size: 11px;
		font-style: italic;
		color: var(--text-muted);
	}

	/* ── STATS STRIP (inline, pinned to the bottom) ─────────────────── */
	.stats-strip {
		display: flex;
		justify-content: space-between;
		gap: 4px;
		padding: 10px 12px;
		margin-top: auto;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
		gap: 3px;
	}
	.stat b {
		font-size: 15px;
		font-weight: 700;
		line-height: 1;
		font-family: var(--font-mono, monospace);
		color: var(--text-primary);
	}
	.stat span {
		font-size: 8px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	/* ── Modal (create session) ──────────────────────────────────────── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}
	.modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border, #2a2a33);
		border-radius: 12px;
		width: 360px;
		max-width: 90vw;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		animation: modalIn 0.15s ease-out;
	}
	@keyframes modalIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border, #2a2a33);
	}
	.modal-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.modal-close {
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--border, #2a2a33);
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 18px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-fast);
	}
	.modal-close:hover {
		background: var(--bg-tertiary);
		border-color: var(--accent, #ff3e00);
		color: var(--accent, #ff3e00);
	}
	.modal-body {
		padding: 16px;
	}
	.form-label {
		display: block;
		margin-bottom: 6px;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-secondary);
	}
	.modal-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--bg-primary);
		border: 1px solid var(--border, #2a2a33);
		border-radius: 8px;
		color: var(--text-primary);
		font-size: 14px;
		font-family: inherit;
		box-sizing: border-box;
		transition: all var(--transition-fast);
	}
	.modal-input:focus {
		outline: none;
		border-color: var(--accent, #ff3e00);
		box-shadow: 0 0 0 3px var(--accent-glow);
	}
	.modal-footer {
		padding: 12px 16px;
		border-top: 1px solid var(--border, #2a2a33);
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.btn-cancel {
		padding: 8px 16px;
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		border: 1px solid var(--border, #2a2a33);
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
		font-family: inherit;
		transition: all var(--transition-fast);
	}
	.btn-cancel:hover {
		background: var(--bg-hover, #2f2f38);
		border-color: var(--border-light, #4a4a55);
	}
	.btn-confirm {
		padding: 8px 16px;
		background: var(--gradient-accent, var(--gradient-btn));
		color: #fff;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		transition: all var(--transition-fast);
	}
	.btn-confirm:hover:not(:disabled) {
		box-shadow: var(--shadow-glow, var(--accent-glow));
		transform: translateY(-1px);
	}
	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}
</style>
