<script lang="ts">
	import type { PipeRow, SubjectReference } from '$types';
	import {
		addSubjectRef as addSubjectRefAction,
		updateSubjectRef as updateSubjectRefAction,
	} from '$lib/composerStore';
	import { flashToast } from '$lib/flashToast';

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
		} else {
			srType = 'url';
			srImageUrl = '';
			srPrompt = '';
			srUseFrames = false;
			srStart = 0;
			srEnd = Math.min(8, maxFrames - 1);
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
						<label id="sr-ref-label">Reference Image URL</label>
						<input type="text" bind:value={srImageUrl} placeholder="https://..." class="modal-input" aria-labelledby="sr-ref-label" />
					</div>
					<div class="modal-field">
						<label id="sr-img2img-prompt-label">Prompt</label>
						<textarea bind:value={srPrompt} placeholder="Describe the transformation..." class="modal-textarea" aria-labelledby="sr-img2img-prompt-label"></textarea>
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
