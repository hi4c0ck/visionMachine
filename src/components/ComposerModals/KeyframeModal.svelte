<script lang="ts">
	import type { PipeRow, PipeKeyframe, ModelSpec } from '$types';
	import { addKeyframe as addKeyframeAction, setTrimBoundary, sessions } from '$lib/composerStore';
	import { getSettings } from '$lib/settings/store';
	import { getPreset, modelsFor } from '$lib/settings/catalog';
	import {
		availableImageTiers,
		availableImageRatios,
		sessionDefaultTier,
		sessionDefaultRatio,
		sessionDefaultLabel,
	} from '$lib/settings/mediaMode';
	import PieceGenPanel from './PieceGenPanel.svelte';
	import { flashToast } from '$lib/flashToast';
	import { snapTo8 } from '$lib/frameMath';
	import { isTauri } from '@tauri-apps/api/core';
	import { pickImageFile, readUserImage, extractPipeLastFrame } from '$lib/localImage';

	let {
		pipe,
		sessionId,
		maxFrames,
		editingSlot,
		prevPipe = null,
		open = $bindable(false),
		onSaved,
	} = $props<{
		pipe: PipeRow;
		sessionId: string | undefined;
		maxFrames: number;
		editingSlot: number | null;
		/** The pipe just before this one in timeline order — the source of
		 *  the slot-1 "use last frame" action (its last-gen video's final
		 *  frame). Null when this is the first pipe. */
		prevPipe?: PipeRow | null;
		open: boolean;
		/** Fires after a successful save so the caller can re-validate the
		 * reference's URL accessibility (D5 red-out clears on success). */
		onSaved?: (refId: string) => void;
	}>();

	import '../composer-modal.css';

	let kfType = $state<'url' | 'txt2img' | 'img2img'>('url');
	// url mode and the prompt modes are INDEPENDENT fields: a URL pasted into
	// the url section must NOT bleed into the txt2img/img2img prompt box when
	// the user flips the mode tabs (previously one shared `kfValue`).
	let kfUrl = $state('');
	let kfPrompt = $state('');
	// img2img carries two independent fields: the reference image and the prompt.
	let kfReferenceUrl = $state('');
	let kfFrame = $state(0);
	// Stable piece id for this slot: an existing keyframe keeps its own id, a
	// new slot gets a provisional one so a pre-save "Generate" writes to the
	// same on-disk history the saved piece will own.
	let kfRefId = $state('');
	// The modal's standalone generation result (previewed live + carried onto
	// the record at Confirm so the chip shows a thumbnail immediately).
	let kfGenLocal = $state('');
	let kfGenRemote = $state('');
	// 0012 Phase 4: per-piece image size-mode override. `default` = use the
	// session default (shown with its tier/ratio label); a concrete tier/ratio
	// pair overrides it for this piece only (R-3: request params, not bytes).
	let kfSizeMode = $state<'default' | 'custom'>('default');
	let kfCustomSize = $state('');
	let kfCustomRatio = $state('');

	// Resolve the active image model + its size options (mirrors PieceGenPanel:
	// the profile default, non-readOnly, non-pending fallback).
	const imageModel = $derived.by((): ModelSpec | null => {
		const s = getSettings();
		const ip = getPreset(s.providers.image.preset);
		const models = (ip ? modelsFor(ip, 'image') : []).filter((m) => !m.readOnly);
		let id = s.providers.image.model;
		if (!models.some((m) => m.id === id)) id = models.find((m) => !m.pending)?.id ?? id;
		return models.find((m) => m.id === id) ?? null;
	});
	const sizeTiers = $derived(availableImageTiers(imageModel));
	const sizeRatios = $derived(availableImageRatios(imageModel));
	const defTier = $derived(sessionDefaultTier(imageModel, sessions.get(sessionId ?? '')));
	const defRatio = $derived(sessionDefaultRatio(imageModel, sessions.get(sessionId ?? '')));
	const defLabel = $derived(sessionDefaultLabel(imageModel, sessions.get(sessionId ?? '')));

	// Seed values when the modal opens (moved verbatim from openKeyframeModal)
	$effect(() => {
		if (!open || editingSlot === null) return;
		const existing = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === editingSlot);
		if (existing) {
			kfType = existing.type;
			kfUrl = existing.imageSrc ?? '';
			kfPrompt = existing.prompt ?? '';
			kfReferenceUrl = existing.referenceUrl ?? '';
			kfFrame = existing.frame;
			kfRefId = existing.id;
			kfGenLocal = existing.previewLocalPath ?? '';
			kfGenRemote = existing.previewRemoteUrl ?? '';
			// 0012 Phase 4: restore this piece's explicit size override (if any).
			if (existing.imageSize || existing.imageRatio) {
				kfSizeMode = 'custom';
				kfCustomSize = existing.imageSize ?? '';
				kfCustomRatio = existing.imageRatio ?? '';
			} else {
				kfSizeMode = 'default';
				kfCustomSize = '';
				kfCustomRatio = '';
			}
		} else {
			kfType = 'url';
			kfUrl = '';
			kfPrompt = '';
			kfReferenceUrl = '';
			kfFrame = snapTo8(pipe.keyframes.length > 0 ? pipe.keyframes[0].frame : 0);
			kfRefId = `kf-slot${editingSlot}`;
			kfGenLocal = '';
			kfGenRemote = '';
			kfSizeMode = 'default';
			kfCustomSize = '';
			kfCustomRatio = '';
		}
	});

	// url needs a URL; txt2img needs a prompt; img2img needs both.
	const kfValid = $derived(
		kfType === 'url'
			? kfUrl.trim().length > 0
			: kfType === 'txt2img'
				? kfPrompt.trim().length > 0
				: kfReferenceUrl.trim().length > 0 && kfPrompt.trim().length > 0,
	);

	// #5 by-design preview: a url-mode keyframe holds a DIRECT image source —
	// a `data:` URI (the last-frame catch / a picked local image) or a remote
	// https URL. The PieceGenPanel thumbnails above only cover txt2img/img2img,
	// so render a compact thumbnail here for url-mode so a captured last frame
	// (or any pasted URL) is visible when the modal opens.
	const kfUrlPreviewable = $derived(/^data:image\/?|^https?:\/\//i.test(kfUrl.trim()));

	// The value that's ACTIVE for the current mode: the URL field in url mode,
	// the prompt field in the generation modes. This is what gets persisted
	// (imageSrc vs prompt) and validated.
	const kfActiveValue = $derived(kfType === 'url' ? kfUrl : kfPrompt);

	// ── User-sourced image assets ────────────────────────────────────────────
	// "Use last frame" (slot 1 only): grab the previous pipe's last-gen video's
	// final frame into this keyframe. "Browse local": pick an image file as
	// the img2img reference base. Both yield a base64 data URI (provider-ready)
	// and also persist a durable copy under the pipe's user-images dir.
	let lastFrameBusy = $state(false);
	let localBusy = $state(false);
	const canUseLastFrame = $derived(
		isTauri() &&
			kfType === 'url' &&
			editingSlot === 1 &&
			!!prevPipe &&
			prevPipe.lastGeneration?.status === 'done' &&
			(prevPipe.lastGeneration?.videoPath ?? '').trim().length > 0,
	);

	async function useLastFrame() {
		if (!sessionId || !prevPipe || lastFrameBusy) return;
		lastFrameBusy = true;
		try {
			const res = await extractPipeLastFrame(sessionId, pipe.id);
			kfUrl = res.dataUri;
			// A locally-sourced keyframe's own preview = the source itself.
			kfGenLocal = res.localPath || '';
			kfGenRemote = '';
			flashToast(`Last frame of ${res.sourcePipeName} → keyframe ${editingSlot}`, 'success');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			flashToast(msg.startsWith('{') ? 'Could not extract last frame' : msg, 'error');
		} finally {
			lastFrameBusy = false;
		}
	}

	async function browseLocal() {
		if (!sessionId || localBusy) return;
		const path = await pickImageFile();
		if (!path) return; // cancelled / non-Tauri
		localBusy = true;
		try {
			const res = await readUserImage(sessionId, pipe.id, kfRefId || 'local', path);
			kfReferenceUrl = res.dataUri;
			// Keep a live preview of the picked base in the generated panel.
			kfGenLocal = res.localPath || '';
			kfGenRemote = '';
			flashToast('Local image loaded as img2img reference', 'success');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			flashToast(msg.startsWith('{') ? 'Could not load local image' : msg, 'error');
		} finally {
			localBusy = false;
		}
	}

	async function confirm() {
		if (!sessionId || editingSlot === null) return;
		if (!kfValid) return;
		const result = await addKeyframeAction(
			sessionId,
			pipe.id,
			editingSlot,
			kfFrame,
			kfType,
			kfActiveValue,
			kfType === 'img2img' ? kfReferenceUrl : undefined,
			// Stable piece id + the pre-save generation preview (local + remote).
			kfRefId || undefined,
			kfGenLocal || undefined,
			kfGenRemote || undefined,
			// 0012 Phase 4: per-piece size override (default -> null = session
			// default; custom -> the selected tier/ratio from the model catalog).
			kfSizeMode === 'custom'
				? { size: kfCustomSize || null, ratio: kfCustomRatio || null }
				: { size: null, ratio: null },
		);
		if (result.errors.length > 0) {
			flashToast(result.errors[0] || 'Failed to save keyframe');
			console.error('[KeyframeModal] confirm:', result.errors);
			return;
		}
		open = false;
		kfUrl = '';
		kfPrompt = '';
		kfReferenceUrl = '';
		// upsert keeps the id stable — resolve it and let the caller re-check
		const savedKf = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === editingSlot);
		if (savedKf) onSaved?.(savedKf.id);
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => open = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{editingSlot ? 'Edit Keyframe' : 'Add Keyframe'} <span class="modal-sub">Slot {editingSlot ?? '?'}</span></h3>
			</div>
			<div class="modal-body">
				<div class="mode-selector">
					<button class="mode-btn {kfType === 'url' ? 'active' : ''}" onclick={() => kfType = 'url'}>URL</button>
					<button class="mode-btn {kfType === 'txt2img' ? 'active' : ''}" onclick={() => kfType = 'txt2img'}>Txt2Img</button>
					<button class="mode-btn {kfType === 'img2img' ? 'active' : ''}" onclick={() => kfType = 'img2img'}>Img2Img</button>
				</div>
				<div class="modal-field">
					<label id="kf-frame-label">Frame</label>
					<input type="number" bind:value={kfFrame} step={8} min={0} max={maxFrames - 1} class="modal-input" aria-labelledby="kf-frame-label" />
				</div>
				{#if kfType === 'url'}
					<div class="modal-field">
						<label id="kf-url-label">Image URL</label>
						<div class="modal-url-row">
							<input type="text" bind:value={kfUrl} placeholder="https://... or a data URI" class="modal-input" aria-labelledby="kf-url-label" />
							{#if canUseLastFrame}
								<button
									class="btn-icon"
									type="button"
									disabled={lastFrameBusy}
									onclick={useLastFrame}
									title={`Use last frame of ${prevPipe?.name ?? 'previous pipe'} (its last-gen video)`}
									aria-label="Use previous pipe last frame"
								>{lastFrameBusy ? '…' : '⏮'}</button>
							{/if}
						</div>
						{#if kfUrlPreviewable}
							<div class="kf-url-thumb" title="Keyframe preview">
								<img src={kfUrl} alt="Keyframe preview" />
								<span>{canUseLastFrame && prevPipe ? 'Last frame of ' + prevPipe.name : 'Keyframe'}</span>
							</div>
						{/if}
					</div>
				{:else if kfType === 'txt2img'}
					<div class="modal-field">
						<label id="kf-prompt-label">Prompt</label>
						<textarea bind:value={kfPrompt} placeholder="Describe the image..." class="modal-textarea" aria-labelledby="kf-prompt-label"></textarea>
					</div>
				{:else if kfType === 'img2img'}
					<div class="modal-field">
						<label id="kf-ref-label">Reference Image</label>
						<div class="modal-url-row">
							<input type="text" bind:value={kfReferenceUrl} placeholder="https://... or pick a file" class="modal-input" aria-labelledby="kf-ref-label" />
							{#if isTauri()}
								<button
									class="btn-icon"
									type="button"
									disabled={localBusy}
									onclick={browseLocal}
									title="Pick a local image as the img2img base"
									aria-label="Browse local reference image"
								>{localBusy ? '…' : '📁'}</button>
							{/if}
						</div>
					</div>
					<div class="modal-field">
						<label id="kf-img2img-prompt-label">Prompt</label>
						<textarea bind:value={kfPrompt} placeholder="Describe the image..." class="modal-textarea" aria-labelledby="kf-img2img-prompt-label"></textarea>
					</div>
				{/if}

				{#if kfType !== 'url' && kfRefId && sessionId}
					<PieceGenPanel
						kind="keyframe"
						refId={kfRefId}
						sessionId={sessionId}
						pipeId={pipe.id}
						imageType={kfType}
						prompt={kfPrompt}
						referenceUrl={kfType === 'img2img' ? kfReferenceUrl : undefined}
						onGenerated={(l, r) => { kfGenLocal = l; kfGenRemote = r ?? ''; }}
					/>
				{/if}

				{#if kfType !== 'url'}
					<div class="modal-field kf-size-field">
						<label id="kf-size-label">Size mode</label>
						<div class="kf-size-row">
							<select
								class="modal-input"
								value={kfSizeMode}
								onchange={(e) => (kfSizeMode = e.currentTarget.value as 'default' | 'custom')}
								aria-labelledby="kf-size-label"
							>
								<option value="default">Use session default ({defLabel})</option>
								{#if sizeTiers.length || sizeRatios.length}
									<option value="custom">Custom size</option>
								{/if}
							</select>
							{#if kfSizeMode === 'custom'}
								<select class="modal-input" bind:value={kfCustomSize} aria-label="Size tier">
									{#if sizeTiers.length}
										{#each sizeTiers as t (t)}
											<option value={t}>{t}</option>
										{/each}
									{:else}
										<option value="">(no size tiers)</option>
									{/if}
								</select>
								<select class="modal-input" bind:value={kfCustomRatio} aria-label="Aspect ratio">
									{#if sizeRatios.length}
										{#each sizeRatios as r (r)}
											<option value={r}>{r}</option>
										{/each}
									{:else}
										<option value="">(no ratios)</option>
									{/if}
								</select>
							{/if}
						</div>
						<p class="kf-size-hint">
							{#if kfSizeMode === 'default'}
								Session default: {defLabel} — all images in this session generate at this size unless overridden here.
							{:else}
								{#if sizeTiers.length || sizeRatios.length}
									Generates this piece at {kfCustomSize || '—'} {kfCustomRatio && `· ${kfCustomRatio}`}.
								{:else}
									The current model offers no explicit size options.
								{/if}
							{/if}
						</p>
					</div>
				{/if}

				{#if getSettings().experimental?.composePipes === true && prevPipe != null}
					<label class="kf-trim-check" title="Experimental: drop one 8n+1 keyframe interval off this pipe's clip head when the session video is composed">
						<input
							type="checkbox"
							checked={pipe.trimBoundary === true}
							onchange={(e) => void setTrimBoundary(sessionId!, pipe.id, (e.target as HTMLInputElement).checked)}
						/>
						<span>Trim 8-frame boundary at compose</span>
					</label>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={!kfValid}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Experimental "compose pipes" per-pipe boundary-trim toggle. Inline row
	   under the generation panel; visible only on interior pipes when the
	   master gate (Settings > Tools > Experimental) is on. */
	.kf-trim-check {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		padding: 8px 10px;
		border: 1px dashed var(--border-color, #3f3f46);
		border-radius: 7px;
		font-size: 0.8rem;
		color: var(--text-secondary, #a1a1aa);
		cursor: pointer;
	}
	.kf-trim-check input {
		accent-color: var(--accent-color, #ff3e00);
	}
	.kf-trim-check:hover {
		border-color: var(--accent-color, #ff3e00);
	}

	.kf-url-thumb {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
	}
	.kf-url-thumb img {
		width: 100%;
		max-width: 260px;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background: var(--bg-tertiary);
	}
	.kf-url-thumb span {
		font-size: 0.68rem;
		color: var(--text-muted);
	}

	/* 0012 Phase 4: per-piece image size-mode selector. */
	.kf-size-field {
		margin-top: 12px;
	}
	.kf-size-row {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
	.kf-size-row .modal-input {
		flex: 1;
	}
	.kf-size-hint {
		margin: 6px 0 0;
		font-size: 0.68rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
</style>
