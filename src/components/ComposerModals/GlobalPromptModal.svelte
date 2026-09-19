<script lang="ts">
	/**
	 * Prompt editor for global-alike elements (Global style / Sound).
	 * Mirrors TagPromptModal; the panel owns the store calls and passes the
	 * element label + an onConfirm callback.
	 */
	let {
		label,
		prompt,
		open = $bindable(false),
		onConfirm,
	} = $props<{
		/** Element label shown in the header (e.g. "Global", "Sound") */
		label: string;
		prompt: string;
		open: boolean;
		onConfirm: (prompt: string) => void;
	}>();

	import '../composer-modal.css';

	let text = $state('');

	$effect(() => {
		if (!open) return;
		text = prompt;
	});

	function confirm() {
		onConfirm(text);
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => (open = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Edit {label} Prompt</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="global-prompt-label">Prompt</label>
					<textarea
						bind:value={text}
						placeholder={label === 'Sound' ? 'Describe the sound for this range…' : 'Describe the style for this range…'}
						class="modal-textarea"
						aria-labelledby="global-prompt-label"
					></textarea>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
				<button class="btn-confirm" onclick={confirm}>Confirm</button>
			</div>
		</div>
	</div>
{/if}
