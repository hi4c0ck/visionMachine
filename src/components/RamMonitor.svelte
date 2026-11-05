<script lang="ts">
	// In-app RAM monitor chip — the "affordable" way for a normal user to
	// watch memory: no console, no external tooling. It shows BOTH pools
	// (renderer JS heap + backend process RSS) because a Tauri app is two
	// processes, and flags "growing" when either pool has climbed well past
	// its observed baseline (the signature of the leak class, not steady
	// work). Polls every 8 s; each read is a handful of syscalls + one
	// invoke, so the chip itself adds no meaningful CPU / main-thread load.
	import { invoke, isTauri } from '@tauri-apps/api/core';
	import { pollMemoryProbe, type MemoryProbeView } from '$lib/memWatch';
	import { initStallWatch, getStallSnapshot, consumeFreezeRecord, markFreezeRecordFlushed, type StallSnapshot } from '$lib/stallWatch';
	import { getPipelineSnapshot, flushPipelineDiag, noteHeapSample, heapTrendMb, type PipelineSnapshot } from '$lib/pipelineDiag';
	import { reportToDashboard } from '$lib/dashStore';

	const mb = (b: number): string => (b > 0 ? `${Math.round(b / 1024 / 1024)} MB` : '—');

	let view = $state<MemoryProbeView | null>(null);
	// Main-thread stall meter (longtask) + freeze watchdog. Read on the same
	// 8s tick; a big `longtask_max_ms` or a `stall Ns` flag is the in-app
	// proof of a pinned renderer without a debugger or PowerShell.
	let stalls = $state<StallSnapshot>(getStallSnapshot());
	// Frame-pipeline ledger (the leak discriminator). `clonesOutstanding`
	// = created − closed ImageBitmap clones: a count that climbs without
	// bound while `frameCalls` is high is the texture-leak signature.
	let pipe = $state<PipelineSnapshot>(getPipelineSnapshot());
	// The baseline is the first *settled* reading (post-poll), not 0 — so a
	// fresh app start reads "flat", not "growing".
	let baseline = $state<{ renderer: number; backend: number } | null>(null);

	const GROW_MB = 60; // a pool is "growing" when it is GROW_MB past baseline

	const rendererUp = $derived(!!view && !!baseline && view.renderer_heap_bytes - baseline.renderer >= GROW_MB * 1024 * 1024);
	const backendUp = $derived(!!view && !!baseline && view.backend_rss_bytes - baseline.backend >= GROW_MB * 1024 * 1024);
	// The stall flag: any longtask in the current window above 500 ms.
	const stallFlag = $derived(stalls.longtask_max_ms >= 500 && stalls.longtask_count > 0);
	const stallLabel = $derived(
		`${stalls.longtask_count} longtask stall(s), max ${Math.round(stalls.longtask_max_ms / 1000)}s since last session-select reset`,
	);
	// Leak flags from the pipeline ledger:
	//  - outstanding clones > 128 = un-closed bitmap buildup (the primary leak)
	//  - active sources > 1 = undisposed FrameSource churn
	const leakClones = $derived(pipe.clonesOutstanding > 128);
	const leakSources = $derived(pipe.sourcesActive > 1);
	const leakFlag = $derived(leakClones || leakSources);
	const leakLabel = $derived(
		`clones ${pipe.clonesCreated}c/${pipe.clonesClosed}x=${pipe.clonesOutstanding}outstanding · ` +
			`sources ${pipe.sourcesCreated}c/${pipe.sourcesActive}a · ` +
			`LRU ${pipe.lruEvictions}ev · inflightPeak ${pipe.inflightPeak} · outQPeak ${pipe.outputQueuePeak}`,
	);

	// Flush a freeze record from a PREVIOUS (possibly force-closed) run: the
	// worker watchdog persists "frozen since T" to localStorage the moment it
	// detects a block, so a run that froze and got killed still leaves its
	// record on disk. Hand it to the BACKEND log (log_stall_report) on the
	// next healthy moment — VisionMachine.log is readable without devtools —
	// then mark it flushed so it is not reported twice.
	$effect(() => {
		const rec = consumeFreezeRecord();
		if (rec && !rec.flushed) {
			const snap = getStallSnapshot();
			const recovered = rec.ended_at > 0 && rec.started_at > 0;
			const sec = recovered ? Math.round((rec.ended_at - rec.started_at) / 1000) : 0;
			console.warn(
				`[stallWatch] previous run: main thread was blocked ~${recovered ? sec : '?'}s ` +
					`(frozen ${new Date(rec.started_at).toLocaleTimeString()}, ` +
					`${rec.ended_at > 0 ? 'recovered' : 'never recovered — app was likely force-closed'}). ` +
					`Recovery stack:\n${(rec.recovery_stack || '(no stack captured)').split('\n').slice(0, 10).join('\n')}`,
			);
			if (isTauri()) {
				void invoke('log_stall_report', {
					input: {
						startedAt: rec.started_at,
						endedAt: rec.ended_at,
						recoveryStack: rec.recovery_stack,
						longtaskCount: snap.longtask_count,
						longtaskMaxMs: snap.longtask_max_ms,
						context: rec.context,
					},
				})
					.then(() => markFreezeRecordFlushed())
					.catch(() => markFreezeRecordFlushed());
			} else {
				markFreezeRecordFlushed();
			}
		}
	});

	async function tick() {
		const v = await pollMemoryProbe();
		view = v;
		stalls = getStallSnapshot();
		pipe = getPipelineSnapshot();
		// Record the renderer-heap sample so the pipeline flush line carries
		// the growth TREND (baseline → last → delta) — the "eats in a loop"
		// signal is a monotonic rise, not a spike.
		noteHeapSample(v.renderer_heap_bytes);
		const heap = heapTrendMb();
		const extra =
			heap.baseline > 0
				? `heap ${heap.baseline}→${heap.last}MB (Δ${heap.delta >= 0 ? '+' : ''}${heap.delta}MB)`
				: '';
		// Throttled (15s, on-change) flush of the pipeline ledger + heap trend
		// to the backend log — the leak signature is diagnosable from
		// VisionMachine.log without devtools.
		flushPipelineDiag(extra);
		// Push the renderer's structure sizes + pipeline + stall + JS heap to
		// the live dashboard (backend-served). Rides this same 8s tick, so it
		// adds no timer. No-op in the browser.
		reportToDashboard();
		if (!baseline && v.renderer_heap_bytes > 0 || (baseline === null && v.backend_rss_bytes > 0)) {
			baseline = { renderer: v.renderer_heap_bytes, backend: v.backend_rss_bytes };
		}
	}

	// Poll on a timer + immediately on mount. The interval is torn down on
	// destroy so the chip is not itself a listener leak (the exact bug
	// class it exists to surface).
	$effect(() => {
		initStallWatch(); // start the longtask observer + worker freeze watchdog (idempotent)
		void tick();
		const id = setInterval(() => void tick(), 8000);
		return () => clearInterval(id);
	});

	// A short, human label for the chip.
	const statusWord = $derived(view ? (rendererUp || backendUp ? 'growing' : leakFlag ? 'leak' : stallFlag ? 'stall' : 'stable') : '…');
	const title = $derived(
		[
			`renderer JS heap: ${mb(view?.renderer_heap_bytes ?? 0)}`,
			`backend RSS: ${mb(view?.backend_rss_bytes ?? 0)}`,
			`pipeline: ${leakLabel}`,
			stalls.supported
				? `main-thread stalls: ${stalls.longtask_count} · max ${Math.round(stalls.longtask_max_ms / 1000)}s · total ${Math.round(stalls.longtask_total_ms / 1000)}s (since last reset)`
				: '(longtask meter not supported in this browser)',
			view?.active_tasks ? `${view.active_tasks} generation task(s) active` : 'no generation running',
			view?.ring_summary ? view.ring_summary : '(no stage samples yet — run a generation to attribute RAM per step)',
		].join('\n'),
	);
</script>

<span class="ram-chip {rendererUp || backendUp || stallFlag || leakFlag ? 'is-up' : ''}" role="status" aria-label="memory monitor" title={title}>
	<span class="ram-dot" class:ram-dot-up={rendererUp || backendUp} class:ram-dot-stall={stallFlag || leakFlag} aria-hidden="true"></span>
	<code class="ram-val" title={title}>
		<span class="ram-pool {rendererUp ? 'is-up' : ''}" title="renderer JS heap (msedgewebview2.exe)">ui {mb(view?.renderer_heap_bytes ?? 0)}</span>
		<span class="ram-sep">·</span>
		<span class="ram-pool {backendUp ? 'is-up' : ''}" title="backend process RSS (vision-machine.exe)">cpu {mb(view?.backend_rss_bytes ?? 0)}</span>
		{#if view && view.active_tasks > 0}
			<span class="ram-sep">·</span>
			<span class="ram-tasks">{view.active_tasks} gen</span>
		{/if}
		{#if stallFlag}
			<span class="ram-sep">·</span>
			<span class="ram-stall" title={stallLabel}>stall {Math.round(stalls.longtask_max_ms / 1000)}s</span>
		{/if}
		{#if leakFlag}
			<span class="ram-sep">·</span>
			<span class="ram-leak" title={leakLabel}>leak {pipe.clonesOutstanding}</span>
		{/if}
	</code>
</span>

<style>
	/* Template-A hairline chip: quiet monospace, no new color families.
	   The two "pools" read like the two processes; an up-state tints the
	   pool amber (the theme's warning token) so growth is visible at a
	   glance without a console. */
	.ram-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10px;
		letter-spacing: 0.02em;
		color: var(--text-muted);
		padding: 2px 7px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-elevated);
		white-space: nowrap;
	}
	.ram-chip.is-up {
		border-color: color-mix(in srgb, var(--warning-color, #e0a34e) 45%, var(--border-color));
	}
	.ram-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--success-color, #22c55e);
		opacity: 0.75;
		flex-shrink: 0;
	}
	.ram-dot.is-up,
	.ram-dot-up {
		background: var(--warning-color, #e0a34e);
	}
	.ram-dot-stall {
		background: var(--error-color, #ef4444);
	}
	.ram-val {
		font-family: var(--font-mono, monospace);
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.ram-pool {
		color: var(--text-secondary);
	}
	.ram-pool.is-up {
		color: var(--warning-color, #e0a34e);
		font-weight: 600;
	}
	.ram-sep {
		color: var(--text-muted);
		opacity: 0.6;
	}
	.ram-tasks {
		color: var(--accent-color, var(--text-secondary));
	}
	.ram-stall {
		color: var(--error-color, #ef4444);
		font-weight: 600;
	}
	.ram-leak {
		color: var(--error-color, #ef4444);
		font-weight: 600;
	}

	/* Reduced motion: the chip is static anyway; this just guards a future
	   pulse on the dot. */
	@media (prefers-reduced-motion: reduce) {
		.ram-dot {
			transition: none;
		}
	}
</style>
