<script lang="ts">
	import type { PipeRow, SubjectReference, ModelSpec } from '$types';
	import {
		addSubjectRef as addSubjectRefAction,
		updateSubjectRef as updateSubjectRefAction,
	} from '$lib/composerStore';
	import { sessions } from '$lib/composerStore';
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
	import { isTauri } from '@tauri-apps/api/core';
	import { pickImageFile, readUserImage } from '$lib/localImage';

	let {
		pipe,
		sessionId,
		maxFrames,
		editingRefId,
		maxSubjectRefs,
		open = $bindable(false),
		onSaved,
	} = $props<{
		pipe: PipeRow;
		sessionId: string | undefined;
		maxFrames: number;
		editingRefId: string | null;
		maxSubjectRefs: number;
		open: boolean;
		/** Fires after a successful EDIT save so the caller can re-validate
		 * the reference's URL accessibility (D5 red-out clears on success). */
		onSaved?: (refId: string) => void;
	}>();

	import '../composer-modal.css';

	let srType = $state<'url' | 'txt2img' | 'img2img'>('url');
	let srImageUrl = $state('');
	let srPrompt = $state('');
	let srUseFrames = $state(false);
	let srStart = $state(0);
	let srEnd = $state(8);
	// Stable piece id for this ref: an existing ref keeps its own id, a new
	// ref gets a provisional one so a pre-save "Generate" writes to the same
	// on-disk history the saved ref will own.
	let srRefId = $state('');
	// The modal's standalone generation result (previewed live + carried onto
	// the record at Confirm so the chip shows a thumbnail immediately).
	let srGenLocal = $state('');
	let srGenRemote = $state('');
	// 0012 Phase 4: per-piece image size-mode override (same as KeyframeModal).
	let srSizeMode = $state<'default' | 'custom'>('default');
	let srCustomSize = $state('');
	let srCustomRatio = $state('');

	// Resolve the active image model + its size options (mirrors KeyframeModal).
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
	const defLabel = $derived(sessionDefaultLabel(imageModel, sessions.get(sessionId ?? '')));

	// Seed values when the modal opens (moved verbatim from openSubjectRefModal)
	$effect(() => {
		if (!open) return;
		const existing = editingRefId
			? (pipe.subjectReferences ?? []).find((r: SubjectReference) => r.id === editingRefId)
			: null;
		if (existing) {
			srType = existing.type ?? 'url';
			srImageUrl = existing.imageUrl;
			srPrompt = existing.prompt ?? '';
			srUseFrames = existing.useFrames ?? false;
			srStart = existing.frameStart ?? 0;
			srEnd = existing.frameEnd ?? Math.min(8, maxFrames - 1);
			srRefId = existing.id;
			srGenLocal = existing.previewLocalPath ?? '';
			srGenRemote = existing.previewRemoteUrl ?? '';
			// 0012 Phase 4: restore this piece's explicit size override (if any).
			if (existing.imageSize || existing.imageRatio) {
				srSizeMode = 'custom';
				srCustomSize = existing.imageSize ?? '';
				srCustomRatio = existing.imageRatio ?? '';
			} else {
				srSizeMode = 'default';
				srCustomSize = '';
				srCustomRatio = '';
			}
		} else {
			srType = 'url';
			srImageUrl = '';
			srPrompt = '';
			srUseFrames = false;
			srStart = 0;
			srEnd = Math.min(8, maxFrames - 1);
			srRefId = `sr-new${Date.now()}`;
			srGenLocal = '';
			srGenRemote = '';
			srSizeMode = 'default';
			srCustomSize = '';
			srCustomRatio = '';
		}
	});

	// Subjects follow the same preset rules as keyframes:
	// url → imageUrl, txt2img → prompt, img2img → imageUrl (reference) + prompt.
	const srValid = $derived(
		srType === 'url'
			? srImageUrl.trim().length > 0
			: srType === 'txt2img'
			? srPrompt.trim().length > 0
			: srImageUrl.trim().length > 0 && srPrompt.trim().length > 0,
	);

	// ── Local file as img2img reference base ──────────────────────────────────
	// Pick a local image → base64 data URI → stored in `srImageUrl` (the
	// img2img reference). Also persists a durable copy under the pipe's
	// user-images dir. The provider accepts data URIs (assert_media_fetchable).
	let localBusy = $state(false);
	async function browseLocal() {
		if (!sessionId || localBusy) return;
		const path = await pickImageFile();
		if (!path) return;
		localBusy = true;
		try {
			const res = await readUserImage(sessionId, pipe.id, srRefId || 'local', path);
			srImageUrl = res.dataUri;
			srGenLocal = res.localPath || '';
			srGenRemote = '';
			flashToast('Local image loaded as reference', 'success');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			flashToast(msg.startsWith('{') ? 'Could not load local image' : msg, 'error');
		} finally {
			localBusy = false;
		}
	}

	async function confirm() {
		if (!sessionId) return;
		if (!srValid) return;
		if (!editingRefId && (pipe.subjectReferences?.length ?? 0) >= maxSubjectRefs) return;

		let result;
		if (editingRefId) {
			// Atomic: one operation updates type/preset + range + useFrames together,
			// so a failure can't leave a partial edit behind.
			result = await updateSubjectRefAction(sessionId, pipe.id, editingRefId, {
				imageUrl: srImageUrl,
				useFrames: srUseFrames,
				frameStart: srUseFrames ? srStart : undefined,
				frameEnd: srUseFrames ? srEnd : undefined,
				type: srType,
				prompt: srPrompt,
				// 0012 Phase 4: the modal always sends an override decision
				// (default -> reset to session default; custom -> the selection).
				imageOverride:
					srSizeMode === 'custom'
						? { size: srCustomSize || null, ratio: srCustomRatio || null }
						: { size: null, ratio: null },
			});
			if (result.errors.length === 0) onSaved?.(editingRefId);
		} else {
			// Newly added refs get checked on the next generation Confirm (D5).
			result = await addSubjectRefAction(
				sessionId,
				pipe.id,
				srImageUrl,
				srUseFrames,
				srUseFrames ? srStart : undefined,
				srUseFrames ? srEnd : undefined,
				srType,
				srPrompt,
				// Stable piece id + the pre-save generation preview (local + remote).
				srRefId || undefined,
				srGenLocal || undefined,
				srGenRemote || undefined,
				// 0012 Phase 4: same override decision as the edit path.
				srSizeMode === 'custom'
					? { size: srCustomSize || null, ratio: srCustomRatio || null }
					: { size: null, ratio: null },
			);
		}
		if (result.errors.length > 0) {
			flashToast(result.errors[0] || 'Failed to save subject reference');
			console.error('[SubjectRefModal] confirm:', result.errors);
			return;
		}
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => open = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{editingRefId ? 'Edit Subject Reference' : 'Add Subject Reference'}</h3>
			</div>
			<div class="modal-body">
				<div class="mode-selector">
					<button class="mode-btn {srType === 'url' ? 'active' : ''}" onclick={() => (srType = 'url')}>URL</button>
					<button class="mode-btn {srType === 'txt2img' ? 'active' : ''}" onclick={() => (srType = 'txt2img')}>Txt2Img</button>
					<button class="mode-btn {srType === 'img2img' ? 'active' : ''}" onclick={() => (srType = 'img2img')}>Img2Img</button>
				</div>
				{#if srType === 'url'}
					<div class="modal-field">
						<label id="sr-url-label">Image URL</label>
						<input type="text" bind:value={srImageUrl} placeholder="https://..." class="modal-input" aria-labelledby="sr-url-label" />
					</div>
				{:else if srType === 'txt2img'}
					<div class="modal-field">
						<label id="sr-prompt-label">Prompt</label>
						<textarea bind:value={srPrompt} placeholder="Describe the subject image..." class="modal-textarea" aria-labelledby="sr-prompt-label"></textarea>
					</div>
				{:else}
					<div class="modal-field">
						<label id="sr-ref-label">Reference Image</label>
						<div class="modal-url-row">
							<input type="text" bind:value={srImageUrl} placeholder="https://... or pick a file" class="modal-input" aria-labelledby="sr-ref-label" />
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
						<label id="sr-img2img-prompt-label">Prompt</label>
						<textarea bind:value={srPrompt} placeholder="Describe the transformation..." class="modal-textarea" aria-labelledby="sr-img2img-prompt-label"></textarea>
					</div>
				{/if}
				{#if srType !== 'url' && srRefId && sessionId}
					<PieceGenPanel
						kind="subject"
						refId={srRefId}
						sessionId={sessionId}
						pipeId={pipe.id}
						imageType={srType}
						prompt={srPrompt}
						referenceUrl={srType === 'img2img' ? srImageUrl : undefined}
						onGenerated={(l, r) => { srGenLocal = l; srGenRemote = r ?? ''; }}
					/>
				{/if}
				{#if srType !== 'url'}
					<!-- 0012 Phase 4: per-piece image size-mode selector (mirrors KeyframeModal). -->
					<div class="modal-field sr-size-field">
						<label id="sr-size-label">Size mode</label>
						<div class="sr-size-row">
							<select
								class="modal-input"
								value={srSizeMode}
								onchange={(e) => (srSizeMode = e.currentTarget.value as 'default' | 'custom')}
								aria-labelledby="sr-size-label"
							>
								<option value="default">Use session default ({defLabel})</option>
								{#if sizeTiers.length || sizeRatios.length}
									<option value="custom">Custom size</option>
								{/if}
							</select>
							{#if srSizeMode === 'custom'}
								<select class="modal-input" bind:value={srCustomSize} aria-label="Size tier">
									{#if sizeTiers.length}
										{#each sizeTiers as t (t)}
											<option value={t}>{t}</option>
										{/each}
									{:else}
										<option value="">(no size tiers)</option>
									{/if}
								</select>
								<select class="modal-input" bind:value={srCustomRatio} aria-label="Aspect ratio">
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
						<p class="sr-size-hint">
							{#if srSizeMode === 'default'}
								Session default: {defLabel} — all subject images in this session generate at this size unless overridden here.
							{:else}
								{#if sizeTiers.length || sizeRatios.length}
									Generates this subject at {srCustomSize || '—'} {srCustomRatio && `· ${srCustomRatio}`}.
								{:else}
									The current model offers no explicit size options.
								{/if}
							{/if}
						</p>
					</div>
				{/if}
				<div class="modal-field">
					<label>
						<input type="checkbox" bind:checked={srUseFrames} />
						Use frame range
					</label>
				</div>
				{#if srUseFrames}
					<div class="modal-field">
						<label id="sr-start-label">Start Frame</label>
						<input type="number" bind:value={srStart} step={8} min={0} max={maxFrames - 1} class="modal-input" aria-labelledby="sr-start-label" />
					</div>
					<div class="modal-field">
						<label id="sr-end-label">End Frame</label>
						<input type="number" bind:value={srEnd} step={8} min={0} max={maxFrames - 1} class="modal-input" aria-labelledby="sr-end-label" />
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={!srValid}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* 0012 Phase 4: per-piece image size-mode selector (mirrors KeyframeModal). */
	.sr-size-field {
		margin-top: 12px;
	}
	.sr-size-row {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
	.sr-size-row .modal-input {
		flex: 1;
	}
	.sr-size-hint {
		margin: 6px 0 0;
		font-size: 0.68rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
</style>
