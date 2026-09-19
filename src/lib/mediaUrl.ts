// Media URL helper — converts an on-disk media path to a WebView-loadable URL.
// Browser (dev): renders nothing. Tauri: fetches the bytes through the
// read_media_file command (per-project media roots can't be a static
// asset-protocol scope, so the command validates the path against a known
// media root) and hands back an object URL.

import { invoke, isTauri } from '@tauri-apps/api/core';

// In-flight dedup: the entry stays in the map after settling so a concurrent
// call in the microtask window after resolve still reuses the result rather
// than re-fetching. The map is bounded by the number of distinct media files
// shown per session — small; entries are cheap (a string + a blob URL).
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
  const p = invoke('read_media_file', { input: { path } })
    .then((bytes) => {
      const data = bytes as unknown as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: mediaMime(path) });
      return URL.createObjectURL(blob);
    })
    .catch(() => null);
  urlCache.set(path, p);
  return p;
}

/** Fetch a media-tree text file (e.g. the redacted `request.log`) as a string. */
export async function readMediaText(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (!isTauri()) return null;
  try {
    const bytes = (await invoke('read_media_file', { input: { path } })) as unknown as Uint8Array;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
