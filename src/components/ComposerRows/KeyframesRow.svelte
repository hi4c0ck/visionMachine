<script lang="ts">
	import type { PipeRow, PipeKeyframe } from '$types';
	import { getVisibleKeyframeSlots } from '$lib/keyframeSlots';
	import '../composer-row.css';

	// Keyframes row — display slots come from the shared keyframeSlots lib
	// (single source of truth, also used by the panel's next-slot default).
	// The panel owns the keyframe store actions; this component fires callbacks.
	// `headerless` hides the row's own label/count (used inside the FIXED
	// variant's tabbed aux panel, where the tab owns the title + count).
	let {
		pipe,
		maxKeyframes,
		onEditSlot,
		onRemoveKeyframe,
		headerless = false,
		containsBroken,
	} = $props<{
		pipe: PipeRow;
		maxKeyframes: number;
		onEditSlot: (slotIndex: number) => void;
		onRemoveKeyframe: (kfId: string) => void;
		headerless?: boolean;
		/** Red-out state for refs whose URL failed the accessibility check (D5). */
		containsBroken?: (id: string) => boolean;
	}>();

	const visibleSlots = () => getVisibleKeyframeSlots(pipe, maxKeyframes);
</script>

	<div class="row-group" class:headerless>
	{#if !headerless}
	<div class="row-header">
		<span class="row-label">KEYFRAMES</span>
		<span class="row-count">{pipe.keyframes.length}/{maxKeyframes}</span>
	</div>
	{/if}
	<div class="kf-row">
		{#each visibleSlots() as kfNum}
			{#each [pipe.keyframes.find((kf: PipeKeyframe) => kf.slotIndex === kfNum)] as kf}
				{#if kf}
					{@const broken = containsBroken?.(kf.id) ?? false}
					<div 
						class="kf-chip kf-filled"
						class:kf-broken={broken}
						onclick={() => onEditSlot(kfNum)}
						onkeydown={(e) => e.key === 'Enter' && onEditSlot(kfNum)}
						role="button"
						tabindex="0"
						title={broken
							? `Frame ${kf.frame} · ${kf.type} · URL not accessible · Click to fix`
							: `Frame ${kf.frame} · ${kf.type} · Click to edit`}
						aria-invalid={broken || undefined}
						>
						{#if broken}
							<span class="kf-broken-mark" aria-hidden="true">⚠</span>
						{/if}
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
	/* The row-header is a sibling of the chip rows; headerless (inside the
	   FIXED aux panel) drops the whole row-group gap so the body sits tight. */
	.row-group.headerless {
		gap: 0;
	}

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

	/* Broken URL state (D5): red-out the chip whose reference failed the
	   accessibility check. Persists until the ref is re-validated. */
	.kf-broken {
		border-color: #ef4444;
		background: rgba(239, 68, 68, 0.14);
	}

	.kf-broken-mark {
		color: #ef4444;
		font-size: 11px;
		font-weight: 700;
	}
</style>
