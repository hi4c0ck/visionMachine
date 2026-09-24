// Media URL helper — converts an on-disk media path to a WebView-loadable URL.
// Browser (dev): renders nothing. Tauri: fetches the bytes through the
// read_media_file command (per-project media roots can't be a static
// asset-protocol scope, so the command validates the path against a known
// media root) and hands back an object URL.

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

// In-flight dedup: the entry stays in the map after settling so a concurrent
// call in the microtask window after resolve still reuses the result rather
// than re-fetching. The map is bounded by the number of distinct media files
// shown per session — small; entries are cheap (a string + a blob URL).
// A failure does NOT settle to `null`: it removes the entry and re-throws,
// so a later call (e.g. after a freshly-generated artifact lands at the same
// path, or after a transient IPC hiccup) retries instead of caching the miss
// for the whole app session.
const urlCache = new Map<string, Promise<string | null>>();

function mediaMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

export async function toMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (!isTauri()) return null;
  const existing = urlCache.get(path);
  if (existing) return existing;
  const p = readMediaBytes(path)
    .then((bytes) => {
      const blob = new Blob([bytes], { type: mediaMime(path) });
      return URL.createObjectURL(blob);
    })
    .catch(() => {
      // Drop the entry so a later attempt (a freshly-generated artifact at
      // the same path, or a transient IPC hiccup) re-fetches instead of
      // inheriting this miss; callers still observe the null result.
      urlCache.delete(path);
      return null;
    });
  urlCache.set(path, p);
  return p;
}

/**
 * True when the value is a local filesystem path (not a remote http(s) URL).
 * Generated image artifacts are stored as local media-tree paths; remote
 * user-supplied keyframe URLs pass through `<img src>` directly. The WebView
 * can only load local paths through the `read_media_file` media command.
 */
export function isLocalPath(value: string): boolean {
  return !/^https?:\/\//i.test(value.trim());
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
