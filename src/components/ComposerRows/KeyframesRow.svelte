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
		aspect,
		containsBroken,
	} = $props<{
		pipe: PipeRow;
		maxKeyframes: number;
		onEditSlot: (slotIndex: number) => void;
		onRemoveKeyframe: (kfId: string) => void;
		/** Scene aspect ratio ("W / H") — chips size to it so thumbnails
		 *  preview at the same shape as the generated frame. */
		aspect?: string;
		/** Red-out state for refs whose URL failed the accessibility check (D5). */
		containsBroken?: (id: string) => boolean;
	}>();

	const visibleSlots = () => getVisibleKeyframeSlots(pipe, maxKeyframes);

	// Human-readable keyframe type (url / txt2img / img2img).
	const KF_TYPE_LABEL: Record<PipeKeyframe['type'], string> = {
		url: 'URL',
		txt2img: 'txt2img',
		img2img: 'img2img',
	};

	function kfTypeLabel(kf: PipeKeyframe): string {
		return KF_TYPE_LABEL[kf.type] ?? kf.type;
	}
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
					{@const broken = containsBroken?.(kf.id) ?? false}
					<div
						class="kf-chip kf-filled"
						class:kf-broken={broken}
						onclick={() => onEditSlot(kfNum)}
						onkeydown={(e) => e.key === 'Enter' && onEditSlot(kfNum)}
						role="button"
						tabindex="0"
						title={broken
							? `Frame ${kf.frame} · ${kfTypeLabel(kf)} · URL not accessible · Click to fix`
							: `Frame ${kf.frame} · ${kfTypeLabel(kf)} · Click to edit`}
						aria-invalid={broken || undefined}
						>
						{#if broken}
							<span class="kf-broken-mark" aria-hidden="true">⚠</span>
						{/if}
						{#if kf.imageSrc}
							<img src={kf.imageSrc} class="kf-img" style={aspect ? `aspect-ratio: ${aspect};` : ''} alt="keyframe" />
						{:else}
							<span class="kf-placeholder" style={aspect ? `aspect-ratio: ${aspect};` : ''}></span>
						{/if}
						<span class="kf-meta">
							<span class="kf-label">k{kfNum}</span>
							<span class="kf-type">{kfTypeLabel(kf)}</span>
						</span>
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
						<span class="kf-placeholder kf-placeholder-empty" style={aspect ? `aspect-ratio: ${aspect};` : ''}></span>
						<span class="kf-meta">
							<span class="kf-empty-label">+ k{kfNum}</span>
						</span>
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
		align-items: stretch;
		min-height: 48px;
		width: 100%;
	}

	.kf-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		flex: 1 1 0;
		min-width: 0;
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

	/* Thumbnail sized to the scene aspect ratio (width fixed, height from
	   aspect-ratio) — no longer a square, so portrait scenes read correctly. */
	.kf-img {
		width: 48px;
		height: auto;
		max-height: 40px;
		object-fit: cover;
		border-radius: 4px;
		flex: 0 0 auto;
	}

	/* Empty thumbnail placeholder — a dashed frame of the same shape. */
	.kf-placeholder {
		width: 48px;
		height: 40px;
		border-radius: 4px;
		border: 1px dashed var(--border-color);
		background: var(--bg-tertiary);
		flex: 0 0 auto;
	}
	.kf-placeholder-empty {
		border-color: var(--border-light, var(--border-color));
		opacity: 0.5;
	}

	/* Left label block: slot name on top, type annotation below. */
	.kf-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.kf-label {
		font-weight: 600;
		font-size: 12px;
	}

	.kf-type {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--text-muted, var(--text-secondary));
		text-transform: lowercase;
		white-space: nowrap;
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
		flex: 0 0 auto;
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
		flex: 0 0 auto;
	}
</style>
