// One-time backfill: link already-generated image artifacts back to their
// keyframe/subject so the chips show a thumbnail even when the task that
// produced them predates the previewLocalPath / previewRemoteUrl fields.
//
// The media tree records every artifact in `<root>/<pipe>/images/log.jsonl`:
//   { refId, localPath, remoteUrl, ts, model }
// We take the LATEST entry per refId and link it onto the pipe. The keyframe
// refId in the log is the slotIndex (registry `record_upstream` uses the
// ordinal), so matching is by slotIndex for keyframes and by id for subjects.
// Runs on session load (Tauri only); no-op in the browser.

import { isTauri } from '@tauri-apps/api/core';
import { readMediaText } from '$lib/mediaUrl';
import type { PipeRow, SessionData } from '$types';

interface LogEntry {
  refId?: string;
  localPath?: string;
  remoteUrl?: string;
  ts?: number;
}

/**
 * Resolve the media root for a session. The on-disk tree lives under the
 * project's `directoryPath` (the session's directoryPath points at it).
 */
function mediaRootFor(session: SessionData): string | null {
  const d = (session.directoryPath ?? '').trim();
  return d ? d : null;
}

/**
 * Link already-generated images onto their keyframes/subjects from the
 * pipe's images/log.jsonl. No-op when the log is absent or there is nothing
 * new to link. Only fills fields that are still empty so a newer explicit
 * value from the task terminal is never clobbered.
 *
 * Returns true when any field was actually filled, so the caller can persist
 * the recovery to SQLite (mark the session dirty) — without that, the next
 * reload re-backfills the same stale rows and a later save can overwrite the
 * recovery with stale data.
 *
 * Never throws: a backfill failure must not block session loading.
 */
export async function backfillGeneratedImages(session: SessionData): Promise<boolean> {
  try {
    if (!isTauri()) return false;
    const root = mediaRootFor(session);
    if (!root) return false;

    let changed = false;
    for (const pipe of session.pipes) {
      if (!Array.isArray(pipe.keyframes) && !Array.isArray(pipe.subjectReferences)) continue;
      const logPath = `${root}\\${pipe.id}\\images\\log.jsonl`;
      const text = await readMediaText(logPath);
      if (!text) continue;

      // Latest entry per refId wins.
      const latest = new Map<string, LogEntry>();
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry: LogEntry;
        try {
          entry = JSON.parse(trimmed) as LogEntry;
        } catch {
          continue;
        }
        if (!entry.refId || !entry.localPath) continue;
        const prev = latest.get(entry.refId);
        if (!prev || (entry.ts ?? 0) >= (prev.ts ?? 0)) latest.set(entry.refId, entry);
      }
      if (latest.size === 0) continue;

      for (const [refId, entry] of latest) {
        // Keyframe refId in the log is the slotIndex (registry ordinal).
        const kf = pipe.keyframes?.find((k) => String(k.slotIndex) === refId);
        if (
          kf &&
          (!kf.previewLocalPath || !kf.previewRemoteUrl) &&
          kf.previewLocalPath !== entry.localPath
        ) {
          kf.previewLocalPath = entry.localPath;
          if (entry.remoteUrl && !kf.previewRemoteUrl) kf.previewRemoteUrl = entry.remoteUrl;
          changed = true;
        }
        const sr = (pipe.subjectReferences ?? []).find((s) => s.id === refId);
        if (
          sr &&
          (!sr.previewLocalPath || !sr.previewRemoteUrl) &&
          sr.previewLocalPath !== entry.localPath
        ) {
          sr.previewLocalPath = entry.localPath;
          if (entry.remoteUrl && !sr.previewRemoteUrl) sr.previewRemoteUrl = entry.remoteUrl;
          changed = true;
        }
      }
    }
    return changed;
  } catch (e) {
    // A backfill failure must never block session loading — log and continue.
    console.warn('[generatedImageBackfill] backfill failed (non-fatal):', e);
    return false;
  }
}
