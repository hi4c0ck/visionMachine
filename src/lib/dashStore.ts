// Live dashboard reporter (frontend → backend).
//
// The backend serves a live dashboard (src-tauri/src/dashboard.rs) that reads
// its OWN structures directly (generation tasks, groups, the per-stage memory
// ring). But the module-level Maps that outlive the {#key} remount live only
// in the JS heap, so this module pushes their sizes (plus the frame-pipeline
// ledger + main-thread stall meter + JS heap) to `report_renderer_metrics`
// and a compact line to `log_dashboard_line`. No-op in the browser.
//
// The caller (RamMonitor) drives this on its 8s tick, so the report rides
// existing work — it adds one invoke per tick, never a new timer.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { getPipelineSnapshot } from './pipelineDiag';
import { getStallSnapshot, updateFreezeSnapshot } from './stallWatch';
import { sessions, unsynced } from './composerStore';
import { runStatesSize } from './directorStore';

/**
 * Sizes of the two WORKSPACE-LOCAL structures that persist for the app
 * lifetime (Workspace is the root component — it never remounts, only the
 * composer-area `{#key}` does). Updated by handleSessionSelect so the
 * dashboard shows truthful values.
 */
let dashExtra = { lastPreview: 0, projectsFiles: 0 };
export function setDashExtra(lastPreview: number, projectsFiles: number): void {
	dashExtra.lastPreview = lastPreview;
	dashExtra.projectsFiles = projectsFiles;
}

export interface DashSnapshot {
	timestamp_ms: number;
	sessions_size: number;
	unsynced_size: number;
	run_states_size: number;
	flows_loaded_size: number;
	last_preview_size: number;
	projects_files_size: number;
	heap_used_bytes: number | null;
	pipeline: unknown;
	stall: unknown;
}

/** Read the renderer's structure sizes + JS heap. Pure — no side effects. */
export function buildDashSnapshot(): DashSnapshot {
	let heap: number | null = null;
	const perf = (globalThis as any).performance as
		| { memory?: { usedJSHeapSize?: number } }
		| undefined;
	if (perf?.memory?.usedJSHeapSize != null) {
		heap = perf.memory.usedJSHeapSize;
	}
	return {
		timestamp_ms: Date.now(),
		sessions_size: sessions.size,
		unsynced_size: unsynced.size,
		run_states_size: runStatesSize(),
		// The flows-loaded latch is per-DirectorPanel-instance (<script>
		// scope), so it is NOT a cross-remount leak; reported as 0 here.
		flows_loaded_size: 0,
		last_preview_size: dashExtra.lastPreview,
		projects_files_size: dashExtra.projectsFiles,
		heap_used_bytes: heap,
		pipeline: getPipelineSnapshot(),
		stall: getStallSnapshot(),
	};
}

/** Push the snapshot to the live dashboard. No-op in the browser; a failed
 *  invoke (dashboard down / pre-migration) is swallowed — this is diagnostic
 *  side-channel, never on the critical path. */
export function reportToDashboard(): void {
	if (!isTauri()) return;
	const snap = buildDashSnapshot();
	void invoke('report_renderer_metrics', { input: snap }).catch(() => {});
	// Refresh the freeze-detecting worker's held snapshot with the SAME data.
	// When a freeze happens the main thread's tick stops — but the worker
	// persists the LAST snapshot it was given into the freeze record, so the
	// record answers "which structure was big at the freeze onset" without
	// the main thread (which is, by definition, pinned).
	updateFreezeSnapshot(snap);
	// Also feed the dashboard's log ring with the compact pipeline line so a
	// hung main thread that stops the 8s tick still leaves its last state
	// visible in the feed (the backend log file keeps rotating; this does not).
	void invoke('log_dashboard_line', {
		message: `[RENDER] sessions ${snap.sessions_size} · unsynced ${snap.unsynced_size} · runStates ${snap.run_states_size} · lastPreview ${snap.last_preview_size} · projFiles ${snap.projects_files_size} · heap ${
			snap.heap_used_bytes != null ? Math.round(snap.heap_used_bytes / 1048576) + 'MB' : '?'
		}`,
	}).catch(() => {});
}
