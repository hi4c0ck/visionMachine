// Session-video frame-space mapping (pure, unit-tested).
//
// The composed session video splices every pipe clip back-to-back in
// orderIndex order (the Rust compose core's concat order), so its global
// frame space is the SUM of the pipes' frame counts. This module is the
// inverse of that sum: a global frame belongs to the pipe whose cumulative
// range contains it, and every pipe's composer ruler offsets the global
// playhead by that pipe's start — the same walk, read two ways.
//
// Lives here (not inline in Workspace.svelte) so the global↔local frame
// math is unit-testable without the Svelte runtime.

import type { PipeRow } from '$types';

export interface SessionVideoLayout {
  /** Pipe i's first frame in the spliced timeline (0-based), aligned to
   *  `pipes` order — so `starts[pipeIdx]` is that pipe's own offset. */
  starts: number[];
  /** Session-video frame → the owning pipe's index into the `pipes` array
   *  (out-of-range clamps to the last pipe). */
  frameToPipe: (f: number) => number;
}

/**
 * Compute each pipe's spliced start + the frame→pipe mapping.
 * `pipes` is the session's array (in UI order); `orderIndex` drives the
 * concat order. Returns `null` for an empty list (no session video to map).
 */
export function computeSessionVideoLayout(pipes: PipeRow[]): SessionVideoLayout | null {
  if (pipes.length === 0) return null;
  // Walk in orderIndex (concat) order to compute each pipe's spliced
  // start, but store the result ALIGNED to the `pipes` array so
  // `starts[pipeIdx]` is that pipe's own offset for localFrameForPipe.
  const order = [...pipes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const starts = new Array<number>(pipes.length).fill(0);
  let acc = 0;
  for (const p of order) {
    starts[pipes.indexOf(p)] = acc;
    acc += p.lengthFrames ?? 0;
  }
  return {
    starts,
    frameToPipe: (f: number) => {
      // Walk once to the owning pipe; clamp above the total to the
      // last pipe so a rounding-overshoot playhead still lands.
      let remaining = f;
      for (const p of order) {
        const len = p.lengthFrames ?? 0;
        if (remaining < len || p === order[order.length - 1]) return pipes.indexOf(p);
        remaining -= len;
      }
      return pipes.length - 1;
    },
  };
}

/**
 * Clamp the global playhead into a pipe's LOCAL frame space
 * (0..lengthFrames-1). This is the value each pipe's composer ruler pin
 * shows when the spliced session video is the preview target.
 */
export function localFrameForPipe(
  layout: SessionVideoLayout,
  pipes: PipeRow[],
  pipeIdx: number,
  globalFrame: number
): number {
  const pipe = pipes[pipeIdx];
  if (!pipe) return 0;
  const start = layout.starts[pipeIdx] ?? 0;
  return Math.min(Math.max(globalFrame - start, 0), (pipe.lengthFrames ?? 0) - 1);
}

/**
 * The raw spliced start of `pipeIdx` (no clamping) — the offset a local-frame
 * write-back (ruler click / element drag) adds back to reach the GLOBAL
 * playhead. 0 in plain composer mode (no layout).
 */
export function pipeStartForPipe(layout: SessionVideoLayout | null, pipes: PipeRow[], pipeIdx: number): number {
  if (!layout) return 0;
  return layout.starts[pipeIdx] ?? 0;
}
