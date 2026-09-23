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
   * Decoded ImageBitmap for a 0-based frame index, or null (unsupported,
   * decode failure, index past end of media, or evicted from the LRU).
   */
  frame(index: number): Promise<ImageBitmap | null> {
    if (index < 0 || this.closed) return Promise.resolve(null);
    const cached = this.cache.get(index);
    if (cached) {
      cached.t = ++this.lruCounter; // promote to most-recently-used
      return Promise.resolve(cached.bitmap);
    }
    if (!FrameSource.isSupported) return Promise.resolve(null);
    const pending = this.inflight.get(index);
    if (pending) return pending;
    const p = this.decodeTo(index).finally(() => this.inflight.delete(index));
    this.inflight.set(index, p);
    return p;
  }

  /** Close the decoder and release the thumbnail cache. */
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
    for (const e of this.cache.values()) e.bitmap?.close();
    this.cache.clear();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async decodeTo(index: number): Promise<ImageBitmap | null> {
    try {
      await this.ensureDecoder();
      if (!this.decoder || this.decoder.state === 'closed') return null;

      // Seek just before the target frame so the decoder starts at/behind
      // it; decode forward and drop every frame until `index` is emitted.
      const seekMs = Math.max(0, ((index - 1) / this.fps) * 1000);
      await this.seekDecoder(seekMs);

      const bitmap = await this.decodeForward(index);
      if (bitmap) {
        this.cache.set(index, { bitmap, t: ++this.lruCounter });
        this.evictLru();
      }
      return bitmap;
    } catch (e) {
      // A decode failure poisons this source (unsupported codec/container):
      // close the pipeline so later frames don't retry it; callers fall
      // back to placeholder neighbors.
      console.warn('[frameDecoder] decode failed:', e);
      this.dispose();
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
