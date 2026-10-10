///<reference types="svelte" />
;
import { APP_CONSTANTS } from '$constants';
import type { ProviderKind, Settings } from '$types';
import type { ProviderStatusSnapshot } from '$lib/settings/guards';
import ProviderStatus from './Settings/ProviderStatus.svelte';
import FrameCarousel from './FrameCarousel.svelte';

;type $$ComponentProps = {
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
	};function $$render() {

	
	
	
	
	

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
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

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
;
async () => {

 { svelteHTML.createElement("header", { "class":`frame`,});
	
	 { svelteHTML.createElement("div", { "class":`frame-top`,});
		 { svelteHTML.createElement("div", { "class":`logo`,});
			 { svelteHTML.createElement("img", {          "src":`/icons/vm-mark-64.png`,"alt":`VisionMachine`,"class":`logo-icon`,"width":`28`,"height":`28`,});}
			 { svelteHTML.createElement("span", { "class":`logo-text`,});APP_CONSTANTS.strings.appName; }
			if(showWelcome){
				 { svelteHTML.createElement("span", { "class":`welcome-badge`,});  }
			}
		 }

		 { svelteHTML.createElement("div", { "class":`layout-controls`,});
			if(totalFrames !== null && fps !== null){
				
				 { svelteHTML.createElement("span", {     "class":`frame-step`,"role":`group`,"aria-label":`Frame stepping`,});
					 { svelteHTML.createElement("button", {         "class":`layout-btn frame-step-btn`,"onclick":() => stepFrames(-1),"disabled":!canStepPrev,"title":canStepPrev ? APP_CONSTANTS.strings.frameStepPrev : APP_CONSTANTS.strings.frameStepDisabled,});
						 CAROUSEL_FRAME_STEP;
					 }
					 { svelteHTML.createElement("button", {         "class":`layout-btn frame-step-btn`,"onclick":() => stepFrames(1),"disabled":!canStepNext,"title":canStepNext ? APP_CONSTANTS.strings.frameStepNext : APP_CONSTANTS.strings.frameStepDisabled,});
						CAROUSEL_FRAME_STEP; 
					 }
				 }
			}
			  for(let layout of __sveltets_2_ensureArray(layouts)){
				 { svelteHTML.createElement("button", {       "class":`layout-btn ${layoutMode === layout.id ? 'active' : ''}`,"onclick":() => setLayout(layout.id),"title":layout.label,});
					layout.icon; layout.label;
				 }
			}
		 }
	 }

	
	 { svelteHTML.createElement("div", {   "class":`frame-preview`,"style":`height:${stripH}px`,});
		if(video){
			if(mode === 'carousel' && carouselReady){
				
				 { const $$_lesuoraCemarF2C = __sveltets_2_ensureComponent(FrameCarousel); const $$_lesuoraCemarF2 = new $$_lesuoraCemarF2C({ target: __sveltets_2_any(), props: {                  "video":video,videoEl,"totalFrames":totalFrames!,"fps":fps!,"frame":carouselFrame,"videoAspect":videoAspect,"stripH":stripH,"onframeSelect":(f) => oncarouselSelect?.(f),"onexit":toggleMode,}});/*Ωignore_startΩ*/() => videoEl = __sveltets_2_any(null);/*Ωignore_endΩ*/$$_lesuoraCemarF2.$$bindings = 'videoEl';}
				
				if(onplayoutside){
					 { svelteHTML.createElement("button", {         "class":`outside-float`,"onclick":handlePlayOutside,"title":APP_CONSTANTS.strings.playOutsideHint,"aria-label":APP_CONSTANTS.strings.playOutside,});
						
					 }
				}
				if(sessionVideoDetached){
					 { svelteHTML.createElement("button", {     "class":`session-pill`,"onclick":handleOpenSessionPreview,"title":APP_CONSTANTS.strings.openSessionPreviewHint,});
						 APP_CONSTANTS.strings.openInPreview;
					 }
				}
			}else{
			 { svelteHTML.createElement("div", { "class":`frame-video-wrap`,});
				
				if(videoLoading){
					 { svelteHTML.createElement("div", {   "class":`frame-video-loading`,"aria-hidden":`true`,});
						 { svelteHTML.createElement("span", { "class":`frame-video-loading-label`,});  }
					 }
				}
				 { const $$_video3 = svelteHTML.createElement("video", {                        "class":`frame-video`,"src":video.url,"muted":true,"playsinline":true,"loop":loopEnabled,"oncanplay":() => (videoLoading = false),"onerror":() => (videoLoading = false),"onpause":() => (videoPlaying = false),"onplay":() => (videoPlaying = true),"onended":() => (videoPlaying = false),"ontimeupdate":handleTimeUpdate,"onloadedmetadata":() => {
						videoDuration = videoEl?.duration ?? 0;
						// Re-apply the user's chosen speed to the fresh element —
						// a new source resets playbackRate to 1 natively.
						if (videoEl) videoEl.playbackRate = playbackRate;
					},});videoEl = $$_video3; }
				 { svelteHTML.createElement("span", { "class":`frame-video-label`,});
					
					if(isSessionVideo){
						  { svelteHTML.createElement("span", {   "class":`session-badge`,"title":APP_CONSTANTS.strings.sessionVideoBadgeHint,});  }
					}
					video.label;
				 }
				if(totalFrames !== null){
					
					 { svelteHTML.createElement("span", { "class":`frame-position`,});carouselFrame ?? 0;  totalFrames; }
				}
				if(sessionVideoDetached){
					
					 { svelteHTML.createElement("button", {     "class":`session-pill`,"onclick":handleOpenSessionPreview,"title":APP_CONSTANTS.strings.openSessionPreviewHint,});
						 APP_CONSTANTS.strings.openInPreview;
					 }
				}
				
				 { svelteHTML.createElement("div", {     "class":`frame-controls`,"role":`group`,"aria-label":APP_CONSTANTS.strings.playbackControls,});
					 { svelteHTML.createElement("span", {   "class":`ctl-time`,"aria-hidden":`true`,});formatTime(videoTime);  formatTime(videoDuration); }
					 { svelteHTML.createElement("span", { "class":`ctl-cluster`,});
						 { svelteHTML.createElement("button", {        "class":`ctl-btn`,"onclick":toggleLoop,"title":APP_CONSTANTS.strings.loopHint,"aria-pressed":loopEnabled,});loopEnabled;
							
						 }
						 { svelteHTML.createElement("select", {         "class":`ctl-speed`,"value":String(playbackRate),"onchange":(e) => applySpeed(e.currentTarget.value),"title":APP_CONSTANTS.strings.speedLabel,"aria-label":APP_CONSTANTS.strings.speedLabel,});
							  for(let s of __sveltets_2_ensureArray(SPEED_OPTIONS)){
								 { svelteHTML.createElement("option", { "value":String(s),});s;  }
							}
						 }
						if(onplayoutside){
							 { svelteHTML.createElement("button", {       "class":`ctl-btn`,"onclick":handlePlayOutside,"title":APP_CONSTANTS.strings.playOutsideHint,"aria-label":APP_CONSTANTS.strings.playOutside,});
								
							 }
						}
						if(carouselReady){
							
							 { svelteHTML.createElement("button", {         "class":`ctl-btn ${mode === 'carousel' ? 'active' : ''}`,"onclick":toggleMode,"title":mode === 'carousel' ? APP_CONSTANTS.strings.frameCarouselToPlayback : APP_CONSTANTS.strings.frameCarouselHint,"aria-label":APP_CONSTANTS.strings.frameCarousel,});
								
							 }
						}
						 { svelteHTML.createElement("button", {         "class":`ctl-btn ctl-play`,"onclick":toggleVideoPlay,"title":videoPlaying ? 'Pause' : 'Play',"aria-label":videoPlaying ? 'Pause video' : 'Play video',});
							videoPlaying ? '❚❚' : '▶';
						 }
					 }
				 }
				
				 { svelteHTML.createElement("input", {                    "class":`ctl-scrub`,"type":`range`,"min":`0`,"max":videoDuration || 0,"step":`0.01`,"value":videoTime,"oninput":handleScrub,"aria-label":APP_CONSTANTS.strings.scrubLabel,"disabled":videoDuration === 0,});__sveltets_2_ensureType(String, Number, scrubPct);}
				if(videoDuration > 0){
					 { svelteHTML.createElement("span", {    "class":`ctl-scrub-line`,"aria-hidden":`true`,});__sveltets_2_ensureType(String, Number, scrubPct); }
					 { svelteHTML.createElement("span", {    "class":`ctl-scrub-dot`,"aria-hidden":`true`,});__sveltets_2_ensureType(String, Number, scrubPct); }
				}
			 }
			}
		} else if (previewImage){
			 { svelteHTML.createElement("img", {        "src":previewImage,"alt":`Frame preview`,"class":`preview-img`,"onclick":handlePreviewClick,});}
		}else{
			 { svelteHTML.createElement("div", {   "class":`preview-empty`,"onclick":handlePreviewClick,});
				 { svelteHTML.createElement("span", { "class":`preview-icon`,});  }
				 { svelteHTML.createElement("span", { "class":`preview-label`,});  }
			 }
		}

		
		if(showRuler && ruler){
			 { svelteHTML.createElement("div", {   "class":`global-ruler`,"aria-hidden":`true`,});
				  for(let tick of __sveltets_2_ensureArray(ruler.ticks)){
					 { svelteHTML.createElement("div", {      "class":`g-tick`,"style":`left: ${(tick / Math.max(1, ruler.total - 1)) * 100}%`,});tick % 32 === 0;
						if(tick % 32 === 0){ { svelteHTML.createElement("span", { "class":`g-label`,});tick; }}
					 }
				}
				 { svelteHTML.createElement("div", {     "class":`g-playhead`,"style":`left: ${(ruler.frame / Math.max(1, ruler.total - 1)) * 100}%`,}); }
			 }
		}
	 }

	
	 { svelteHTML.createElement("div", { "class":`frame-bottom`,});
		 { svelteHTML.createElement("div", { "class":`frame-bottom-left`,});
			 { svelteHTML.createElement("div", { "class":`theme-selector`,});
				 { svelteHTML.createElement("label", { "for":`theme-select`,});  }
				 { svelteHTML.createElement("select", {   "id":`theme-select`,"onchange":(e) => onthemeChange?.(e.currentTarget.value),});
					 { svelteHTML.createElement("option", { "value":`jetbrains-dark`,});  }
					 { svelteHTML.createElement("option", { "value":`steel-dark`,});   }
					 { svelteHTML.createElement("option", { "value":`light`,});  }
				 }
			 }

			if(providers && providerStatus && onopenprovidersettings){
				 { const $$_sutatSredivorP3C = __sveltets_2_ensureComponent(ProviderStatus); new $$_sutatSredivorP3C({ target: __sveltets_2_any(), props: {       providers,"providerStatus":providerStatus,"loading":providerLoading,"onopen":onopenprovidersettings,}});}
			}

			
			 { svelteHTML.createElement("button", {     "type":`button`,"class":`kb-hint`,"aria-label":APP_CONSTANTS.strings.kbShortcutsHint,});
				
				 { svelteHTML.createElement("span", {   "class":`kb-pop`,"role":`tooltip`,});
					 { svelteHTML.createElement("span", { "class":`kb-row`,}); { svelteHTML.createElement("b", {});   } APP_CONSTANTS.strings.kbStep; }
					 { svelteHTML.createElement("span", { "class":`kb-row`,}); { svelteHTML.createElement("b", {});  } APP_CONSTANTS.strings.kbPlay; }
					 { svelteHTML.createElement("span", { "class":`kb-row`,}); { svelteHTML.createElement("b", {});  } APP_CONSTANTS.strings.kbEsc; }
				 }
			 }
		 }

		if(userName){
			 { svelteHTML.createElement("div", { "class":`user-section`,});
				 { svelteHTML.createElement("div", { "class":`user-badge`,});
					 { svelteHTML.createElement("span", { "class":`avatar`,});userName.charAt(0).toUpperCase(); }
					 { svelteHTML.createElement("span", { "class":`name`,});userName; }
				 }
				 { svelteHTML.createElement("button", {   "class":`logout-btn`,"onclick":onlogout,});  }
			 }
		}
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const Frame__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type Frame__SvelteComponent_ = ReturnType<typeof Frame__SvelteComponent_>;
/*Ωignore_endΩ*/export default Frame__SvelteComponent_;