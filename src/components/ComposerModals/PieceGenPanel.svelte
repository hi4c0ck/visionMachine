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
	import {
		generatePiece,
		listPieceHistory,
		type PieceHistoryEntry,
		type PieceKind,
	} from '$lib/pieceGeneration';
	import type { ModelSpec } from '$types';

	let {
		kind,
		refId,
		sessionId,
		pipeId,
		imageType,
		prompt,
		referenceUrl,
		onGenerated,
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
	}>();

	const isImg2Img = $derived(imageType === 'img2img');

	let imageModels = $state<ModelSpec[]>([]);
	let imageModel = $state('');
	let busy = $state(false);

	// The currently-shown "generated" preview (default = the newest on-disk).
	let generatedUrl = $state<string | null>(null);
	let sourceUrl = $state<string | null>(null);
	let history = $state<PieceHistoryEntry[]>([]);
	let historyThumbs = $state<(string | null)[]>([]);

	// Seed the image-model picker from the profile's default (mirrors
	// GenerateModal): read-only / pending models are filtered out.
	$effect(() => {
		const s = getSettings();
		const ip = getPreset(s.providers.image.preset);
		imageModels = (ip ? modelsFor(ip, 'image') : []).filter((m) => !m.readOnly);
		imageModel = s.providers.image.model;
		if (!imageModels.some((m) => m.id === imageModel))
			imageModel = imageModels.find((m) => !m.pending)?.id ?? imageModel;
	});

	function isRemote(v?: string | null): boolean {
		return !!v && /^https?:\/\//i.test(v.trim());
	}

	/** Resolve a displayable URL for the img2img source (reference) image. */
	async function refreshSource() {
		if (!referenceUrl) {
			sourceUrl = null;
			return;
		}
		sourceUrl = isRemote(referenceUrl) ? referenceUrl : await toMediaUrl(referenceUrl);
	}

	function thumbUrl(entry: PieceHistoryEntry): Promise<string | null> {
		return entry.localPath ? toMediaUrl(entry.localPath) : Promise.resolve(null);
	}

	/** Load the piece's on-disk history and preview the newest artifact. */
	async function loadHistory() {
		const entries = await listPieceHistory(sessionId, pipeId, refId, kind);
		history = entries;
		historyThumbs = await Promise.all(entries.map((e) => thumbUrl(e)));
		await refreshSource();
		const newest = entries[0];
		if (newest?.localPath) generatedUrl = await toMediaUrl(newest.localPath);
	}

	// Load when the modal opens for a given piece.
	$effect(() => {
		if (refId) void loadHistory();
	});

	/** A history thumb was clicked — preview that generation. */
	function selectGeneration(entry: PieceHistoryEntry, idx: number) {
		// `historyThumbs[idx]` is the already-resolved `toMediaUrl` cache entry
		// for this generation; fall back to re-resolving for a missing local.
		void (entry.localPath ? toMediaUrl(entry.localPath) : Promise.resolve(null)).then(
			(u) => (generatedUrl = u ?? historyThumbs[idx] ?? null),
		);
	}

	async function doGenerate() {
		if (busy || !prompt.trim()) return;
		busy = true;
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
			flashToast(e instanceof Error ? e.message : String(e), 'error');
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
		</button>
	</div>

	{#if isImg2Img}
		<div class="pg-preview-pair">
			<figure class="pg-preview">
				<figcaption>Source</figcaption>
				{#if sourceUrl}
					<img src={sourceUrl} alt="Source image" />
				{:else}
					<div class="pg-empty">No source</div>
				{/if}
			</figure>
			<figure class="pg-preview">
				<figcaption>Generated</figcaption>
				{#if generatedUrl}
					<img src={generatedUrl} alt="Generated image" />
				{:else}
					<div class="pg-empty">{busy ? 'Working…' : 'No generation yet'}</div>
				{/if}
			</figure>
		</div>
	{:else}
		<figure class="pg-preview pg-preview-single">
			<figcaption>Generated</figcaption>
			{#if generatedUrl}
				<img src={generatedUrl} alt="Generated image" />
			{:else}
				<div class="pg-empty">{busy ? 'Working…' : 'No generation yet'}</div>
			{/if}
		</figure>
	{/if}

	{#if history.length > 0}
		<div class="pg-history">
			<span class="pg-history-label">History ({history.length})</span>
			<div class="pg-history-thumbs">
				{#each history as h, i (h.localPath + ':' + h.ts)}
					<button
						class="pg-thumb"
						class:pg-thumb-active={generatedUrl === historyThumbs[i]}
						onclick={() => selectGeneration(h, i)}
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
