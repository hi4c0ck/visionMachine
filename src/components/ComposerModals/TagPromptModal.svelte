<script lang="ts">
	import { updateTagPrompt as updateTagPromptAction } from '$lib/composerStore';

	let {
		sessionId,
		pipeId,
		segmentId,
		tagId,
		prompt,
		open = $bindable(false),
		onConfirm,
	} = $props<{
		sessionId: string | undefined;
		pipeId: string;
		segmentId: string;
		tagId: string;
		prompt: string;
		open: boolean;
		onConfirm: (prompt: string) => void;
	}>();

	import '../composer-modal.css';

	let tagPrompt = $state('');

	// Seed from the panel-provided prompt when the modal opens
	$effect(() => {
		if (!open) return;
		tagPrompt = prompt;
	});

	async function confirm() {
		if (!sessionId) return;
		const result = await updateTagPromptAction(sessionId, pipeId, segmentId, tagId, tagPrompt);
		if (result.errors.length > 0) {
			console.error('[TagPromptModal] confirm:', result.errors);
			return;
		}
		onConfirm(tagPrompt);
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => open = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Edit Tag Prompt</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="tag-prompt-label">Prompt</label>
					<textarea bind:value={tagPrompt} placeholder="Enter tag prompt..." class="modal-textarea" aria-labelledby="tag-prompt-label"></textarea>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm}>Confirm</button>
			</div>
		</div>
	</div>
{/if}
