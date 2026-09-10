<script lang="ts">
	import type { PipeRow, SubjectReference } from '$types';
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
	} = $props<{
		pipe: PipeRow;
		maxSubjectRefs: number;
		onToggle: (refId: string) => void;
		onRemove: (refId: string) => void;
		onAdd: () => void;
	}>();

	// Store mutations replace pipe arrays, so the counts must stay derived.
	const refs = $derived(pipe.subjectReferences ?? []);
	const visibleCount = $derived(refs.filter((r: SubjectReference) => r.visible !== false).length);
	const refNumber = $derived(refs.length);
</script>

<div class="row-group">
	<div class="row-header">
		<span class="row-label">SUBJECT REFS</span>
		<span class="row-count">{visibleCount}/{maxSubjectRefs}</span>
	</div>
	<div class="sr-row">
		{#each refs as sr (sr.id)}
			{#if sr.visible !== false}
				<div class="sr-chip" title="Frames {sr.frameStart ?? '—'}–{sr.frameEnd ?? '—'} · Click to edit">
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
</style>
