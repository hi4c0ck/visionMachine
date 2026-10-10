<script lang="ts">
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
		carouselBlurF,
		carouselDissolveOpacity,
		carouselDissolveDirF,
		carouselDissolveReveal,
		carouselStackTuckF,
		snapCarouselFrame,
		carouselCardWidth,
		carouselDragPxPerStep,
		thumbnailIntrinsic,
		type ThumbDiag
	} from '$lib/frameDecoder';

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
	}>();

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
	// Which direction the LAST strip move ran: 1 = forward (centerFrame↑,
	// the old front recedes to the LEFT, d<0), -1 = backward (centerFrame↓,
	// old front recedes to the RIGHT, d>0), 0 = idle. Only the RECEDING
	// (old-front) card gets the dissolve grain; the ARRIVING/upcoming frame
	// is always clean (user requirement: never mask the underneath frame).
	let moveDir = 0;

	// ── Immersive Snaps (profile-preset bound) ────────────────────────────
	// [i] toggle + [>]/[>>] auto-scroll radios. Values MIRROR the profile
	// preset (Settings → Tools "Immersive" section): a settings commit
	// re-syncs them here, and a click here commits the same copy back.
	import { getSettings, setOnSettingsChange, unregisterSettingsChange, updateSettings } from '$lib/settings/store';
	import { onMount } from 'svelte';
	let immersive = $state<boolean>(getSettings().carousel.immersiveSnaps);
	let autoScroll = $state<'off' | 'steady' | 'fast'>(getSettings().carousel.autoScroll);

	// Settings store re-sync: a profile switch or a Settings-modal commit
	// replaces the carousel block — mirror it locally. The auto-advance
	// $effect below is keyed on both values, so a re-sync re-arms it.
	const onImmersiveSettingsSync = () => {
		immersive = getSettings().carousel.immersiveSnaps;
		autoScroll = getSettings().carousel.autoScroll;
	};
	setOnSettingsChange(onImmersiveSettingsSync);
	onMount(() => () => unregisterSettingsChange(onImmersiveSettingsSync));

	function toggleImmersive() {
		immersive = !immersive;
		updateSettings((s) => {
			s.carousel.immersiveSnaps = immersive;
		});
	}

	function setAutoScroll(mode: 'off' | 'steady' | 'fast') {
		// Radio semantics: clicking the already-active mode turns BOTH off.
		autoScroll = autoScroll === mode ? 'off' : mode;
		updateSettings((s) => {
			s.carousel.autoScroll = autoScroll;
		});
	}

	// ── Auto-advance engine ([>] steady / [>>] fast+idle) ─────────────────
	// A simple self-rescheduling timer that steps the shared frame forward
	// while the mode is armed. MANUAL interaction (drag, wheel, ‹/› step,
	// nav buttons) only PAUSES it — a cooldown is recorded and the engine
	// resumes on the next tick; it is never torn down (dragging stays
	// possible, it just pauses auto mode).
	//   [>]  STEADY — consistent slow pace: one step every ~2.2s, no dwell.
	//   [>>] FAST   — quick snap to the next stop, then a 0.8s idle dwell
	//                at each snap before the next snap (the "stays idle"
	//                beat the user asked for).
	const STEADY_TICK_MS = 2200; // [>] steady slow cadence
	const FAST_IDLE_MS = 800; // [>>] dwell at each snap
	const FAST_TICK_MS = 300 + FAST_IDLE_MS; // [>>] snap glide (~300ms) + idle
	const MANUAL_PAUSE_MS = 1500; // manual move → resume only after this cooldown
	let lastManualAt = 0;

	function pauseAuto() {
		lastManualAt = performance.now();
	}

	$effect(() => {
		const mode = autoScroll;
		void totalFrames;
		if (mode === 'off') return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const TICK = mode === 'fast' ? FAST_TICK_MS : STEADY_TICK_MS;

		function fire() {
			if (cancelled) return;
			// Pointer owns the strip — hold the tick and re-poll quickly.
			if (dragActive) {
				timer = setTimeout(fire, 300);
				return;
			}
			// A manual move happened — pause until its cooldown is over,
			// then resume from wherever the user left the strip.
			const sinceManual = performance.now() - lastManualAt;
			if (sinceManual < MANUAL_PAUSE_MS) {
				timer = setTimeout(fire, Math.max(60, MANUAL_PAUSE_MS - sinceManual + 60));
				return;
			}
			const target = centerFrame + STEP;
			if (target >= totalFrames) {
				// End of the strip: park and RE-POLL, so a manual back-step
				// re-arms the engine without a mode toggle.
				timer = setTimeout(fire, 600);
				return;
			}
			onframeSelect?.(target);
			timer = setTimeout(fire, TICK);
		}
		timer = setTimeout(fire, TICK);
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	});

	// Sinusoidal ease-in-out tween of the visual center. The new front card
	// (which was the settled neighbor before the switch) glides toward the
	// center at a constant SIN pace for most of the move, then the last
	// segment decelerates — reading as if the frame is being "placed
	// precisely" into the center slot (user: "the last part of movement
	// slowly ... like we place it in accurate way"). A sine ease-in-out is
	// symmetric: slow start, fast middle, slow settle, so the grab (lift)
	// and place feel deliberate. It carries the semi-state THROUGH the
	// switch point (|d| = 0.5) so the receding card's dissolve actually
	// ramps. A plain CSS transition never recomputes the JS dissolve vars,
	// which is why a snapped (integer) visualStep kept the wash invisible.
	function tweenVisualStep(from: number, to: number, dir: number) {
		cancelAnimationFrame(tweenRAF);
		if (from === to) { visualStep = to; return; }
		moveDir = dir;
		const start = performance.now();
		const DUR = 300;
		const tick = (now: number) => {
			const p = Math.min(1, (now - start) / DUR);
			// Sinusoidal ease-in-out: fast middle, slow "precise place" tail.
			const e = (1 - Math.cos(Math.PI * p)) / 2;
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
				// moveDir: +1 forward (old front recedes left, d<0),
				// -1 backward (old front recedes right, d>0).
				const dir = target > from ? 1 : -1;
				tweenVisualStep(from, target, dir);
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
				pauseAuto();
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
		// v6: name the sweep direction so the RECEDING front (the one that
		// was the anchor before this drag) gets the grain wash and the
		// UPCOMING frame stays clean. travel dx<0 → forward (+1), dx>0 →
		// backward (-1). At the exact anchor the wash is off (0).
		moveDir = visualStep > anchorStep ? 1 : visualStep < anchorStep ? -1 : 0;
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
		if (target !== centerFrame) {
			pauseAuto();
			onframeSelect?.(target);
		}
	}

	function endDrag(event: PointerEvent) {
		if (event.pointerId !== dragPointerId) return;
		dragPointerId = -1;
		if (!dragActive) return; // never adopted → it was a click; nothing to do
		// Release: commit where the FLOAT position rests (rounded to the
		// nearest grid stop) so the frame settles where the pointer did, not
		// where it snapped back to. The within-step remainder glides home on
		// the sine tween below instead of jumping.
		const target = Math.round(visualStep);
		liveCommitStep = target;
		commitLiveFrame();
		dragActive = false;
		// v6: do NOT snap visualStep here. The chase $effect (which keys on
		// the new centerFrame + dragActive=false) runs the sine "place
		// precisely" settle tween from the float rest position to the target
		// step, and it sets moveDir to the settle direction. The receding
		// old front keeps its grain wash through the whole settle; the
		// arriving new front stays clean.
		try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* released */ }
	}

	function step(deltaCards: number) {
		if (deltaCards === 0) return;
		pauseAuto();
		const next = snapCarouselFrame(centerFrame + deltaCards * STEP, totalFrames, STEP);
		if (next !== centerFrame) onframeSelect?.(next);
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
		// v8: horizontal "brick interlock" tuck — the card rests EXACTLY at
		// its ladder offset at every integer stop, but drifts slightly toward
		// the deck center mid-switch (peaks at |d|=0.5) and snaps back out on
		// the last few steps. Purely horizontal (0 at the front d=0 and rest):
		// a right-side card (d>0) tucks leftward, a left-side card tucks right.
		const tuck = carouselStackTuckF(d, CARD_W);
		const xRaw = carouselCardX(d, CARD_W);
		const x = tuck > 0 ? (d > 0 ? xRaw - tuck : xRaw + tuck) : xRaw;
		const opacity = carouselCardOpacityF(d);
		const z = Math.max(1, 10 - Math.round(Math.abs(d)));
		const glow = carouselGlowF(d);
		const blur = carouselBlurF(d);
		// The card's OWN box-shadow carries the accent glow so it paints OUTSIDE
		// the border-box and is not clipped by the card's overflow:hidden (a
		// child glow ring would be). Its radius/spread scale with `glow`
		// (carouselGlowF): 1 at the resting center, 0.5 on the two crossing
		// fronts mid-move, 0 a step away — so the departing front's glow
		// dissolves as the arriving front's rises, and both ride the card's
		// box-shadow transition on a commit.
		// v6: the dissolve belongs ONLY to the RECEDING (old-front) card, and
		// opens toward the deck center so the grain reveals the UPCOMING frame
		// settling into the slot the old front is leaving. The arriving /
		// upcoming card is NEVER masked (user requirement). moveDir names which
		// side just receded: +1 forward (old front left, d<0), -1 backward
		// (old front right, d>0), 0 idle.
		// v8: TWO independent dissolve channels, both receding-only (moveDir)
		// and both 0 at the idle rest position (no effect without a drag):
		//  - REVEAL (strong ~0.7 at the switch): how much of the receding
		//    front's OWN media goes transparent so the UPCOMING frame settling
		//    behind it is genuinely visible through the grain. Drives the mask.
		//  - ACCENT (subtle ~0.1 at the switch): the accent shimmer painted
		//    through the wave-grain texture. Drives the .fc-wave-tint layer.
		// The arriving/upcoming card is NEVER masked in either channel.
		const reveal = immersive ? carouselDissolveReveal(d, moveDir) : 0;
		const accent = immersive ? carouselDissolveOpacity(d, moveDir) : 0;
		// The mask opens from the center-facing edge of the receding card.
		const dissolveDir = carouselDissolveDirF(d, moveDir);
		return "left:calc(50% + " + x + "px - " + (CARD_W / 2) + "px);width:" + CARD_W + "px;transform:scale(" + scale.toFixed(4) + ");transform-origin:50% 100%;opacity:" + opacity.toFixed(3) + ";z-index:" + z + ";--fc-tint-bg:" + cardTintBg(d) + ";--fc-dissolve-op:" + reveal.toFixed(3) + ";--fc-wave-op:" + accent.toFixed(3) + ";--fc-dissolve-dir:" + dissolveDir + ";filter:blur(" + blur.toFixed(2) + "px);box-shadow:0 0 " + (22 * glow).toFixed(1) + "px " + (5 * glow).toFixed(1) + "px var(--accent-glow, rgba(255, 62, 0, 0.25));";  
	}
</script>

	<div
		class="fc-strip"
		class:fc-dragging={dragActive}
		class:fc-settled={videoAtRest}

		style:--fc-card-w={`${CARD_W}px`}
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
				<!-- Stacked veils: a blue-grey "past" tint on backwards cards,
				 a warm "future" dim on forwards cards, driven by --fc-tint-bg
				 (transparent at the front card). -->
				<div class="fc-tint-overlay" aria-hidden="true"></div>
				<!-- Granular accent wave-tint on the receding edge: accent
				 gradient through the wave-grain texture (shine/shadow),
				 opacity = --fc-dissolve-op (0 on clean cards). -->
				<div class="fc-wave-tint" aria-hidden="true"></div>
				<!-- Liquid-glass shine: a subtle top-edge highlight + inner
				 glow that makes every card read as a translucent glass pane
				 over the dark background (Vecteezy-style glassmorphism).
				 Always present, not driven by --fc-dissolve-op. -->
				<div class="fc-glass-shine" aria-hidden="true"></div>
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
			<div class="fc-glass-shine" aria-hidden="true"></div>
		</div>

	<!-- Immersive cluster (top-left): [i] toggles the dissolve treatment
		 (gray = off, accent = on); to its right, two radio-grouped auto-scroll
		 buttons [>] (steady slow) and [>>] (fast snaps + 0.8s idle). A click
		 on the active radio turns both off. All mirror the profile preset
		 (Settings → Tools "Immersive"). stopPropagation keeps the strip sweep
		 from adopting these clicks. -->
	<div class="fc-immersive" role="group" aria-label={APP_CONSTANTS.strings.autoScroll}>
		<button
			class="fc-imm-btn fc-i"
			class:fc-imm-on={immersive}
			onclick={(e) => { e.stopPropagation(); toggleImmersive(); }}
			onpointerdown={(e) => e.stopPropagation()}
			onpointermove={(e) => e.stopPropagation()}
			onpointerup={(e) => e.stopPropagation()}
			onwheel={(e) => e.stopPropagation()}
			aria-pressed={immersive}
			aria-label={APP_CONSTANTS.strings.immersiveSnaps}
			title={APP_CONSTANTS.strings.immersiveSnapsHint}
		>i</button>
		<span class="fc-imm-gap" aria-hidden="true"></span>
		<button
			class="fc-imm-btn"
			class:fc-imm-on={autoScroll === 'steady'}
			onclick={(e) => { e.stopPropagation(); setAutoScroll('steady'); }}
			onpointerdown={(e) => e.stopPropagation()}
			onpointermove={(e) => e.stopPropagation()}
			onpointerup={(e) => e.stopPropagation()}
			onwheel={(e) => e.stopPropagation()}
			aria-pressed={autoScroll === 'steady'}
			aria-label={APP_CONSTANTS.strings.autoScrollSteady}
			title={APP_CONSTANTS.strings.autoScrollSteady}
		>›</button>
		<button
			class="fc-imm-btn"
			class:fc-imm-on={autoScroll === 'fast'}
			onclick={(e) => { e.stopPropagation(); setAutoScroll('fast'); }}
			onpointerdown={(e) => e.stopPropagation()}
			onpointermove={(e) => e.stopPropagation()}
			onpointerup={(e) => e.stopPropagation()}
			onwheel={(e) => e.stopPropagation()}
			aria-pressed={autoScroll === 'fast'}
			aria-label={APP_CONSTANTS.strings.autoScrollFast}
			title={APP_CONSTANTS.strings.autoScrollFast}
		>››</button>
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
		/* Transparent body (not #000): when the media grain-dissolves, the
			 card UNDERNEATH shows through the holes. The border and glow
			 are on this element and are NOT masked, so the frame stays
			 crisp while only the image content dissolves. */
		background: transparent;
		/* Continuous dip motion: the card's box is a fixed CARD_W × full-height
			 slot pinned to the strip; the dip is expressed as transform:scale
			 (around 50% 100% so cards stay bottom-anchored) plus a left offset.
			 Both ride the compositor / layout without re-flowing siblings. While
			 a drag is in flight (.fc-dragging) the transition is removed so the
			 pointer owns the position 1:1. */
		/* No CSS transition: the rAF tween (tweenVisualStep) and the 1:1 drag
			 pointer drive every card's geometry per-frame, so a CSS transition
			 here would double-animate and fight the tween. */
	}

	.fc-strip.fc-dragging .fc-card {
		transition: none;
	}

	/* v9b: glide the accent switch - the front card's accent BORDER color
	   previously snapped when the .fc-center class flipped, making the
	   center read 'jumpy'. Easing border-color over ~220ms fades the new
	   center's accent frame in smoothly. Only border-color is transitioned;
	   geometry (transform/opacity/box-shadow) stays rAF-driven. */
	.fc-card {
		transition: border-color 220ms ease;
	}

	.fc-card.fc-center {
		border-color: var(--accent-color, #ff3e00);
	}

	/* The blue-grey "past" / warm "future" veil, painted over the thumbnail
		 from the card's --fc-tint-bg (transparent at the front). Its own
		 background transition keeps the tint smooth across a commit. */
	.fc-tint-overlay {
		position: absolute;
		inset: 0;
		background: var(--fc-tint-bg, transparent);
		pointer-events: none;
		transition: background-color 260ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* Idle / breathing: when the strip is settled at a rest stop (fc-settled)
		 the front card's accent halo gently pulses, so the panel reads as
		 "alive" while scrubbing has stopped. Applied to the live <video>
		 layer (the settled front) and to the thumbnail center card fallback.
		 A soft ambient spotlight lifts the strip's mood from flat-dark. */
	@keyframes fc-breathe {
		0%, 100% { box-shadow: 0 0 18px 2px var(--accent-glow, rgba(255, 62, 0, 0.25)); }
		50%      { box-shadow: 0 0 30px 7px var(--accent-glow, rgba(255, 62, 0, 0.25)); }
	}
	.fc-strip.fc-settled .fc-video-layer:not(.fc-video-hidden),
	.fc-strip.fc-settled .fc-card.fc-center {
		animation: fc-breathe 3.4s ease-in-out infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.fc-strip.fc-settled .fc-video-layer,
		.fc-strip.fc-settled .fc-card.fc-center {
			animation: none;
		}
	}

	/* The live <video>: a fixed CARD_W × full-height slot pinned to the strip
		 center, cross-fading over the center card's thumbnail. It is the ONLY
		 <video> in the carousel — frame commits animate card transforms, the
		 element itself never moves, so the source is never reloaded. */
	.fc-video-layer {
		position: absolute;
		bottom: 0;
		left: 50%;
		width: var(--fc-card-w, 170px);
		transform: translateX(-50%);
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

	/* Glass shine on the live video layer (front card when settled) */
	.fc-video-layer .fc-glass-shine {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		/* Neutral white specular only — NO accent color wash at the settled
		   center (the user wants the stable front to read clean). The accent
		   border + halo stay on the card's border/box-shadow, not this layer. */
		background:
			linear-gradient(
				to bottom,
				rgba(255, 255, 255, 0.16) 0%,
				rgba(255, 255, 255, 0.04) 10%,
				transparent 30%
			),
			linear-gradient(
				to top,
				rgba(255, 255, 255, 0.06) 0%,
				transparent 12%
			);
	}

	/* True-transparency dissolve (v6, receding-only): the RECEDING front's
		 MEDIA is masked (not the card box), so the accent border + glow stay
		 solid and the UPCOMING frame UNDERNEATH is never dithered. The wash
		 peaks ~0.1 alpha at the switch distance and is 0 at both rest stops,
		 so the settled center reads clean. Two layers, unioned (add /
		 source-over):
		   1) Directional ramp — solid white from the outer edge up to
		      (1 − dissolve-op) × 100%, then transparent toward the deck
		      center. At rest (dissolve-op=0) the ramp is fully white →
		      media fully opaque.
		   2) Dither texture — stretched to 100%×100% so the grain density
		      matches the frame size.
		 --fc-dissolve-op is driven per-frame by the rAF tween and is >0 on
		 ONLY the receding side (named by moveDir); the arriving side stays
		 clean. */
	/* v9: the media REVEAL is a clean, SMOOTH directional gradient — NO grain
	   baked into this channel. The receding front's own media fades to
	   transparent from its outer edge toward the deck center, so the UPCOMING
	   frame settling behind it shows through a smooth, pristine gradient
	   (the idea: "we see the upcoming frame through the transparency of the
	   center one"). Because the grain texture used to live here, the SOLID
	   part of the center card was mottled and the frame behind read as
	   "affected" — that's gone now. The grain/structure is moved to the
	   accent-wave layer below, which is purely additive (screen blend) so it
	   never touches the reveal. An eased ramp (white 0 → 55%, then fade to
	   transparent 100%) keeps the edge soft instead of a hard band. */
	.fc-card .fc-thumb,
	.fc-card .fc-thumb-placeholder {
		/* v9: clean SMOOTH media reveal — directional white→transparent
		   gradient, NO grain baked in. At rest (op=0) the white stop is at
		   100% → card fully opaque. Mid-switch it retreats to (1-op)*100%,
		   opening the center-facing edge so the UPCOMING frame behind shows
		   through a smooth, pristine gradient. Grain/structure lives in the
		   accent-wave layer below (purely additive), never here. */
		-webkit-mask-image:
			linear-gradient(var(--fc-dissolve-dir, to right),
			  white 0%,
			  white calc((1 - var(--fc-dissolve-op, 0)) * 100%),
			  transparent calc((1 - var(--fc-dissolve-op, 0)) * 100% + 30%));
		mask-image:
			linear-gradient(var(--fc-dissolve-dir, to right),
			  white 0%,
			  white calc((1 - var(--fc-dissolve-op, 0)) * 100%),
			  transparent calc((1 - var(--fc-dissolve-op, 0)) * 100% + 30%));
		-webkit-mask-size: 100% 100%;
		mask-size: 100% 100%;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
	}

	/* v9: ACCENT WAVE - the structured sheen on the receding edge. Two
	   mask layers INTERSECTED (mask-composite: intersect):
	     1) a soft directional ramp - keeps the sheen inside the dissolve
	        zone (transparent on the outer side, opaque toward center);
	     2) the SQUARED/stepped grain texture, OFFSET so its rows undulate
	        instead of tiling flat - this is the 'accent wave' structure
	        (neo squared-mask aesthetic). The accent gradient supplies the
	   color; the intersection carves the structure. Screen-blended so it
	   GLOWS over the frame rather than dulling it. Driven by --fc-wave-op
	   (0 at rest, peak at the switch), so it is purely a mid-move effect
	   and never tints the clean upcoming frame behind. */
	.fc-wave-tint {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		/* Accent color, brightest at the center-facing dissolve edge. */
		background: linear-gradient(
			var(--fc-dissolve-dir, to right),
			transparent 0%,
			color-mix(in srgb, var(--accent-color, #ff6b35) 45%, transparent) 42%,
			var(--accent-color, #ff6b35) 100%
		);
		opacity: var(--fc-wave-op, 0);
		pointer-events: none;
		mix-blend-mode: screen;
	/* Layer 1 = soft ramp; Layer 2 = squared grain, offset (18px 6px) so
		   the stepped rows read as a wave. Intersected = structured sheen. */
	/* Layer 1 clips the accent wave to the receding card's SOLID media
	   (white where opaque, transparent where the .fc-thumb reveal opens) so
	   the sheen never paints over the transparent zone or the upcoming
	   frame behind. Same directional ramp + --fc-dissolve-op as reveal. */
	-webkit-mask-image:
		linear-gradient(var(--fc-dissolve-dir, to right),
			white 0%,
			white calc((1 - var(--fc-dissolve-op, 0)) * 100%),
			transparent calc((1 - var(--fc-dissolve-op, 0)) * 100% + 30%)),
		url('/icons/fc-wave-mask.png');
	mask-image:
		linear-gradient(var(--fc-dissolve-dir, to right),
			white 0%,
			white calc((1 - var(--fc-dissolve-op, 0)) * 100%),
			transparent calc((1 - var(--fc-dissolve-op, 0)) * 100% + 30%)),
		url('/icons/fc-wave-mask.png');
	-webkit-mask-size: 100% 100%, 100% 100%;
	mask-size: 100% 100%, 100% 100%;
	-webkit-mask-repeat: no-repeat, repeat;
	mask-repeat: no-repeat, repeat;
	-webkit-mask-position: 0 0, 18px 6px;
	mask-position: 0 0, 18px 6px;
	-webkit-mask-composite: source-in;
	mask-composite: intersect;
		animation: fc-wave-breathe 1.4s ease-in-out infinite;
	}

	/* Liquid-glass shine (Vecteezy glassmorphism): a subtle top-edge white
		 highlight + inner glow that makes every card read as a translucent
		 glass pane over the dark background. Always present, very low opacity
		 so it doesn't overpower the frame content. The top highlight mimics
		 light hitting the curved top edge of a glass block. */
	.fc-glass-shine {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		background:
			/* Top-edge specular highlight (light hitting the glass top) */
			linear-gradient(
				to bottom,
				rgba(255, 255, 255, 0.18) 0%,
				rgba(255, 255, 255, 0.04) 12%,
				transparent 30%
			),
			/* Subtle inner bottom glow (glass thickness effect) */
			linear-gradient(
				to top,
				rgba(255, 255, 255, 0.06) 0%,
				transparent 15%
			);
		/* Accent tint on the top edge when the card is the front (fc-center) */
	}

	/* Neutral white specular on the front card too — NO accent color wash at
	   the settled center. The accent reads through the border + box-shadow
	   halo only, so the media content stays clean at rest. */
	.fc-card.fc-center .fc-glass-shine {
		background:
			linear-gradient(
				to bottom,
				rgba(255, 255, 255, 0.16) 0%,
				rgba(255, 255, 255, 0.04) 10%,
				transparent 30%
			),
			linear-gradient(
				to top,
				rgba(255, 255, 255, 0.06) 0%,
				transparent 12%
			);
	}

	.fc-video,
	.fc-thumb,
	.fc-thumb-placeholder {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: fill;
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

	/* v9b: subtle accent breathing - a ~1.4s opacity pulse gives the wave
	   sheen amplitude so the transition reads as 'powered by accent color',
	   not a flat static wash. Scales the base --fc-wave-op by 0.72..1.0. */
	@keyframes fc-wave-breathe {
		0%, 100% { opacity: calc(var(--fc-wave-op, 0) * 0.72); }
		50%      { opacity: calc(var(--fc-wave-op, 0) * 1.0); }
	}

	/* Immersive cluster (top-left): [i] toggle + [>]/[>>] auto-scroll radios.
	   Gray when off/active-none, accent when on — analog to the playback ctl.
	*/
	.fc-immersive {
		position: absolute;
		top: 8px;
		left: 8px;
		display: flex;
		align-items: center;
		gap: 4px;
		z-index: 21;
	}

	.fc-imm-btn {
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-secondary);
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 140ms ease, background-color 140ms ease, border-color 140ms ease;
	}

	/* The bold "i" information toggle: a heavy serif italic reads as "i". */
	.fc-imm-btn.fc-i {
		font-family: Georgia, "Times New Roman", serif;
		font-weight: 800;
		font-style: italic;
		font-size: 1.05rem;
	}

	/* Enabled / active: accent color + glow (analog to ctl-btn.active). */
	.fc-imm-btn.fc-imm-on {
		color: var(--accent-color, #ff3e00);
		border-color: var(--accent-color, #ff3e00);
		background: color-mix(in srgb, var(--accent-color, #ff3e00) 14%, var(--bg-tertiary));
		box-shadow: 0 0 10px var(--accent-glow, rgba(255, 62, 0, 0.25));
	}

	.fc-imm-btn:hover {
		background: var(--bg-hover);
	}

	.fc-imm-gap {
		width: 8px;
	}

</style>
