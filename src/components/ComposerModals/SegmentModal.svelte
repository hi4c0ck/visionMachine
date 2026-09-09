<script lang="ts">
	import { snapTo8 } from '$lib/frameMath';

	let {
		startFrame,
		endFrame,
		totalFrames,
		open = $bindable(false),
		onConfirm,
	} = $props<{
		startFrame: number;
		endFrame: number;
		totalFrames: number;
		open: boolean;
		onConfirm: (start: number, end: number) => void;
	}>();

	import '../composer-modal.css';

	let segStart = $state(0);
	let segEnd = $state(8);

	// Seed input values from panel-provided start/end when the modal opens
	$effect(() => {
		if (!open) return;
		segStart = startFrame;
		segEnd = endFrame;
	});

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
