// Reference readiness — the status dot on keyframe / subject chips.
// Pure: no component coupling, unit-testable.
//
//  - 'ready'   (green)  — a settled asset exists: generated preview for
//                        txt2img/img2img pieces, or a valid URL for 'url'
//                        pieces (the D5 accessibility check passed).
//  - 'broken'  (red)    — 'url' piece whose URL failed the accessibility
//                        check, OR a generated piece with an error status /
//                        no settled preview.
//  - 'pending' (neutral) — txt2img/img2img with nothing generated yet.
//
// The D5 broken set is passed in pre-computed (Workspace owns the
// re-validation flow); this helper only maps ref fields + that set to a
// dot state.

import type { GenerationStatus, KeyframeType } from '$types';

export type RefDotState = 'ready' | 'broken' | 'pending';

export interface RefDotSource {
  /** Effective piece type ('url' for legacy refs without a type). */
  type: KeyframeType;
  /** User-supplied URL source: keyframe `imageSrc` / subject `imageUrl`. */
  url: string | undefined;
  /** Settled generation status (only txt2img/img2img pieces carry it). */
  status: GenerationStatus | undefined;
  /** Settled generated-preview pair — either side counts as settled. */
  previewRemoteUrl?: string;
  previewLocalPath?: string;
}

/** D5 broken-state key: `${pipeId}:${refId}`. */
export function brokenKey(pipeId: string, refId: string): string {
  return `${pipeId}:${refId}`;
}

export function refDotState(
  pipeId: string,
  refId: string,
  ref: RefDotSource,
  brokenRefs?: Set<string>,
): RefDotState {
  const t = ref.type ?? 'url';
  const isUrl = t === 'url';
  // D5 red-out always wins: a URL that failed the accessibility check is
  // broken regardless of anything else.
  if (brokenRefs?.has(brokenKey(pipeId, refId))) return 'broken';

  if (isUrl) {
    // 'url' piece: a non-empty, reachable source = ready; empty = broken
    // (the pre-checks block generation, but the dot says it plainly).
    return ref.url?.trim() ? 'ready' : 'broken';
  }

  // Generated pieces (txt2img / img2img): the settled preview pair is the
  // readiness source. An error status (task failed on this piece) is
  // broken even when a stale preview from an earlier run is still linked.
  if (ref.status === 'error') return 'broken';
  const settled =
    !!(ref.previewRemoteUrl && ref.previewRemoteUrl.trim()) ||
    !!(ref.previewLocalPath && ref.previewLocalPath.trim());
  return settled ? 'ready' : 'pending';
}
