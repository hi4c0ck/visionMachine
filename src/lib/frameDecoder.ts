// WebCodecs sparse frame sampling for the top-panel frame carousel.
//
// Design (docs/plan-session-video-and-carousel.md, B1):
// - The center carousel card keeps the live <video> element (free playback,
//   no reload on the playback ⇄ carousel toggle). Neighboring cards are
//   decoded <img> thumbnails.
// - Frame fetching: WebCodecs. `EncodedVideoFileSource` is the container
//   demuxer (it reads only the byte ranges it needs from the blob URL the
//   <video> element already uses) and `VideoDecoder` turns those ranges into
//   frames. No manual frame splitting — the decoder does the work.
// - `frame(index)` seeks the file source to just before the target frame,
//   then pulls encoded chunks through the decoder until the target frame
//   index is emitted (an 8-frame step is a handful of frames to throw away
//   after a keyframe). Frames before the target are closed immediately.
// - LRU cache (~16 decoded thumbs): scrolling back is a cache hit.
// - Fallback: when the WebCodecs video types are unavailable (older
//   WebView2), `frame()` resolves null and the UI keeps the <video>-based
//   center card with placeholder neighbors — the feature degrades, not dies.
//
// 8-frame stepping is a single constant (CAROUSEL_STEP). If 720p+ decode
// feels heavy at the session fps, the perf lever is to sub-sample the step
// (e.g. 4 instead of 8) — same API, one constant flip in the carousel.

/** Carousel step in frames (the composer 8n grid). */
export const CAROUSEL_STEP = 8;

/** LRU size for decoded frame thumbnails. */
const LRU_SIZE = 16;

/** Guard so a stuck decode can't hold the UI hostage. */
const DECODE_TIMEOUT_MS = 5000;

/** Top-panel preview strip height in px — the frame-preview band in Frame.svelte. */
export const CAROUSEL_STRIP_H = 180;

/** Fixed card width (px) used when no video aspect is known. */
export const CAROUSEL_FALLBACK_CARD_W = 170;

/**
 * Deck-tuck ladder: horizontal offset of the card at grid distance 0..4, in
 * card-width units — [0, 0.55, 0.87, 1.13, 1.35]. The ±1 card tucks UNDER
 * the front card (only 45% of its width peeks out), and every further card
 * steps out a little less, so the visible slivers shrink down the deck: a
 * nested `[ [[]] ]` cascade, not a side-by-side row.
 */
export const CAROUSEL_DECK_OFFSET_LADDER = [0, 0.55, 0.87, 1.13, 1.35];

/** Display-scale ladder matching the offsets: [1.0, 0.76, 0.64, 0.55, 0]. */
export const CAROUSEL_DECK_SCALE_LADDER = [1.0, 0.76, 0.64, 0.55, 0];

/** Piecewise-linear read of a ladder at a (clamped) float position. */
function deckLerp(ladder: number[], pos: number): number {
  const n = ladder.length - 1;
  const p = Math.max(0, Math.min(pos, n));
  const lo = Math.floor(p);
  const hi = Math.min(lo + 1, n);
  return ladder[lo] + (ladder[hi] - ladder[lo]) * (p - lo);
}

/**
 * Card width in px for the given video aspect (width/height), at the
 * strip's rendered height `stripH` (px). Cards track the strip's full height
 * so portrait videos get narrow cards and landscape videos get wide ones —
 * no crop, no letterbox. `stripH` defaults to CAROUSEL_STRIP_H (the standard
 * 180px band); the top panel passes a taller value for portrait media so the
 * card box matches the band's REAL height. When the aspect is unknown
 * (null/undefined/non-finite/≤0), falls back to the fixed width.
 */
export function carouselCardWidth(
  stripH: number,
  aspect: number | null | undefined,
): number {
  if (aspect == null || !Number.isFinite(aspect) || aspect <= 0) return CAROUSEL_FALLBACK_CARD_W;
  return Math.round(stripH * aspect);
}

/**
 * Pixel width of horizontal drag movement per carousel step.
 * One step tucks the first neighbor (offset 0.55 × cardW) under the front
 * card. No rubber-banding: pointer travel maps 1:1 to strip movement.
 */
export function carouselDragPxPerStep(cardW: number): number {
  return Math.round(cardW * CAROUSEL_DECK_OFFSET_LADDER[1]);
}

/**
 * Backing-store dimensions for a thumbnail canvas that must fill a card of
 * `cardW` px wide. The intrinsic bitmap is 1:1 with the card box (width =
 * cardW, height aspect-corrected to the source), so object-fit:fill renders
 * it with NO second scale — a 2×-resolution backing store would be
 * down-sampled again by the CSS into the 1× card box (a double scaler that
 * blurs the portrait thumbnail). A zero/negative height bitmap clamps to
 * 1px so the canvas never has a zero-height backing store.
 */
export function thumbnailIntrinsic(
  cardW: number,
  bitmapW: number,
  bitmapH: number,
): { w: number; h: number } {
  const w = Math.max(1, Math.round(cardW));
  // Guard the ratio itself: a missing/zero bitmap width would produce a
  // non-finite height, which would corrupt the canvas. Default to 1px.
  const ratio = bitmapW > 0 ? bitmapH / bitmapW : 0;
  const h = Math.max(1, Math.round(w * ratio));
  return { w, h };
}

/**
 * WebCodecs video types, read defensively so the module is safe to import
 * in environments that lack them (jsdom tests, older WebView2).
 */
const g = globalThis as any;
const HAS_ENCODDED_VIDEO_FILE_SOURCE =
  typeof g.EncodedVideoFileSource !== 'undefined' ||
  typeof g.EncodedVideoFrameSource !== 'undefined';
const HAS_VIDEO_DECODER = typeof g.VideoDecoder !== 'undefined';

interface LRUEntry {
  bitmap: ImageBitmap | null;
  t: number;
}

/** Clone a cached bitmap before exposing it to a canvas action. */
async function cloneImageBitmap(bitmap: ImageBitmap | null): Promise<ImageBitmap | null> {
  if (!bitmap) return null;
  try {
    return await createImageBitmap(bitmap);
  } catch {
    return null;
  }
}

/**
 * Why a frame thumbnail is unavailable — the UI keeps the placeholder but
 * can show the RIGHT one ("loading…", "out of range", "decoder failed")
 * instead of a generic ellipsis.
 */
export type ThumbDiag =
  | 'pending' // nothing known yet (source not loaded / decode in flight)
  | 'unsupported' // WebCodecs absent AND canvas capture unavailable (no <video> in the env)
  | 'loading' // the capture <video> hasn't finished its first load / metadata
  | 'out-of-range' // frame index is past the media's actual duration
  | 'failed' // capture/decode broke (media error, unseekable, drawImage failure)
  | 'ok'; // a bitmap is available (or a cache hit)

export interface FrameDiag {
  thumb: ThumbDiag;
}

/**
 * A decoded-frame source for one media file. `frame(i)` resolves to the
 * 0-based frame index's ImageBitmap (or null). Frame indices are composer
 * frame numbers at the session fps — frame i maps to timestamp i / fps.
 */
export class FrameSource {
  private readonly url: string;
  private readonly fps: number;
  private readonly cache = new Map<number, LRUEntry>();
  private lruCounter = 0;
  private fileSource: any = null;
  // WebCodecs VideoDecoder + the file/frame source types are not in this
  // project's TS lib target, so the pipeline is typed as any and driven
  // defensively (every WebCodecs call is guarded by isSupported + try).
  private decoder: any = null;
  private readonly inflight = new Map<number, Promise<ImageBitmap | null>>();
  private captureBroken = false;
  private decodeBroken = false;
  /** Last diagnostics for the most-recently-requested frame. The UI reads
   *  this to pick the right placeholder copy. Updated by resolveFrame. */
  private diagState: FrameDiag = { thumb: 'pending' };
  /** Frames emitted by the decoder and not yet claimed by a decodeForward
   *  caller, in decode order. Bounded: each pass claims/closes them. */
  private readonly outputQueue: VideoFrame[] = [];
  private outputQueueNotifier: (() => void) | null = null;
  private closed = false;

  /**
   * @param url  A loadable media URL (blob: / https: / asset:).
   * @param fps  Session fps (frame index → timestamp = index / fps s).
   */
  constructor(url: string, fps: number) {
    this.url = url;
    this.fps = fps > 0 ? fps : 24;
    // Create the capture <video> eagerly so its METADATA (duration +
    // videoWidth/videoHeight) is available as soon as it loads — even when
    // the WebCodecs fast path never touches it. Without this, a
    // WebCodecs-only environment leaves mediaSize/mediaDurationFrames null
    // forever and the carousel falls back to the session's preset aspect.
    this.ensureCaptureVideo();
  }

  /** True when WebCodecs can drive the decoder in this environment. */
  static get isSupported(): boolean {
    return HAS_VIDEO_DECODER && HAS_ENCODDED_VIDEO_FILE_SOURCE;
  }

  /**
   * Diagnostics for the most-recently-requested frame (see FrameDiag).
   * The UI polls this to render the correct placeholder copy. Read-only
   * snapshot; safe to call any time.
   */
  get diag(): FrameDiag {
    return this.diagState;
  }

  /**
   * The media's measured duration in frames (null until the capture <video>
   * has loaded metadata). The UI clamps its frame pool to this so side
   * cards past the real video end show "out of range", not a forever-
   * pending placeholder.
   */
  get mediaDurationFrames(): number | null {
    const v = this.captureVideo;
    if (!v || !isFinite(v.duration) || v.duration <= 0) return null;
    return Math.floor(v.duration * this.fps);
  }

  /**
   * The media's ACTUAL width/height, measured off the capture <video>
   * (null until its metadata has loaded). The carousel sizes its cards to
   * the TRUE video aspect — the preset in the session (720p vertical ⇒
   * 720×1280) is only an intent; the real file's dimensions are what render.
   * Read-only snapshot; safe to poll.
   */
  get mediaSize(): { width: number; height: number } | null {
    const v = this.captureVideo;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    return { width: v.videoWidth, height: v.videoHeight };
  }

  /**
   * ImageBitmap for a 0-based frame index, or null (index past end of media
   * or evicted from the LRU). Resolution order per frame:
   *   1. LRU cache
   *   2. WebCodecs decode (EncodedVideoFileSource + VideoDecoder) when the
   *      runtime has the types — the fast path the plan calls out.
   *   3. Canvas capture off a throwaway <video> element: seek the element to
   *      `index / fps`, wait for `seeked`, draw to a canvas, toDataURL.
   *      This is the universal fallback that works in every WebView2/Chromium
   *      WITHOUT WebCodecs (or when the WebCodecs decode poisons the source),
   *      so neighbor cards show REAL frames instead of placeholders.
   */
  frame(index: number): Promise<ImageBitmap | null> {
    if (index < 0 || this.closed) return Promise.resolve(null);
    const cached = this.cache.get(index);
    if (cached) {
      cached.t = ++this.lruCounter; // promote to most-recently-used
      // The cache owns this bitmap and may close it during LRU eviction.
      // Never hand the same resource to Svelte's canvas action: it can then
      // receive a detached ImageBitmap on the next update and throw.
      return cloneImageBitmap(cached.bitmap);
    }
    const pending = this.inflight.get(index);
    if (pending) return pending;
    const raw = this.resolveFrame(index).finally(() => this.inflight.delete(index));
    // The resolved bitmap is cached by FrameSource and can be closed later;
    // expose an independent clone to every Svelte action instead.
    const p = raw.then(cloneImageBitmap);
    this.inflight.set(index, p);
    return p;
  }

  /**
   * Resolve a frame to an ImageBitmap, preferring WebCodecs and falling back
   * to a <video>-element canvas capture. A WebCodecs failure disposes the
   * decoder pipeline but does NOT poison the whole source — the canvas
   * fallback still serves subsequent frames.
   *
   * The media-duration clamp: the requested composer frame may exceed the
   * ACTUAL encoded video's length (totalFrames is the configured composer
   * length, the generated clip can be shorter). Seeking past the end yields
   * a `seeked` at the clamped last frame — a duplicate, not a new image. So
   * when the duration is known, frames past it short-circuit to null with
   * the "out of range" diagnostic instead of drawing the last frame N times.
   */
  private async resolveFrame(index: number): Promise<ImageBitmap | null> {
    // 1) WebCodecs fast path (only when the decoder pipeline is healthy).
    if (FrameSource.isSupported && !this.decodeBroken && this.decoder?.state !== 'closed') {
      const webcodecs = await this.decodeTo(index);
      if (webcodecs) {
        this.diagState = { thumb: 'ok' };
        this.cache.set(index, { bitmap: webcodecs, t: ++this.lruCounter });
        this.evictLru();
        return webcodecs;
      }
      // decodeTo returned null (past-end or unsupported) — try canvas below.
      // If the decoder failed for this frame, stop retrying it.
      if (this.decoder?.state === 'closed') this.decodeBroken = true;
    }
    // 2) Duration clamp: past the real end of the media → no bitmap, and the
    //    UI shows "out of range" (distinct from a decode failure).
    const durFrames = this.mediaDurationFrames;
    if (durFrames !== null && index > durFrames) {
      this.diagState = { thumb: 'out-of-range' };
      return null;
    }
    // 3) Canvas-capture fallback (universal, no WebCodecs required).
    const captured = await this.captureFrame(index);
    if (captured) {
      this.diagState = { thumb: 'ok' };
      this.cache.set(index, { bitmap: captured, t: ++this.lruCounter });
      this.evictLru();
    } else {
      // captureFrame set the specific reason; surface it.
      this.diagState = { thumb: this.captureBroken ? 'failed' : this.captureVideo ? 'loading' : 'unsupported' };
    }
    return captured;
  }

  /**
   * Seek a throwaway <video> element to `index / fps` and capture its current
   * frame as an ImageBitmap via canvas. Reused element (created lazily, one
   * per source) so seek is cheap. Resolves null when the element can't load
   * the media, can't seek in time, or the runtime lacks canvas.captureStream /
   * drawImage of video. The fallback is best-effort: it must never hard-fail.
   */
  private captureVideo?: HTMLVideoElement;
  /** Set once the capture element's first load (canplay + metadata) settles.
   *  A seek issued before metadata is available silently no-ops in WebView2
   *  (no `seeked` event), which is the original "empty side cards" bug. */
  private captureReady = false;
  private captureInflight: Promise<ImageBitmap | null> | null = null;
  private async captureFrame(index: number): Promise<ImageBitmap | null> {
    if (this.captureBroken) return null;
    // One seek at a time: a queued capture awaits the in-flight one, then
    // re-seeks. Concurrent captures would fight over the same element and
    // draw stale frames.
    const prev = this.captureInflight ?? Promise.resolve(null);
    const job = prev.then(async () => {
      if (this.captureBroken) return null;
      const videoEl = this.ensureCaptureVideo();
      if (!videoEl) return null;
      // Gate every seek on the element being fully loaded. Without this, a
      // seek before `loadedmetadata` produces no `seeked` event at all and
      // the caller times out (the root cause of empty side cards).
      if (!this.captureReady) {
        const ready = await this.waitCaptureReady(videoEl);
        if (!ready) {
          this.captureBroken = true; // media never became seekable
          return null;
        }
      }
      const targetSec = index / this.fps;
      try {
        const seeked = await this.seekVideo(videoEl, targetSec);
        if (!seeked) {
          // A non-seekable / errored element would stall every later capture
          // (each 2s timeout) — mark the fallback broken so it stops.
          this.captureBroken = true;
          return null;
        }
        const canvas = document.createElement('canvas');
        // Capture at the element's intrinsic size (capped) to keep memory
        // bounded: the card is rendered ~170px wide, no need for full res.
        const cap = 640;
        let w = videoEl.videoWidth || videoEl.clientWidth || cap;
        let h = videoEl.videoHeight || videoEl.clientHeight || 360;
        if (w > cap) { h = Math.round(h * (cap / w)); w = cap; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(videoEl, 0, 0, w, h);
        const bitmap = await createImageBitmap(canvas);
        return bitmap;
      } catch {
        return null; // best-effort: never throw out of the carousel fallback
      }
    });
    this.captureInflight = job;
    const result = await job;
    if (this.captureInflight === job) this.captureInflight = null;
    return result;
  }

  /**
   * Resolve when the capture element is loaded far enough to seek: it has
   * fired `loadeddata` (metadata + first frame available) or `canplay`, and
   * `videoWidth` is known. Bounded — a media that never loads marks the
   * fallback broken instead of hanging the carousel.
   */
  private waitCaptureReady(el: HTMLVideoElement): Promise<boolean> {
    if (this.captureReady) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(budget);
        el.removeEventListener('loadeddata', onReady);
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error', onErr);
        if (ok) this.captureReady = true;
        resolve(ok);
      };
      const onReady = () => {
        // loadeddata guarantees videoWidth/videoHeight + duration are set;
        // a seek from here on will fire `seeked`.
        if (el.readyState >= 2) finish(true);
      };
      const onErr = () => finish(false);
      const budget = setTimeout(() => finish(false), 10000);
      el.addEventListener('loadeddata', onReady);
      el.addEventListener('canplay', onReady);
      el.addEventListener('error', onErr);
      // Already loaded (e.g. a second frame() call after the first settled).
      if (el.readyState >= 2) finish(true);
    });
  }

  private ensureCaptureVideo(): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.captureVideo) {
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      // Do NOT autoplay; we only seek + draw. src is set on first use.
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.src = this.url;
      this.captureVideo = el;
    }
    return this.captureVideo;
  }

  /**
   * Seek a <video> to a timestamp; resolves true when the `seeked` event
   * fires within a short budget, false otherwise (not seekable / the element
   * errored). The element is already metadata-ready when this runs (see
   * waitCaptureReady), so `seeked` is a reliable completion signal. Bounded
   * so a stuck element can't hang the carousel.
   */
  private seekVideo(el: HTMLVideoElement, sec: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(budget);
        el.removeEventListener('seeked', onSeeked);
        el.removeEventListener('error', onErr);
        resolve(ok);
      };
      const onSeeked = () => finish(true);
      const onErr = () => finish(false);
      const budget = setTimeout(() => finish(false), 3000);
      el.addEventListener('seeked', onSeeked);
      el.addEventListener('error', onErr);
      try {
        // Clamp to the measured duration: seeking past the end of a finite
        // clip fires `seeked` at the last frame — the duration check in
        // resolveFrame already rejects out-of-range frames, this is a guard.
        const d = isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
        el.currentTime = Math.max(0, Math.min(sec, d - 0.001));
      } catch {
        finish(false);
      }
    });
  }

  /** Close the decoder, release the thumbnail cache, and stop the capture video. */
  dispose(): void {
    this.closed = true;
    try {
      this.decoder?.close();
    } catch {
      /* already closed */
    }
    this.decoder = null;
    try {
      this.fileSource?.close?.();
    } catch {
      /* ignore */
    }
    this.fileSource = null;
    if (this.captureVideo) {
      this.captureVideo.removeAttribute('src');
      this.captureVideo.load?.();
      this.captureVideo = undefined;
    }
    this.captureReady = false;
    this.captureBroken = false;
    this.decodeBroken = false;
    this.diagState = { thumb: 'pending' };
    for (const e of this.cache.values()) e.bitmap?.close();
    this.cache.clear();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async decodeTo(index: number): Promise<ImageBitmap | null> {
    if (!FrameSource.isSupported) return null;
    try {
      await this.ensureDecoder();
      if (!this.decoder || this.decoder.state === 'closed') return null;

      // Seek just before the target frame so the decoder starts at/behind
      // it; decode forward and drop every frame until `index` is emitted.
      const seekMs = Math.max(0, ((index - 1) / this.fps) * 1000);
      await this.seekDecoder(seekMs);
      return await this.decodeForward(index);
      // NOTE: no caching here — resolveFrame owns the LRU so both the
      // WebCodecs and canvas-capture paths share one cache.
    } catch (e) {
      // A WebCodecs failure (unsupported codec/container) closes the decoder
      // pipeline so we stop retrying it — but we do NOT dispose() the whole
      // source, because the <video>-canvas fallback can still serve frames.
      console.warn('[frameDecoder] decode failed:', e);
      try {
        this.decoder?.close();
      } catch {
        /* already closed */
      }
      this.decoder = null;
      this.decodeBroken = true;
      return null;
    }
  }

  private async ensureDecoder(): Promise<void> {
    if (this.decoder && this.decoder.state !== 'closed') return;
    // EncodedVideoFileSource demuxes the container; EncodedVideoFrameSource
    // (older Chromium) only feeds a raw frame stream. Prefer the file form.
    const SourceCtor = g.EncodedVideoFileSource ?? g.EncodedVideoFrameSource;
    const source = new SourceCtor(this.url, this.fps);
    this.fileSource = source;
    const decoder = new g.VideoDecoder({
      output: (frame: VideoFrame) => this.onDecoderOutput(frame),
      error: (e: unknown) => {
        console.warn('[frameDecoder] decoder error:', e);
      },
    });
    await source.connectToDecoder(decoder);
    this.decoder = decoder;
  }

  /**
   * Decoder output sink: queue every emitted frame for claim by the active
   * decodeForward pass. A frame no pass is claiming (no pending caller)
   * is closed immediately to avoid a growing dead-frame buffer.
   */
  private onDecoderOutput(frame: VideoFrame): void {
    if (this.outputQueueNotifier) {
      this.outputQueue.push(frame);
      const n = this.outputQueueNotifier;
      this.outputQueueNotifier = null;
      n();
    } else {
      // No active claim pass: this frame can't be decoded to the index we
      // want (we always seek just before the target) — drop it.
      frame.close();
    }
  }

  /**
   * Seek the decoder to a timestamp (ms), tolerating sources that lack
   * `seekToApproximatePosition` (fall back to decode-from-start).
   */
  private async seekDecoder(seekMs: number): Promise<void> {
    const source = this.fileSource;
    if (typeof source?.seekToApproximatePosition === 'function') {
      // Approximate byte position: seekMs is a fraction of the total
      // duration; scale it against the media's byte size when available.
      try {
        await source.seekToApproximatePosition(seekMs);
      } catch {
        /* keep the pre-seek position; decodeForward still lands on target */
      }
    }
    // Reset the decoder to the seeked position. `seek()` on a configured
    // decoder rewinds its internal state to the nearest keyframe.
    await new Promise<void>((resolve, reject) => {
      try {
        this.decoder!.seek(seekMs, () => resolve(), (e: unknown) => reject(e));
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Decode forward from the current position until frame `index` is
   * emitted. Frames before it are closed immediately; `index` becomes an
   * ImageBitmap. Resolves null when the source is exhausted or errors.
   *
   * The decoder's `output` callback (see onDecoderOutput) enqueues each
   * emitted frame; we register a notifier that is woken once per enqueued
   * frame, then drain the queue to find the first frame at/after the
   * target timestamp. Frames before the target are closed here.
   */
  private decodeForward(index: number): Promise<ImageBitmap | null> {
    const targetMs = (index / this.fps) * 1000;
    const decoder = this.decoder!;

    // Rewire the output sink for this pass: enqueued frames are held until
    // we find the target, so onDecoderOutput's "no active claim" branch
    // does not drop them.
    let wake: (() => void) | null = null;
    const prevNotifier = this.outputQueueNotifier;
    this.outputQueueNotifier = () => wake?.();

    // Drain any frames already in the queue from a prior pass.
    const drainQueue = (): VideoFrame | null => {
      // Find the first frame at/after targetMs; close the ones before it.
      for (let i = 0; i < this.outputQueue.length; i++) {
        const f = this.outputQueue[i];
        if (f.timestamp >= targetMs) {
          this.outputQueue.splice(i, 1);
          return f;
        }
        f.close();
        this.outputQueue.splice(i, 1);
        i--;
      }
      return null;
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (bitmap: ImageBitmap | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        this.outputQueueNotifier = prevNotifier ?? null;
        resolve(bitmap);
      };

      // Try to claim from the queue now; if not present, await the next
      // enqueued frame (the decoder is still feeding the file source).
      const tryClaim = () => {
        if (settled) return;
        const hit = drainQueue();
        if (hit) {
          createImageBitmap(hit)
            .then((b) => {
              hit.close();
              finish(b);
            })
            .catch(() => {
              hit.close();
              finish(null);
            });
          return;
        }
        // Nothing yet — the decoder is mid-emit. Register a one-shot wake
        // so the next enqueued frame re-enters tryClaim.
        wake = () => {
          wake = null;
          tryClaim();
        };
        // If the decoder has ended without producing the target frame
        // (index past end of media, or source exhausted), give up.
        if (decoder.ended) {
          finish(null);
        }
      };

      const deadline = setTimeout(() => finish(null), DECODE_TIMEOUT_MS);
      tryClaim();
    });
  }

  private evictLru(): void {
    if (this.cache.size <= LRU_SIZE) return;
    let oldestKey: number | null = null;
    let oldestT = Infinity;
    for (const [k, v] of this.cache) {
      if (v.t < oldestT) {
        oldestT = v.t;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) {
      this.cache.get(oldestKey)?.bitmap?.close();
      this.cache.delete(oldestKey);
    }
  }
}

/**
 * Snap a frame index to the carousel grid (multiple of `step`, default
 * CAROUSEL_STEP), clamped to [0, totalFrames-1].
 */
export function snapCarouselFrame(frame: number, totalFrames: number, step: number = CAROUSEL_STEP): number {
  const s = Math.round(frame / step) * step;
  return Math.min(Math.max(0, s), Math.max(0, totalFrames - 1));
}

/**
 * The set of card frame indices visible in a carousel centered on `center`:
 * center ± span·step, clamped to [0, totalFrames-1], sorted ascending.
 * Default span 2 → up to five cards (center + 2 neighbors each side).
 */
export function carouselWindow(
  center: number,
  totalFrames: number,
  step: number = CAROUSEL_STEP,
  span = 2,
): number[] {
  const out = new Set<number>();
  for (let d = -span; d <= span; d++) {
    const f = center + d * step;
    if (f < 0 || f >= totalFrames) continue;
    out.add(f);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Display scale for a card `delta` steps from center (the deck cascade):
 * 0 → 1.0, ±1 → 0.76, ±2 → 0.64, ±3 → 0.55, otherwise 0 (hidden).
 */
export function carouselCardScale(delta: number): number {
  switch (Math.abs(delta)) {
    case 0:
      return 1.0;
    case 1:
      return 0.76;
    case 2:
      return 0.64;
    case 3:
      return 0.55;
    default:
      return 0;
  }
}

/**
 * Continuous deck-cascade scale for a card `d` steps from the *visual*
 * center, where `d` is a FLOAT (the semi-state between grid stops — mid-drag,
 * or mid transition between centers). Piecewise-linear through the
 * CAROUSEL_DECK_SCALE_LADDER, so resting positions look identical to
 * `carouselCardScale` but intermediate positions are smooth: a card 0.5 steps
 * from center reads 0.88, not the discrete 0.76 or 1.0. Beyond |d| ≥ 4 the
 * card is hidden (0).
 */
export function carouselCardScaleF(d: number): number {
  const a = Math.abs(d);
  if (a >= 4) return 0;
  return deckLerp(CAROUSEL_DECK_SCALE_LADDER, a);
}

/**
 * Horizontal offset (px, signed: negative = left of the strip center) of a
 * card `d` steps from the *visual* center (float). Follows the
 * CAROUSEL_DECK_OFFSET_LADDER — the first neighbor tucks UNDER the front
 * card (offset 0.55 × cardW vs its 0.76 scale, so its wider body hides behind
 * the front and only its edge peeks out), and each further card steps out a
 * little less, shrinking the visible sliver down the deck. Interpolates
 * linearly between stops so mid-transition positions are continuous. At
 * |d| ≥ 4 the offset keeps the formula (the card is hidden anyway).
 */
export function carouselCardX(d: number, cardW: number): number {
  const a = Math.abs(d);
  const x = cardW * deckLerp(CAROUSEL_DECK_OFFSET_LADDER, Math.min(a, 4));
  return d < 0 ? -x : x;
}

/**
 * Opacity for a card `d` steps from the *visual* center (float): full until
 * 3 steps out, then fading to 0 by 4 (where the card is already scaled away).
 * Keeps entering/leaving cards from popping at the strip edges.
 */
export function carouselCardOpacityF(d: number): number {
  const a = Math.abs(d);
  if (a <= 3) return 1;
  if (a >= 4) return 0;
  return 1 - (a - 3);
}

// ── Stacked-treatment layer (horizontal nested `[ [[]] ]` depth) ───────────
// Everything below is driven by the SAME float distance `d` that drives the
// dip geometry (negative = backwards cards on the left, positive = forwards
// cards on the right), so mid-transition (semi-state) positions interpolate
// every treatment smoothly with no discrete state. All are continuous.

/** Peak vertical "grab" lift (px) of the dissolve arc. */
export const CAROUSEL_DISSOLVE_LIFT_PX = 8;

/**
 * Blue-grey "past frames" overlay strength (0..1) for BACKWARDS cards (d<0):
 * 0 at the center, ramping to 0.45 by the first back resting position (d=-1)
 * and growing 0.10 per further step, capped at 0.7. Forward cards read 0.
 * Continuous in d, so the departing front card (d crossing 0→-1) gains the
 * tint exactly as it loses the front position.
 */
export function carouselBackTintF(d: number): number {
  if (d >= 0) return 0;
  const back = -d;
  const tint = 0.45 * Math.min(back, 1) + Math.max(0, back - 1) * 0.1;
  return Math.min(0.7, tint);
}

/**
 * Warm-neutral "future frames" dim (0..1) for FORWARDS cards (d>0): symmetric
 * to the backwards ramp but softer (0.25 at d=1, growing 0.10/step, capped at
 * 0.45). Backwards cards read 0.
 */
export function carouselFwdDimF(d: number): number {
  if (d <= 0) return 0;
  const dim = 0.25 * Math.min(d, 1) + Math.max(0, d - 1) * 0.1;
  return Math.min(0.45, dim);
}

/**
 * Accent glow strength (0..1) for the front-card treatment: 1 at the center,
 * decaying linearly to 0 by |d| = 1, so during a move the OUTGOING front's
 * glow and the INCOMING front's glow cross-fade at 0.5 / 0.5 mid-transition.
 */
export function carouselGlowF(d: number): number {
  return Math.max(0, 1 - Math.abs(d));
}

/**
 * "Grab-and-place" lift: a pulse peaking at |d| = 0.5 (mid-transition) and
 * settling to 0 at BOTH resting positions (|d| = 0 and |d| = 1), so the
 * departing/arriving front cards arc slightly upward while crossing the
 * center and rest flat again. Symmetric in d (forward and backward moves
 * look the same, matching the reference sheets).
 */
export function carouselLiftF(d: number): number {
  const a = Math.abs(d);
  if (a >= 1) return 0;
  return CAROUSEL_DISSOLVE_LIFT_PX * (1 - Math.abs(2 * a - 1));
}

/**
 * Depth blur (px): the front area (|d| < 0.5) stays sharp, receding cards
 * blur up to a 3px cap. Continuous; |d| ≥ 3.5 clamps at the cap.
 */
export function carouselBlurF(d: number): number {
  const a = Math.max(0, Math.abs(d) - 0.5);
  return Math.min(3, a * 1.2);
}

/**
 * Continuous dissolve strength (0..1) for a card at float distance `d` from
 * the visual center — a single bump: 0 at the resting front (`|d| = 0`),
 * peaking at 1 on the "switch" midpoint (`|d| = 0.5`), back to 0 at the
 * settled neighbor (`|d| = 1`), and 0 beyond. Driven by the card's SIGNED
 * float distance, so it reads the same on the receding (d<0) and arriving
 * (d>0) sides of the front. This powers the accent-wash overlay on every
 * card: the wash ramps up as the front card approaches the switch and ramps
 * back down once it settles — a smooth, continuous effect with no discrete
 * state branch and no spurious wash on the far (barely-visible) cards.
 */
/**
 * Continuous dissolve strength (0..1) for a card at float distance `d` from
 * the visual center — a WIDE trapezoid that stays elevated through the whole
 * move (not a narrow pulse at the switch point):
 *   |d| in [0, 0.5] → ramps 0 → 0.5
 *   |d| in [0.5, 1] → stays at 1 (full wash through the commit)
 *   |d| ≥ 1         → 0 (far cards never wash)
 * Driven by the SIGNED float distance, so it reads the same on the
 * receding (d<0) and arriving (d>0) sides of the front. The rAF tween
 * (visualStep) sweeps `d` continuously through 0.5, which is where this
 * function stays at 1 — the wash lingers for the entire 260 ms move.
 */
/**
 * Continuous dissolve strength (0..1) for a card at float distance `d` from
 * the visual center — a trapezoid that LINGERS through the whole move (B),
 * not a narrow pulse at the switch point:
 *   |d| in [0.0, 0.5] → ramps 0 → 1
 *   |d| in [0.5, 1.0] → stays at 1 (full wash through the commit)
 *   |d| in [1.0, 1.5] → ramps 1 → 0
 *   |d| >= 1.5        → 0 (far cards never wash)
 * Every boundary is continuous, so a card settling at |d| = 1 (the receding
 * neighbor) holds the wash and a card arriving from |d| = 1 clears it only
 * once it reaches the front (|d| = 0). The rAF tween sweeps `d` through 0.5
 * continuously, which is where this function plateaus — so the dissolve is
 * present for most of the 260 ms move.
 */
/**
 * Continuous dissolve strength (0..1) for a card at signed float distance
 * `d` from the visual center — SYMMETRIC (both receding d<0 and arriving d>0
 * sides), so the effect is visible regardless of scroll direction:
 *   |d| in [0, 0.25]   → ramps 0 → 1 (front card gains the wash as it moves)
 *   |d| in [0.25,0.75] → stays at 1  (wash lingers through the commit)
 *   |d| in [0.75, 1]   → ramps 1 → 0 (clears before settling into the
 *                                    neighbor rest stop, so the frame
 *                                    underneath stays unmasked)
 *   |d| >= 1          → 0
 *
 * The rAF tween (visualStep) sweeps the crossing card through |d|: 0 → 0.5 →
 * 1 over 260 ms; the wash is visible from the first quarter of the move and
 * gone by the time the card is a settled neighbor. Both the departing front
 * (d<0, left side) and the arriving front (d>0, right side) dissolve
 * symmetrically, so left-scroll and right-scroll look identical.
 */
/**
 * v6: the dissolve belongs to the card that is currently the FRONT, and it
 * recedes in the direction of motion — i.e. it leaves on the side it is
 * moving TOWARD, and the mask opens toward that side.
 *
 * `receding` = the motion direction at the moment the move started:
 *  - forward (next / drag-left): the old front recedes to the LEFT side
 *    (d<0) and its wash opens toward center → 'to right'.
 *  - backward (prev / drag-right): the old front recedes to the RIGHT side
 *    (d>0) and its wash opens toward center → 'to left'.
 *
 * The NEW front (the card arriving from the opposite side) is NEVER
 * masked — the user explicitly asked for the upcoming/underneath frame to
 * stay clean. Every settled card stays clean (op=0 at rest stops).
 */
/**
 * v6: the dissolve belongs ONLY to the receding (old-front) card, and it
 * opens toward the deck center so the grain reveals the UPCOMING frame
 * settling into the slot the old front is leaving. The arriving/upcoming
 * card (the one on the opposite side) is NEVER masked.
 *
 * `moveDir` records which way the strip just moved:
 *   +1 = forward (centerFrame↑): the old front recedes to the LEFT (d<0).
 *   -1 = backward (centerFrame↓): the old front recedes to the RIGHT (d>0).
 *    0 = idle / settled: no wash anywhere (rest stops stay clean).
 *
 * So a card only gets the wash when it is on the receding side that
 * `moveDir` names; everything else (arriving front, settled neighbors,
 * idle) returns 0.
 */
export function carouselDissolveOpacity(d: number, moveDir: number): number {
  if (moveDir === 0) return 0;
  // Forward move → old front on the LEFT (d<0). Backward → RIGHT (d>0).
  // The opposite (arriving) side never washes.
  if (moveDir > 0 ? d >= 0 : d <= 0) return 0;
  const a = Math.abs(d);
  if (a >= 1) return 0;
  // v9b: BUMPED ACCENT PEAK — the accent wave needs to read as a visible
  // "powered by accent" effect. PEAK = 0.9 at the switch, plus a subtle
  // CSS breathing pulse (see .fc-wave-tint keyframe) so the sheen has
  // amplitude and feels alive during the move.
  const PEAK = 0.9;
  return PEAK * Math.sin(Math.PI * a);
}

/**
 * v6: which way the receding card's media-dissolve opens is set by the
 * MOTION (`moveDir`), not the card's side — the wash always grows from the
 * deck CENTER outward, so the grainy "edge reveal" shows the frame settling
 * behind the receding front:
 *
 *  - forward move  (moveDir>0): the old front recedes LEFT; its mask opens
 *    toward the center (right) → 'to right'.
 *  - backward move (moveDir<0): the old front recedes RIGHT; its mask opens
 *    toward the center (left) → 'to left'.
 *
 * The `d` argument is kept only for call-site clarity; it does not affect the
 * result, because every card on a strip shares one `moveDir`, and the wash
 * (`--fc-dissolve-op`) is non-zero on exactly the receding card, so its edge
 * direction is the only one that is ever visible.
 */
export function carouselDissolveDirF(_d: number, moveDir: number): 'to right' | 'to left' {
  if (moveDir < 0) return 'to left'; // backward: receding front opens toward center (left)
  return 'to right';                 // forward / idle: receding front opens toward center (right)
}

/**
 * v8: the MEDIA-dissolve REVEAL — how much of the receding front's own media
 * goes transparent, so the UPCOMING frame settling behind it is genuinely
 * visible through the grain ("noticeable transparent to see upcoming frame").
 *
 * Same receding gate + sin-bump shape as carouselDissolveOpacity, but peaking
 * far HIGHER (0.7 at the switch midpoint) so the reveal reads clearly. 0 at
 * BOTH rest stops, so the idle center + settled neighbors stay fully opaque
 * (no effect with no drag). The receding gate is identical: only the
 * moveDir-named receding side ever reveals; the arriving/upcoming card is
 * never masked.
 */
export function carouselDissolveReveal(d: number, moveDir: number): number {
  if (moveDir === 0) return 0;
  if (moveDir > 0 ? d >= 0 : d <= 0) return 0;
  const a = Math.abs(d);
  if (a >= 1) return 0;
  // Strong, SMOOTH reveal: the receding front's media fades to transparent on
  // a clean directional gradient (NO grain in this channel), so the UPCOMING
  // frame behind it reads pristine — not mottled. The grain structure lives
  // in the separate accent-wave layer, never in this reveal. PEAK ~0.85 opens
  // ~3/4 of the card at the switch so the frame UNDERNEATH (its border +
  // edge) is clearly visible.
  const PEAK = 0.85;
  return PEAK * Math.sin(Math.PI * a);
}

/**
 * v8: horizontal "brick interlock" tuck (px, POSITIVE = toward the deck
 * center) for a card at float distance `d` from the visual center.
 *
 * The card rests EXACTLY at its ladder offset at every integer stop (the
 * "accurate place" the user wants — no drift on the final slot), but tucks
 * slightly INSIDE during the transit between stops, peaking at |d|=0.5 (the
 * switch midpoint). This is the horizontal `[ [[ ]] ]` interlock: the
 * crossing card drifts toward center mid-descent, then snaps back out to its
 * exact rest offset on the last few steps. Purely horizontal — no vertical
 * motion. 0 at |d|>=1.5 (far cards are already scaled away).
 */
export function carouselStackTuckF(d: number, cardW: number): number {
  const a = Math.abs(d);
  // The interlock is a single inward pulse between the front and its first
  // neighbor: 0 at BOTH rest stops (a=0 and a=1), peaking at the switch
  // midpoint (a=0.5). Beyond the first neighbor (a>=1) far cards are already
  // small and tucked, so they never tuck again.
  if (a >= 1) return 0;
  const P = 0.15 * cardW; // how far inside the card drifts at the peak
  return P * Math.sin(Math.PI * a);
}
