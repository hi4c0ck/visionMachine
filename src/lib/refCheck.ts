// Reference accessibility check (decision D5).
// Collects the remote URLs a pipe references and verifies reachability.
// Runs on generation Confirm (gate) and when a single reference is
// re-validated after an edit. Local (non-http) paths are skipped for now.

import type { PipeRow } from '$types';

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
export function collectRemoteUrls(pipe: PipeRow, videoMedia?: { sharedArray?: boolean }): RefUrlTarget[] {
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
  // Subjects only matter when the model actually consumes them:
  //  - sharedArray: subjects merge into the keyframe image array
  //  - reference mode: subjects are the primary input
  // In plain keyframes mode, subjects are inert — skip them.
  const mode = pipe.mediaMode ?? 'keyframes';
  if (videoMedia?.sharedArray || mode === 'reference') {
    for (const sr of pipe.subjectReferences ?? []) {
      const ty = sr.type ?? 'url';
      if (ty === 'url' || ty === 'img2img') push('subject', sr.id, sr.imageUrl);
    }
  }
  return out;
}

/** Fetch-check every remote target; returns the ones that are unreachable. */
export async function checkRemoteUrls(targets: RefUrlTarget[], timeoutMs = 5000): Promise<RefUrlTarget[]> {
  const remote = targets.filter((t) => isRemoteUrl(t.url));
  const broken: RefUrlTarget[] = [];
  await Promise.all(
    remote.map(async (t) => {
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(t.url, { method: 'GET', signal: ctrl.signal });
        window.clearTimeout(timer);
        if (!res.ok) broken.push(t);
      } catch {
        // network error, timeout abort, or CORS block → treat as broken
        broken.push(t);
      }
    }),
  );
  return broken;
}
