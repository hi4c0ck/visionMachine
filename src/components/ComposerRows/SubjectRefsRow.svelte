<script lang="ts">
	import type { PipeRow, SubjectReference, KeyframeType } from '$types';
	import '../composer-row.css';

	// Subject references row — pure chrome. The panel owns the subject-ref
	// store actions; this component fires callbacks. Collapses the empty and
	// non-empty branches into one row (chips render conditionally).
	let {
		pipe,
		maxSubjectRefs,
		onToggle,
		onRemove,
		onAdd,
		onEdit,
		aspect,
		containsBroken,
	} = $props<{
		pipe: PipeRow;
		maxSubjectRefs: number;
		onToggle: (refId: string) => void;
		onRemove: (refId: string) => void;
		onAdd: () => void;
		/** Open the subject-ref modal in EDIT mode for an existing ref. */
		onEdit?: (refId: string) => void;
		/** Scene aspect ratio ("W / H") — chips size to it so thumbnails
		 *  preview at the same shape as the generated frame. */
		aspect?: string;
		/** Red-out state for refs whose URL failed the accessibility check (D5). */
		containsBroken?: (id: string) => boolean;
	}>();

	// Store mutations replace pipe arrays, so the counts must stay derived.
	const refs = $derived(pipe.subjectReferences ?? []);
	const visibleCount = $derived(refs.filter((r: SubjectReference) => r.visible !== false).length);
	const refNumber = $derived(refs.length);

	// Human-readable subject type (url / txt2img / img2img); legacy refs
	// without a preset read as 'url'.
	const SR_TYPE_LABEL: Record<KeyframeType, string> = {
		url: 'URL',
		txt2img: 'txt2img',
		img2img: 'img2img',
	};

	function srTypeLabel(sr: SubjectReference): string {
		const t = (sr.type ?? 'url') as KeyframeType;
		return SR_TYPE_LABEL[t] ?? t;
	}
</script>

	<div class="row-group">
	<div class="row-header">
		<span class="row-label">SUBJECT REFS</span>
		<span class="row-count">{visibleCount}/{maxSubjectRefs}</span>
	</div>
	<div class="sr-row">
		{#each refs as sr (sr.id)}
			{@const broken = containsBroken?.(sr.id) ?? false}
			{#if sr.visible !== false}
				<div
					class="sr-chip"
					class:sr-broken={broken}
					onclick={() => onEdit?.(sr.id)}
					onkeydown={(e) => e.key === 'Enter' && onEdit?.(sr.id)}
					role="button"
					tabindex={onEdit ? 0 : undefined}
					title={broken
						? `Frame ${sr.frameStart ?? '—'}–${sr.frameEnd ?? '—'} · ${srTypeLabel(sr)} · URL not accessible · Click to fix`
						: `Frame ${sr.frameStart ?? '—'}–${sr.frameEnd ?? '—'} · ${srTypeLabel(sr)} · Click to edit`}
					>
					{#if broken}
						<span class="sr-broken-mark" aria-hidden="true">⚠</span>
					{/if}
					<button
						class="sr-eye"
						onclick={(e) => { e.stopPropagation(); onToggle(sr.id); }}
						title={sr.visible === false ? 'Enable reference' : 'Disable reference'}>
						{#if sr.visible === false}
							<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>
						{:else}
							<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
						{/if}
					</button>
					{#if sr.imageUrl}
						<img src={sr.imageUrl} class="sr-img" style={aspect ? `aspect-ratio: ${aspect};` : ''} alt="subject ref" />
					{:else}
						<span class="sr-dot" style={aspect ? `aspect-ratio: ${aspect}; border-radius: 4px;` : ''}></span>
					{/if}
					<span class="sr-meta">
						{#if sr.useFrames}
							<span class="sr-range">{sr.frameStart}–{sr.frameEnd}</span>
						{:else}
							<span class="sr-label">full</span>
						{/if}
						<span class="sr-type">{srTypeLabel(sr)}</span>
					</span>
					<button
						class="sr-del"
						onclick={(e) => { e.stopPropagation(); onRemove(sr.id); }}
						title="Remove subject reference">×</button>
				</div>
			{/if}
		{/each}
		{#if refNumber < maxSubjectRefs}
			<button
				class="sr-add"
				onclick={onAdd}
				title="Add subject reference">
				+ s{refNumber + 1}
			</button>
		{/if}
	</div>
</div>

<style>
	.sr-row {
		display: flex;
		gap: 8px;
		align-items: stretch;
		flex-wrap: wrap;
		min-height: 48px;
	}

	.sr-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		font-size: 12px;
	}

	.sr-eye {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sr-eye:hover {
		color: var(--text-primary);
	}

	/* Thumbnail sized to the scene aspect ratio (width fixed, height from
	   aspect-ratio) — no longer a square, so portrait scenes read correctly. */
	.sr-img {
		width: 32px;
		height: auto;
		max-height: 36px;
		object-fit: cover;
		border-radius: 4px;
		flex: 0 0 auto;
	}

	/* Empty thumbnail placeholder — a dot of the scene's shape. */
	.sr-dot {
		width: 32px;
		height: 36px;
		border-radius: 50%;
		background: var(--accent-color);
		flex: 0 0 auto;
	}

	/* Left meta block: frame range on top, type annotation below. */
	.sr-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.sr-range, .sr-label {
		font-size: 11px;
		color: var(--text-secondary);
	}

	.sr-type {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--text-muted, var(--text-secondary));
		text-transform: lowercase;
		white-space: nowrap;
	}

	.sr-del {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
		flex: 0 0 auto;
	}

	.sr-del:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.sr-add {
		background: none;
		border: 1px dashed var(--border-color);
		color: var(--text-secondary);
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		align-self: center;
	}

	.sr-add:hover {
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

	/* Broken URL state (D5): red-out the chip whose reference failed the
	   accessibility check. Persists until the ref is re-validated. */
	.sr-broken {
		border-color: #ef4444;
		background: rgba(239, 68, 68, 0.14);
	}

	.sr-broken-mark {
		color: #ef4444;
		font-size: 11px;
		font-weight: 700;
		flex: 0 0 auto;
	}
</style>
