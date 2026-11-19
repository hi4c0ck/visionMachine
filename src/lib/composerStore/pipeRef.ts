// Pipe-reference bridge (bug batch nov19, items 1+4).
//
// The composer store keeps plain (non-$state) objects; the Workspace
// revision bridge returns a fresh SHALLOW session shell but shares the
// pipes array + pipe objects by reference (the anti-heap-ratchet design).
// Svelte 5 user deriveds use strict === equality: a stable pipes array
// reference never bumps the derived's write version, so the keyed each in
// ComposerPanel never reconciles and pipe-subtree effects (KeyframesRow
// thumbnails, ToolsPanel last-video preview, status dots) never re-run
// after an in-place store mutation — previews froze after generation
// terminal / keyframe confirm.
//
// Fix: after every successful mutation (notifyUpdate, the store's single
// mutation trigger) replace the pipes array with a new array of shallow
// pipe shells. Nested data (keyframes/refs/elements arrays) stays shared —
// one shallow copy per pipe, no deep clone, no whole-project rebuild, so
// the single-producer / one-copy-at-a-time invariant holds. Untouched
// pipes' NESTED references are stable; only the pipe-level shell changes,
// which is exactly what the keyed each + child prop equality need to
// propagate. Array-level ops (add/remove/move/duplicate) are covered by
// the same uniform touch.

import type { SessionData } from '$types';

/**
 * Replace the session's pipes array with shallow copies of the pipe rows.
 * Call AFTER all writes to the pipes are done (the old held references are
 * detached by design — re-read `session.pipes` to observe the mutation).
 * A no-op session (no pipes) still gets a fresh array so add-pipe propagates.
 */
export function touchPipeShells(session: SessionData): void {
  session.pipes = session.pipes.map((p) => ({ ...p }));
}