// Reference accessibility check (decision D5).
// Collects the remote URLs a pipe references and verifies reachability.
// Runs on generation Confirm (gate) and when a single reference is
// re-validated after an edit. Local (non-http) paths are skipped for now.

import type { PipeRow, ModelMedia } from '$types';
import { effectiveMediaMode } from '$lib/settings';

export interface RefUrlTarget {
  refKind: 'keyframe' | 'subject';
  refId: string;
  url: string;
}

export function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Remote URLs referenced by a pipe, per the preset rules:
 *  - keyframes: url → imageSrc, img2img → referenceUrl (txt2img has none)
 *  - subjects:  url / img2img → imageUrl (txt2img has none)
 * Non-http(s) paths are skipped here (uncheckable for now — D5).
 */
export function collectRemoteUrls(pipe: PipeRow, videoMedia?: ModelMedia): RefUrlTarget[] {
  const out: RefUrlTarget[] = [];
  const push = (refKind: RefUrlTarget['refKind'], refId: string, url: string | undefined) => {
    const u = url?.trim();
    if (u && isRemoteUrl(u)) out.push({ refKind, refId, url: u });
  };
  for (const kf of pipe.keyframes ?? []) {
    const ty = kf.type ?? 'url';
    if (ty === 'url') push('keyframe', kf.id, kf.imageSrc);
    if (ty === 'img2img') push('keyframe', kf.id, kf.referenceUrl);
  }
  // Subjects matter when the model ships them: sharedArray (merge into the
  // keyframe array) or when the EFFECTIVE wire mode is reference (the
  // content-aware resolution can cross-fall a locked keyframes pipe with no
  // keyframes into reference — the D5 gate must cover those subjects).
  const eff = effectiveMediaMode(pipe, videoMedia);
  if (videoMedia?.sharedArray || eff === 'reference') {
    for (const sr of pipe.subjectReferences ?? []) {
      const ty = sr.type ?? 'url';
      if (ty === 'url' || ty === 'img2img') push('subject', sr.id, sr.imageUrl);
    }
  }
  return out;
}

/**
 * Fetch-check every remote target; returns the ones that are DEFINITIVELY
 * unreachable.
 *
 * Only a readable, non-OK HTTP response (e.g. 404/403) marks a target as
 * broken. A *thrown* fetch (CORS-opaque cross-origin media, a timeout, or a
 * plain network error) is treated as UNCHECKABLE and NOT marked broken:
 *
 *  - The app already shows the image via <img>, which loads cross-origin
 *    media fine (CORS is only needed to READ a fetch body, not to display).
 *  - In the Tauri webview, a cross-origin URL the browser can't read for CORS
 *    reasons throws exactly like a down server does — we cannot distinguish
 *    "CORS blocked the read" from "the host is unreachable" from the browser.
 *  - The authoritative reachability check is the provider engine's own HTTP
 *    client (Rust reqwest — no CORS), which runs later and reports the real
 *    error if the URL is genuinely dead.
 *
 * So: a readable HTTP error = broken (catch it early); a throw = let it
 * through to the engine instead of producing the classic "URL not accessible
 * (but it is)" false positive.
 */
export async function checkRemoteUrls(targets: RefUrlTarget[], timeoutMs = 5000): Promise<RefUrlTarget[]> {
  const remote = targets.filter((t) => isRemoteUrl(t.url));
  const broken: RefUrlTarget[] = [];
  await Promise.all(
    remote.map(async (t) => {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(t.url, { method: 'GET', signal: ctrl.signal });
      } catch {
        // CORS-opaque / timeout / network error: uncheckable from the browser
        // (the engine will fetch it authoritatively) → do NOT mark broken.
        window.clearTimeout(timer);
        return;
      }
      window.clearTimeout(timer);
      // Only a readable, definitive HTTP error counts as "not accessible".
      if (!res.ok) broken.push(t);
    }),
  );
  return broken;
}
