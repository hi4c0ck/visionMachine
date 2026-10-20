<script lang="ts">
	import type { PipeRow, SubjectReference } from '$types';
	import {
		addSubjectRef as addSubjectRefAction,
		updateSubjectRef as updateSubjectRefAction,
	} from '$lib/composerStore';
import PieceGenPanel from './PieceGenPanel.svelte';
	import ChromeIcon from '../ChromeIcon.svelte';
	import { flashToast } from '$lib/flashToast';
	import { isTauri } from '@tauri-apps/api/core';
	import { pickImageFile, readUserImage } from '$lib/localImage';
	import SessionImageBrowser from './SessionImageBrowser.svelte';

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
		} else {
			srType = 'url';
			srImageUrl = '';
			srPrompt = '';
			srUseFrames = false;
			srStart = 0;
			srEnd = Math.min(8, maxFrames - 1);
			// crypto.randomUUID() instead of Date.now() — two "Add Subject Ref"
			// clicks in the same ms would collide on a time-based provisional
			// id, and the resulting duplicate-id pair would share the same
			// pieces/<kind>/<refId>/ history dir (the "two refs share one
			// image" bug). UUIDs are collision-free in practice.
			srRefId = crypto.randomUUID();
			srGenLocal = '';
			srGenRemote = '';
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

	// Session-image browser ("browse session images" affordance next to the
	// "pick local file" button). Reuses the existing readUserImage path so
	// the provider gets a data URI + a durable copy under this pipe's
	// user-images dir — zero new backend surface.
	let browserOpen = $state(false);
	// When the parent modal closes, force the browser sub-state closed too so
	// it never auto-reopens when the parent is re-opened (stale `true` bug).
	$effect(() => {
		if (!open) browserOpen = false;
	});
	async function pickFromSession(entry: import('$lib/pieceGeneration').SessionImageEntry) {
		if (!sessionId || localBusy) return;
		localBusy = true;
		try {
			const res = await readUserImage(sessionId, pipe.id, srRefId || 'local', entry.localPath);
			srImageUrl = res.dataUri;
			srGenLocal = res.localPath || '';
			srGenRemote = '';
			flashToast(`From ${entry.pipeName || 'session'} · ${entry.label}`, 'success');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			flashToast(msg.startsWith('{') ? 'Could not load session image' : msg, 'error');
		} finally {
			localBusy = false;
		}
	}

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
			// 0012 D4: notify when the image was preemptively downscaled to
			// fit the API's input cap (the data URI already carries the
			// resized bytes — informational, not a failure).
			const note =
				res.resizedToWidth != null && res.resizedToHeight != null
					? ` (${res.imageWidth}×${res.imageHeight} → ${res.resizedToWidth}×${res.resizedToHeight}, downscaled to fit API limit)`
					: '';
			flashToast(`Local image loaded as reference${note}`, 'success');
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
			// so a failure can't leave a partial edit behind. Image size is
			// inherited from the session — no per-piece override.
			result = await updateSubjectRefAction(sessionId, pipe.id, editingRefId, {
				imageUrl: srImageUrl,
				useFrames: srUseFrames,
				frameStart: srUseFrames ? srStart : undefined,
				frameEnd: srUseFrames ? srEnd : undefined,
				type: srType,
				prompt: srPrompt,
				// Carry the piece's current generation preview so the chip
				// reflects the artifact (was dropped on edit-confirm, leaving
				// a stale thumbnail — the "confirmed but no change" bug).
				previewLocalPath: srGenLocal || undefined,
				previewRemoteUrl: srGenRemote || undefined,
			});
			if (result.errors.length === 0) onSaved?.(editingRefId);
		} else {
			// Newly added refs get checked on the next generation Confirm (D5).
			// Image size is inherited from the session — no per-piece override.
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
						<div class="modal-url-row">
							<input type="text" bind:value={srImageUrl} placeholder="https://... or pick a file" class="modal-input" aria-labelledby="sr-url-label" />
							{#if isTauri()}
								<button
									class="btn-icon"
									type="button"
									disabled={localBusy}
									onclick={browseLocal}
									title="Pick a local image"
									aria-label="Browse local image"
								>{#if localBusy}
									…
								{:else}
									<ChromeIcon id="open-folder" size={16} />
								{/if}</button>
								<button
									class="btn-icon"
									type="button"
									disabled={localBusy}
									onclick={() => (browserOpen = true)}
									title="Browse images generated in this session"
									aria-label="Browse session images"
								><ChromeIcon id="eye" size={16} /></button>
							{/if}
						</div>
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
								>{#if localBusy}
									…
								{:else}
									<ChromeIcon id="open-folder" size={16} />
								{/if}</button>
								<button
									class="btn-icon"
									type="button"
									disabled={localBusy}
									onclick={() => (browserOpen = true)}
									title="Browse images generated in this session"
									aria-label="Browse session images"
								><ChromeIcon id="eye" size={16} /></button>
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
						initialLocal={srGenLocal || null}
						initialRemote={srGenRemote || null}
					/>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={!srValid}>Confirm</button>
			</div>
		</div>
	</div>
	<SessionImageBrowser
		bind:open={browserOpen}
		sessionId={sessionId}
		onPick={(e) => pickFromSession(e)}
	/>
{/if}
