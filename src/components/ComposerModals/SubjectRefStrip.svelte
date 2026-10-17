<script lang="ts">
	/**
	 * Compact subject-reference strip for prompt modals. A horizontal row of
	 * small thumbnails (each with a `+N` insert badge, N = 1-based position in
	 * the reference list). Click a thumbnail → a FULLSCREEN lightbox preview
	 * (image at up to 90vw × 85vh, click/Esc to close) — no small side box.
	 * The strip itself is one compact row, so the prompt area is never
	 * squeezed; it only appears when the pipe actually has subject refs.
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

	// ── Lightbox preview state ─────────────────────────────────────────────
	let previewIdx = $state<number | null>(null);
	function openPreview(i: number) {
		previewIdx = i;
	}
	function closePreview() {
		previewIdx = null;
	}
	const previewRef = $derived(previewIdx !== null ? refs[previewIdx] : null);
	const previewSrc = $derived(previewRef ? srcFor(previewRef) : null);

	// Esc closes the lightbox while it's up (window-level, the lightbox div
	// is not focusable-friendly inside a modal).
	$effect(() => {
		if (previewIdx === null) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closePreview();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

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
		<span class="srp-hint">click → preview · +N → insert</span>
	</div>
	<div class="srp-list">
		{#each refs as r, i (r.id)}
			{@const src = srcFor(r)}
			<div class="srp-item">
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
				>+{i + 1}</button>
			</div>
		{/each}
	</div>
</aside>

{#if previewIdx !== null && previewSrc}
	<!-- Fullscreen lightbox: covers the whole window ABOVE the modal overlay
	     (z-index 3000 > 2000), so the image reads at up to 90vw × 85vh —
	     never a cramped side box. Click anywhere or Esc to dismiss. -->
	<div class="srp-lightbox" role="dialog" aria-modal="true" aria-label="Subject image preview"
		onclick={() => closePreview()}>
		<button class="srp-close" aria-label="Close preview"
			onclick={(e) => { e.stopPropagation(); closePreview(); }}>×</button>
		<img src={previewSrc} alt="Subject preview" onerror={() => closePreview()} />
		<div class="srp-caption">Subject {(previewIdx ?? 0) + 1} · click or Esc to close</div>
	</div>
{/if}

<style>
	/* One compact block: a header row + a single horizontal thumbnail row.
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

	.srp-item {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	/* Thumbnail: square 44px, click → fullscreen preview. A tiny number
	   corner marks the Subject N index. */
	.srp-thumb {
		position: relative;
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

	/* +N: insert the [SubjectN] token into the prompt at the cursor. */
	.srp-insert {
		width: 30px;
		height: 44px;
		flex: 0 0 auto;
		padding: 0;
		background: transparent;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
		color: var(--text-secondary, #a1a1aa);
		font-size: 10px;
		font-weight: 700;
		font-family: var(--font-mono, monospace);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.srp-insert:hover {
		border-color: var(--accent-color, #ff3e00);
		color: var(--accent-color, #ff3e00);
		background: color-mix(in srgb, var(--accent-color, #ff3e00) 10%, transparent);
	}

	/* ── Fullscreen lightbox: above the modal overlay, covers the window ── */
	.srp-lightbox {
		position: fixed;
		inset: 0;
		z-index: 3000; /* above .modal-overlay's 2000 */
		background: rgba(0, 0, 0, 0.88);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: zoom-out;
	}

	.srp-lightbox img {
		max-width: 90vw;
		max-height: 85vh;
		object-fit: contain;
		border-radius: 8px;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
	}

	.srp-caption {
		position: absolute;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		padding: 5px 12px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.55);
		border: 1px solid var(--border-color, #3f3f46);
		color: var(--text-secondary, #a1a1aa);
		font-size: 12px;
		white-space: nowrap;
	}

	.srp-close {
		position: absolute;
		top: 16px;
		right: 20px;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: var(--text-primary, #fff);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}
	.srp-close:hover {
		border-color: var(--accent-color, #ff3e00);
		color: var(--accent-color, #ff3e00);
	}
</style>
