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
		/** The pipe's subject references — rendered as a compact tray in the
		 *  footer next to Cancel/Confirm; "+" inserts the `[SubjectN]`
		 *  token into the prompt, clicking a card previews it fullscreen. */
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
			<div class="modal-body">
				<div class="modal-field">
					<label id="global-prompt-label">Prompt</label>
					<textarea
						bind:this={textareaEl}
						bind:value={text}
						placeholder={label === 'Sound' ? 'Describe the sound for this range…' : 'Describe the style for this range…'}
						class="modal-textarea"
						aria-labelledby="global-prompt-label"
					></textarea>
				</div>
			</div>
			<div class="modal-footer gpm-footer" class:gpm-split={refs.length > 0}>
				{#if refs.length}
					<div class="gpm-subs">
						<SubjectRefStrip refs={refs} onInsert={insertSubjectToken} compact />
					</div>
				{/if}
				<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
				<button class="btn-confirm" onclick={confirm}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Widen the modal so the footer subject tray fits alongside the buttons. */
	.gpm-modal {
		max-width: 560px;
	}
	.gpm-split {
		justify-content: space-between;
	}
	.gpm-footer {
		flex-wrap: wrap;
		row-gap: 10px;
	}
	.gpm-subs {
		flex: 1 1 auto;
		min-width: 0;
	}
</style>
