<script lang="ts">
	/**
	 * Side panel listing a pipe's subject-reference images (the "Subject N"
	 * thumbnails). Click a thumbnail → enlarged preview; the small +N button
	 * inserts the `[SubjectN]` token into the prompt (N = 1-based position in
	 * the reference list, matching the SubjectRefsRow "+ sN" numbering).
	 * Reused by the prompt modals (TagPromptModal, GlobalPromptModal).
	 */
	import type { SubjectReference } from '$types';
	import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';

	let {
		refs,
		onInsert,
	} = $props<{
		refs: SubjectReference[];
		/** Called with the `[SubjectN]` token to insert into the prompt. */
		onInsert?: (token: string) => void;
	}>();

	let selectedId = $state<string | null>(null);

	// Resolve local media paths to WebView blob URLs (same priority as
	// SubjectRefsRow: previewLocalPath first, then the remote imageUrl).
	let resolved = $state(new Map<string, string>());
	let resolvedFor = $state(new Map<string, string>());
	let failed = $state(new Set<string>());
	$effect(() => {
		for (const r of refs) {
			const src = r.previewLocalPath || r.imageUrl || '';
			if (!src || !isLocalPath(src)) continue;
			if (resolvedFor.get(r.id) === src) continue;
			toMediaUrl(src).then((url) => {
				if (url) {
					failed = new Set([...failed].filter((k) => k !== r.id));
					resolved = new Map([...resolved, [r.id, url]]);
					resolvedFor = new Map([...resolvedFor, [r.id, src]]);
				} else {
					failed = new Set([...failed, r.id]);
				}
			});
		}
	});

	function srcFor(r: SubjectReference): string | null {
		const src = r.previewLocalPath || r.imageUrl || null;
		if (!src || failed.has(r.id)) return null;
		if (isLocalPath(src)) {
			const cached = resolved.get(r.id);
			return cached !== undefined && resolvedFor.get(r.id) === src ? cached : null;
		}
		return src;
	}

	const selected = $derived(refs.find((r: SubjectReference) => r.id === selectedId) ?? null);
	const selectedSrc = $derived(selected ? srcFor(selected) : null);

	function toggle(r: SubjectReference) {
		selectedId = selectedId === r.id ? null : r.id;
	}

	/** 1-based position in the reference list → the prompt token. */
	function tokenFor(r: SubjectReference): string {
		const i = refs.findIndex((x: SubjectReference) => x.id === r.id);
		return `[Subject${i + 1}]`;
	}
</script>

<aside class="srp-strip" aria-label="Subject references">
	<div class="srp-title">Subjects</div>

	{#if selected && selectedSrc}
		<div class="srp-preview" title="Click the thumbnail again to close">
			<img src={selectedSrc} alt="Subject preview" />
		</div>
	{/if}

	<div class="srp-list">
		{#each refs as r, i (r.id)}
			{@const src = srcFor(r)}
			<div class="srp-item" class:selected={selectedId === r.id}>
				<button
					class="srp-thumb"
					onclick={() => toggle(r)}
					title={`Preview Subject ${i + 1}`}
					aria-label={`Preview Subject ${i + 1}`}
				>
					{#if src}
						<img src={src} alt="" onerror={() => (failed = new Set([...failed, r.id]))} />
					{:else}
						<span class="srp-ph" aria-hidden="true"></span>
					{/if}
				</button>
				<button
					class="srp-insert"
					onclick={() => onInsert?.(tokenFor(r))}
					title={`Insert [Subject${i + 1}] into the prompt`}
					aria-label={`Insert Subject ${i + 1} token into the prompt`}
				>+{i + 1}</button>
			</div>
		{/each}
	</div>
</aside>

<style>
	.srp-strip {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 132px;
		padding: 10px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 10px;
	}

	.srp-title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted, #71717a);
	}

	/* Enlarged preview of the selected thumbnail (click toggles it). */
	.srp-preview {
		height: 104px;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--border-color, #3f3f46);
		background: #000;
		flex: 0 0 auto;
	}
	.srp-preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	.srp-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.srp-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	/* Thumbnail: click → preview. Square, cover-fit so any aspect reads. */
	.srp-thumb {
		width: 44px;
		height: 44px;
		padding: 0;
		flex: 0 0 auto;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.15s ease;
	}
	.srp-item.selected .srp-thumb {
		border-color: var(--accent-color, #ff3e00);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color, #ff3e00) 30%, transparent);
	}
	.srp-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* Dashed placeholder when no image source resolves yet. */
	.srp-ph {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		border: 1px dashed var(--border-color, #3f3f46);
		display: block;
	}

	/* +N: insert the [SubjectN] token into the prompt at the cursor. */
	.srp-insert {
		flex: 1 1 auto;
		min-width: 0;
		padding: 5px 8px;
		background: transparent;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		color: var(--text-secondary, #a1a1aa);
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-mono, monospace);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.srp-insert:hover {
		border-color: var(--accent-color, #ff3e00);
		color: var(--accent-color, #ff3e00);
	}
</style>
