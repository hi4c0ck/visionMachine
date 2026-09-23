<script lang="ts">
	/**
	 * Top-panel frame carousel (plan B2/B3): a concrete center frame + 2
	 * overlapped, lower cards on each side showing the nearest frames on the
	 * 8n grid. The center card is the LIVE <video> element (passed in via
	 * bind so the playback ⇄ carousel toggle never reloads the source);
	 * neighbors are WebCodecs-decoded <img> thumbnails. Prev/next advance
	 * the shared frame selection by CAROUSEL_STEP (8) at a time.
	 */
	import { APP_CONSTANTS } from '$constants';
	import {
		FrameSource,
		CAROUSEL_STEP,
		carouselWindow,
		carouselCardScale,
		snapCarouselFrame
	} from '$lib/frameDecoder';

	let {
		video,
		videoEl,
		totalFrames,
		fps = 24,
		frame,
		onframeSelect
	} = $props<{
		/** The same media shown in the top panel — center card plays it. */
		video: { url: string; label: string };
		/**
	 * The top panel's live <video> element, rendered in the center card
	 * slot. Keeping it mounted (rather than a second <video>) means the
	 * mode toggle never reloads the source.
	 */
		videoEl: HTMLVideoElement | null;
		/** Total frame count of the session (8n+1). */
		totalFrames: number;
		/** Session fps — frame index → seconds. */
		fps?: number;
		/** Current center frame (the shared selectedFrame). */
		frame: number;
		/** Advance the shared frame selection (snaps to the 8-grid). */
		onframeSelect?: (frame: number) => void;
	}>();

	// Perf lever (plan B1): default 8-frame grid. If 720p+ decode feels
	// heavy, flip CAROUSEL_STEP to a sub-sample (e.g. 4) in frameDecoder or
	// narrow SPAN below — the window math adapts.
	const STEP = CAROUSEL_STEP;
	const SPAN = 2; // 2 neighbor cards each side (±1, ±2 on the grid)

	// Snap the incoming frame to the carousel grid so the window is stable
	// even when the shared frame arrives off-grid (free ruler scrubbing).
	const centerFrame = $derived(snapCarouselFrame(frame, totalFrames, STEP));
	const windowFrames = $derived(carouselWindow(centerFrame, totalFrames, STEP, SPAN));

	// Keep the center <video> parked on the snapped frame: the carousel's
	// single source of truth is the frame grid, and the live element shows
	// that exact frame (paused).
	let fcCenterReady = $state(false);
	$effect(() => {
		// Reset readiness when the media changes so a fresh element re-probes.
		void video.url;
		fcCenterReady = false;
		const t = centerFrame / fps;
		if (videoEl && Math.abs(videoEl.currentTime - t) > 1 / fps / 2) {
			videoEl.currentTime = t;
			void videoEl.pause();
		}
	});

	// Neighbor thumbnail bitmaps, keyed by frame index.
	let thumbs = $state<Record<number, ImageBitmap | null>>({});
	let source: FrameSource | null = null;

	// (Re)build the decoder source when the media or fps changes.
	$effect(() => {
		const url = video.url;
		const s = new FrameSource(url, fps);
		source = s;
		thumbs = {};
		return () => {
			s.dispose();
			if (source === s) source = null;
		};
	});

	// Decode the visible neighbor frames whenever the window moves. Each
	// `frame()` call is LRU-cached in the source, so scrolling back is a
	// cache hit; null → placeholder card.
	$effect(() => {
		void windowFrames; // re-run when the window changes
		const src = source;
		if (!src) return;
		let cancelled = false;
		(async () => {
			for (const f of windowFrames) {
				if (f === centerFrame) continue; // center card is the <video>
				const b = await src.frame(f);
				if (cancelled) return;
				thumbs = { ...thumbs, [f]: b };
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function step(deltaCards: number) {
		const next = snapCarouselFrame(centerFrame + deltaCards * STEP, totalFrames, STEP);
		onframeSelect?.(next);
	}

	// ── layout math (plan B2) ───────────────────────────────────────────────
	// Horizontal strip: center card full height, neighbors shorter (dip)
	// and overlapping inward. Each neighbor's offset folds the card width
	// by OVERLAP so the outer cards tuck under their inner neighbors.
	const CARD_W = 170; // px, center card width
	const OVERLAP = 0.55;

	function cardStyle(f: number): string {
		const delta = Math.round((f - centerFrame) / STEP);
		const scale = carouselCardScale(delta);
		if (scale === 0) return 'display:none;';
		const side = delta < 0 ? -1 : 1;
		// |delta| neighbor widths between the card and center.
		const offset =
			delta === 0 ? 0 : side * (CARD_W * (1 + (Math.abs(delta) - 1) * (1 - OVERLAP)));
		const w = CARD_W * scale;
		return `left:calc(50% + ${offset}px - ${w / 2}px);width:${w}px;height:${100 * scale}%;opacity:${scale};z-index:${10 - Math.abs(delta)};pointer-events:${delta === 0 ? 'auto' : 'none'};`;
	}
</script>

<div class="fc-strip" role="group" aria-label={APP_CONSTANTS.strings.frameCarousel}>
	{#each windowFrames as f (f)}
		<div class="fc-card" class:fc-center={f === centerFrame} style={cardStyle(f)}>
			{#if f === centerFrame}
				<video
					bind:this={videoEl}
					class="fc-video"
					class:fc-video-loading={!fcCenterReady}
					src={video.url}
					muted
					playsinline
					oncanplay={() => (fcCenterReady = true)}
					onloadeddata={() => (fcCenterReady = true)}
				></video>
			{:else if thumbs[f]}
				<img class="fc-thumb" src={thumbs[f] as unknown as string}
					alt="{APP_CONSTANTS.strings.frameLabel} {f}" />
			{:else}
				<div class="fc-thumb-placeholder" aria-hidden="true">…</div>
			{/if}
			<span class="fc-frame-label">{f} · {(f / fps).toFixed(1)}s</span>
		</div>
	{/each}

	<!-- Prev / next: advance the shared frame by ±STEP on the grid. -->
	<button
		class="fc-nav fc-prev"
		onclick={() => step(-1)}
		disabled={centerFrame <= 0}
		aria-label={APP_CONSTANTS.strings.frameNavPrev}
		title={APP_CONSTANTS.strings.framePrevDisabled}
	>‹</button>
	<button
		class="fc-nav fc-next"
		onclick={() => step(1)}
		disabled={centerFrame >= totalFrames - 1 - STEP}
		aria-label={APP_CONSTANTS.strings.frameNavNext}
		title={APP_CONSTANTS.strings.frameNextDisabled}
	>›</button>
</div>

<style>
	.fc-strip {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-primary);
	}

	.fc-card {
		position: absolute;
		bottom: 0;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--border);
		background: #000;
		transition: left 120ms ease, opacity 120ms ease, width 120ms ease, height 120ms ease;
	}

	.fc-card.fc-center {
		border-color: var(--accent-color, #ff3e00);
		box-shadow: 0 0 18px var(--accent-glow, rgba(255, 62, 0, 0.25));
	}

	.fc-video,
	.fc-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.fc-thumb-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 1.4rem;
		background: var(--bg-tertiary);
	}

	.fc-frame-label {
		position: absolute;
		bottom: 4px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-secondary);
		background: rgba(0, 0, 0, 0.6);
		padding: 1px 6px;
		border-radius: 3px;
		white-space: nowrap;
	}

	.fc-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 30px;
		height: 54px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-primary);
		font-size: 1.3rem;
		cursor: pointer;
		z-index: 20;
	}

	.fc-prev { left: 8px; }
	.fc-next { right: 8px; }

	.fc-nav:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.fc-nav:hover:not(:disabled) {
		background: var(--bg-hover);
	}
</style>
