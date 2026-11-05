// src/lib/directorStore/runProgress.ts
//
// Push-side subscription for the Director S0→S5 run pipeline.
// The Rust backend emits `director_run_progress` window events (one per
// phase transition); this module wraps Tauri's `listen()` so the UI can
// accumulate log lines and rebuild the "watch it think" progress strip.
//
// Safe in tests / non-Tauri: returns a no-op unsubscriber when
// `isTauri()` is false OR `listen` is unavailable. This module never
// throws to the caller.

import { isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * A single run-phase event emitted by the Director S0→S5 pipeline.
 * The backend (Rust state machine) fires one event per phase transition.
 */
export interface RunProgressEvent {
	/** Phase name — see `PHASE_ORDER` for the canonical set. */
	phase: string;
	/** Human-readable detail (e.g. "novel expanded via llm"). */
	detail: string;
	/** Wall-clock ms when this event was emitted. */
	ms: number;
}

/** Stable display order the UI can align log rows to. */
export const PHASE_ORDER = ['intent', 'expand', 'structure', 'critic', 'lower', 'verify'];

/**
 * Subscribe to `director_run_progress` events.
 *
 * Returns a **synchronous** unsubscriber. In non-Tauri environments or
 * when `listen` is not yet available, a no-op unsubscriber is returned.
 * This function never throws to the caller.
 *
 * Usage inside a Svelte 5 `$effect`:
 * ```ts
 * $effect(() => {
 *   const unsub = onRunProgress((e) => {
 *     logLines = [...logLines, e].slice(-40);
 *   });
 *   return unsub;
 * });
 * ```
 */
export function onRunProgress(cb: (e: RunProgressEvent) => void): () => void {
	try {
		if (!isTauri()) return () => {};
		// `listen` resolves ASYNCHRONOUSLY, but this unsubscriber is synchronous
		// (a Svelte `$effect` teardown may run before the promise settles). Track
		// disposal so a late-resolving listener is removed immediately instead of
		// leaking: each unremoved `director_run_progress` listener holds the
		// component closure (and its render tree) in memory, so a per-mount leak
		// compounds into the unbounded RAM growth seen after repeated Director
		// visits. `disposed` closes that race; `unlisten` handles the resolved case.
		let disposed = false;
		let unlisten: UnlistenFn | null = null;
		listen<RunProgressEvent>('director_run_progress', ({ payload }) => cb(payload))
			.then((u) => {
				if (disposed) {
					// Teardown already ran before the listener registered —
					// remove it now so it doesn't outlive the component.
					u();
					return;
				}
				unlisten = u;
			})
			.catch(() => {
				/* silently swallow — UI degrades to no events, which is fine */
			});
		return () => {
			disposed = true;
			if (unlisten) {
				unlisten();
				unlisten = null;
			}
		};
	} catch {
		// `isTauri` or `listen` itself threw synchronously — no-op is the safest fallback.
		return () => {};
	}
}
