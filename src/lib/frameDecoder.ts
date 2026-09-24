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
  }

  /** True when WebCodecs can drive the decoder in this environment. */
  static get isSupported(): boolean {
    return HAS_VIDEO_DECODER && HAS_ENCODDED_VIDEO_FILE_SOURCE;
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
      return Promise.resolve(cached.bitmap);
    }
    const pending = this.inflight.get(index);
    if (pending) return pending;
    const p = this.resolveFrame(index).finally(() => this.inflight.delete(index));
    this.inflight.set(index, p);
    return p;
  }

  /**
   * Resolve a frame to an ImageBitmap, preferring WebCodecs and falling back
   * to a <video>-element canvas capture. A WebCodecs failure disposes the
   * decoder pipeline but does NOT poison the whole source — the canvas
   * fallback still serves subsequent frames.
   */
  private async resolveFrame(index: number): Promise<ImageBitmap | null> {
    // 1) WebCodecs fast path (only when the decoder pipeline is healthy).
    if (FrameSource.isSupported && !this.decodeBroken && this.decoder?.state !== 'closed') {
      const webcodecs = await this.decodeTo(index);
      if (webcodecs) {
        this.cache.set(index, { bitmap: webcodecs, t: ++this.lruCounter });
        this.evictLru();
        return webcodecs;
      }
      // decodeTo returned null (past-end or unsupported) — try canvas below.
      // If the decoder failed for this frame, stop retrying it.
      if (this.decoder?.state === 'closed') this.decodeBroken = true;
    }
    // 2) Canvas-capture fallback (universal, no WebCodecs required).
    const captured = await this.captureFrame(index);
    if (captured) {
      this.cache.set(index, { bitmap: captured, t: ++this.lruCounter });
      this.evictLru();
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

  private ensureCaptureVideo(): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.captureVideo) {
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      // Do NOT autoplay; we only seek + draw. src is set on first use.
      el.preload = 'auto';
      el.src = this.url;
      this.captureVideo = el;
    }
    return this.captureVideo;
  }

  /**
   * Seek a <video> to a timestamp; resolves true when the `seeked` event
   * fires within a short budget, false otherwise (media still loading / not
   * seekable / the element errored). Bounded so a stuck element can't hang
   * the carousel.
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
      const budget = setTimeout(() => finish(false), 2000);
      el.addEventListener('seeked', onSeeked);
      el.addEventListener('error', onErr);
      try {
        el.currentTime = sec;
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
 * Display scale for a card `delta` steps from center (the "dip"):
 * 0 → 1.0, ±1 → 0.85, ±2 → 0.7, ±3 → 0.55, otherwise 0 (hidden).
 */
export function carouselCardScale(delta: number): number {
  switch (Math.abs(delta)) {
    case 0:
      return 1.0;
    case 1:
      return 0.85;
    case 2:
      return 0.7;
    case 3:
      return 0.55;
    default:
      return 0;
  }
}

/**
 * Continuous dip scale for a card `d` steps from the *visual* center, where
 * `d` is a FLOAT (the semi-state between grid stops — mid-drag, or mid
 * transition between centers). Piecewise-linear through the same
 * breakpoints as the discrete dip (0→1.0, 1→0.85, 2→0.7, 3→0.55, 4→0), so
 * resting positions look identical to `carouselCardScale` but intermediate
 * positions are smooth: a card 0.5 steps from center reads 0.925, not the
 * discrete 0.85 or 1.0. Beyond |d| ≥ 4 the card is hidden (0).
 */
export function carouselCardScaleF(d: number): number {
  const a = Math.abs(d);
  if (a >= 4) return 0;
  if (a < 1) return 1 - 0.15 * a;
  if (a < 2) return 0.85 - 0.15 * (a - 1);
  if (a < 3) return 0.7 - 0.15 * (a - 2);
  return 0.55 - 0.55 * (a - 3);
}

/**
 * Horizontal offset (px, signed: negative = left of the strip center) of a
 * card `d` steps from the *visual* center (float). Matches the discrete
 * layout at integer stops — the first neighbor sits one full card-width out,
 * each further neighbor folds by `OVERLAP` — but interpolates linearly
 * between stops so mid-transition positions are continuous. At |d| ≥ 4 the
 * offset keeps the formula (the card is hidden anyway).
 */
export function carouselCardX(d: number, cardW: number, overlap: number): number {
  const a = Math.abs(d);
  const x = a < 1 ? cardW * a : cardW * (1 + (a - 1) * (1 - overlap));
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
