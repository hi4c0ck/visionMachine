<script lang="ts">
	import type { PipeRow, SubjectReference } from '$types';
	import {
		addSubjectRef as addSubjectRefAction,
		updateSubjectRefRange as updateSubjectRefRangeAction,
		updateSubjectRefUrl as updateSubjectRefUrlAction,
		updateSubjectRefUseFrames as updateSubjectRefUseFramesAction,
	} from '$lib/composerStore';
	import { flashToast } from '$lib/flashToast';

	let {
		pipe,
		sessionId,
		maxFrames,
		editingRefId,
		maxSubjectRefs,
		open = $bindable(false),
	} = $props<{
		pipe: PipeRow;
		sessionId: string | undefined;
		maxFrames: number;
		editingRefId: string | null;
		maxSubjectRefs: number;
		open: boolean;
	}>();

	import '../composer-modal.css';

	let srImageUrl = $state('');
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
			srImageUrl = existing.imageUrl;
			srUseFrames = existing.useFrames ?? false;
			srStart = existing.frameStart ?? 0;
			srEnd = existing.frameEnd ?? Math.min(8, maxFrames - 1);
		} else {
			srImageUrl = '';
			srUseFrames = false;
			srStart = 0;
			srEnd = Math.min(8, maxFrames - 1);
		}
	});

	async function confirm() {
		if (!sessionId) return;
		if (!srImageUrl.trim()) return;
		if (!editingRefId && (pipe.subjectReferences?.length ?? 0) >= maxSubjectRefs) return;

		let result;
		if (editingRefId) {
			result = await updateSubjectRefRangeAction(sessionId, pipe.id, editingRefId, srStart, srEnd);
			await updateSubjectRefUrlAction(sessionId, pipe.id, editingRefId, srImageUrl);
			await updateSubjectRefUseFramesAction(sessionId, pipe.id, editingRefId, srUseFrames);
		} else {
			result = await addSubjectRefAction(sessionId, pipe.id, srImageUrl, srUseFrames, srUseFrames ? srStart : undefined, srUseFrames ? srEnd : undefined);
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
				<div class="modal-field">
					<label id="sr-url-label">Image URL</label>
					<input type="text" bind:value={srImageUrl} placeholder="https://..." class="modal-input" aria-labelledby="sr-url-label" />
				</div>
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
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={!srImageUrl.trim()}>Confirm</button>
			</div>
		</div>
	</div>
{/if}
