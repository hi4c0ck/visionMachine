<script lang="ts">
	import type { PipeRow, PipeKeyframe } from '$types';
	import { addKeyframe as addKeyframeAction } from '$lib/composerStore';
	import { flashToast } from '$lib/flashToast';
	import { snapTo8 } from '$lib/frameMath';

	let {
		pipe,
		sessionId,
		maxFrames,
		editingSlot,
		open = $bindable(false),
	} = $props<{
		pipe: PipeRow;
		sessionId: string | undefined;
		maxFrames: number;
		editingSlot: number | null;
		open: boolean;
	}>();

	import '../composer-modal.css';

	let kfType = $state<'url' | 'txt2img' | 'img2img'>('url');
	let kfValue = $state('');
	// img2img carries two independent fields: the reference image and the prompt.
	let kfReferenceUrl = $state('');
	let kfFrame = $state(0);

	// Seed values when the modal opens (moved verbatim from openKeyframeModal)
	$effect(() => {
		if (!open || editingSlot === null) return;
		const existing = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === editingSlot);
		if (existing) {
			kfType = existing.type;
			kfValue = existing.imageSrc ?? existing.prompt ?? '';
			kfReferenceUrl = existing.referenceUrl ?? '';
			kfFrame = existing.frame;
		} else {
			kfType = 'url';
			kfValue = '';
			kfReferenceUrl = '';
			kfFrame = snapTo8(pipe.keyframes.length > 0 ? pipe.keyframes[0].frame : 0);
		}
	});

	// url needs a URL; txt2img needs a prompt; img2img needs both.
	const kfValid = $derived(
		kfType === 'url'
			? kfValue.trim().length > 0
			: kfType === 'txt2img'
				? kfValue.trim().length > 0
				: kfReferenceUrl.trim().length > 0 && kfValue.trim().length > 0,
	);

	async function confirm() {
		if (!sessionId || editingSlot === null) return;
		if (!kfValid) return;
		const result = await addKeyframeAction(
			sessionId,
			pipe.id,
			editingSlot,
			kfFrame,
			kfType,
			kfValue,
			kfType === 'img2img' ? kfReferenceUrl : undefined,
		);
		if (result.errors.length > 0) {
			flashToast(result.errors[0] || 'Failed to save keyframe');
			console.error('[KeyframeModal] confirm:', result.errors);
			return;
		}
		open = false;
		kfValue = '';
		kfReferenceUrl = '';
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
						<input type="text" bind:value={kfValue} placeholder="https://..." class="modal-input" aria-labelledby="kf-url-label" />
					</div>
				{:else if kfType === 'txt2img'}
					<div class="modal-field">
						<label id="kf-prompt-label">Prompt</label>
						<textarea bind:value={kfValue} placeholder="Describe the image..." class="modal-textarea" aria-labelledby="kf-prompt-label"></textarea>
					</div>
				{:else if kfType === 'img2img'}
					<div class="modal-field">
						<label id="kf-ref-label">Reference Image URL</label>
						<input type="text" bind:value={kfReferenceUrl} placeholder="https://..." class="modal-input" aria-labelledby="kf-ref-label" />
					</div>
					<div class="modal-field">
						<label id="kf-img2img-prompt-label">Prompt</label>
						<textarea bind:value={kfValue} placeholder="Describe the image..." class="modal-textarea" aria-labelledby="kf-img2img-prompt-label"></textarea>
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={!kfValid}>Confirm</button>
			</div>
		</div>
	</div>
{/if}
