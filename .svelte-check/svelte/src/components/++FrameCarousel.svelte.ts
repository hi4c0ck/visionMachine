///<reference types="svelte" />
;
/**
	 * Top-panel frame carousel (plan B2/B3): a nested horizontal card stack
	 * `[ [[]] ]` — a concrete front frame flanked by 2 overlapped, lower
	 * cards on each side showing the nearest frames on the 8n grid. The
	 * front card is the LIVE <video> element (passed in via bind so the
	 * playback ⇄ carousel toggle never reloads the source); neighbors are
	 * WebCodecs-decoded thumbnails. Prev/next advance the shared frame
	 * selection by CAROUSEL_STEP (8) at a time.
	 *
	 * Stacked treatment (driven off the same float distance as the dip, so
	 * every state interpolates with no discrete branch):
	 *  - BACKWARDS cards (d<0) gain a blue-grey "past frames" tint + desat.
	 *  - FORWARDS  cards (d>0) gain a soft warm "future" dim.
	 *  - The front card's accent glow cross-fades (carouselGlowF) so the
	 *    departing and arriving fronts hand off at 0.5/0.5 mid-move.
	 *  - A grab-and-place lift arc (carouselLiftF) peaks at |d|=0.5, and a
	 *    depth blur (carouselBlurF) keeps the front sharp while receding
	 *    cards fall out of focus.
	 *  - At rest the settled front card gets a subtle breathing halo.
	 */
import { untrack } from 'svelte';
import { APP_CONSTANTS } from '$constants';
import {
		FrameSource,
		CAROUSEL_STEP,
		carouselCardScaleF,
		carouselCardX,
		carouselCardOpacityF,
		carouselBackTintF,
		carouselFwdDimF,
		carouselGlowF,
		carouselLiftF,
		carouselBlurF,
		carouselDissolveOpacity,
		snapCarouselFrame,
		carouselCardWidth,
		carouselDragPxPerStep,
		thumbnailIntrinsic,
		type ThumbDiag
	} from '$lib/frameDecoder';

;type $$ComponentProps = {
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
		/**
		 * Video aspect ratio (width/height) of the session video — a SEED, not
		 * the truth. The carousel measures the media's ACTUAL dimensions off its
		 * capture <video> and sizes cards to those once known; this preset is
		 * only the card width until that measurement lands. null = use the
		 * fixed 170px fallback immediately.
		 */
		videoAspect?: number | null;
		/**
		 * The top-panel strip's rendered height (px). The parent band is 180px
		 * for landscape/square media and grows taller for portrait media, so
		 * cards must track it: a portrait card's width = stripH × aspect keeps
		 * the box at the video's true aspect at the band's REAL height.
		 */
		stripH?: number;
		/** Advance the shared frame selection (snaps to the 8-grid). */
		onframeSelect?: (frame: number) => void;
		/** Exit carousel mode (back to full-screen playback). */
		onexit?: () => void;
	};function $$render() {

	
	
	
	

	let {
		video,
		videoEl = $bindable(),
		totalFrames,
		fps = 24,
		frame,
		videoAspect = null,
		stripH = 180,
		onframeSelect,
		onexit
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>()/*Ωignore_startΩ*/;videoEl;/*Ωignore_endΩ*/;

	// Measured media dimensions, mirrored off the source's capture <video> by
	// the poll effect further down. Declared here (above CARD_W) so the card
	// width can be derived from them without a forward reference.
	//   mediaDurFrames — end-of-media in frames (null until metadata).
	//   mediaSize      — the ACTUAL width/height (null until metadata). Cards
	//                    size to the real video, not the session's preset.
	let mediaDurFrames = $state<number|null>(null);
	let mediaSize = $state<{ width: number; height: number } | null>(null);

	// Card width from the media's TRUE aspect. The real size (measured off the
	// source's capture <video> once metadata lands) wins; the session preset
	// (videoAspect) is only the seed shown until that measurement arrives; the
	// fixed 170px is the last resort when neither is known. The card box keeps
	// the video's true aspect, so object-fit:fill never crops or letterboxes.
	// The card tracks the strip's REAL height (stripH, passed from the parent
	// band), not a hard-coded 180 — portrait bands are taller.
	const CARD_W = $derived(
		carouselCardWidth(stripH, mediaSize ? mediaSize.width / mediaSize.height : videoAspect)
	);
	/** px of horizontal drag per carousel step (1 : 1, no damped rubber-band). */
	const DRAG_PX_PER_STEP = $derived(carouselDragPxPerStep(CARD_W));

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
	let visualStep = $state<number>(0); // continuous strip position, rAF-tweened (not CSS-transitioned)
	let dragActive = $state(false); // moveDrag owns visualStep while true
	let visualStepInitialized = false; // first chase run parks instantly
	let tweenRAF = 0; // active requestAnimationFrame handle

	// Ease-out-cubic tween of the visual center. It carries the semi-state
	// THROUGH the switch point (|d| = 0.5) so the accent dissolve actually
	// ramps. A plain CSS transition never recomputes the JS dissolve vars,
	// which is why a snapped (integer) visualStep kept the wash invisible.
	function tweenVisualStep(from: number, to: number) {
		cancelAnimationFrame(tweenRAF);
		if (from === to) { visualStep = to; return; }
		const start = performance.now();
		const DUR = 260;
		const tick = (now: number) => {
			const p = Math.min(1, (now - start) / DUR);
			const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
			visualStep = from + (to - from) * e;
			if (p < 1) tweenRAF = requestAnimationFrame(tick);
			else { visualStep = to; tweenRAF = 0; }
		};
		tweenRAF = requestAnimationFrame(tick);
	}



	// External moves (frame-step buttons, wheel, nav arrows, ruler) land as
	// a new `frame` prop → chase the new grid stop; the cards' CSS transition
	// carries the strip there. While a drag is in flight the pointer owns
	// the position, so this effect stands down. Runs on mount to sync the
	// initial position too.
	$effect(() => {
		void centerFrame;
		void dragActive;
		if (dragActive) {
			// A drag owns the position 1:1 — stop any in-flight commit tween
			// so it doesn't fight the pointer.
			cancelAnimationFrame(tweenRAF);
			tweenRAF = 0;
			return;
		}
		const target = centerFrame / STEP;
		// Read the current position without tracking it, so this effect does
		// NOT re-run on every tween frame (it keys only on centerFrame/dragActive).
		const from = untrack(() => visualStep);
		if (from !== target) {
			if (!visualStepInitialized) {
				visualStep = target; // mount: park instantly
				visualStepInitialized = true;
			} else {
				tweenVisualStep(from, target);
			}
		}
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

	// ── Per-video reset (solid pipeline on video switch) ─────────────────────
	// All per-video state belongs to ONE video.url. When the url (or fps, which
	// also bounds the frame grid) changes we clear every one of them and
	// rebuild the decoder from scratch, so frames, durations, and readiness
	// from the previous clip never leak into the new one. This effect keys on
	// video.url + fps and is the SINGLE place that resets on a switch.
	//
	// IMPORTANT: Svelte runs $effect bodies in source order and their
	// cleanups in the SAME order on dependency change. We declare the reset
	// effect AFTER the source-building effect below so that on a url change
	// the old FrameSource is disposed FIRST (releasing its capture video,
	// WebCodecs decoder, and LRU bitmaps) and THEN the Svelte-side state is
	// cleared. Reversing that order would let the new source start capturing
	// while the old one's in-flight work is still writing into `thumbs`.

	// (Re)build the decoder source when the media or fps changes. The cleanup
	// disposes the old FrameSource (closes the WebCodecs decoder + capture
	// video + LRU bitmaps) BEFORE the reset effect below clears Svelte state,
	// so no in-flight capture from the previous video races the new one.
	$effect(() => {
		const url = video.url;
		const s = new FrameSource(url, fps);
		source = s;
		return () => {
			s.dispose();
			if (source === s) source = null;
		};
	});

	$effect(() => {
		void video.url;
		void fps;
		thumbs = {};
		thumbDiag = 'pending';

		mediaDurFrames = null;
		mediaSize = null;
		// The live <video> element still shows the old clip (or a 0:00 shell)
		// until the new url's canplay fires — mark it not-ready so the center
		// card falls back to the (re-decoded) thumbnail, not a stale frame.
		videoReady = false;
		seekSettled = false;
		// Drag position was relative to the old video's frame grid — drop it;
		// the chase effect re-syncs visualStep to the new center frame.
		dragActive = false;
	});

	// Track the source's diagnostic state (loading / out-of-range / failed /
	// unsupported) and reactivity so placeholders render the right copy and
	// side frames past the real video end stop pretending to load.
	//
	// This effect depends ONLY on `source` — it must NOT read any other
	// $state in its body, because reading a $state inside an $effect makes
	// the effect depend on it, and writing it would re-run the effect →
	// infinite loop on entering carousel mode. The last-pushed value is kept
	// in a plain local for the stop-polling check.
	//
	// Terminal states stop polling: 'unsupported' and 'failed' never resolve
	// on their own (the runtime can't decode at all / the capture broke
	// permanently). Only 'pending' and 'loading' keep a re-poll so the
	// placeholder copy upgrades to 'ok' the moment the first bitmap lands.
	$effect(() => {
		const src = source;
		if (!src) return;
		let cancelled = false;
		let last = src.diag.thumb; // plain local — NOT the reactive state
		let lastDur: number | null = null; // plain local — NOT the reactive state
		let lastSize: { width: number; height: number } | null = null; // plain local
		const poll = () => {
			if (cancelled) return;
			const diag = src.diag.thumb;
			if (diag !== last) {
				last = diag;
				thumbDiag = diag; // same-value write is a no-op, no churn
			}
			// Keep the measured-duration mirror fresh so the decode effect
			// re-clamps its pool as soon as the source measures the media.
			// Both mirrors are pushed through PLAIN LOCALS (lastDur/lastSize)
			// so the effect's reactive deps stay ONLY `source` — it never
			// depends on the $state it writes, so a value change can't re-run
			// it into a loop. A same-value write is a no-op anyway.
			const d = src.mediaDurationFrames;
			if (d !== null && d !== lastDur) {
				lastDur = d;
				mediaDurFrames = d;
			}
			// Same for the ACTUAL media size — card width tracks it so the
			// strip sizes to the real video, not the session's preset.
			const s = src.mediaSize;
			if (s && s !== lastSize) {
				lastSize = s;
				mediaSize = s;
			}
			// Re-poll only while the source can still transition to 'ok'.
			if (diag === 'pending' || diag === 'loading') {
				setTimeout(poll, 500);
			}
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
		const src = source;
		if (!src) return;
		// Read the measured duration directly off the source (a plain class
		// getter, not a $state) so this effect's reactive deps are only
		// `source` and `poolFrames` — no cross-effect state sharing, no loop.
		const dur = src.mediaDurationFrames;
		const frames = poolFrames.filter(
			(f): f is number => f !== null && (dur === null || f <= dur)
		);
		if (frames.length === 0) return;
		let cancelled = false;
		const settled = (f: number, b: ImageBitmap | null) => {
			if (cancelled) return;
			// Guard against an orphaned source: if the video.url has changed
			// since this effect ran, `src` is the old FrameSource and its
			// in-flight promises must NOT write into the new video's thumbs.
			if (src !== source) return;
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
		if (deltaCards === 0) return;
		const next = snapCarouselFrame(centerFrame + deltaCards * STEP, totalFrames, STEP);
		onframeSelect?.(next);
	}

	function wheelMove(event: WheelEvent) {
		// Horizontal or vertical scroll both advance the frame sweep.
		event.preventDefault();
		step(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
	}

	// Paint a decoded frame into the card's canvas. The backing store is 1:1 with
	// the card box (width = CARD_W, height aspect-corrected to the source), so
	// object-fit:fill renders it with no second scale — a 2×-resolution store
	// would be down-sampled again by the CSS (a double scaler that blurs the
	// portrait thumbnail). The card is CSS-transformed (transform: scale), and
	// clientWidth/clientHeight on a child of a scaled element can read 0 or a
	// stale value in WebView2 — so we derive the intrinsic size from CARD_W
	// (a $derived constant, not a layout read) instead.
	function drawThumbnail(node: HTMLCanvasElement, bitmap: ImageBitmap | null | undefined) {
		const paint = (value: ImageBitmap | null | undefined) => {
			if (!value) return;
			// 1:1 with the card box, aspect-corrected to the source.
			const { w, h } = thumbnailIntrinsic(CARD_W, value.width, value.height);
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
	/** The "past frames" veil colour for a card at signed distance `d`. */
	function cardTintBg(d: number): string {
		const back = carouselBackTintF(d); // 0 for d >= 0
		const fwd = carouselFwdDimF(d); // 0 for d <= 0
		// Backwards (d<0) and forwards (d>0) never co-occur; during a move
		// the crossing cards read a small value of one side only. Pick the
		// dominant veil so the value fades smoothly to transparent.
		if (back >= fwd) return back > 0 ? `rgba(84,104,138,${back.toFixed(3)})` : 'transparent';
		return fwd > 0 ? `rgba(18,14,10,${fwd.toFixed(3)})` : 'transparent';
	}

	/**
	 * Full geometry from a (float) signed step distance — shared by pool
	 * cards. Emits the dip transform/opacity plus the stacked-treatment CSS
	 * vars (`--fc-tint-bg`), a depth-blur filter, and a card-level accent
	 * box-shadow. Everything is a smooth function of `d`, so a commit (d
	 * jumping between two grid stops) rides the card's CSS transition and a
	 * drag (d tracking the pointer 1:1) stays continuous — no discrete state
	 * branch anywhere.
	 */
	function cardStyleByDistance(d: number): string {
		const scale = carouselCardScaleF(d);
		if (scale <= 0) return 'display:none;';
		const x = carouselCardX(d, CARD_W);
		const opacity = carouselCardOpacityF(d);
		const z = Math.max(1, 10 - Math.round(Math.abs(d)));
		const lift = carouselLiftF(d);
		const glow = carouselGlowF(d);
		const blur = carouselBlurF(d);
		// The card's OWN box-shadow carries the accent glow so it paints OUTSIDE
		// the border-box and is not clipped by the card's overflow:hidden (a
		// child glow ring would be). Its radius/spread scale with `glow`
		// (carouselGlowF): 1 at the resting center, 0.5 on the two crossing
		// fronts mid-move, 0 a step away — so the departing front's glow
		// dissolves as the arriving front's rises, and both ride the card's
		// box-shadow transition on a commit.
		// Continuous dissolve (v4, receding-only): a RECEDING card (d<0)
		// fades to true transparency through the dither grains — the mask is
		// on the card's MEDIA only, so the accent border + glow stay solid
		// and the frame UNDERNEATH is never masked — and gains a granular
		// accent wave-tint (.fc-wave-tint, wavy shine/shadow). Arriving
		// cards (d>=0) and every rest stop stay fully clean.
		const dissolveOp = carouselDissolveOpacity(d); // non-zero only when d < 0
		// For a left-side (receding) card the wash/accent open on the
		// center-facing edge: dir 'to right' → ramp solid on the outer
		// (left) edge, transparent toward the deck center.
		const dissolveDir = 'to right';
		return "left:calc(50% + " + x + "px - " + (CARD_W / 2) + "px);width:" + CARD_W + "px;transform:translateY(" + (-lift).toFixed(2) + "px) scale(" + scale.toFixed(4) + ");transform-origin:50% 100%;opacity:" + opacity.toFixed(3) + ";z-index:" + z + ";--fc-tint-bg:" + cardTintBg(d) + ";--fc-dissolve-op:" + dissolveOp.toFixed(3) + ";--fc-dissolve-dir:" + dissolveDir + ";filter:blur(" + blur.toFixed(2) + "px);box-shadow:0 0 " + (22 * glow).toFixed(1) + "px " + (5 * glow).toFixed(1) + "px var(--accent-glow, rgba(255, 62, 0, 0.25));";
	}
;
async () => {

	 { svelteHTML.createElement("div", {                       "class":`fc-strip`,"role":`group`,"aria-label":APP_CONSTANTS.strings.frameCarousel,"onpointerdown":beginDrag,"onpointermove":moveDrag,"onpointerup":endDrag,"onpointercancel":endDrag,"onwheel":wheelMove,"ondragstart":(event) => event.preventDefault(),});dragActive;videoAtRest;__sveltets_2_ensureType(String, Number, `${CARD_W}px`);__sveltets_2_ensureType(String, Number, dragActive ? 'grabbing' : 'ew-resize');
		
		   for(let offset of __sveltets_2_ensureArray(POOL)){offset;
			const f = poolFrames[offset + HOT] ?? null;
			 { svelteHTML.createElement("div", {    "class":`fc-card`,"style":f === null ? 'display:none;' : cardStyleByDistance(offset - (visualStep - centerFrame / STEP)),});f !== null && f === centerFrame;
				 { svelteHTML.createElement("div", {    "class":`fc-thumb-placeholder`,"aria-hidden":`true`,});f !== null && !thumbs[f] && (thumbDiag === 'failed' || thumbDiag === 'unsupported' || (mediaDurFrames !== null && f > mediaDurFrames));f !== null ? slotPlaceholder(f) : ''; }
				if(f !== null && thumbs[f]){
					 {const $$action_0 = __sveltets_2_ensureAction(drawThumbnail(svelteHTML.mapElementTag('canvas'),(thumbs[f])));{ svelteHTML.createElement("canvas", __sveltets_2_union($$action_0), {     "class":`fc-thumb`,"aria-label":`${APP_CONSTANTS.strings.frameLabel} ${f}`,}); }}
				}
				
				 { svelteHTML.createElement("div", {   "class":`fc-tint-overlay`,"aria-hidden":`true`,}); }
				
				 { svelteHTML.createElement("div", {   "class":`fc-wave-tint`,"aria-hidden":`true`,}); }
				if(f !== null){
					 { svelteHTML.createElement("span", { "class":`fc-frame-label`,});f;  (f / fps).toFixed(1);  }
				}
			 }
		}

		
		 { svelteHTML.createElement("div", {  "class":`fc-video-layer`,});!showVideo;
			 { const $$_video2 = svelteHTML.createElement("video", {                "class":`fc-video`,"src":video.url,"muted":true,"playsinline":true,"oncanplay":() => (videoReady = true),"onloadeddata":() => (videoReady = true),"onseeked":() => (seekSettled = true),"style":`pointer-events:none`,});videoEl = $$_video2; }
		 }

	
	 { svelteHTML.createElement("button", {                   "class":`fc-nav fc-prev`,"onclick":(e) => { e.stopPropagation(); step(-1); },"onpointerdown":(e) => e.stopPropagation(),"onpointermove":(e) => e.stopPropagation(),"onpointerup":(e) => e.stopPropagation(),"onwheel":(e) => e.stopPropagation(),"disabled":centerFrame <= 0,"aria-label":APP_CONSTANTS.strings.frameNavPrev,"title":APP_CONSTANTS.strings.framePrevDisabled,});  }
	 { svelteHTML.createElement("button", {                   "class":`fc-nav fc-next`,"onclick":(e) => { e.stopPropagation(); step(1); },"onpointerdown":(e) => e.stopPropagation(),"onpointermove":(e) => e.stopPropagation(),"onpointerup":(e) => e.stopPropagation(),"onwheel":(e) => e.stopPropagation(),"disabled":centerFrame >= totalFrames - 1 - STEP,"aria-label":APP_CONSTANTS.strings.frameNavNext,"title":APP_CONSTANTS.strings.frameNextDisabled,});  }

	
	 { svelteHTML.createElement("button", {                 "class":`fc-exit`,"onclick":(e) => { e.stopPropagation(); onexit?.(); },"onpointerdown":(e) => e.stopPropagation(),"onpointermove":(e) => e.stopPropagation(),"onpointerup":(e) => e.stopPropagation(),"onwheel":(e) => e.stopPropagation(),"aria-label":APP_CONSTANTS.strings.frameCarouselToPlayback,"title":APP_CONSTANTS.strings.frameCarouselToPlayback,});  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings('videoEl'), slots: {}, events: {} }}
const FrameCarousel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type FrameCarousel__SvelteComponent_ = ReturnType<typeof FrameCarousel__SvelteComponent_>;
/*Ωignore_endΩ*/export default FrameCarousel__SvelteComponent_;