<script lang="ts">
	import { APP_CONSTANTS } from '$constants';
	import type { ProviderKind, Settings } from '$types';
	import type { ProviderStatusSnapshot } from '$lib/settings/guards';
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
		providerStatus = null,
		providerLoading = false,
		onopenprovidersettings,
		videoAspect = null,
		isSessionVideo = false,
		onplayoutside,
		sessionVideoDetached = false,
		onopensessionpreview,
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
		 * special mode in future development. */
		showRuler?: boolean;
		/** Provider settings for the status chip (Phase 4). null = chip hidden. */
		providers?: Settings['providers'] | null;
		/** Per-kind key-presence / configured snapshot (P6) for the chip. */
		providerStatus?: Record<ProviderKind, ProviderStatusSnapshot> | null;
		/**
		 * True while the active profile's settings are still in flight (P6b).
		 * Passed straight to the chip, which renders a neutral "Loading…"
		 * state instead of asserting key presence off the default-seeded
		 * snapshot. Defaults to false for backward compatibility.
		 */
		providerLoading?: boolean;
		/** Open the settings modal at the Providers tab. */
		onopenprovidersettings?: () => void;
		/**
		 * Video aspect ratio (width/height) of the session video, derived from
		 * session orientation + resolution. e.g. 16/9 = 1.778, 9/16 = 0.5625.
		 * Passed to the frame carousel so it can size cards to the true aspect.
		 * null = fall back to the fixed 170px card width.
		 */
		videoAspect?: number | null;
		/**
		 * The preview is the composed full-session video (all pipes spliced),
		 * not a single pipe clip. Shows the "SESSION" badge so the two are
		 * never confused. (2d) */
		isSessionVideo?: boolean;
		/**
		 * "Play outside": open the current preview in the OS's default player
		 * (VLC / MPV / QuickTime). The parent owns the actual file path + the
		 * backend call; this just fires the intent. Absent = button hidden.
		 */
		onplayoutside?: () => void;
		/**
		 * A composed session video exists for this session but the top panel
		 * is currently showing a single-pipe clip — surface the "Open in
		 * preview" restore affordance as a pill (2f). */
		sessionVideoDetached?: boolean;
		/** Re-attach the composed session video to the top panel (2f). */
		onopensessionpreview?: () => void;
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

	// ── Fixed strip height ───────────────────────────────────────────────────
	// The top panel is a fixed 180px band for ANY preview, independent of the
	// video's aspect ratio. Earlier this band grew with portrait media
	// (PORTRAIT_MAX_W / aspect, up to ~460px) — switching sessions then
	// resized the top panel and shifted every panel below it. Phase decision:
	// no panel resizing; the video letterboxes into the fixed band via
	// object-fit:contain (full frame visible, no crop, no distortion).
	const stripH = 180;
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
		// Park the playback-mode <video> on the stepped frame (B4): the
		// time scrubber + readout below then reflect the step instead of
		// the video drifting away from the frame the user just picked.
		// Carousel mode manages its own element position, so never seek
		// there.
		if (mode === 'playback' && videoEl && fps !== null && !videoPlaying) {
			videoEl.currentTime = next / fps;
		}
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

	// ── Playback control cluster (2a/2b): loop, speed, time scrubber ─────
	// Operates on the native <video> (videoEl). The discrete frame world
	// (‹8/8›, arrow keys, frame ruler, carousel) is untouched — the
	// scrubber is a complementary *time* view of the same media. They
	// meet in one place: ontimeupdate mirrors the playhead into the shared
	// frame selection, so the top-right readout + global ruler stay
	// honest while the video plays.
	let loopEnabled = $state(false);
	let playbackRate = $state(1);
	let videoTime = $state(0);
	let videoDuration = $state(0);
	// 0.25× for slow-motion inspection of fast material.
	const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2];
	// Progress fill of the bottom-edge scrubber (0–100%). Feeds the CSS
	// custom property --scrub-pct that paints the hairline's filled part.
	const scrubPct = $derived(
		videoDuration > 0 ? `${Math.min(100, (videoTime / videoDuration) * 100).toFixed(2)}%` : '0%'
	);

	function formatTime(sec: number): string {
		if (!Number.isFinite(sec) || sec < 0) sec = 0;
		const m = Math.floor(sec / 60);
		const s = sec - m * 60;
		return `${m}:${s.toFixed(1).padStart(4, '0')}`;
	}

	function applySpeed(value: string) {
		const rate = Number(value);
		if (!Number.isFinite(rate) || rate <= 0) return;
		playbackRate = rate;
		if (videoEl) videoEl.playbackRate = rate;
	}

	function toggleLoop() {
		loopEnabled = !loopEnabled;
		if (videoEl) videoEl.loop = loopEnabled;
	}

	// 2b — scrub: seek the native element, mirror into videoTime so the
	// range input + readout track the pointer 1:1 (ontimeupdate would
	// fight the drag otherwise).
	function handleScrub(e: Event) {
		const el = videoEl;
		const t = Number((e.currentTarget as HTMLInputElement).value);
		if (el && Number.isFinite(t)) el.currentTime = t;
		videoTime = t;
	}

	// Playhead → shared frame selection. Only in playback mode (the
	// carousel owns the center frame itself). Clamped to the session's
	// frame space so the readout/ruler never run past the media.
	function handleTimeUpdate() {
		const el = videoEl;
		if (!el) return;
		videoTime = el.currentTime;
		if (fps !== null && totalFrames !== null && mode === 'playback') {
			const f = Math.min(totalFrames - 1, Math.max(0, Math.round(el.currentTime * fps)));
			onframeSelect?.(f);
		}
	}

	// ── Play outside (2a+) — hand the file to the OS default player. ────
	// The parent owns the on-disk path + the backend call; the button
	// only fires the intent.
	function handlePlayOutside() {
		onplayoutside?.();
	}

	// ── 2f — "Open in preview" restore pill. ────────────────────────────
	// A composed session video exists for this session but the top panel
	// shows a single-pipe clip: the pill re-attaches the session video.
	function handleOpenSessionPreview() {
		onopensessionpreview?.();
	}

	// ── 2e — keyboard layer (Space / Esc). ─────────────────────────────
	// Global desktop-first shortcuts (design brief 4.4). Guards: never
	// steal keys from form controls / buttons (their own semantics win),
	// and Space only toggles in playback mode with a loaded video.
	$effect(() => {
		const videoPresent = video !== null;
		if (!videoPresent) return;
		function onKey(e: KeyboardEvent) {
			const t = e.target as HTMLElement | null;
			if (
				t &&
				(t.tagName === 'INPUT' ||
					t.tagName === 'TEXTAREA' ||
					t.tagName === 'SELECT' ||
					t.tagName === 'BUTTON' ||
					t.isContentEditable)
			) {
				return;
			}
			if (e.code === 'Space' && !e.repeat && mode === 'playback' && !videoLoading) {
				e.preventDefault();
				toggleVideoPlay();
			} else if (e.key === 'Escape' && mode === 'carousel') {
				toggleMode();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

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
			// oncanplay fires. Reset the scrubber's time world too — stale
			// seconds from the previous source would render a bogus
			// "0:45 / 0:00" readout until the new metadata lands.
			// (loop/speed are user settings: kept, re-applied on load.)
			videoLoading = true;
			videoTime = 0;
			videoDuration = 0;
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
	<div class="frame-preview" style={`height:${stripH}px`}>
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
					videoAspect={videoAspect}
					stripH={stripH}
					onframeSelect={(f) => oncarouselSelect?.(f)}
					onexit={toggleMode}
				/>
				<!-- Play outside + the 2f restore pill float over the carousel:
					 the carousel owns the strip's own nav/exit buttons, so these
					 sit in the strip's bottom-right / top-right corners. -->
				{#if onplayoutside}
					<button
						class="outside-float"
						onclick={handlePlayOutside}
						title={APP_CONSTANTS.strings.playOutsideHint}
						aria-label={APP_CONSTANTS.strings.playOutside}
					>
						↗
					</button>
				{/if}
				{#if sessionVideoDetached}
					<button class="session-pill" onclick={handleOpenSessionPreview}
						title={APP_CONSTANTS.strings.openSessionPreviewHint}>
						▸ {APP_CONSTANTS.strings.openInPreview}
					</button>
				{/if}
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
					loop={loopEnabled}
					oncanplay={() => (videoLoading = false)}
					onerror={() => (videoLoading = false)}
					onpause={() => (videoPlaying = false)}
					onplay={() => (videoPlaying = true)}
					onended={() => (videoPlaying = false)}
						ontimeupdate={handleTimeUpdate}
					onloadedmetadata={() => {
						videoDuration = videoEl?.duration ?? 0;
						// Re-apply the user's chosen speed to the fresh element —
						// a new source resets playbackRate to 1 natively.
						if (videoEl) videoEl.playbackRate = playbackRate;
					}}
				></video>
				<span class="frame-video-label">
					<!-- 2d: badge distinguishes the composed full-session video
					     from a single pipe clip in the same preview slot. -->
					{#if isSessionVideo}
						<span class="session-badge" title="{APP_CONSTANTS.strings.sessionVideoBadgeHint}">SESSION</span>
					{/if}
					{video.label}
				</span>
				{#if totalFrames !== null}
					<!-- Frame position readout (playback mode): the top panel's
						 frame-step buttons need a visible position to act on. -->
					<span class="frame-position">{carouselFrame ?? 0} / {totalFrames}</span>
				{/if}
				{#if sessionVideoDetached}
					<!-- 2f: a composed session video exists for this session but
					     the panel shows a single-pipe clip — the pill restores the
					     session video without leaving the top panel. -->
					<button class="session-pill" onclick={handleOpenSessionPreview}
						title={APP_CONSTANTS.strings.openSessionPreviewHint}>
						▸ {APP_CONSTANTS.strings.openInPreview}
					</button>
				{/if}
				<!-- 2a/2b cluster, professional composition: a time chip floats
					 bottom-LEFT, one compact control pill bottom-RIGHT, and the
					 scrubber is a 3px hairline tied to the panel's very bottom
					 edge. No background bar — the chips sit directly on the
					 media with a faint glass tint. The discrete frame world
					 (‹8/8›, frame ruler, arrow keys) stays exactly as it was. -->
				<div class="frame-controls" role="group" aria-label={APP_CONSTANTS.strings.playbackControls}>
					<span class="ctl-time" aria-hidden="true">{formatTime(videoTime)} / {formatTime(videoDuration)}</span>
					<span class="ctl-cluster">
						<button class="ctl-btn" class:active={loopEnabled} onclick={toggleLoop}
							title={APP_CONSTANTS.strings.loopHint} aria-pressed={loopEnabled}>
							⟳
						</button>
						<select class="ctl-speed" value={String(playbackRate)}
							onchange={(e) => applySpeed(e.currentTarget.value)}
							title={APP_CONSTANTS.strings.speedLabel} aria-label={APP_CONSTANTS.strings.speedLabel}>
							{#each SPEED_OPTIONS as s}
								<option value={String(s)}>{s}×</option>
							{/each}
						</select>
						{#if onplayoutside}
							<button class="ctl-btn" onclick={handlePlayOutside}
								title={APP_CONSTANTS.strings.playOutsideHint} aria-label={APP_CONSTANTS.strings.playOutside}>
								↗
							</button>
						{/if}
						{#if carouselReady}
							<!-- Playback ⇄ carousel toggle (plan B3): moved into the
								 control cluster, still gated on known fps + frame
								 bounds. -->
							<button
								class="ctl-btn {mode === 'carousel' ? 'active' : ''}"
								onclick={toggleMode}
								title={mode === 'carousel' ? APP_CONSTANTS.strings.frameCarouselToPlayback : APP_CONSTANTS.strings.frameCarouselHint}
								aria-label={APP_CONSTANTS.strings.frameCarousel}
							>
								≣
							</button>
						{/if}
						<button
							class="ctl-btn ctl-play"
							onclick={toggleVideoPlay}
							title={videoPlaying ? 'Pause' : 'Play'}
							aria-label={videoPlaying ? 'Pause video' : 'Play video'}
						>
							{videoPlaying ? '❚❚' : '▶'}
						</button>
					</span>
				</div>
				<!-- 2b scrubber: a full-width 3px hairline tied to the panel's
					 bottom edge. The <input> is an invisible 14px hit strip
					 (keyboard-operable, native thumb/track hidden); the visible
					 line + hover dot are decorative layers driven by
					 --scrub-pct. Idle state is a quiet hairline; the accent
					 dot only materialises on hover/focus. -->
				<input
					class="ctl-scrub"
					type="range"
					min="0"
					max={videoDuration || 0}
					step="0.01"
					value={videoTime}
					oninput={handleScrub}
					aria-label={APP_CONSTANTS.strings.scrubLabel}
					style:--scrub-pct={scrubPct}
					disabled={videoDuration === 0}
				/>
				{#if videoDuration > 0}
					<span class="ctl-scrub-line" style:--scrub-pct={scrubPct} aria-hidden="true"></span>
					<span class="ctl-scrub-dot" style:--scrub-pct={scrubPct} aria-hidden="true"></span>
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

			{#if providers && providerStatus && onopenprovidersettings}
				<ProviderStatus {providers} providerStatus={providerStatus} loading={providerLoading} onopen={onopenprovidersettings} />
			{/if}

			<!-- 2e: keyboard layer discoverability — a quiet hint affordance that
				 lists the top-panel shortcuts on hover/focus. CSS-only popover;
				 a real <button> so it is focusable + screen-reader labelled. -->
			<button type="button" class="kb-hint" aria-label={APP_CONSTANTS.strings.kbShortcutsHint}>
				⌨
				<span class="kb-pop" role="tooltip">
					<span class="kb-row"><b>← / →</b> {APP_CONSTANTS.strings.kbStep}</span>
					<span class="kb-row"><b>Space</b> {APP_CONSTANTS.strings.kbPlay}</span>
					<span class="kb-row"><b>Esc</b> {APP_CONSTANTS.strings.kbEsc}</span>
				</span>
			</button>
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

	/* ── Playback control cluster (2a/2b) — quiet, professional composition ── */
	/* A small time chip bottom-LEFT, one compact control pill bottom-RIGHT,
	   and a 3px hairline scrubber pinned to the panel's very bottom edge.
	   No background bar, no gradient: the chips float over the media with
	   a faint glass tint; the scrubber shows only a quiet line at idle —
	   the thumb materialises on hover. */
	.frame-controls {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px; /* just above the 10px scrubber hit strip */
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 10px;
		z-index: 6;
		/* The row itself never blocks: media click/drag passes through the
		   gap between the two chips; only the chips take input. */
		pointer-events: none;
	}
	.frame-controls > * {
		pointer-events: auto;
	}

	.ctl-time {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.62rem;
		color: rgba(255, 255, 255, 0.78);
		background: rgba(0, 0, 0, 0.35);
		border-radius: 4px;
		padding: 2px 7px;
		white-space: nowrap;
		backdrop-filter: blur(4px);
	}

	.ctl-cluster {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px 4px;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 8px;
		backdrop-filter: blur(4px);
	}

	/* 2b scrubber: a 10px hit strip pinned to the panel's bottom edge.
	   It is a pure overlay on the video (transparent element background,
	   z-index above the <video>) — the whiteness you saw was the TRACK
	   COLOR itself: a 30%-white line over the black letterbox reads as a
	   plain white strip no matter how "low" the opacity. So:
	   IDLE   — 4px line, accent fill up to --scrub-pct, then a
	            SEMI-TRANSPARENT DARK track (black 45%): invisible-ish on
	            the letterbox, a quiet dark glass line over picture.
	   HOVER  — YouTube behaviour: the bar brightens (track → 35% white),
	            grows 4px → 6px, and the soft thumb appears. */
	.ctl-scrub {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 10px;
		margin: 0;
		padding: 0;
		z-index: 7;
		-webkit-appearance: none;
		appearance: none;
		border: none;
		border-radius: 2px;
		background-color: transparent;
		cursor: pointer;
		background-image: linear-gradient(to right,
			var(--accent-color, #59b5ff) 0%,
			var(--accent-color, #59b5ff) var(--scrub-pct, 0%),
			rgba(0, 0, 0, 0.45) var(--scrub-pct, 0%),
			rgba(0, 0, 0, 0.45) 100%);
		background-repeat: no-repeat;
		background-size: 100% 4px;
		background-position: left bottom;
	}
	/* YouTube: on hover the bar brightens to a translucent white and grows
	   (4px → 6px); the soft thumb also fades in (rules below). */
	.ctl-scrub:hover {
		background-size: 100% 6px;
		background-image: linear-gradient(to right,
			var(--accent-color, #59b5ff) 0%,
			var(--accent-color, #59b5ff) var(--scrub-pct, 0%),
			rgba(255, 255, 255, 0.35) var(--scrub-pct, 0%),
			rgba(255, 255, 255, 0.35) 100%);
	}
	.ctl-scrub:disabled {
		background-image: none;
		cursor: default;
	}
	.ctl-scrub:focus {
		outline: none;
	}
	.ctl-scrub::-webkit-slider-runnable-track {
		height: 10px;
		background: transparent;
		border: none;
	}
	.ctl-scrub::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		/* YouTube-style soft handle: a semi-transparent white radial
		   gradient that fades to transparent at the edge — no hard
		   border, no gray disc. */
		background: radial-gradient(circle at 50% 50%,
			rgba(255, 255, 255, 0.9) 0%,
			rgba(255, 255, 255, 0.45) 45%,
			rgba(255, 255, 255, 0) 72%);
		border: none;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
		opacity: 0;
		transition: opacity 120ms ease;
		cursor: pointer;
	}
	.ctl-scrub:hover::-webkit-slider-thumb,
	.ctl-scrub:active::-webkit-slider-thumb,
	.ctl-scrub:focus-visible::-webkit-slider-thumb {
		opacity: 1;
	}
	.ctl-scrub::-moz-range-track {
		height: 10px;
		background: transparent;
		border: none;
	}
	.ctl-scrub::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 50%,
			rgba(255, 255, 255, 0.9) 0%,
			rgba(255, 255, 255, 0.45) 45%,
			rgba(255, 255, 255, 0) 72%);
		border: none;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
		opacity: 0;
		transition: opacity 120ms ease;
		cursor: pointer;
	}
	.ctl-scrub:hover::-moz-range-thumb,
	.ctl-scrub:active::-moz-range-thumb,
	.ctl-scrub:focus-visible::-moz-range-thumb {
		opacity: 1;
	}

	.ctl-btn {
		width: 22px;
		height: 22px;
		border-radius: 5px;
		border: none;
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		font-size: 0.72rem;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.ctl-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}
	.ctl-btn.active {
		color: var(--accent-color, #ff3e00);
	}
	.ctl-play {
		font-size: 0.66rem;
	}

	.ctl-speed {
		height: 22px;
		padding: 0 3px;
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border: none;
		border-radius: 5px;
		font-size: 0.62rem;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		flex-shrink: 0;
	}
	.ctl-speed:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}
	.ctl-speed:focus {
		outline: none;
	}
	.ctl-speed option {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	/* 2d — "SESSION" badge on the preview label: the composed full-session
	   video is visually distinguished from a single-pipe clip in the slot. */
	.session-badge {
		display: inline-block;
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #fff;
		background: var(--accent-color, #ff3e00);
		padding: 1px 5px;
		border-radius: 3px;
		margin-right: 6px;
		vertical-align: middle;
	}

	/* 2f — "Open in preview" restore pill: a composed session video exists
	   but the panel shows a pipe clip. Sits under the top-right readout / exit
	   button, in both modes. */
	.session-pill {
		position: absolute;
		top: 34px;
		right: 8px;
		z-index: 5;
		padding: 4px 10px;
		font-size: 0.68rem;
		font-family: inherit;
		border: 1px solid var(--accent-color, #ff3e00);
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.55);
		color: var(--text-primary);
		cursor: pointer;
		white-space: nowrap;
	}
	.session-pill:hover {
		background: var(--bg-hover);
	}

	/* Play-outside float for carousel mode (in playback mode the button lives
	   in the control bar). Bottom-right of the strip; the carousel's own
	   nav/exit buttons use the vertical-center sides and top-right, so there
	   is no collision. */
	.outside-float {
		position: absolute;
		bottom: 8px;
		right: 8px;
		z-index: 22;
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
	.outside-float:hover {
		background: var(--bg-hover);
	}

	/* 2e — keyboard-shortcut hint: a quiet affordance in the top panel's
	   bottom bar; hover/focus reveals a CSS-only popover listing the keys. */
	.kb-hint {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 5px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.8rem;
		cursor: help;
		outline: none;
		padding: 0;
	}
	.kb-hint:hover,
	.kb-hint:focus {
		color: var(--text-primary);
		border-color: var(--border-light, var(--border));
	}
	.kb-pop {
		visibility: hidden;
		opacity: 0;
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
		white-space: nowrap;
		transition: opacity 120ms ease;
		pointer-events: none;
		z-index: 50;
	}
	.kb-hint:hover .kb-pop,
	.kb-hint:focus .kb-pop {
		visibility: visible;
		opacity: 1;
	}
	.kb-row {
		font-size: 0.68rem;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', monospace;
	}
	.kb-row b {
		color: var(--text-primary);
		font-weight: 700;
		margin-right: 6px;
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
