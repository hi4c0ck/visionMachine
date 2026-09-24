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
		carouselCardScaleF,
		carouselCardX,
		carouselCardOpacityF,
		snapCarouselFrame,
		type ThumbDiag
	} from '$lib/frameDecoder';

	let {
		video,
		videoEl = $bindable(),
		totalFrames,
		fps = 24,
		frame,
		onframeSelect,
		onexit
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
		/** Exit carousel mode (back to full-screen playback). */
		onexit?: () => void;
	}>();

	// Perf lever (plan B1): default 8-frame grid. If 720p+ decode feels
	// heavy, flip CAROUSEL_STEP to a sub-sample (e.g. 4) in frameDecoder or
	// narrow SPAN below — the window math adapts.
	const STEP = CAROUSEL_STEP;
	// POOL: 9 card slots, one per STEP, offsets -4..4. The dip is visible to
	// ±3 (scale > 0); ±4 are the HOT PRELOAD ring — off-screen slots whose
	// frames are already decoded in the LRU, so stepping 1–2 frames never
	// waits on a decode. Slots are always mounted; each just re-points to its
	// frame index as the window slides (no card DOM ever created/destroyed).
	const HOT = 4; // pool radius in steps
	const POOL = Array.from({ length: 2 * HOT + 1 }, (_, i) => i - HOT); // offsets -4..4

	// Snap the incoming frame to the carousel grid so the window is stable
	// even when the shared frame arrives off-grid (free ruler scrubbing).
	const centerFrame = $derived(snapCarouselFrame(frame, totalFrames, STEP));
	// Pre-decode frames for the whole pool (center ± HOT steps) so the off-
	// screen ring is hot: a 1–2 frame move finds the neighbors already in
	// the LRU instead of waiting on a decode. Clamped to [0, totalFrames).
	const poolFrames = $derived(
		POOL.map((i) => {
			const f = centerFrame + i * STEP;
			return f >= 0 && f < totalFrames ? f : null;
		})
	);

	// ── Continuous strip position (the "semi-state") ───────────────────────
	// There is no discrete left/center/right state: every card's geometry is
	// a smooth function of its FLOAT distance from `visualStep` (in step
	// units). `visualStep` chases the committed `centerFrame` with a CSS
	// transition on the cards' transform, and chases the pointer 1:1 while a
	// drag is in flight (sub-step, mid-transit positions are legal).
	let visualStep = $state<number>(0); // synced on mount + chase (see $effect below)
	let dragActive = $state(false); // moveDrag owns visualStep while true

	// External moves (frame-step buttons, wheel, nav arrows, ruler) land as
	// a new `frame` prop → chase the new grid stop; the cards' CSS transition
	// carries the strip there. While a drag is in flight the pointer owns
	// the position, so this effect stands down. Runs on mount to sync the
	// initial position too.
	$effect(() => {
		if (dragActive) return;
		const t = centerFrame / STEP;
		if (t !== visualStep) visualStep = t;
	});

	// ── Live <video> layer: pinned at the strip center, cross-fading ───────
	// The video element is rendered ONCE, in a fixed center slot (not inside
	// a card, so it is never re-parented between frames → the source is
	// never reloaded → no shimmer). While the strip is in motion or the seek
	// to the new center hasn't settled, the layer fades out and the center
	// card's DECODED thumbnail (an LRU hit — it was a neighbor before) shows
	// through instead; at rest + settled the video fades back on top of the
	// identical thumbnail. Both content layers are keyed per frame, so a
	// commit just animates positions — nothing re-renders in place.
	let videoReady = $state(false);
	let seekSettled = $state(true);

	// Park the live element on the committed center frame (paused).
	$effect(() => {
		void video.url; // re-park on media change too
		seekSettled = false;
		const el = videoEl;
		if (!el) return;
		const t = centerFrame / fps;
		if (Math.abs(el.currentTime - t) > 1 / fps / 2) {
			el.currentTime = t; // seeked handler below flips seekSettled
		} else {
			seekSettled = true; // already parked — no seek in flight
		}
		void el.pause();
	});

	// Adopting a ready element (mode toggle re-parents the same node —
	// canplay does not re-fire on re-parenting), and tracking its readiness.
	$effect(() => {
		const el = videoEl;
		if (el && el.readyState >= 2) videoReady = true;
	});

	const videoAtRest = $derived(
		!dragActive && Math.abs(visualStep - centerFrame / STEP) < 0.01
	);
	const showVideo = $derived(videoAtRest && videoReady && seekSettled);

	// Neighbor thumbnail bitmaps, keyed by frame index.
	let thumbs = $state<Record<number, ImageBitmap | null>>({});
	let source: FrameSource | null = null;
	// Diagnostic state for the current source — drives the placeholder copy
	// so the UI distinguishes "loading", "out of range", "decoder failed",
	// and "unsupported runtime" instead of showing a generic ellipsis.
	let thumbDiag = $state<ThumbDiag>('pending');

	// (Re)build the decoder source when the media or fps changes.
	$effect(() => {
		const url = video.url;
		const s = new FrameSource(url, fps);
		source = s;
		thumbs = {};
		thumbDiag = 'pending';
		return () => {
			s.dispose();
			if (source === s) source = null;
		};
	});

	// Track the source's diagnostic state (loading / out-of-range / failed /
	// unsupported) and reactivity so placeholders render the right copy and
	// side frames past the real video end stop pretending to load.
	let mediaDurFrames = $state<number | null>(null);
	$effect(() => {
		const src = source;
		if (!src) return;
		let cancelled = false;
		const poll = () => {
			if (cancelled) return;
			thumbDiag = src.diag.thumb;
			const d = src.mediaDurationFrames;
			if (d !== null && d !== mediaDurFrames) mediaDurFrames = d;
			// Keep polling until a bitmap lands; the source settles fast.
			if (src.diag.thumb !== 'ok') setTimeout(poll, 500);
		};
		poll();
		return () => { cancelled = true; };
	});

	// Decode the whole pool (center ± HOT), clamped to the media's measured
	// duration. Each `frame()` call is LRU-cached in the source (or deduped
	// while in-flight), so re-pointing after a back-scroll is a cache hit.
	// Decodes run IN PARALLEL — the source serializes its own seek/capture
	// pipeline, so parallel requests are safe. (Sequential-await + fast-drag
	// cancellation is what previously starved the far slots.)
	//
	// The clamp matters: totalFrames is the CONFIGURED composer length, but
	// the generated clip can be shorter. Frames past the real video end
	// would otherwise seek to the last frame (duplicates) or spin — so skip
	// them and let the UI render "out of range" for those slots.
	$effect(() => {
		const frames = poolFrames.filter(
			(f): f is number => f !== null && (mediaDurFrames === null || f <= mediaDurFrames)
		);
		const src = source;
		if (!src || frames.length === 0) return;
		let cancelled = false;
		const settled = (f: number, b: ImageBitmap | null) => {
			if (cancelled) return;
			thumbs = { ...thumbs, [f]: b };
		};
		for (const f of frames) {
			void src.frame(f).then((b) => settled(f, b));
		}
		return () => {
			cancelled = true;
		};
	});

	// A pool slot shows a diagnostic placeholder when its frame has no bitmap
	// for a KNOWN reason: out of the media's real duration, the capture broke,
	// or the runtime can't decode at all. "Pending" (first load / still
	// decoding) keeps the generic ellipsis.
	function slotPlaceholder(f: number): string {
		if (mediaDurFrames !== null && f > mediaDurFrames) return 'out of range';
		switch (thumbDiag) {
			case 'failed':
				return 'decode failed';
			case 'unsupported':
				return 'thumbnails unavailable';
			case 'loading':
			case 'pending':
			default:
				return '…';
		}
	}

	// Horizontal-only frame sweep. The pointer drag ONLY moves cards on the
	// horizontal axis (the "swing scroll" the user wants) — a vertical or
	// mostly-vertical gesture does NOT capture the strip, so the rest of the
	// top panel (and any surrounding view) is not dragged along with it.
	//
	// The drag drives `visualStep` (the FLOAT strip position) 1:1 with the
	// pointer — sub-step, mid-transit positions are the semi-state the user
	// sees while sweeping. Every full step crossed live-commits the shared
	// selection (wheel-like) so the external UI stays in sync; the within-step
	// remainder settles on release with a transition back to the nearest stop.
	let dragPointerId = -1;
	let liveCommitStep = 0; // last whole step committed during this drag
	// A pointer-down only becomes a drag once the pointer actually travels
	// horizontally past DRAG_START_X (or vertically past DRAG_START_Y).
	// Below those thresholds the gesture is a plain CLICK (nav buttons, the
	// strip background) — pointer capture is NOT taken, so <button> click
	// handlers fire normally. Without this gate, setPointerCapture on every
	// pointerdown steals the click event from the prev/next buttons.
	const DRAG_START_X = 6; // px of horizontal travel to adopt the sweep
	const DRAG_START_Y = 10; // px of vertical travel to release (not a sweep)
	let downX = 0;
	let downY = 0;
	let dragged = false; // true once the gesture has crossed the start threshold
	// Anchor = the grid step the drag started on (float, in step units).
	// Live center = anchorStep ± pointer travel → the semi-state.
	let anchorStep = 0;

	function beginDrag(event: PointerEvent) {
		// A 2-finger touch sweep keeps moving even though we only track the
		// first pointer; ignore subsequent pointers so they can't double-drive
		// the same drag.
		if (dragPointerId !== -1) return;
		downX = event.clientX;
		downY = event.clientY;
		dragged = false;
		dragPointerId = event.pointerId;
		// Don't preventDefault or capture here: the gesture is still a click
		// until it travels past the threshold. beginDrag just remembers the
		// start point; moveDrag adopts the drag on travel.
	}

	function moveDrag(event: PointerEvent) {
		if (event.pointerId !== dragPointerId) return;
		const dx = event.clientX - downX;
		const dy = event.clientY - downY;
		if (!dragged) {
			if (Math.abs(dy) > DRAG_START_Y && Math.abs(dy) > Math.abs(dx)) {
				// Mostly-vertical before any horizontal travel → not a frame
				// sweep: release so the browser / surrounding UI handles it.
				dragPointerId = -1;
				return;
			}
			if (Math.abs(dx) > DRAG_START_X) {
				// Adopt the gesture as a frame sweep: capture the pointer now
				// so moves keep flowing to the strip even when the cursor
				// leaves the strip bounds (touch / mouse alike).
				dragged = true;
				dragActive = true;
				anchorStep = centerFrame / STEP;
				liveCommitStep = Math.round(anchorStep);
				// preventDefault suppresses the native media drag / text-select
				// so LMB hold+move sweeps frames instead of grabbing the panel.
				event.preventDefault();
				(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			}
			return;
		}
		if (!dragActive) return;
		// 1:1 tracking: the strip position is the anchor + pointer travel in
		// steps (LEFT drag = forward/next, i.e. travel dx<0 → steps>0).
		visualStep = anchorStep - dx / DRAG_PX_PER_STEP;
		// Live-commit the shared selection as each step boundary is crossed
		// (wheel-like, one step per DRAG_PX_PER_STEP of travel) so the ruler
		// and step buttons stay in sync during the sweep.
		const crossed = Math.round(visualStep);
		if (crossed !== liveCommitStep) {
			liveCommitStep = crossed;
			commitLiveFrame();
		}
	}

	/** Park the live center on the currently-committed step. */
	function commitLiveFrame() {
		const target = snapCarouselFrame(liveCommitStep * STEP, totalFrames, STEP);
		if (target !== centerFrame) onframeSelect?.(target);
	}

	function endDrag(event: PointerEvent) {
		if (event.pointerId !== dragPointerId) return;
		dragPointerId = -1;
		if (!dragActive) return; // never adopted → it was a click; nothing to do
		// Release: commit where the FLOAT position rests (rounded to the
		// nearest grid stop) so the frame settles where the pointer did, not
		// where it snapped back to. Snapping the strip back to that stop and
		// re-enabling the transition happen in the same render, so the
		// within-step remainder glides home instead of jumping.
		const target = Math.round(visualStep);
		liveCommitStep = target;
		commitLiveFrame();
		dragActive = false;
		visualStep = target;
		try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* released */ }
	}

	function step(deltaCards: number) {
		const next = snapCarouselFrame(centerFrame + deltaCards * STEP, totalFrames, STEP);
		onframeSelect?.(next);
	}

	function wheelMove(event: WheelEvent) {
		// Horizontal or vertical scroll both advance the frame sweep.
		event.preventDefault();
		step(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
	}

	// Paint a decoded frame into the card's canvas at a FIXED intrinsic size
	// (THUMB_PX wide, aspect-corrected to the source), independent of the
	// card's on-screen box. The card is CSS-transformed (transform: scale),
	// and clientWidth/clientHeight on a child of a scaled element can read
	// 0 or a stale value in WebView2 — which silently skips the paint. The
	// canvas is laid out at width:100%/height:100% + object-fit:cover by the
	// card's CSS, so the browser scales the fixed backing store to fit the
	// (possibly mid-transition) slot. No layout read needed.
	const THUMB_PX = 340; // 2× the max card width; crisp enough, memory-bounded
	function drawThumbnail(node: HTMLCanvasElement, bitmap: ImageBitmap | null | undefined) {
		const paint = (value: ImageBitmap | null | undefined) => {
			if (!value) return;
			// Intrinsic backing store: THUMB_PX wide, source aspect ratio.
			const w = THUMB_PX;
			const h = Math.max(1, Math.round(THUMB_PX * (value.height / value.width)));
			if (node.width !== w) node.width = w;
			if (node.height !== h) node.height = h;
			const ctx = node.getContext('2d');
			if (!ctx) return;
			ctx.imageSmoothingQuality = 'high';
			try {
				ctx.drawImage(value, 0, 0, w, h);
			} catch (e) {
				// A late Svelte action update can outlive an ImageBitmap close.
				// Treat that frame as unavailable instead of crashing the UI.
				console.warn('[FrameCarousel] detached thumbnail ignored:', e);
			}
		};
		paint(bitmap);
		return { update: paint, destroy: () => {} };
	}

	// ── layout math (plan B2) ───────────────────────────────────────────────
	// Horizontal strip: center card full height, neighbors shorter (dip)
	// and overlapping inward. Each neighbor's offset folds the card width
	// by OVERLAP so the outer cards tuck under their inner neighbors.
	const CARD_W = 170; // px, center card width
	const OVERLAP = 0.55;
	/** px of horizontal drag per carousel step (1 : 1, no damped rubber-band). */
	const DRAG_PX_PER_STEP = Math.round(CARD_W * (1 + (1 - OVERLAP))); // 285.5

	/**
	 * Continuous card geometry (the semi-state): the card's position/scale are
	 * smooth functions of its FLOAT distance from the visual center, so a card
	 * mid-transit between two grid stops reads a proportional dip (scale,
	 * height, x-offset, opacity) instead of a discrete center/neighbor state.
	 * All motion rides on `transform` (compositor-only, no layout) — the
	 * card's box is a fixed CARD_W × 100% slot; scale + translate express the
	 * dip. While a drag is in flight the strip transitions are disabled
	 * (fc-dragging class) so the pointer owns the position 1:1.
	 */
	/** Geometry from a (float) signed step distance — shared by pool cards. */
	function cardStyleByDistance(d: number): string {
		const scale = carouselCardScaleF(d);
		if (scale <= 0) return 'display:none;';
		const x = carouselCardX(d, CARD_W, OVERLAP);
		const opacity = carouselCardOpacityF(d);
		const z = Math.max(1, 10 - Math.round(Math.abs(d)));
		return `left:calc(50% + ${x}px - ${CARD_W / 2}px);width:${CARD_W}px;transform:scale(${scale});transform-origin:50% 100%;opacity:${opacity};z-index:${z};`;
	}
</script>

	<div
		class="fc-strip"
		class:fc-dragging={dragActive}
		role="group"
		aria-label={APP_CONSTANTS.strings.frameCarousel}
		onpointerdown={beginDrag}
		onpointermove={moveDrag}
		onpointerup={endDrag}
		onpointercancel={endDrag}
		onwheel={wheelMove}
		ondragstart={(event) => event.preventDefault()}
		style:cursor={dragActive ? 'grabbing' : 'ew-resize'}
	>
		<!-- Reusable card POOL: 9 slots (offsets -4..4), always mounted.
			 7 slots hold the visible dip (±3); ±4 are the hot-preload ring —
			 decoded off-screen so a 1–2 frame move never waits on a decode.
			 Each slot re-points to its frame index as the window slides (or
			 null past the media bounds → hidden); no card DOM is ever created
			 or destroyed during a sweep. A card is a thumbnail at ALL positions;
			 the live <video> lives in the fixed layer below, cross-fading over
			 the center slot when the strip is at rest. -->
		{#each POOL as offset (offset)}
			{@const f = poolFrames[offset + HOT] ?? null}
			<div class="fc-card" class:fc-center={f !== null && f === centerFrame} style={f === null ? 'display:none;' : cardStyleByDistance(offset - (visualStep - centerFrame / STEP))}>
				<div class="fc-thumb-placeholder" class:fc-thumb-placeholder-warn={f !== null && !thumbs[f] && (thumbDiag === 'failed' || thumbDiag === 'unsupported' || (mediaDurFrames !== null && f > mediaDurFrames))} aria-hidden="true">{f !== null ? slotPlaceholder(f) : ''}</div>
				{#if f !== null && thumbs[f]}
					<canvas class="fc-thumb" use:drawThumbnail={thumbs[f]} aria-label="{APP_CONSTANTS.strings.frameLabel} {f}"></canvas>
				{/if}
				{#if f !== null}
					<span class="fc-frame-label">{f} · {(f / fps).toFixed(1)}s</span>
				{/if}
			</div>
		{/each}

		<!-- The live <video>, pinned at the strip's center (CARD_W × full
				 height, bottom-aligned like a card). It renders ONCE — never
				 re-parented between frames — and cross-fades: while the strip
				 is in motion or the seek hasn't settled, the center card's
				 thumbnail shows through instead. pointer-events:none so a
				 drag started over it still sweeps the frames. -->
		<div class="fc-video-layer" class:fc-video-hidden={!showVideo}>
			<video
				bind:this={videoEl}
				class="fc-video"
				src={video.url}
				muted
				playsinline
				oncanplay={() => (videoReady = true)}
				onloadeddata={() => (videoReady = true)}
				onseeked={() => (seekSettled = true)}
				style="pointer-events:none"
			></video>
		</div>

	<!-- Prev / next: advance the shared frame by ±STEP on the grid.
		 stopPropagation keeps the strip's pointer/wheel handlers from
		 seeing button presses, so a click here is a clean click. -->
	<button
		class="fc-nav fc-prev"
		onclick={(e) => { e.stopPropagation(); step(-1); }}
		onpointerdown={(e) => e.stopPropagation()}
		onpointermove={(e) => e.stopPropagation()}
		onpointerup={(e) => e.stopPropagation()}
		onwheel={(e) => e.stopPropagation()}
		disabled={centerFrame <= 0}
		aria-label={APP_CONSTANTS.strings.frameNavPrev}
		title={APP_CONSTANTS.strings.framePrevDisabled}
	>‹</button>
	<button
		class="fc-nav fc-next"
		onclick={(e) => { e.stopPropagation(); step(1); }}
		onpointerdown={(e) => e.stopPropagation()}
		onpointermove={(e) => e.stopPropagation()}
		onpointerup={(e) => e.stopPropagation()}
		onwheel={(e) => e.stopPropagation()}
		disabled={centerFrame >= totalFrames - 1 - STEP}
		aria-label={APP_CONSTANTS.strings.frameNavNext}
		title={APP_CONSTANTS.strings.frameNextDisabled}
	>›</button>

	<!-- Exit carousel: the strip owns the top panel while active, so the
		 toggle back to playback lives HERE — it's unreachable otherwise
		 (the playback-mode toggle only renders in the other branch). -->
	<button
		class="fc-exit"
		onclick={(e) => { e.stopPropagation(); onexit?.(); }}
		onpointerdown={(e) => e.stopPropagation()}
		onpointermove={(e) => e.stopPropagation()}
		onpointerup={(e) => e.stopPropagation()}
		onwheel={(e) => e.stopPropagation()}
		aria-label={APP_CONSTANTS.strings.frameCarouselToPlayback}
		title={APP_CONSTANTS.strings.frameCarouselToPlayback}
	>⨯</button>
</div>

<style>
	.fc-strip {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-primary);
		/* LMB hold+move on the strip is a frame sweep (like the 2-finger
			touch drag), not a native image/video grab or text selection.
			The cursor reads as a horizontal-scroll affordance, not "move". */
		user-select: none;
		-webkit-user-drag: none;
		touch-action: pan-x;
		overscroll-behavior: contain;
		-webkit-touch-callout: none;
		cursor: ew-resize;
	}

	.fc-card {
		position: absolute;
		bottom: 0;
		height: 100%;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--border);
		background: #000;
		/* Continuous dip motion: the card's box is a fixed CARD_W × full-height
			 slot pinned to the strip; the dip is expressed as transform:scale
			 (around 50% 100% so cards stay bottom-anchored) plus a left offset.
			 Both ride the compositor / layout without re-flowing siblings. While
			 a drag is in flight (.fc-dragging) the transition is removed so the
			 pointer owns the position 1:1. */
		transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
			left 260ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 260ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.fc-strip.fc-dragging .fc-card {
		transition: none;
	}

	.fc-card.fc-center {
		border-color: var(--accent-color, #ff3e00);
		box-shadow: 0 0 18px var(--accent-glow, rgba(255, 62, 0, 0.25));
	}

	/* The live <video>: a fixed CARD_W × full-height slot pinned to the strip
		 center, cross-fading over the center card's thumbnail. It is the ONLY
		 <video> in the carousel — frame commits animate card transforms, the
		 element itself never moves, so the source is never reloaded. */
	.fc-video-layer {
		position: absolute;
		bottom: 0;
		left: calc(50% - 85px); /* CARD_W / 2 */
		width: 170px; /* CARD_W */
		height: 100%;
		border-radius: 8px;
		overflow: hidden;
		z-index: 11;
		transition: opacity 180ms ease;
	}

	.fc-video-layer:not(.fc-video-hidden) {
		border: 1px solid var(--accent-color, #ff3e00);
		box-shadow: 0 0 18px var(--accent-glow, rgba(255, 62, 0, 0.25));
	}

	.fc-video-layer.fc-video-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.fc-video,
	.fc-thumb,
	.fc-thumb-placeholder {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		/* Pointer events bubble to the strip handler, so a drag that starts
			 on the center card or a thumbnail still sweeps frames. Disable
			 the native draggable grab on the media elements. */
		-webkit-user-drag: none;
		user-select: none;
	}

	/* The placeholder sits UNDER the thumbnail canvas (which only mounts
		 once the decode lands) and fills the card while the bitmap is in
		 flight — so a thumbnail appearing never re-lays-out the card.
		 The warn variant marks KNOWN-failure states (out of range / decode
		 failed / unsupported) so the user isn't left staring at an ellipsis. */
	.fc-thumb-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 1.4rem;
		background: var(--bg-tertiary);
	}

	.fc-thumb-placeholder-warn {
		font-size: 0.62rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		letter-spacing: 0.02em;
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

	/* Exit-carousel button: top-right of the strip, the only way out while the
		 carousel owns the top panel. Reads as "close this view", not a frame
		 control, so it's set apart from the prev/next nav buttons. */
	.fc-exit {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		font-size: 0.8rem;
		line-height: 1;
		cursor: pointer;
		z-index: 21;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fc-exit:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--accent-color, #ff3e00);
	}
</style>
