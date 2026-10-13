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
