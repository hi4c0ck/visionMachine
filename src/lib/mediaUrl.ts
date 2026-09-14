// Media URL helper — converts an on-disk media path to a WebView-loadable URL.
// No generation engine exists yet (D1), so this path renders nothing today;
// the asset-protocol scope for the media dir lands with the engine.

import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export function toMediaUrl(path: string | null | undefined): string | null {
  if (!isTauri() || !path) return null;
  return convertFileSrc(path);
}
