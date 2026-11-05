<script lang="ts">
	// In-app RAM monitor chip — the "affordable" way for a normal user to
	// watch memory: no console, no external tooling. It shows BOTH pools
	// (renderer JS heap + backend process RSS) because a Tauri app is two
	// processes, and flags "growing" when either pool has climbed well past
	// its observed baseline (the signature of the leak class, not steady
	// work). Polls every 8 s; each read is a handful of syscalls + one
	// invoke, so the chip itself adds no meaningful CPU / main-thread load.
	import { pollMemoryProbe, type MemoryProbeView } from '$lib/memWatch';

	const mb = (b: number): string => (b > 0 ? `${Math.round(b / 1024 / 1024)} MB` : '—');

	let view = $state<MemoryProbeView | null>(null);
	// The baseline is the first *settled* reading (post-poll), not 0 — so a
	// fresh app start reads "flat", not "growing".
	let baseline = $state<{ renderer: number; backend: number } | null>(null);

	const GROW_MB = 60; // a pool is "growing" when it is GROW_MB past baseline

	const rendererUp = $derived(!!view && !!baseline && view.renderer_heap_bytes - baseline.renderer >= GROW_MB * 1024 * 1024);
	const backendUp = $derived(!!view && !!baseline && view.backend_rss_bytes - baseline.backend >= GROW_MB * 1024 * 1024);
	const flat = $derived(!rendererUp && !backendUp && !!view);

	async function tick() {
		const v = await pollMemoryProbe();
		view = v;
		if (!baseline && v.renderer_heap_bytes > 0 || (baseline === null && v.backend_rss_bytes > 0)) {
			baseline = { renderer: v.renderer_heap_bytes, backend: v.backend_rss_bytes };
		}
	}

	// Poll on a timer + immediately on mount. The interval is torn down on
	// destroy so the chip is not itself a listener leak (the exact bug
	// class it exists to surface).
	$effect(() => {
		void tick();
		const id = setInterval(() => void tick(), 8000);
		return () => clearInterval(id);
	});

	// A short, human label for the chip.
	const statusWord = $derived(view ? (rendererUp || backendUp ? 'growing' : 'stable') : '…');
	const title = $derived(
		[
			`renderer JS heap: ${mb(view?.renderer_heap_bytes ?? 0)}`,
			`backend RSS: ${mb(view?.backend_rss_bytes ?? 0)}`,
			view?.active_tasks ? `${view.active_tasks} generation task(s) active` : 'no generation running',
			view?.ring_summary ? view.ring_summary : '(no stage samples yet — run a generation to attribute RAM per step)',
		].join('\n'),
	);
</script>

<span class="ram-chip {rendererUp || backendUp ? 'is-up' : ''}" role="status" aria-label="memory monitor" title={title}>
	<span class="ram-dot" class:ram-dot-up={rendererUp || backendUp} aria-hidden="true"></span>
	<code class="ram-val" title={title}>
		<span class="ram-pool {rendererUp ? 'is-up' : ''}" title="renderer JS heap (msedgewebview2.exe)">ui {mb(view?.renderer_heap_bytes ?? 0)}</span>
		<span class="ram-sep">·</span>
		<span class="ram-pool {backendUp ? 'is-up' : ''}" title="backend process RSS (vision-machine.exe)">cpu {mb(view?.backend_rss_bytes ?? 0)}</span>
		{#if view && view.active_tasks > 0}
			<span class="ram-sep">·</span>
			<span class="ram-tasks">{view.active_tasks} gen</span>
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

	/* Reduced motion: the chip is static anyway; this just guards a future
	   pulse on the dot. */
	@media (prefers-reduced-motion: reduce) {
		.ram-dot {
			transition: none;
		}
	}
</style>
