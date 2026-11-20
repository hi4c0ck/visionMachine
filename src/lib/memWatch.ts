// In-app RAM monitor — the "affordable" half of memory profiling.
// No console, no external tooling: the UI polls the backend's on-demand
// probe (`memory_probe`) every few seconds and shows both processes side
// by side, because a Tauri desktop app has TWO memory pools:
//
//   * renderer (msedgewebview2.exe) — the JS heap, where listener leaks
//     and heavy component re-renders grow unbounded;
//   * backend (vision-machine.exe)  — process RSS, where generation
//     stage work (provider poll, artifact streams) is attributed.
//
// A user only needs to look at one small chip to see "which side is
// growing". The backend ring summary (per-stage peak, when a generation
// ran) rides along so the chip doubles as a post-run report.

import { isTauri, invoke } from '@tauri-apps/api/core';

/** One memory-pool reading, MB-rounded by the caller. */
export interface MemoryProbeView {
	/** Backend process RSS bytes (0 when unavailable / non-Tauri). */
	backend_rss_bytes: number;
	/** Renderer JS-heap used bytes (0 when unavailable). */
	renderer_heap_bytes: number;
	/** System total memory bytes. */
	total_memory_bytes: number;
	/** System available memory bytes. */
	free_memory_bytes: number;
	/** Generation tasks currently active in the backend. */
	active_tasks: number;
	/** The per-stage ring-buffer summary line ("mem N samples · rss
	 * first X MB → peak Y MB at <stage> (Δ Z MB)") or '' when no
	 * generation has sampled yet. */
	ring_summary: string;
	/** Number of stage-attributed samples in the backend ring buffer. */
	ring_len: number;
}

/** The renderer's own JS heap. WebView2 (Chromium) exposes
 * `performance.memory`; non-Chromium / non-Tauri returns 0 (guarded —
 * this must never throw, the chip degrades to "—"). */
function rendererHeapBytes(): number {
	try {
		const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
		return mem?.usedJSHeapSize ?? 0;
	} catch {
		return 0;
	}
}

/** One probe read. Safe in the browser (no Tauri): the backend fields
 * read 0 so the chip still shows the renderer pool. */
export async function pollMemoryProbe(): Promise<MemoryProbeView> {
	const renderer = rendererHeapBytes();
	if (!isTauri()) {
		return {
			backend_rss_bytes: 0,
			renderer_heap_bytes: renderer,
			total_memory_bytes: 0,
			free_memory_bytes: 0,
			active_tasks: 0,
			ring_summary: '',
			ring_len: 0,
		};
	}
	try {
		const raw = await invoke<{
			backend: number;
			total: number;
			free: number;
			activeTasks: number;
			ringSummary: string;
			ringLen: number;
		} | {
			// The Rust side is `rename_all = "camelCase"` on the wire, but
			// keep both shapes lenient (a field rename must not crash the
			// monitor chip).
			backendRssBytes?: number;
			totalMemoryBytes?: number;
			freeMemoryBytes?: number;
			activeTasks?: number;
			ringSummary?: string;
			ringLen?: number;
		}>('memory_probe');
		const r = raw as Record<string, unknown>;
		const num = (k: string, fb = 0): number => (typeof r[k] === 'number' ? (r[k] as number) : fb);
		const str = (k: string): string => (typeof r[k] === 'string' ? (r[k] as string) : '');
		return {
			backend_rss_bytes: num('backend', num('backendRssBytes', num('process_rss_bytes', num('processRssBytes')))),
			renderer_heap_bytes: renderer,
			total_memory_bytes: num('total', num('totalMemoryBytes', num('total_memory_bytes'))),
			free_memory_bytes: num('free', num('freeMemoryBytes', num('free_memory_bytes'))),
			active_tasks: num('activeTasks', num('active_tasks')),
			ring_summary: str('ringSummary') || str('ring_summary'),
			ring_len: num('ringLen', num('ring_len')),
		};
	} catch {
		// A probe failure must never take the UI down: show renderer-only.
		return {
			backend_rss_bytes: 0,
			renderer_heap_bytes: renderer,
			total_memory_bytes: 0,
			free_memory_bytes: 0,
			active_tasks: 0,
			ring_summary: '',
			ring_len: 0,
		};
	}
}
