<script lang="ts">
	// Standalone image generation + on-disk preview for a single keyframe /
	// subject piece — embedded by KeyframeModal and SubjectRefModal.
	//
	//  - A "Generate" button fires ONE image POST (txt2img or img2img) through
	//    the provider engine and materializes the artifact into the piece's
	//    OWN append-only history tree (<session>/<pipe>/pieces/<kind>/<refId>/),
	//    so regenerating NEVER erases a previous generation.
	//  - Previews: for img2img BOTH the source (reference) and the generated
	//    image are shown; for txt2img just the generated image.
	//  - A history strip lists the piece's prior on-disk generations; clicking
	//    one switches the "generated" preview to that artifact.
	import { getSettings } from '$lib/settings/store';
	import { modelsFor, getPreset } from '$lib/settings/catalog';
	import { toMediaUrl } from '$lib/mediaUrl';
	import { flashToast } from '$lib/flashToast';
	import ImageLightbox from './ImageLightbox.svelte';
	import ChromeIcon from '../ChromeIcon.svelte';
	import {
		generatePiece,
		listPieceHistory,
		type PieceHistoryEntry,
		type PieceKind,
	} from '$lib/pieceGeneration';
	import type { ModelSpec } from '$types';
	import { invoke, isTauri } from '@tauri-apps/api/core';

	let {
		kind,
		refId,
		sessionId,
		pipeId,
		imageType,
		prompt,
		referenceUrl,
		onGenerated,
		onBusyChange,
		initialLocal = null,
		initialRemote = null,
	} = $props<{
		kind: PieceKind;
		refId: string;
		sessionId: string;
		pipeId: string;
		/** "txt2img" | "img2img" (the modal's current preset mode). */
		imageType?: string;
		prompt: string;
		/** img2img reference image URL (the "source" preview). */
		referenceUrl?: string;
		/** Fires after a successful generation with (localPath, remoteUrl). */
		onGenerated?: (localPath: string, remoteUrl: string | null) => void;
		/** Notifies the parent when a standalone generation starts/finishes,
		 *  so the modal can hold its Confirm button while the piece is in
		 *  flight (the saved record must not race the running generation). */
		onBusyChange?: (busy: boolean) => void;
		/** The piece's persisted generation preview (local path / remote URL).
		 *  When set, the panel opens on THIS artifact instead of the newest
		 *  on-disk entry — so a re-opened modal shows the user's last choice. */
		initialLocal?: string | null;
		initialRemote?: string | null;
	}>();

	const isImg2Img = $derived(imageType === 'img2img');

	let imageModels = $state<ModelSpec[]>([]);
	let imageModel = $state('');
	let busy = $state(false);
	// Last standalone-generation failure (shown as a problem cue, cleared on
	// the next attempt). The "in-queue / generating" cue is `busy` itself.
	let lastError = $state<string | null>(null);
	// Notify the parent modal whenever a standalone generation starts/finishes
	// so it can hold its Confirm button while this piece is in flight.
	$effect(() => {
		onBusyChange?.(busy);
	});
	// Seed at most once per distinct model/preset config. Without this guard
	// the effect below reassigns the imageModels $state array (a fresh
	// reference) on every pass, and Svelte 5 re-invalidates this very effect
	// until it aborts with `effect_update_depth_exceeded` (the same bug
	// GenerateModal guards against — the "modal frozen / never appears"
	// symptom). The key guard makes re-runs no-ops; a changed settings config
	// still re-seeds.
	// Note: no cleanup resetting this. On re-mount the $state re-initializes
	// to null, so a new piece re-seeds; the persistent key is what breaks the
	// re-invalidation loop on same-mount re-runs (a cleanup that nulled it on
	// re-run would re-trigger the seed forever).
	let imageModelSeedKey = $state<string | null>(null);

	// The currently-shown "generated" preview (default = the newest on-disk).
	// `generatedUrl` is the WebView blob URL; `generatedPath` is the on-disk
	// media path so the "open in viewer" icon can hand it to the OS opener
	// (a blob URL is useless to an OS viewer — same split the top panel uses).
	// `generatedRemote` is the provider's shareable remote URL for the current
	// generation (preferred target for the "copy URL" action over the preview).
	let generatedUrl = $state<string | null>(null);
	let generatedPath = $state<string | null>(null);
	let generatedRemote = $state<string | null>(null);
	let sourceUrl = $state<string | null>(null);
	let sourcePath = $state<string | null>(null);
	let sourceRemote = $state<string | null>(null);
	let history = $state<PieceHistoryEntry[]>([]);
	let historyThumbs = $state<(string | null)[]>([]);

	// Fullscreen zoom + pan preview of any piece image (click a preview →
	// lightbox; double-click a history thumb works too).
	let lbOpen = $state(false);
	let lbSrc = $state<string | null>(null);
	let lbTitle = $state('');
	function openPreview(src: string | null, title: string) {
		if (!src) return;
		lbSrc = src;
		lbTitle = title;
		lbOpen = true;
	}

	// Seed the image-model picker from the profile's default (mirrors
	// GenerateModal): read-only / pending models are filtered out.
	$effect(() => {
		const s = getSettings();
		const key = [s.providers.image.model, s.providers.image.preset].join('|');
		if (imageModelSeedKey === key) return;
		imageModelSeedKey = key;
		const ip = getPreset(s.providers.image.preset);
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m) => !m.readOnly && !m.obsolete);
		imageModel = s.providers.image.model;
		if (!imageModels.some((m) => m.id === imageModel))
			imageModel = imageModels.find((m) => !m.pending)?.id ?? imageModel;
	});

	function isRemote(v?: string | null): boolean {
		return !!v && /^https?:\/\//i.test(v.trim());
	}

	/** Open a preview image in the OS's default viewer. A REMOTE url is
	 *  handed to the browser (a new tab); a LOCAL media path goes through the
	 *  backend's `open_media_in_player` command (the blob URL the <img> uses is
	 *  useless to an OS viewer, so the on-disk path travels instead). The same
	 *  command works for images and video — it just spawns the platform opener. */
	async function openInViewer(localPath: string | null, displayUrl: string | null) {
		if (!localPath) {
			// No on-disk path (e.g. a remote reference with no local artifact):
			// fall back to opening the display URL in a new browser tab.
			if (displayUrl) {
				if (isRemote(displayUrl)) window.open(displayUrl, '_blank', 'noopener,noreferrer');
				else window.open(displayUrl, '_blank');
			}
			return;
		}
		if (!isTauri()) return;
		try {
			await invoke('open_media_in_player', { input: { path: localPath } });
			flashToast('Opened in system viewer', 'info');
		} catch (e) {
			flashToast(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	/** Copy a URL to the clipboard. Prefers the shareable remote URL when one
	 *  is available, else falls back to the displayed (blob/asset) URL. */
	async function copyUrl(remote: string | null, display: string | null) {
		const target = remote ?? display;
		if (!target) return;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(target);
			} else {
				// Non-secure context fallback (some WebView origins).
				const ta = document.createElement('textarea');
				ta.value = target;
				ta.style.position = 'fixed';
				ta.style.opacity = '0';
				document.body.appendChild(ta);
				ta.select();
				document.execCommand('copy');
				document.body.removeChild(ta);
			}
			flashToast('URL copied', 'success');
		} catch {
			flashToast('Copy failed', 'error');
		}
	}

	/** Resolve a displayable URL for the img2img source (reference) image.
	 *  Also records the on-disk path when the source is a local media path so
	 *  the "open in viewer" icon has a real file to hand to the OS opener, and
	 *  the remote URL so the "copy URL" button copies something shareable. */
	async function refreshSource() {
		if (!referenceUrl) {
			sourceUrl = null;
			sourcePath = null;
			sourceRemote = null;
			return;
		}
		const remote = isRemote(referenceUrl);
		const dataUri = /^data:image\//i.test(referenceUrl.trim());
		// A data: URI (a locally-picked base / extracted last frame) renders
		// directly in the WebView; only a real media-tree path goes through
		// the read_media_file IPC (the media root allowlist rejects anything
		// else, and a data URI is not a path at all).
		sourceUrl = remote || dataUri ? referenceUrl : await toMediaUrl(referenceUrl);
		sourcePath = remote || dataUri ? null : referenceUrl;
		sourceRemote = remote ? referenceUrl : null;
	}

	function thumbUrl(entry: PieceHistoryEntry): Promise<string | null> {
		return entry.localPath ? toMediaUrl(entry.localPath) : Promise.resolve(null);
	}

	/** Load the piece's on-disk history and preview the SAVED artifact (the
	 *  piece's persisted generation) when present, else the newest entry. */
	async function loadHistory() {
		const entries = await listPieceHistory(sessionId, pipeId, refId, kind);
		history = entries;
		historyThumbs = await Promise.all(entries.map((e) => thumbUrl(e)));
		await refreshSource();
		// 0012 D3-fix: prefer the piece's persisted generation preview over
		// "always the newest" so a re-opened modal lands on the user's choice.
		const seed = initialLocal ?? initialRemote;
		const match = seed
			? entries.find((e) =>
					initialLocal ? e.localPath === initialLocal : e.remoteUrl === initialRemote,
				)
			: undefined;
		const chosen = match ?? entries[0];
		if (chosen?.localPath) {
			generatedPath = chosen.localPath;
			generatedRemote = chosen.remoteUrl ?? null;
			// historyThumbs aligns 1:1 with `history` (=== entries), so the
			// pre-resolved blob URL for the chosen artifact is already cached.
			const idx = entries.findIndex((e) => e.localPath === chosen.localPath);
			generatedUrl = (idx >= 0 ? historyThumbs[idx] : null) ?? (await toMediaUrl(chosen.localPath));
		} else if (initialRemote) {
			generatedRemote = initialRemote;
			generatedUrl = initialRemote;
		}
	}

	// Load when the modal opens for a given piece.
	$effect(() => {
		if (refId) void loadHistory();
	});

	/** A history thumb was clicked — preview that generation AND propagate it
	 *  to the parent record via onGenerated so the *selected* image is what
	 *  gets persisted (previously only the newest was, so a reopened modal
	 *  always jumped back to the last generation). */
	function selectGeneration(entry: PieceHistoryEntry, idx: number) {
		// `historyThumbs[idx]` is the already-resolved `toMediaUrl` cache entry
		// for this generation; fall back to re-resolving for a missing local.
		generatedPath = entry.localPath ?? null;
		generatedRemote = entry.remoteUrl ?? null;
		void (entry.localPath ? toMediaUrl(entry.localPath) : Promise.resolve(null)).then(
			(u) => (generatedUrl = u ?? historyThumbs[idx] ?? null),
		);
		// Persist the selection onto the keyframe / subject record.
		onGenerated?.(entry.localPath ?? '', entry.remoteUrl ?? '');
	}

	async function doGenerate() {
		if (busy || !prompt.trim()) return;
		busy = true;
		lastError = null;
		try {
			const res = await generatePiece({
				sessionId,
				pipeId,
				refId,
				kind,
				imageType,
				prompt,
				referenceUrl,
				imageModel: imageModel || undefined,
			});
			// The fresh artifact becomes the current "generated" preview + the
			// newest history entry (its row is also on disk via the manifest).
			const freshUrl = await toMediaUrl(res.localPath);
			generatedPath = res.localPath;
			generatedRemote = res.remoteUrl ?? null;
			generatedUrl = freshUrl;
			historyThumbs = [freshUrl ?? '', ...historyThumbs];
			history = [
				{
					ts: Date.now(),
					model: imageModel,
					seed: null,
					prompt,
					localPath: res.localPath,
					remoteUrl: res.remoteUrl,
				},
				...history,
			];
			await refreshSource();
			onGenerated?.(res.localPath, res.remoteUrl);
			flashToast('Image generated', 'info');
		} catch (e) {
			console.error('[PieceGenPanel] generate failed:', e);
			lastError = e instanceof Error ? e.message : String(e);
			flashToast(lastError, 'error');
		} finally {
			busy = false;
		}
	}
</script>

<section class="piece-gen" aria-label="Image generation">
	<div class="pg-controls">
		<label class="pg-select">
			<span>Image model</span>
			<select
				value={imageModel}
				onchange={(e) => (imageModel = e.currentTarget.value)}
				disabled={busy}
				aria-label="Image model"
			>
				{#each imageModels as m (m.id)}
					<option value={m.id} disabled={m.pending}>{m.label ?? m.id}{m.pending ? ' (pending)' : ''}</option>
				{/each}
			</select>
		</label>
		<button class="pg-generate" onclick={doGenerate} disabled={busy || !prompt.trim()}>
			{busy ? 'Generating…' : 'Generate'}
			{#if busy}
				<span class="pg-gen-cue" role="status" aria-label="In queue / generating">
					<span class="pg-gen-dot" />
				</span>
			{:else if lastError}
				<span class="pg-gen-cue pg-gen-cue-error" role="status" aria-label="Generation failed" title={lastError}>
					<ChromeIcon id="warning" size={12} />
				</span>
			{/if}
		</button>
	</div>

	{#if isImg2Img}
		<div class="pg-preview-pair">
			<figure class="pg-preview">
				<figcaption>Source</figcaption>
				{#if sourceUrl}
					<div class="pg-imgwrap" onclick={() => openPreview(sourceUrl, 'Source')}>
						<img src={sourceUrl} alt="Source image" />
						{#if sourceRemote || sourceUrl}
							<button class="pg-copy" onclick={(e) => { e.stopPropagation(); copyUrl(sourceRemote, sourceUrl); }} title="Copy URL" aria-label="Copy source image URL"><ChromeIcon id="copy" size={14} /></button>
						{/if}
						<button class="pg-open" onclick={(e) => { e.stopPropagation(); openInViewer(sourcePath, sourceUrl); }} title="Open in viewer" aria-label="Open source image in viewer"><ChromeIcon id="eye" size={14} /></button>
					</div>
				{:else}
					<div class="pg-empty">No source</div>
				{/if}
			</figure>
			<figure class="pg-preview">
				<figcaption>Generated</figcaption>
				{#if generatedUrl}
					<div class="pg-imgwrap" onclick={() => openPreview(generatedUrl, 'Generated')}>
						<img src={generatedUrl} alt="Generated image" />
						{#if generatedRemote || generatedUrl}
							<button class="pg-copy" onclick={(e) => { e.stopPropagation(); copyUrl(generatedRemote, generatedUrl); }} title="Copy URL" aria-label="Copy generated image URL"><ChromeIcon id="copy" size={14} /></button>
						{/if}
						<button class="pg-open" onclick={(e) => { e.stopPropagation(); openInViewer(generatedPath, generatedUrl); }} title="Open in viewer" aria-label="Open generated image in viewer"><ChromeIcon id="eye" size={14} /></button>
					</div>
				{:else}
					<div class="pg-empty">{busy ? 'Working…' : 'No generation yet'}</div>
				{/if}
			</figure>
		</div>
	{:else}
		<figure class="pg-preview pg-preview-single">
			<figcaption>Generated</figcaption>
			{#if generatedUrl}
				<div class="pg-imgwrap" onclick={() => openPreview(generatedUrl, 'Generated')}>
					<img src={generatedUrl} alt="Generated image" />
					{#if generatedRemote || generatedUrl}
						<button class="pg-copy" onclick={(e) => { e.stopPropagation(); copyUrl(generatedRemote, generatedUrl); }} title="Copy URL" aria-label="Copy generated image URL"><ChromeIcon id="copy" size={14} /></button>
					{/if}
					<button class="pg-open" onclick={(e) => { e.stopPropagation(); openInViewer(generatedPath, generatedUrl); }} title="Open in viewer" aria-label="Open generated image in viewer"><ChromeIcon id="eye" size={14} /></button>
				</div>
			{:else}
				<div class="pg-empty">{busy ? 'Working…' : 'No generation yet'}</div>
			{/if}
		</figure>
	{/if}

	{#if history.length > 0}
		<div class="pg-history">
			<span class="pg-history-label">History ({history.length}) · double-click to zoom</span>
			<div class="pg-history-thumbs">
				{#each history as h, i (h.localPath + ':' + h.ts)}
					<button
						class="pg-thumb"
						class:pg-thumb-active={generatedUrl === historyThumbs[i]}
						onclick={() => selectGeneration(h, i)}
						ondblclick={() => historyThumbs[i] && openPreview(historyThumbs[i], `Generation ${i + 1}`)}
						title="{h.model}{h.ts ? ' · ' + new Date(h.ts).toLocaleString() : ''}"
						aria-label="Preview generation"
					>
						{#if historyThumbs[i]}
							<img src={historyThumbs[i]} alt="Generation {i + 1}" />
						{:else}
							<span class="pg-thumb-empty">…</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<ImageLightbox bind:open={lbOpen} src={lbSrc} title={lbTitle} />
</section>

<style>
	.piece-gen {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px dashed var(--border-color);
	}

	.pg-controls {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}

	.pg-select {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.pg-select span {
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.pg-select select {
		width: 100%;
		padding: 9px 11px;
		font-size: 0.85rem;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
	}

	.pg-select select:focus {
		outline: none;
		border-color: var(--accent-color);
	}

	.pg-generate {
		flex: none;
		padding: 10px 18px;
		font-size: 13px;
		cursor: pointer;
		border: none;
		border-radius: 6px;
		background: var(--accent-color);
		color: var(--text-inverse, #fff);
		transition: opacity 0.15s ease;
	}

	.pg-generate:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Minimal in-button generation cue: a small status dot (in-queue /
	   generating) that appears inside the Generate button while a standalone
	   image run is in flight, and a small red warning on error. No separate
	   panel / box — just a compact indicator next to the button's label. */
	.pg-gen-cue {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: 8px;
	}

	.pg-gen-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent-color, #ff3e00);
		animation: pg-gen-pulse 1s ease-in-out infinite;
	}

	.pg-gen-cue-error {
		color: var(--error-color, #f87171);
	}

	.pg-gen-cue-error svg {
		color: var(--error-color, #f87171);
	}

	@keyframes pg-gen-pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.35; transform: scale(0.8); }
	}

	.pg-preview-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.pg-preview {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.pg-preview-single {
		max-width: 240px;
	}

	.pg-preview figcaption {
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pg-preview img,
	.pg-empty {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background: var(--bg-tertiary);
	}

	.pg-preview img {
		display: block;
	}

	/* Positioning context for the open-in-viewer + copy-URL icon overlays. */
	.pg-imgwrap {
		position: relative;
	}

	.pg-imgwrap img {
		display: block;
		width: 100%;
	}

	/* Small corner icons over a preview. Reveal-on-hover keeps the thumbnail
	   uncluttered; they stay reachable when shown. Open = top-right, copy =
	   top-left so the two never overlap. */
	.pg-open,
	.pg-copy {
		position: absolute;
		top: 4px;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg-secondary, #14141f) 82%, transparent);
		color: var(--text-secondary, #a1a1aa);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}

	.pg-open { right: 4px; }
	.pg-copy { left: 4px; }

	.pg-imgwrap:hover .pg-open,
	.pg-imgwrap:hover .pg-copy,
	.pg-open:focus-visible,
	.pg-copy:focus-visible {
		opacity: 1;
	}

	.pg-open:hover,
	.pg-copy:hover {
		color: var(--text-primary, #fff);
		border-color: var(--accent-color, #ff3e00);
	}

	.pg-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.pg-history {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.pg-history-label {
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pg-history-thumbs {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.pg-thumb {
		flex: none;
		width: 56px;
		height: 40px;
		padding: 0;
		border: 2px solid var(--border-color);
		border-radius: 5px;
		overflow: hidden;
		cursor: pointer;
		background: var(--bg-tertiary);
	}

	.pg-thumb-active {
		border-color: var(--accent-color);
	}

	.pg-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
</style>
