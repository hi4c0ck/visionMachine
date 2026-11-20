// Experimental "compose pipes" boundary-trim: shared map builder.
//
// The session-video compose can drop one 8n+1 keyframe interval (the model's
// first-frame settle) off each INTERIOR pipe's clip head so the splice lands
// in stable content instead of a visible cut. The decision is:
//   - master gate `settings.experimental.composePipes` (opt-in; default off), AND
//   - a per-pipe `trimBoundary` switch (off by default; pipe 0 never offered),
// so the effective trim map is: the ON interior pipes, keyed by pipe id.
//
// This pure module is the single source of truth for that map, used by the
// manual Compose button, the session-generation start path, and (indirectly)
// the frame-space mapping, so the "first pipe is never trimmed" rule lives in
// exactly one place. Unit-tested without the Tauri runtime.

import type { PipeRow } from '$types';

/**
 * The pipes that will actually have a head-trim, as a `{ [pipeId]: true }`
 * map (the shape the backend's `trim_boundary` / `StartSessionGenerationInput`
 * expect). Empty map = classic lossless splice (the default).
 *
 * Rules:
 * - `gateOn` false → always empty (feature off, classic splice).
 * - The FIRST pipe in timeline (`orderIndex`) order is never trimmed — there
 *   is nothing before it, so trimming its head would just shorten the very
 *   start of the session video for no boundary benefit.
 * - A pipe is trimmed only when its own `trimBoundary` switch is `true`.
 */
export function buildTrimBoundaryMap(pipes: PipeRow[], gateOn: boolean): Record<string, boolean> {
  if (!gateOn || pipes.length === 0) return {};
  const order = [...pipes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const out: Record<string, boolean> = {};
  // Skip index 0 (the timeline head); trim only interior pipes that opted in.
  for (const pipe of order.slice(1)) {
    if (pipe.trimBoundary === true) out[pipe.id] = true;
  }
  return out;
}

/** True when the composed session video will be re-encoded (any clip
 *  head-trimmed), as opposed to the classic lossless back-to-back copy.
 *  Callers use this to set expectations (a trim run is slower + audio-free). */
export function trimWillReencode(map: Record<string, boolean>): boolean {
  return Object.values(map).some(Boolean);
}

// ── Item 10: SIGNED per-boundary overlap (compose-select modal) ─────────────
// The boolean head-trim above stays for the session-run auto-compose path.
// The manual compose modal offers a per-boundary slider with these stops:
// NEGATIVE cuts |v| frames off the PREVIOUS pipe's tail, POSITIVE cuts v
// frames off the NEW pipe's head, 0 = classic lossless splice. The wire map
// is keyed by the NEW pipe's id at each boundary (Rust apply_overlap).

/** The slider stops (frames). 0 is the classic splice. */
export const OVERLAP_STOPS = [-24, -16, -8, 0, 8] as const;

/** Snap an arbitrary slider value to the nearest stop (the UI uses a
 *  discrete range, but a typed/programmatic value must still be valid). */
export function snapOverlap(v: number): number {
  let best: number = OVERLAP_STOPS[0];
  for (const s of OVERLAP_STOPS) {
    if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  }
  return best;
}

/** The wire payload: only NON-ZERO boundaries ride (empty → null = the
 *  classic lossless path). Keys are pipe ids; the backend ignores a key
 *  on the first selected pipe (nothing precedes it). */
export function buildOverlapPayload(map: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(map)) {
    const snapped = snapOverlap(v);
    if (snapped !== 0) out[id] = snapped;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The top-tier master: set EVERY boundary of the selected set (in
 *  orderIndex order) to one value. Keyed by the NEW pipe at each boundary;
 *  the first selected pipe has no boundary and gets no key. */
export function setAllBoundaries(selectedPipes: PipeRow[], value: number): Record<string, number> {
  const order = [...selectedPipes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const out: Record<string, number> = {};
  for (const p of order.slice(1)) out[p.id] = snapOverlap(value);
  return out;
}

/** True when any boundary is non-zero → the compose re-encodes. */
export function overlapWillReencode(map: Record<string, number>): boolean {
  return Object.values(map).some((v) => snapOverlap(v) !== 0);
}
