<script lang="ts">
	import type { PipeRow, SubjectReference, KeyframeType } from '$types';
	import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
	import { refDotState, type RefDotState } from '$lib/refReadiness';
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
		onRegenerate,
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
		/**
		 * Force-regenerate a settled piece: clears its preview so the next
		 * generation run produces a fresh image for it. Fired by the
		 * status dot when it's not a neutral 'pending' with nothing to do.
		 */
		onRegenerate?: (refId: string) => void;
	}>();

	// Store mutations replace pipe arrays, so the counts must stay derived.
	const refs = $derived(pipe.subjectReferences ?? []);
	const visibleCount = $derived(refs.filter((r: SubjectReference) => r.visible !== false).length);
	// Add-button numbering + gate key off the VISIBLE refs only: a toggled-off
	// (eye-closed) subject still occupies an array slot and would otherwise
	// silently eat into the 5-ref cap the user can't see.
	const refNumber = $derived(visibleCount);

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

	// Resolve a subject image source to a renderable URL. Priority:
	//  1. previewLocalPath — the generated artifact (local media-tree file),
	//     the most current representation after a successful run.
	//  2. imageUrl — user-supplied remote URL (url-mode subjects). Remote
	//     URLs load directly; local paths go through read_media_file.
	let srImageUrls = $state<Map<string, string>>(new Map());
	// The source string each cached URL was resolved FROM — a source change
	// (new artifact, recovery backfill) must re-fetch, not reuse the stale
	// blob (the old `has(sr.id)` skip broke newly-attached local paths).
	let srImageUrlsFor = $state<Map<string, string>>(new Map());
	// Sources we've already attempted to resolve, so a `toMediaUrl` that
	// settled to null doesn't re-trigger an IPC call on every effect re-run.
	// Voided when the source changes (checked above) so a new path re-attempts.
	let srAttempted = $state<Map<string, string>>(new Map());
	// Sources whose <img> failed to load (stale local paths, expired remote
	// URLs). Excluded from srSrc so the chip falls back to the dot placeholder
	// instead of the browser's broken-image glyph.
	let failedSrSources = $state<Set<string>>(new Set());
	$effect(() => {
		for (const sr of refs) {
			const src = sr.previewLocalPath || sr.imageUrl || '';
			if (!src || !isLocalPath(src)) continue;
			if (srImageUrlsFor.get(sr.id) === src) continue;
			if (srAttempted.get(sr.id) === src) continue;
			srAttempted = new Map([...srAttempted, [sr.id, src]]);
			toMediaUrl(src).then((url) => {
				if (url) {
					failedSrSources = new Set([...failedSrSources].filter((k) => k !== sr.id));
					srImageUrls = new Map([...srImageUrls, [sr.id, url]]);
					srImageUrlsFor = new Map([...srImageUrlsFor, [sr.id, src]]);
				}
			});
		}
	});

	function srSrc(sr: SubjectReference): string | null {
		const src = sr.previewLocalPath || sr.imageUrl || null;
		if (!src || failedSrSources.has(sr.id)) return null;
		if (isLocalPath(src)) {
			const cached = srImageUrls.get(sr.id);
			return cached !== undefined && srImageUrlsFor.get(sr.id) === src ? cached : null;
		}
		return src;
	}

	/** Drop the cached entry so srSrc() falls back to the placeholder instead
	 *  of the browser's broken-image glyph. */
	function markSrImageFailed(sr: SubjectReference) {
		const src = sr.previewLocalPath || sr.imageUrl || null;
		if (!src) return;
		if (isLocalPath(src)) {
			const next = new Map(srImageUrls);
			next.delete(sr.id);
			srImageUrls = next;
		}
		failedSrSources = new Set([...failedSrSources, sr.id]);
	}

	function dotTitleFor(state: RefDotState): string {
		return state === 'ready'
			? 'Asset ready — click to regenerate'
			: state === 'broken'
				? 'Asset missing or failed — click to regenerate'
				: 'Not generated yet — click to force generate';
	}
	function srDot(sr: SubjectReference): RefDotState {
		const ty = (sr.type ?? 'url') as KeyframeType;
		return refDotState(
			pipe.id,
			sr.id,
			{
				type: ty,
				// Only 'url' pieces carry a direct image source whose presence
				// defines readiness; img2img's imageUrl is a *reference* (the
				// dot reflects the generated preview, not the reference).
				url: ty === 'url' ? sr.imageUrl : undefined,
				status: sr.status,
				previewRemoteUrl: sr.previewRemoteUrl,
				previewLocalPath: sr.previewLocalPath,
			},
			brokenSet,
		);
	}

	// Derive the D5 broken set for this pipe's refs from containsBroken.
	const brokenSet = $derived.by((): Set<string> | undefined => {
		if (!containsBroken) return undefined;
		return new Set(
			(refs as SubjectReference[])
				.filter((r: SubjectReference) => r.visible !== false && containsBroken(r.id))
				.map((r: SubjectReference) => `${pipe.id}:${r.id}`),
		);
	});
</script>

	<div class="row-group">
	<div class="row-header">
		<span class="row-label">SUBJECT REFS</span>
		<span class="row-count">{visibleCount}/{maxSubjectRefs}</span>
	</div>
	<div class="sr-row">
		{#each refs as sr (sr.id)}
			{@const broken = containsBroken?.(sr.id) ?? false}
			{@const dot = srDot(sr)}
			{@const srSrcResolved = srSrc(sr)}
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
						<!-- Media box: thumbnail when a source resolves, dashed
							 placeholder when not. The small status dot badge overlays
							 the box corner ALWAYS, so readiness is visible whether or
							 not a thumbnail is present (the dot the user asked for). -->
						<div class="sr-media">
							{#if srSrcResolved}
								<img
									src={srSrcResolved}
									class="sr-img"
									style={aspect ? `aspect-ratio: ${aspect};` : ''}
									alt="subject ref"
									onerror={() => markSrImageFailed(sr)}
								/>
							{:else}
								<span class="sr-placeholder" style={aspect ? `aspect-ratio: ${aspect};` : ''}></span>
							{/if}
							<button
								class="sr-status"
								class:sr-status-ready={dot === 'ready'}
								class:sr-status-broken={dot === 'broken'}
								onclick={(e) => { e.stopPropagation(); onRegenerate?.(sr.id); }}
								title={dotTitleFor(dot)}
								aria-label={dotTitleFor(dot)}
							></button>
						</div>
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

	/* Media box: thumbnail or dashed placeholder + the persistent status-dot
	   badge in its corner. Green = settled asset, red = broken/failed,
	   neutral (accent) = not generated yet. Clicking the badge force-
	   regenerates the piece. */
	.sr-media {
		position: relative;
		flex: 0 0 auto;
	}

	/* Dashed placeholder when no image source resolves. */
	.sr-placeholder {
		width: 32px;
		height: 36px;
		border-radius: 4px;
		border: 1px dashed var(--border-color);
		background: var(--bg-tertiary);
		display: block;
	}

	/* Status badge — small dot overlaid on the media box corner, always
	   visible so readiness reads even when a thumbnail is present. */
	.sr-status {
		position: absolute;
		right: -3px;
		bottom: -3px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent-color);
		border: 2px solid var(--bg-tertiary);
		padding: 0;
		cursor: pointer;
	}

	.sr-status-ready {
		background: #22c55e;
	}

	.sr-status-broken {
		background: #ef4444;
	}

	.sr-status:hover {
		transform: scale(1.3);
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
