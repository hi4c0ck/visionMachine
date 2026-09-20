<script lang="ts">
	import type { PipeRow, PipeKeyframe } from '$types';
	import { getVisibleKeyframeSlots } from '$lib/keyframeSlots';
	import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
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

	// Resolve a keyframe image source to a renderable URL. Priority:
	//  1. previewLocalPath — the generated artifact (local media-tree file),
	//     the most current representation after a successful run.
	//  2. imageSrc — user-supplied remote URL (url-mode keyframes) or a
	//     locally-saved path. Remote URLs load directly; local paths go
	//     through the Tauri read_media_file command so the WebView can fetch them.
	let kfImageUrls = $state<Map<string, string>>(new Map());
	// The source string each cached URL was resolved FROM. Without this the
	// effect skips any ref already in `kfImageUrls` — so a newly-attached
	// local path (first run / a recovery backfill) and a re-linked artifact
	// would never resolve, leaving the chip on the "image not loaded" glyph.
	let kfImageUrlsFor = $state<Map<string, string>>(new Map());
	// Sources we've already attempted to resolve, so a `toMediaUrl` that
	// settled to null (file missing / not under a media root) doesn't
	// re-trigger an IPC call on every effect re-run. Cleared when the source
	// itself changes (below) so a freshly-attached path re-attempts.
	let kfAttempted = $state<Map<string, string>>(new Map());
	// Sources whose <img> failed to load (stale local paths, expired remote
	// URLs). Excluded from kfSrc so the chip falls back to the dashed
	// placeholder instead of the browser's broken-image glyph.
	let failedKfSources = $state<Set<string>>(new Set());
	$effect(() => {
		for (const kf of pipe.keyframes ?? []) {
			// Resolve the best source for each keyframe.
			const src = kf.previewLocalPath || kf.imageSrc || '';
			if (!src || !isLocalPath(src)) continue;
			// Re-fetch when the source CHANGED since the last cached URL
			// (new artifact, backfill) — not just when the ref is new. A
			// changed source also voids the "already attempted" marker so the
			// new path gets a fresh resolve.
			if (kfImageUrlsFor.get(kf.id) === src) continue;
			if (kfAttempted.get(kf.id) === src) continue;
			// `toMediaUrl` resolves to null on failure (missing/stale path, path
			// not under a media root) — it never rejects in the null-settling
			// path, but guard anyway so a rejection can't crash the effect
			// loop. A null result simply leaves the chip on its placeholder.
			kfAttempted = new Map([...kfAttempted, [kf.id, src]]);
			toMediaUrl(src)
				.then((url) => {
					if (url) {
						// A fresh URL supersedes any failed mark for this ref.
						failedKfSources = new Set([...failedKfSources].filter((k) => k !== kf.id));
						kfImageUrls = new Map([...kfImageUrls, [kf.id, url]]);
						kfImageUrlsFor = new Map([...kfImageUrlsFor, [kf.id, src]]);
					}
				})
				.catch(() => {});
		}
	});

	function kfSrc(kf: PipeKeyframe): string | null {
		// Generated local preview takes precedence over the raw source.
		const src = kf.previewLocalPath || kf.imageSrc || null;
		if (!src || failedKfSources.has(kf.id)) return null;
		// A local path with a STALE cached URL (source changed) must not
		// render the old blob: fall back to the placeholder until the effect
		// re-resolves it.
		if (isLocalPath(src)) {
			const cached = kfImageUrls.get(kf.id);
			return cached !== undefined && kfImageUrlsFor.get(kf.id) === src ? cached : null;
		}
		return src;
	}

	/** Drop the cached entry so kfSrc() falls back to the placeholder instead
	 *  of the browser's broken-image glyph. Covers both local (toMediaUrl /
	 *  missing media file) and remote (expired provider URL) sources. */
	function markKfImageFailed(kf: PipeKeyframe) {
		const src = kf.previewLocalPath || kf.imageSrc || null;
		if (!src) return;
		if (isLocalPath(src)) {
			const next = new Map(kfImageUrls);
			next.delete(kf.id);
			kfImageUrls = next;
		}
		failedKfSources = new Set([...failedKfSources, kf.id]);
	}


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
					{@const kfSrcResolved = kfSrc(kf)}
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
					{#if kfSrcResolved}
						<img
							src={kfSrcResolved}
							class="kf-img"
							style={aspect ? `aspect-ratio: ${aspect};` : ''}
							alt="keyframe"
							onerror={() => markKfImageFailed(kf)}
						/>
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
