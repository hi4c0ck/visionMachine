// Media URL helper — converts an on-disk media path to a WebView-loadable URL.
// Browser (dev): renders nothing. Tauri: fetches the bytes through the
// read_media_file command (per-project media roots can't be a static
// asset-protocol scope, so the command validates the path against a known
// media root) and hands back an object URL.

import { invoke, isTauri } from '@tauri-apps/api/core';

let pending: Map<string, Promise<string | null>> = new Map();

export async function toMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (!isTauri()) return null;
  // Deduplicate concurrent fetches of the same file.
  const existing = pending.get(path);
  if (existing) return existing;
  const p = invoke('read_media_file', { input: { path } })
    .then((bytes) => {
      const data: Uint8Array = bytes as Uint8Array;
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const mime =
        ext === 'mp4' ? 'video/mp4'
        : ext === 'png' ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : ext === 'json' ? 'application/json'
        : 'application/octet-stream';
      return URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: mime }));
    })
    .catch(() => null)
    .finally(() => {
      pending.delete(path);
    });
  pending.set(path, p);
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
