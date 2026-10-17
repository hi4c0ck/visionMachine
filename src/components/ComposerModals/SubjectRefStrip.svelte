<script lang="ts">
	/**
	 * Compact subject-reference strip for prompt modals. A horizontal row of
	 * cards (44px thumbnail + a corner number = 1-based position in the
	 * reference list). Each card carries a small overlay "+" button that
	 * inserts the `[SubjectN]` token into the prompt; clicking the card
	 * itself opens the FULLSCREEN lightbox (ImageLightbox, zoom + pan).
	 *
	 * The strip is one compact block, so the prompt area is never squeezed;
	 * it only appears when the pipe actually has subject refs.
	 */
	import type { SubjectReference } from '$types';
	import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
	import ImageLightbox from './ImageLightbox.svelte';

	let {
		refs,
		onInsert,
	} = $props<{
		refs: SubjectReference[];
		/** Called with the `[SubjectN]` token to insert into the prompt. */
		onInsert?: (token: string) => void;
	}>();

	// ── Lightbox preview state ─────────────────────────────────────────────
	let previewIdx = $state<number | null>(null);
	function openPreview(i: number) {
		previewIdx = i;
	}
	function closePreview() {
		previewIdx = null;
	}
	let lightboxOpen = $state(false);
	$effect(() => {
		lightboxOpen = previewIdx !== null;
	});
	const previewSrc = $derived(previewIdx !== null ? srcFor(refs[previewIdx]) : null);

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
			toMediaUrl(src).then((url: string | null) => {
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

	/** 1-based position in the reference list → the prompt token. */
	function tokenFor(r: SubjectReference): string {
		const i = refs.findIndex((x: SubjectReference) => x.id === r.id);
		return `[Subject${i + 1}]`;
	}
</script>

<aside class="srp-strip" aria-label="Subject references">
	<div class="srp-head">
		<span class="srp-title">Subjects</span>
		<span class="srp-hint">click → preview · + → insert token</span>
	</div>
	<div class="srp-list">
		{#each refs as r, i (r.id)}
			{@const src = srcFor(r)}
			<div class="srp-card">
				<button
					class="srp-thumb"
					onclick={() => openPreview(i)}
					title={`Subject ${i + 1} — click to preview`}
					aria-label={`Preview Subject ${i + 1}`}
				>
					{#if src}
						<img src={src} alt="" onerror={() => (failed = new Set([...failed, r.id]))} />
					{:else}
						<span class="srp-ph" aria-hidden="true"></span>
					{/if}
					<span class="srp-num" aria-hidden="true">{i + 1}</span>
				</button>
				<button
					class="srp-insert"
					onclick={() => onInsert?.(tokenFor(r))}
					title={`Insert [Subject${i + 1}] into the prompt`}
					aria-label={`Insert Subject ${i + 1} token into the prompt`}
				>+</button>
			</div>
		{/each}
	</div>
</aside>

{#if previewIdx !== null}
	<ImageLightbox
		bind:open={lightboxOpen}
		src={previewSrc}
		title={`Subject ${(previewIdx ?? 0) + 1} of ${refs.length}`}
	/>
{/if}

<style>
	/* One compact block: a header row + a single horizontal card row.
	   Never squeezes the prompt — it just adds ~60px of height when the pipe
	   has subject refs. */
	.srp-strip {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
	}

	.srp-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.srp-title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted, #71717a);
	}

	.srp-hint {
		font-size: 10px;
		color: var(--text-muted, #71717a);
		opacity: 0.7;
	}

	/* Horizontal row, wraps when there are many refs. */
	.srp-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	/* Card: 44px square thumbnail with two overlays — a corner number
	   (Subject N index) and a small "+" insert button on the right edge,
	   mirroring the pg-open / pg-copy overlay pattern of PieceGenPanel. */
	.srp-card {
		position: relative;
		flex: 0 0 auto;
	}

	.srp-thumb {
		position: relative;
		width: 44px;
		height: 44px;
		padding: 0;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.15s ease, transform 0.15s ease;
	}
	.srp-thumb:hover {
		border-color: var(--accent-color, #ff3e00);
		transform: scale(1.06);
	}
	.srp-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* Dashed placeholder when no image source resolves yet. */
	.srp-ph {
		width: 30px;
		height: 30px;
		border-radius: 6px;
		border: 1px dashed var(--border-color, #3f3f46);
		display: block;
	}

	/* Number corner: which Subject N this thumb is. */
	.srp-num {
		position: absolute;
		left: 2px;
		bottom: 2px;
		padding: 0 3px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: #fff;
		font-size: 9px;
		font-weight: 700;
		font-family: var(--font-mono, monospace);
		line-height: 13px;
	}

	/* "+" insert button: a small overlay on the card's right edge (only
	   visible on hover / focus, like pg-open / pg-copy). The click target
	   stopPropagation implicitly — it's a separate <button> over the card. */
	.srp-insert {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 18px;
		height: 18px;
		padding: 0;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 50%;
		background: color-mix(in srgb, var(--bg-secondary, #14141f) 82%, transparent);
		color: var(--text-secondary, #a1a1aa);
		font-size: 12px;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}
	.srp-card:hover .srp-insert,
	.srp-card:focus-within .srp-insert,
	.srp-insert:focus-visible {
		opacity: 1;
	}
	.srp-insert:hover {
		color: var(--accent-color, #ff3e00);
		border-color: var(--accent-color, #ff3e00);
	}
</style>
