<script lang="ts">
	// Presentational auto-scrolling monospace run log.
	// The parent (DirectorHotPath) owns the subscription via onRunProgress
	// and passes accumulated lines + a running flag. This component is
	// dumb: it only reads props.

	type LogLine = { phase: string; detail: string; ms: number } | null;

	let {
		lines,
		running,
	}: {
		lines: LogLine[];
		running: boolean;
	} = $props();

	// DOM ref for the auto-scroll container. A plain `let` (not `$state`):
	// `bind:this` must reassign it, and the ref itself never needs to be
	// reactive — only the rendered list (from `lines`) does.
	let scrollRef: HTMLDivElement | null = null;

	// Defensive cap: render at most the last 150 lines.
	const visible = $derived(lines.slice(-150));

	// Auto-scroll: keep the newest line in view when the list grows.
	$effect(() => {
		if (scrollRef && lines.length > 0) {
			scrollRef.scrollTop = scrollRef.scrollHeight;
		}
	});
</script>

<div class="run-log" bind:this={scrollRef}>
	{#if visible.length === 0 && !running}
		<p class="rl-empty">watching the director think…</p>
	{:else}
		{#each visible as line, i}
			{#if line}
				<div class="rl-line" aria-label="{line.phase}: {line.detail}">
					<code class="rl-phase">[{line.phase}]</code>
					<span class="rl-detail">{line.detail}</span>
					<span class="rl-ms">({line.ms}ms)</span>
				</div>
			{/if}
		{/each}
	{/if}

	{#if running}
		<div class="rl-spinner" aria-label="running">
			<span class="rl-spinner-dot"></span>
			<span class="rl-spinner-text">running…</span>
		</div>
	{/if}
</div>

<style>
	/* Template-A hairline: quiet monospace strip, no shadows, no new color families. */

	.run-log {
		max-height: 15rem; /* ~150 lines × ~10.5px line-height, capped */
		overflow-y: auto;
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		line-height: 1.4;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 6px 8px;
		background: var(--bg-elevated);
	}

	.rl-empty {
		color: var(--text-muted);
		font-style: italic;
		margin: 2px 0;
	}

	.rl-line {
		display: flex;
		gap: 6px;
		align-items: baseline;
		padding: 1px 0;
	}

	.rl-phase {
		color: var(--accent-color, var(--text-secondary));
		white-space: nowrap;
		min-width: 6.5rem;
	}

	.rl-detail {
		color: var(--text-primary);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rl-ms {
		color: var(--text-muted);
		white-space: nowrap;
	}

	/* Thin accent spinner row (visible only when running) */
	.rl-spinner {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-top: 4px;
		margin-top: 4px;
		border-top: 1px solid var(--border-color);
		color: var(--accent-color, var(--text-secondary));
	}

	.rl-spinner-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-color, var(--text-secondary));
		animation: rl-pulse 1s ease-in-out infinite;
	}

	.rl-spinner-text {
		font-size: 10px;
		letter-spacing: 0.03em;
	}

	@keyframes rl-pulse {
		0%, 100% { opacity: 0.3; transform: scale(0.85); }
		50%      { opacity: 1;   transform: scale(1); }
	}

	/* Reduced motion: stop the pulse, keep the dot static */
	@media (prefers-reduced-motion: reduce) {
		.rl-spinner-dot {
			animation: none;
			opacity: 1;
			transform: none;
		}
	}
</style>
