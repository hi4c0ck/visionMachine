<script lang="ts">
	/**
	 * Subject-reference thumbnail row for prompt modals. Each card is a small
	 * square with a corner number (= 1-based position in the reference list,
	 * matching the `[SubjectN]` prompt token) and a hover-reveal "+" overlay
	 * that inserts the token into the prompt. Clicking the card itself opens
	 * the shared fullscreen ImageLightbox (zoom + pan).
	 *
	 * `compact` mode (used in the modal footer next to Cancel/Confirm): no
	 * header row, 34px cards — a single slim strip that never squeezes the
	 * prompt area.
	 */
	import type { SubjectReference } from '$types';
	import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
	import ImageLightbox from './ImageLightbox.svelte';

	let {
		refs,
		onInsert,
		compact = false,
	} = $props<{
		refs: SubjectReference[];
		/** Called with the `[SubjectN]` token to insert into the prompt. */
		onInsert?: (token: string) => void;
		/** Footer layout: slim cards, no header. */
		compact?: boolean;
	}>();

	// ── Lightbox preview state ─────────────────────────────────────────────
	let lightboxOpen = $state(false);
	let previewIdx = $state<number | null>(null);
	const previewSrc = $derived(previewIdx !== null ? srcFor(refs[previewIdx]) : null);
	function openPreview(i: number) {
		previewIdx = i;
		lightboxOpen = true;
	}

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

<aside
	class="srp-strip"
	class:srp-compact={compact}
	aria-label="Subject references"
>
	{#if !compact}
		<div class="srp-head">
			<span class="srp-title">Subjects</span>
			<span class="srp-hint">click → preview · + → insert token</span>
		</div>
	{/if}
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

{#if lightboxOpen && previewIdx !== null}
	<ImageLightbox
		bind:open={lightboxOpen}
		src={previewSrc}
		title={`Subject ${(previewIdx ?? 0) + 1} of ${refs.length}`}
	/>
{/if}

<style>
	/* Default: a compact block (header + card row) added under the prompt. */
	.srp-strip {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
	}

	/* Footer mode: one slim, borderless tray (no card chrome) so it blends
	   into the footer next to the action buttons. No header, smaller thumbs. */
	.srp-compact {
		gap: 0;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0;
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

	/* Horizontal row, wraps when there are more than 5 refs. */
	.srp-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.srp-compact .srp-list {
		gap: 6px;
	}

	/* Card: square thumbnail + corner number (Subject N) + hover-reveal "+"
	   insert overlay on the right edge (the pg-open / pg-copy pattern). */
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

	/* "+" insert button: small overlay on the card's right edge, revealed on
	   hover / focus (like pg-open / pg-copy). Separate <button> so the click
	   doesn't open the lightbox. */
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

	/* Compact footer geometry: smaller thumbs + always-visible (subtle) "+" so
	   the insert affordance is discoverable without hover in a busy footer. */
	.srp-compact .srp-thumb {
		width: 36px;
		height: 36px;
		border-radius: 7px;
	}
	.srp-compact .srp-ph {
		width: 24px;
		height: 24px;
	}
	.srp-compact .srp-num {
		font-size: 8px;
		line-height: 11px;
	}
	.srp-compact .srp-insert {
		width: 16px;
		height: 16px;
		font-size: 11px;
		opacity: 0.75;
	}
	.srp-compact .srp-card:hover .srp-insert {
		opacity: 1;
	}
</style>
