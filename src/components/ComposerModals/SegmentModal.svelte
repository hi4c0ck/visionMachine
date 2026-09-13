<script lang="ts">
	import { snapTo8 } from '$lib/frameMath';
	import type { FreeGap } from '$lib/frameMath';

	let {
		startFrame,
		endFrame,
		totalFrames,
		/** Free gaps a new zone may be placed into (before/between/after zones). */
		gaps = [],
		open = $bindable(false),
		onConfirm,
	} = $props<{
		startFrame: number;
		endFrame: number;
		totalFrames: number;
		gaps?: FreeGap[];
		open: boolean;
		onConfirm: (start: number, end: number) => void;
	}>();

	import '../composer-modal.css';

	let segStart = $state(0);
	let segEnd = $state(8);

	// Which gap the user is targeting; picking one re-seeds the inputs.
	let selectedGap = $state<number>(0);

	// Seed the inputs and the gap selection when the modal opens
	$effect(() => {
		if (!open) return;
		segStart = startFrame;
		segEnd = endFrame;
		selectedGap = gaps.findIndex(
			(g: FreeGap) => g.start === startFrame || (g.start <= startFrame && startFrame < g.end)
		);
		if (selectedGap < 0) selectedGap = 0;
	});

	function pickGap(i: number) {
		selectedGap = i;
		const g = gaps[i];
		if (g) {
			segStart = g.start;
			// Default end to the maximum available in the gap (fills the free
			// space); the user can shrink it via the start/end fields.
			segEnd = g.end;
		}
	}

	function confirm() {
		const start = snapTo8(segStart);
		const end = Math.min(snapTo8(segEnd), totalFrames - 1);
		if (end <= start) return;
		onConfirm(start, end);
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => open = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Add Segment</h3>
			</div>
			<div class="modal-body">
				{#if gaps.length > 0}
					<div class="modal-field">
						<label id="seg-gap-label">Place in free space</label>
						<div class="gap-picker">
							{#each gaps as g, i (i)}
								<button
									class="gap-chip"
									class:active={selectedGap === i}
									onclick={() => pickGap(i)}
									title="Frames {g.start}–{g.end}">
									<span class="gap-label">{g.label}</span>
									<span class="gap-range">{g.start}–{g.end}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				<div class="modal-field">
					<label id="seg-start-label">Start Frame</label>
					<input type="number" bind:value={segStart} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="seg-start-label" />
				</div>
				<div class="modal-field">
					<label id="seg-end-label">End Frame</label>
					<input type="number" bind:value={segEnd} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="seg-end-label" />
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={Math.min(snapTo8(segEnd), totalFrames - 1) <= snapTo8(segStart)}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.gap-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.gap-chip {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		padding: 6px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.gap-chip:hover {
		border-color: var(--accent-color);
		color: var(--accent-color);
	}
	.gap-chip.active {
		background: var(--accent-bg);
		border-color: var(--accent-color);
		color: var(--accent-color);
	}
	.gap-label {
		font-weight: 600;
	}
	.gap-range {
		font-size: 10px;
		opacity: 0.7;
	}
</style>
