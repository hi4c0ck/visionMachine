<script lang="ts">
	import type { PipeRow, PipeKeyframe } from '$types';
	import { getVisibleKeyframeSlots } from '$lib/keyframeSlots';
	import '../composer-row.css';

	// Keyframes row — display slots come from the shared keyframeSlots lib
	// (single source of truth, also used by the panel's next-slot default).
	// The panel owns the keyframe store actions; this component fires callbacks.
	let {
		pipe,
		maxKeyframes,
		onEditSlot,
		onRemoveKeyframe,
	} = $props<{
		pipe: PipeRow;
		maxKeyframes: number;
		onEditSlot: (slotIndex: number) => void;
		onRemoveKeyframe: (kfId: string) => void;
	}>();

	const visibleSlots = () => getVisibleKeyframeSlots(pipe, maxKeyframes);
</script>

<div class="row-group">
	<div class="row-header">
		<span class="row-label">KEYFRAMES</span>
		<span class="row-count">{pipe.keyframes.length}/{maxKeyframes}</span>
	</div>
	<div class="kf-row">
		{#each visibleSlots() as kfNum}
			{#each [pipe.keyframes.find((kf: PipeKeyframe) => kf.slotIndex === kfNum)] as kf}
				{#if kf}
					<div 
						class="kf-chip kf-filled"
						onclick={() => onEditSlot(kfNum)}
						onkeydown={(e) => e.key === 'Enter' && onEditSlot(kfNum)}
						role="button"
						tabindex="0"
						title="Frame {kf.frame} · {kf.type} · Click to edit">
						{#if kf.imageSrc}
							<img src={kf.imageSrc} class="kf-img" alt="keyframe" />
						{:else}
							<span class="kf-label">k{kfNum}</span>
						{/if}
						<button 
							class="kf-del"
							onclick={(e) => { e.stopPropagation(); onRemoveKeyframe(kf.id); }}
							title="Remove keyframe">×</button>
					</div>
				{:else}
					<div 
						class="kf-chip kf-empty"
						onclick={() => onEditSlot(kfNum)}
						onkeydown={(e) => e.key === 'Enter' && onEditSlot(kfNum)}
						role="button"
						tabindex="0"
						title="Click to configure keyframe {kfNum}">
						<span class="kf-empty-label">+ k{kfNum}</span>
					</div>
				{/if}
			{/each}
		{/each}
	</div>
</div>

<style>
	.kf-row {
		display: flex;
		gap: 8px;
		align-items: center;
		min-height: 48px;
		width: 100%;
	}

	.kf-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		flex: 1 1 0;
		min-width: 0;
		justify-content: center;
	}

	.kf-filled {
		background: var(--accent-bg);
		border-color: var(--accent-color);
	}

	.kf-empty {
		opacity: 0.6;
		cursor: pointer;
	}

	.kf-empty:hover {
		opacity: 1;
		background: var(--bg-tertiary);
	}

	.kf-img {
		width: 24px;
		height: 24px;
		object-fit: cover;
		border-radius: 4px;
	}

	.kf-label {
		font-weight: 600;
	}

	.kf-empty-label {
		font-size: 12px;
	}

	.kf-del {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
	}

	.kf-del:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}
</style>
