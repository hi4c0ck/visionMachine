<script lang="ts">
	// Presentational horizontal shot-strip that "builds" in with a stagger.
	// Consumes the flat S4-verified timeline rows (engine.ts#timelineRows)
	// and renders one cell per shot: id + a 2-word label + a transition glyph.
	// The parent only mounts this after a run, so zero rows renders nothing.

	// Shape mirrors the return type of engine.timelineRows().
	type Row = {
		shot_id: string;
		subject: string;
		concern: string;
		from_s: number;
		to_s: number;
		transition_out: string;
		frames: number;
	};

	let {
		rows,
		active,
		onPickShot = () => {},
	}: {
		rows: Row[];
		/** engine-present flag — parent only shows this after a run. */
		active: boolean;
		/** Optional cell-click callback (e.g. scroll to the S3 sheet). */
		onPickShot?: (shotId: string) => void;
	} = $props();

	/** Truncate to ~2 words for the cell label; fall back subject -> concern. */
	function label(r: Row): string {
		const src = r.subject.trim() || r.concern.trim() || r.shot_id;
		const words = src.split(/\s+/).filter(Boolean);
		return words.length > 2 ? words.slice(0, 2).join(' ') + '…' : words.join(' ');
	}

	/** Map a transition_out token to its display glyph. */
	function glyph(t: string): string {
		switch (t) {
			case 'hard_cut':
				return '↯';
			case 'crossfade':
			case 'dissolve':
				return '~';
			case 'match_cut':
			case 'wipe':
				return '◇';
			default:
				return '|';
		}
	}

	const visible = $derived(active && rows.length > 0 ? rows : []);
</script>

{#if visible.length > 0}
	<div class="timeline-strip" role="list" aria-label="Shot timeline preview">
		{#each visible as r, i}
			<button
				class="tl-cell"
				style="--i: {i}"
				role="listitem"
				onclick={() => onPickShot(r.shot_id)}
				aria-label="{r.shot_id}: {label(r)}"
				title="{r.shot_id} · {label(r)} · {r.transition_out}">
				<code class="tl-id">{r.shot_id}</code>
				<span class="tl-label">{label(r)}</span>
				<span class="tl-glyph" aria-hidden="true">{glyph(r.transition_out)}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	/* Template-A hairline: quiet horizontal strip; cells build in with a
	   fade/slide-up stagger driven by the per-cell --i custom property. */

	.timeline-strip {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 4px 2px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-elevated);
	}

	.tl-cell {
		flex: 0 0 auto;
		min-width: 96px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 6px 8px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font: inherit;
		font-size: 11px;
		cursor: pointer;
		opacity: 0;
		transform: translateY(4px);
		animation: tl-build 0.32s ease-out forwards;
		transition: border-color var(--transition-fast, 0.15s ease),
			background var(--transition-fast, 0.15s ease);
	}
	.tl-cell:hover {
		border-color: var(--accent-color);
	}
	.tl-cell:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--accent-bg, rgba(89, 181, 255, 0.35));
	}

	/* Staggered entrance: each cell's delay is its own --i (set inline) × 40ms.
	   `forwards` keeps the final visible state after the animation ends. */
	@keyframes tl-build {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.tl-id {
		font-family: var(--font-mono, monospace);
		color: var(--accent-color, var(--text-secondary));
		font-size: 10px;
		letter-spacing: 0.02em;
	}

	.tl-label {
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 120px;
	}

	.tl-glyph {
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1;
	}

	/* Reduced motion: drop the stagger + slide, show cells statically. */
	@media (prefers-reduced-motion: reduce) {
		.tl-cell {
			opacity: 1;
			transform: none;
			animation: none;
		}
	}
</style>
