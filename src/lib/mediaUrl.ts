// Media URL helper — converts an on-disk media path to a WebView-loadable URL.
// Tauri: returns a `media://localhost/<url-encoded-absolute-path>` URL served
// by the Rust custom protocol (Range support, Content-Type set by the
// protocol). No IPC, no blob, no cache — the browser handles HTTP caching.
// Browser (dev): renders nothing (returns null).

import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Read a media file's raw bytes through the Tauri IPC boundary. `Vec<u8>`
 * arrives on the JS side as a plain `number[]` (Tauri serializes it through
 * JSON, not a binary channel), so build a real `Uint8Array` from it —
 * treating the array as if it were already typed (`arr.buffer` on a plain
 * array is `undefined`) produces silently corrupted media.
 */
export async function readMediaBytes(path: string): Promise<Uint8Array> {
  const raw = await invoke('read_media_file', { input: { path } });
  return Array.isArray(raw) ? Uint8Array.from(raw) : (raw as Uint8Array);
}

/**
 * Proxy sibling for preview loads: a small derivative next to the original so
 * thumbnails/previews don't pull full-resolution bytes into the WebView. The
 * sibling lives in the same directory, so the existing media-root guard in
 * `read_media_file` already covers it — no new IPC surface. Returns null for
 * non-media extensions (no proxy exists; callers fall back to the original).
 */
function previewSiblingPath(path: string): string | null {
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (dot <= slash) return null;
  const base = path.slice(0, dot);
  const ext = path.slice(dot + 1).toLowerCase();
  if (ext === 'mp4' || ext === 'mov' || ext === 'webm' || ext === 'mkv' || ext === 'avi') {
    return `${base}.proxy.mp4`;
  }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif' || ext === 'bmp') {
    return `${base}.thumb.jpg`;
  }
  return null;
}

/**
 * No-op: the `media://` protocol serves current on-disk bytes on every load
 * and the browser handles HTTP caching, so there is no blob cache to
 * invalidate. Kept for backward compat with call sites that still invoke it.
 */
export function invalidateMediaUrlCache(_path: string | null | undefined): void {
  // No-op — see above.
}

/**
 * No-op: `media://` URLs hold no JS-heap bytes (unlike the old blob URLs that
 * pinned entire files until revoked), so there is nothing to release. Kept
 * for backward compat with call sites that still invoke it.
 */
export function releaseMediaUrl(_path: string | null | undefined): void {
  // No-op — see above.
}

/**
 * No-op cache stats for backward compat. The `media://` protocol has no
 * client-side cache, so there is nothing to report.
 */
export function getCacheStats(): { entries: number; totalBytes: number; capBytes: number } {
  return { entries: 0, totalBytes: 0, capBytes: 0 };
}

/**
 * Resolve a media path to a WebView-loadable `media://` URL. With
 * `variant: 'preview'` the small proxy sibling is used when one exists for
 * the extension (video `foo.mp4` → `foo.proxy.mp4`, image `foo.png` →
 * `foo.thumb.jpg`) so thumbnails and previews don't pull full-resolution
 * bytes; otherwise the original path is used. No IPC, no blob, no cache.
 * Returns null for empty paths or outside Tauri (browser dev renders nothing).
 */
/**
 * WebView2 (Windows/Android) only intercepts a custom scheme through the
 * `http://<scheme>.localhost` resource-request workaround — a bare
 * `media://` URL is an unknown scheme there and never reaches the Rust
 * handler, so media silently 404s. WebKit (macOS/Linux) registers the real
 * scheme, so it uses the canonical `media://localhost` form. wry reverts the
 * workaround URI back to the canonical one before calling the handler, so the
 * handler only ever sees `media://localhost/<path>` — the path component is
 * identical on every platform and is the only part we encode.
 */
function mediaUrlPrefix(): string {
  // WebView2 = the desktop targets that need the http://<scheme>.localhost form.
  const win = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
  return win ? 'http://media.localhost' : 'media://localhost';
}

export async function toMediaUrl(
  path: string | null | undefined,
  opts?: { variant?: 'preview' },
): Promise<string | null> {
  if (!path) return null;
  if (!isTauri()) return null;
  // A degraded generation (the CDN egress gate blocked the local download)
  // stores a REMOTE url as `lastGeneration.videoPath`. A remote / `data:`
  // URI is NOT a media-tree path: the `media://` protocol (and the
  // `read_media_file` / `open_media_in_player` commands, which guard against
  // a known media root) would 404 / reject it. Pass such values through
  // verbatim so the WebView loads them directly — never prefix a remote url
  // with the local scheme or derive a `.proxy` sibling from it.
  if (!isLocalPath(path)) return path;
  const effective = opts?.variant === 'preview' ? (previewSiblingPath(path) ?? path) : path;
  return `${mediaUrlPrefix()}/${encodeURIComponent(effective)}`;
}

/**
 * True when the value is a local filesystem path (not a remote http(s) URL
 * and not an in-memory data URI). Generated image artifacts are stored as
 * local media-tree paths; remote user-supplied keyframe URLs pass through
 * `<img src>` directly. A `data:` URI (a locally-picked img2img base or an
 * extracted last frame) is ALSO in-memory and renders directly in the
 * WebView — it must NOT be routed through the media-tree IPC, which only
 * knows media-root paths. The WebView can only load local media paths
 * through the `media://` protocol.
 */
export function isLocalPath(value: string): boolean {
  return !/^(https?:|data:)/i.test(value.trim());
}

/** Fetch a media-tree text file (e.g. the redacted `request.log`) as a string. */
export async function readMediaText(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (!isTauri()) return null;
  try {
    return new TextDecoder().decode(await readMediaBytes(path));
  } catch {
    return null;
  }
}
