<script lang="ts">
	/**
	 * Prompt editor for global-alike elements (Global style / Sound).
	 * Mirrors TagPromptModal; the panel owns the store calls and passes the
	 * element label + an onConfirm callback.
	 */
	let {
		label,
		prompt,
		refs = [] as SubjectReference[],
		open = $bindable(false),
		onConfirm,
	} = $props<{
		/** Element label shown in the header (e.g. "Global", "Sound") */
		label: string;
		prompt: string;
		/** The pipe's subject references — rendered as a side panel; clicking
		 *  +N inserts the `[SubjectN]` token into the prompt. */
		refs?: SubjectReference[];
		open: boolean;
		onConfirm: (prompt: string) => void;
	}>();

	import '../composer-modal.css';
	import SubjectRefStrip from './SubjectRefStrip.svelte';
	import type { SubjectReference } from '$types';

	let text = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (!open) return;
		text = prompt;
	});

	// Insert a `[SubjectN]` token from the side panel at the textarea cursor
	// (preserving selection), otherwise append.
	function insertSubjectToken(token: string) {
		const el = textareaEl;
		if (!el) {
			text = text.length > 0 ? text.replace(/[\s;]+$/, '') + ' ' + token : token;
			return;
		}
		const s = el.selectionStart ?? el.value.length;
		const e = el.selectionEnd ?? s;
		text = text.slice(0, s) + token + text.slice(e);
		requestAnimationFrame(() => {
			el.focus();
			const pos = s + token.length;
			el.setSelectionRange(pos, pos);
		});
	}

	function confirm() {
		onConfirm(text);
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => (open = false)} role="presentation">
		<div class="modal gpm-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Edit {label} Prompt</h3>
			</div>
			<div class="modal-body gpm-body">
				<div class="gpm-layout">
					<div class="gpm-field">
						<label id="global-prompt-label">Prompt</label>
						<textarea
							bind:this={textareaEl}
							bind:value={text}
							placeholder={label === 'Sound' ? 'Describe the sound for this range…' : 'Describe the style for this range…'}
							class="modal-textarea"
							aria-labelledby="global-prompt-label"
						></textarea>
					</div>
					{#if refs.length}
						<SubjectRefStrip refs={refs} onInsert={insertSubjectToken} />
					{/if}
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
				<button class="btn-confirm" onclick={confirm}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* The subject-ref strip + prompt share one row; widen the modal (its fixed
	   480px max-width comes from composer-modal.css) so both fit. */
	.gpm-modal {
		max-width: 620px;
	}
	.gpm-layout {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.gpm-field {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.gpm-field label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}
</style>
