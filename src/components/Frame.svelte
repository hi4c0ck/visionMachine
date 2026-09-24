<script lang="ts">
	import { APP_CONSTANTS } from '$constants';
	import type { Settings } from '$types';
	import ProviderStatus from './Settings/ProviderStatus.svelte';
	import FrameCarousel from './FrameCarousel.svelte';

	let {
		userName,
		selectedTheme,
		layoutMode,
		showWelcome,
		onlogout,
		onthemeChange,
		onlayoutChange,
		video = null,
		fps = null,
		totalFrames = null,
		carouselFrame = 0,
		oncarouselSelect,
		onframeSelect,
		ruler = null,
		showRuler = false,
		providers = null,
		onopenprovidersettings,
	} = $props<{
		userName: string;
		selectedTheme: string;
		layoutMode: string;
		showWelcome: boolean;
		onlogout?: () => void;
		onthemeChange?: (theme: string) => void;
		onlayoutChange?: (mode: string) => void;
		/** The video to show in the top-panel preview (D9: native <video> +
		 *  play button, no ffmpeg). null = the empty placeholder state. */
		video?: { url: string; label: string } | null;
		/** Session fps — needed by the frame carousel for frame↔time math.
		 *  null/undefined = the carousel is disabled. */
		fps?: number | null;
		/** Total session frame count (8n+1) — the carousel's frame bounds. */
		totalFrames?: number | null;
		/** The shared selectedFrame — the carousel's center frame. */
		carouselFrame?: number;
		/** Advance the shared frame selection from the carousel (snaps to 8). */
		oncarouselSelect?: (frame: number) => void;
		/**
		 * Select a frame that is NOT snapped to the 8-grid (frame-step
		 * buttons in the top panel): moves the shared selectedFrame exactly,
		 * so the playback-mode preview and the global ruler can sit on any
		 * frame, not just carousel stops.
		 */
		onframeSelect?: (frame: number) => void;
		/** Tiny global frame ruler overlaid at the bottom edge of the
		 *  preview strip (frame ticks + playhead). null = nothing to show. */
		ruler?: { ticks: number[]; total: number; frame: number } | null;
		/** Render the global ruler strip. Off by default — it opts into a
		 *  special mode in future development. */
		showRuler?: boolean;
		/** Provider settings for the status chip (Phase 4). null = chip hidden. */
		providers?: Settings['providers'] | null;
		/** Open the settings modal at the Providers tab. */
		onopenprovidersettings?: () => void;
	}>();

	const layouts = [
		{ id: 'landscape', label: 'Landscape', icon: '⬜' },
		{ id: 'portrait', label: 'Portrait', icon: '⬛' },
		{ id: 'single', label: 'Single', icon: '🖥' },
	];

	let previewImage = $state<string | null>(null);

	// Top-panel video (D9): native <video> + a play/pause toggle. ffmpeg
	// (poster extraction etc.) is explicitly deferred.
	let videoEl = $state<HTMLVideoElement | null>(null);
	let videoPlaying = $state(false);
	// The media URL is ready but the element hasn't finished its first load
	// (network still in flight or codec probing). While true the panel shows a
	// spinner instead of a dead 0:00 shell — clearing the element on each new
	// preview (below) means a freshly-assigned blob URL re-triggers canplay,
	// so this never gets stuck.
	let videoLoading = $state(false);

	function toggleVideoPlay() {
		const el = videoEl;
		if (!el) return;
		if (videoPlaying) {
			el.pause();
			videoPlaying = false;
		} else {
			el.play().then(() => {
				videoPlaying = true;
			}).catch(() => {});
		}
	}

	function resetVideoState() {
		videoEl = null; // force a fresh element on the next preview
		videoPlaying = false;
		videoLoading = false;
		// Leaving a dead preview also exits carousel mode — the center card
		// the carousel keeps parked on a frame no longer exists.
		mode = 'playback';
	}

	// ── Top-panel mode: playback ⇄ carousel (plan B3) ───────────────────────
	// The toggle never reloads the video source: carousel mode parks the SAME
	// <video> element on the shared selectedFrame (FrameCarousel binds it in
	// the center card) and adds decoded neighbor cards around it.
	let mode = $state<'playback' | 'carousel'>('playback');
	// The carousel needs the session's fps + frame bounds to be known.
	let carouselReady = $derived(video !== null && fps !== null && totalFrames !== null);

	// ── Frame stepping (top-panel ‹ 8 / 8 › buttons, plan B4) ────────────
	// Steps of 8 frames match the carousel grid and the arrow-key handler in
	// Workspace. These select the frame EXACTLY (no snap) via onframeSelect,
	// so in playback mode the <video> can park on any frame, not just 8n.
	const CAROUSEL_FRAME_STEP = 8;
	const canStepPrev = totalFrames !== null && (carouselFrame ?? 0) >= CAROUSEL_FRAME_STEP;
	const canStepNext = totalFrames !== null && (carouselFrame ?? 0) < (totalFrames - 1);

	function stepFrames(delta: number) {
		if (totalFrames === null) return;
		const next = Math.min(
			totalFrames - 1,
			Math.max(0, (carouselFrame ?? 0) + delta * CAROUSEL_FRAME_STEP)
		);
		onframeSelect?.(next);
	}

	function toggleMode() {
		if (!carouselReady) return;
		if (mode === 'playback') {
			// Entering carousel: park the live element on the 8-grid so the
			// center card shows a concrete frame, not a mid-step one.
			videoEl?.pause();
			mode = 'carousel';
			oncarouselSelect?.(Math.min(totalFrames! - 1, Math.round((carouselFrame || 0) / 8) * 8));
		} else {
			mode = 'playback';
		}
	}

	// `videoLoading` tracks whether the <video> element has finished its first
	// load. It starts `false`; when the `video` prop first appears (or its url
	// changes), the $effect below sets it to `true` so the spinner shows while
	// the element mounts. `oncanplay` (in the template) flips it back to
	// `false` once playback is possible. `onerror` also clears it so a broken
	// codec / dead blob can't leave the spinner spinning forever.
	$effect(() => {
		void video?.url;
		if (video) {
			// A fresh preview → show the spinner until the <video> element's
			// oncanplay fires.
			videoLoading = true;
		} else {
			resetVideoState();
		}
	});

	function setLayout(mode: string) {
		console.log('[Frame] Layout:', mode);
		onlayoutChange?.(mode);
	}

	function handlePreviewClick() {
		console.log('[Frame] Preview image clicked');
	}
</script>

<header class="frame">
	<!-- Top section: logo + layout controls -->
	<div class="frame-top">
		<div class="logo">
			<img src="/icons/vm-mark-64.png" alt="VisionMachine" class="logo-icon" width="28" height="28" />
			<span class="logo-text">{APP_CONSTANTS.strings.appName}</span>
			{#if showWelcome}
				<span class="welcome-badge">✨ New</span>
			{/if}
		</div>

		<div class="layout-controls">
			{#if totalFrames !== null && fps !== null}
				<!-- Frame stepping (B4): moves the shared selectedFrame by ±8.
					 Lives next to the layout buttons — the top-panel home for
					 frame navigation, in both playback and carousel modes. -->
				<span class="frame-step" role="group" aria-label="Frame stepping">
					<button
						class="layout-btn frame-step-btn"
						onclick={() => stepFrames(-1)}
						disabled={!canStepPrev}
						title={canStepPrev ? APP_CONSTANTS.strings.frameStepPrev : APP_CONSTANTS.strings.frameStepDisabled}
					>
						‹ {CAROUSEL_FRAME_STEP}
					</button>
					<button
						class="layout-btn frame-step-btn"
						onclick={() => stepFrames(1)}
						disabled={!canStepNext}
						title={canStepNext ? APP_CONSTANTS.strings.frameStepNext : APP_CONSTANTS.strings.frameStepDisabled}
					>
						{CAROUSEL_FRAME_STEP} ›
					</button>
				</span>
			{/if}
			{#each layouts as layout}
				<button
					class="layout-btn {layoutMode === layout.id ? 'active' : ''}"
					onclick={() => setLayout(layout.id)}
					title={layout.label}
				>
					{layout.icon} {layout.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Middle section: frame/video preview container -->
	<div class="frame-preview">
		{#if video}
			{#if mode === 'carousel' && carouselReady}
				<!-- Carousel mode: the SAME <video> element is parked in the
					 center card (bound by FrameCarousel), with decoded neighbor
					 cards around it. No source reload on the mode toggle. -->
				<FrameCarousel
					video={video}
					bind:videoEl
					totalFrames={totalFrames!}
					fps={fps!}
					frame={carouselFrame}
					onframeSelect={(f) => oncarouselSelect?.(f)}
					onexit={toggleMode}
				/>
			{:else}
			<div class="frame-video-wrap">
				<!-- Spinner overlay while the <video> element is still probing.
				     The element itself always mounts when video is present so
				     its canplay handler can fire; the overlay just visually
				     hides the 0:00 shell until that happens. -->
				{#if videoLoading}
					<div class="frame-video-loading" aria-hidden="true">
						<span class="frame-video-loading-label">loading…</span>
					</div>
				{/if}
				<video
					bind:this={videoEl}
					class="frame-video"
					src={video.url}
					muted
					playsinline
					oncanplay={() => (videoLoading = false)}
					onerror={() => (videoLoading = false)}
					onpause={() => (videoPlaying = false)}
					onplay={() => (videoPlaying = true)}
					onended={() => (videoPlaying = false)}
				></video>
				<button
					class="frame-video-play"
					onclick={toggleVideoPlay}
					title={videoPlaying ? 'Pause' : 'Play'}
					aria-label={videoPlaying ? 'Pause video' : 'Play video'}
				>
					{videoPlaying ? '❚❚' : '▶'}
				</button>
				{#if carouselReady}
					<!-- Playback ⇄ carousel toggle (plan B3): sits next to
						 play/pause, only present when the session's fps +
						 frame bounds are known. -->
					<button
						class="frame-video-mode {mode === 'carousel' ? 'active' : ''}"
						onclick={toggleMode}
						title={mode === 'carousel' ? APP_CONSTANTS.strings.frameCarouselToPlayback : APP_CONSTANTS.strings.frameCarouselHint}
						aria-label={APP_CONSTANTS.strings.frameCarousel}
					>
						≣
					</button>
				{/if}
				<span class="frame-video-label">{video.label}</span>
				{#if totalFrames !== null}
					<!-- Frame position readout (playback mode): the top panel's
						 frame-step buttons need a visible position to act on. -->
					<span class="frame-position">{carouselFrame ?? 0} / {totalFrames}</span>
				{/if}
			</div>
			{/if}
		{:else if previewImage}
			<img src={previewImage} alt="Frame preview" class="preview-img" onclick={handlePreviewClick} />
		{:else}
			<div class="preview-empty" onclick={handlePreviewClick}>
				<span class="preview-icon">▶</span>
				<span class="preview-label">Frame &lt;img-video-container&gt;</span>
			</div>
		{/if}

		<!-- Tiny global frame ruler: overlaid at the bottom of the preview,
			 disabled by default (showRuler). Purely decorative — no events. -->
		{#if showRuler && ruler}
			<div class="global-ruler" aria-hidden="true">
				{#each ruler.ticks as tick}
					<div
						class="g-tick"
						class:g-major={tick % 32 === 0}
						style={`left: ${(tick / Math.max(1, ruler.total - 1)) * 100}%`}
					>
						{#if tick % 32 === 0}<span class="g-label">{tick}</span>{/if}
					</div>
				{/each}
				<div
					class="g-playhead"
					style={`left: ${(ruler.frame / Math.max(1, ruler.total - 1)) * 100}%`}
				></div>
			</div>
		{/if}
	</div>

	<!-- Bottom section: theme selector + user info -->
	<div class="frame-bottom">
		<div class="frame-bottom-left">
			<div class="theme-selector">
				<label for="theme-select">Theme:</label>
				<select id="theme-select" onchange={(e) => onthemeChange?.(e.currentTarget.value)}>
					<option value="jetbrains-dark">JetBrains Dark</option>
					<option value="steel-dark">Steel Machinery Dark</option>
					<option value="light">Light</option>
				</select>
			</div>

			{#if providers && onopenprovidersettings}
				<ProviderStatus {providers} onopen={onopenprovidersettings} />
			{/if}
		</div>

		{#if userName}
			<div class="user-section">
				<div class="user-badge">
					<span class="avatar">{userName.charAt(0).toUpperCase()}</span>
					<span class="name">{userName}</span>
				</div>
				<button class="logout-btn" onclick={onlogout}>↗ Logout</button>
			</div>
		{/if}
	</div>
</header>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		user-select: none;
	}

	/* ── Top section ── */
	.frame-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-primary);
		letter-spacing: -0.02em;
	}

	  .logo-icon {
		width: 28px;
		height: 28px;
		object-fit: contain;
		display: block;
		flex-shrink: 0;
	}

	.welcome-badge {
		background: linear-gradient(135deg, #ff3e00, #ff7b00);
		color: white;
		font-size: 0.65rem;
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.layout-controls {
		display: flex;
		gap: 6px;
	}

	.layout-btn {
		padding: 6px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.8rem;
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: inherit;
	}

	.layout-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.layout-btn.active {
		background: var(--gradient-accent);
		color: #fff;
		border-color: transparent;
		box-shadow: 0 2px 12px var(--accent-glow);
	}

	/* ── Preview section ── */
	.frame-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 180px;
		background: var(--bg-primary);
		border-bottom: 1px solid var(--border);
		cursor: pointer;
		position: relative;
		overflow: hidden;
		/* LMB hold+move on the preview = frame sweep (carousel), not a native
			grab/drag of the panel content. */
		user-select: none;
		-webkit-user-drag: none;
		touch-action: pan-x;
	}

	.frame-preview::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at center, var(--accent-glow) 0%, transparent 70%);
		opacity: 0.3;
		pointer-events: none;
	}

	.frame-video-wrap {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
	}

	.frame-video {
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #000;
		position: relative;
		z-index: 0;
		/* Swallow the native media grab: an LMB drag that starts on the video
			either sweeps frames (carousel) or is inert, never drags the panel. */
		-webkit-user-drag: none;
		user-select: none;
	}

	/* Shown while the blob is still loading — a 0:00 <video> shell is dead
	   anyway, so a spinner reads as "loading" instead of "broken".
	   It overlays the <video> (which is always mounted so its canplay
	   can fire) until the element is ready. */
	.frame-video-loading {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: #000;
	}
	.frame-video-loading::after {
		content: '';
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 2px solid var(--border);
		border-top-color: var(--accent-color, #ff3e00);
		animation: frame-video-spin 0.8s linear infinite;
	}
	.frame-video-loading-label {
		font-size: 0.7rem;
		color: var(--text-muted, #71717a);
		font-family: 'JetBrains Mono', monospace;
	}
	@keyframes frame-video-spin {
		to { transform: rotate(360deg); }
	}

	.frame-video-play {
		position: absolute;
		bottom: 8px;
		right: 8px;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-primary);
		cursor: pointer;
		font-size: 0.7rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.frame-video-play:hover {
		background: var(--bg-hover);
	}

	/* Carousel toggle: mirrors the play button, one icon to the left of it
	   (plan B3). The two buttons stack in the same corner. */
	.frame-video-mode {
		position: absolute;
		bottom: 8px;
		right: 44px;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-primary);
		cursor: pointer;
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.frame-video-mode:hover {
		background: var(--bg-hover);
	}

	.frame-video-mode.active {
		border-color: var(--accent-color, #ff3e00);
		color: var(--accent-color, #ff3e00);
	}

	/* Frame position readout (playback mode): top-right of the preview strip,
		 paired with the top-panel ‹8/8› step buttons. */
	.frame-position {
		position: absolute;
		top: 6px;
		right: 8px;
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-secondary);
		background: rgba(0, 0, 0, 0.55);
		padding: 2px 6px;
		border-radius: 4px;
		z-index: 2;
	}

	/* Frame-step buttons: compact layout-btn variants (‹8 / 8›) that move the
		 shared selectedFrame by 8. Grouped left of the layout buttons so the
		 top panel's right side reads "frame controls, then layout controls". */
	.frame-step {
		display: flex;
		gap: 6px;
		margin-right: 10px;
	}

	.frame-step-btn {
		padding: 6px 9px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
	}

	.frame-step-btn:disabled {
		opacity: 0.35;
		cursor: default;
		pointer-events: none;
	}

	.frame-video-label {
		position: absolute;
		top: 6px;
		left: 8px;
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-secondary);
		background: rgba(0, 0, 0, 0.55);
		padding: 2px 6px;
		border-radius: 4px;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--text-muted);
		transition: all var(--transition-fast);
		z-index: 1;
	}

	.preview-empty:hover {
		color: var(--text-secondary);
	}

	.preview-icon {
		font-size: 2rem;
		opacity: 0.4;
		filter: drop-shadow(0 0 12px var(--accent-glow));
	}

	.preview-label {
		font-size: 0.8rem;
		font-style: italic;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
	}

	.preview-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* ── Tiny global frame ruler (overlay strip at the preview bottom) ── */
	.global-ruler {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 14px;
		z-index: 3;
		pointer-events: none;
		background: var(--bg-primary);
		opacity: 0.55;
	}

	.g-tick {
		position: absolute;
		bottom: 0;
		width: 1px;
		height: 4px;
		background: var(--text-secondary);
		transform: translateX(-50%);
	}

	.g-tick.g-major {
		height: 7px;
	}

	.g-label {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 8px;
		line-height: 1;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.g-playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--accent-color);
		transform: translateX(-50%);
	}

	/* ── Bottom section ── */
	.frame-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
	}

	.frame-bottom-left {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.theme-selector {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.theme-selector label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
	}

	.theme-selector select {
		padding: 5px 10px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 5px;
		cursor: pointer;
		font-size: 0.8rem;
		font-family: inherit;
		transition: all var(--transition-fast);
	}

	.theme-selector select:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.user-section {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.user-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: var(--bg-tertiary);
		border-radius: 20px;
		border: 1px solid var(--border);
	}

	.avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--gradient-accent);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.name {
		font-size: 0.85rem;
		color: var(--text-primary);
		font-weight: 500;
	}

	.logout-btn {
		padding: 5px 12px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.8rem;
		transition: all var(--transition-fast);
		font-family: inherit;
	}

	.logout-btn:hover {
		background: rgba(220, 38, 38, 0.15);
		color: #ff6b6b;
		border-color: rgba(220, 38, 38, 0.3);
	}
</style>
