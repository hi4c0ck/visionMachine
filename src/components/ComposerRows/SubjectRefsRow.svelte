<script lang="ts">
	import type { PipeRow, SubjectReference } from '$types';
	import '../composer-row.css';

	// Subject references row — pure chrome. The panel owns the subject-ref
	// store actions; this component fires callbacks. Collapses the empty and
	// non-empty branches into one row (chips render conditionally).
	// `headerless` hides the row's own label/count (used inside the FIXED
	// variant's tabbed aux panel, where the tab owns the title + count).
	let {
		pipe,
		maxSubjectRefs,
		onToggle,
		onRemove,
		onAdd,
		onEdit,
		headerless = false,
		containsBroken,
	} = $props<{
		pipe: PipeRow;
		maxSubjectRefs: number;
		onToggle: (refId: string) => void;
		onRemove: (refId: string) => void;
		onAdd: () => void;
		/** Open the subject-ref modal in EDIT mode for an existing ref. */
		onEdit?: (refId: string) => void;
		headerless?: boolean;
		/** Red-out state for refs whose URL failed the accessibility check (D5). */
		containsBroken?: (id: string) => boolean;
	}>();

	// Store mutations replace pipe arrays, so the counts must stay derived.
	const refs = $derived(pipe.subjectReferences ?? []);
	const visibleCount = $derived(refs.filter((r: SubjectReference) => r.visible !== false).length);
	const refNumber = $derived(refs.length);
</script>

	<div class="row-group" class:headerless>
	{#if !headerless}
	<div class="row-header">
		<span class="row-label">SUBJECT REFS</span>
		<span class="row-count">{visibleCount}/{maxSubjectRefs}</span>
	</div>
	{/if}
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
						? `URL not accessible · Click to fix`
						: `Frames ${sr.frameStart ?? '—'}–${sr.frameEnd ?? '—'} · Click to edit`}
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
						<img src={sr.imageUrl} class="sr-img" alt="subject ref" />
					{:else}
						<span class="sr-dot"></span>
					{/if}
					{#if sr.useFrames}
						<span class="sr-range">{sr.frameStart}–{sr.frameEnd}</span>
					{:else}
						<span class="sr-label">full</span>
					{/if}
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
	/* headerless (inside the FIXED aux panel) drops the whole row-group gap
	   so the body sits tight. */
	.row-group.headerless {
		gap: 0;
	}

	.sr-row {
		display: flex;
		gap: 8px;
		align-items: center;
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

	.sr-img {
		width: 20px;
		height: 20px;
		object-fit: cover;
		border-radius: 3px;
	}

	.sr-dot {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--accent-color);
	}

	.sr-range, .sr-label {
		font-size: 11px;
		color: var(--text-secondary);
	}

	.sr-del {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
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
	}
</style>
