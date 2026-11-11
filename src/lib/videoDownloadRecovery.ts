// One-time recovery: re-fetch video artifacts whose download was blocked by
// the provider CDN egress gate (the `output.json` `download_failed` marker
// written by the degraded video stage). The backend command re-GETs each
// marker's `videoUrl` (bounded), and on success rewrites the marker to
// `done`, re-generates the 240p proxy, and repairs the task row + piece log
// + composer `last_generation` in the DB.
//
// Runs on session load (Tauri only), after the composer has loaded — a no-op
// in the browser and when the backend reports nothing to heal. Never throws:
// a recovery failure must not block session loading.

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface VideoDownloadRecovery {
  /** Task ids whose marker was re-fetched and flipped to done. */
  healed: string[];
  /** Markers still 403 after all bounded attempts (gate closed right now). */
  stillGated: string[];
}

/**
 * Call the backend recovery pass for a session. Returns the result, or
 * `null` when not running under Tauri or the call fails.
 */
export async function recoverVideoDownloads(sessionId: string): Promise<VideoDownloadRecovery | null> {
  try {
    if (!isTauri()) return null;
    const result = await invoke<VideoDownloadRecovery>('retry_failed_video_downloads', {
      input: { session_id: sessionId },
    });
    if (result && result.healed.length > 0) {
      console.info(
        `[videoDownloadRecovery] session ${sessionId}: ${result.healed.length} marker(s) healed` +
          (result.stillGated.length ? `, ${result.stillGated.length} still gated` : ''),
      );
    }
    return result;
  } catch (e) {
    console.warn('[videoDownloadRecovery] recovery pass failed (non-fatal):', e);
    return null;
  }
}
