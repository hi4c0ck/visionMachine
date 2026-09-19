<script lang="ts">
	// Tag prompt editor with a camera-"viewport" icon ring: the atlas marks
	// (src/lib/promptIcons.ts) float around the prompt textarea, each on the
	// side of the frame it describes. Hovering a mark lifts it and shows how
	// the tag is written in the reference ("pan left — Horizontal rotation
	// to the left").
	import type { TagType } from '$types';
	import { TAG_SPECIFICATIONS } from '$types';
	import { updateTagPrompt as updateTagPromptAction } from '$lib/composerStore';
	import { ICONS_BY_TAG_TYPE, SLOT_CLASS, type AtlasIcon } from '$lib/promptIcons';
	import PromptIcon from '../PromptIcon.svelte';
	import '../composer-modal.css';

	let {
		sessionId,
		pipeId,
		segmentId,
		tagId,
		tagType = 'scene',
		prompt,
		open = $bindable(false),
		onConfirm,
	} = $props<{
		sessionId: string | undefined;
		pipeId: string;
		segmentId: string;
		tagId: string;
		tagType: TagType;
		prompt: string;
		open: boolean;
		onConfirm: (prompt: string) => void;
	}>();

	let tagPrompt = $state('');

	// Normalize the runtime tagType against the atlas/spec maps (unknown tag
	// types fall back to the scene set).
	const safeTagType: TagType = $derived(
		(Object.keys(TAG_SPECIFICATIONS) as TagType[]).includes(tagType) ? tagType : 'scene'
	);
	const icons: AtlasIcon[] = $derived(
		(ICONS_BY_TAG_TYPE as Record<string, AtlasIcon[]>)[safeTagType] ?? ICONS_BY_TAG_TYPE.scene
	);
	const specName = $derived(TAG_SPECIFICATIONS[safeTagType].name);

	// Seed from the panel-provided prompt when the modal opens
	$effect(() => {
		if (!open) return;
		tagPrompt = prompt;
	});

	// Insert a mark's tag phrase into the prompt, ";-separated", and keep the
	// focus position sane for further editing.
	function insertTag(ic: AtlasIcon) {
		const t = tagPrompt.replace(/[\s;]+$/, '');
		tagPrompt = (t.length > 0 ? t + ' ; ' : '') + ic.tag;
	}

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
		<!-- Fake frame: a relative container hugging the card; the icon ring
		     is positioned around the card on the dark backdrop. -->
		<div class="tpm-frame" onclick={(e) => e.stopPropagation()}>
			<div class="modal tpm-modal" role="dialog" aria-modal="true" tabindex="-1">
				<div class="modal-header">
					<h3>Edit {specName} Prompt</h3>
				</div>
				<div class="modal-body">
					<div class="tpm-prompt-zone">
						<label for="tag-prompt-area" id="tag-prompt-label" class="tpm-label">{specName} prompt</label>
						<textarea
							id="tag-prompt-area"
							bind:value={tagPrompt}
							placeholder="Describe this {specName.toLowerCase()}…"
							class="modal-textarea tpm-textarea"
							aria-labelledby="tag-prompt-label"
						></textarea>
					</div>
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
					<button class="btn-confirm" onclick={confirm}>Confirm</button>
				</div>
			</div>
			{#each icons as ic (ic.id)}
				<button
					class="tpm-icon"
					class:SLOT_CLASS[ic.pos]
					type="button"
					aria-label={ic.tag + ' — ' + ic.meaning}
					onclick={() => insertTag(ic)}
				>
					<PromptIcon id={ic.id} size={24} ariaLabel={ic.tag} />
					<span class="tpm-icon-tip" aria-hidden="true">
						<b>{ic.tag}</b>
						{ic.meaning}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Fake frame: hugs the card, becomes the positioning context for the
	   icon ring, so the marks orbit the card — not the whole overlay. */
	.tpm-frame {
		position: relative;
		display: inline-flex;
	}

	.tpm-modal {
		max-width: 480px;
	}

	/* ── Icon ring: absolutely positioned around the card on the dark backdrop. */
	/* Top row: 3 marks above the header (i1 i2 i3 in the layout sketch). */
	.slot-nw { top: -32px; left: 0; }
	.slot-n  { top: -32px; left: 50%; transform: translateX(-50%); }
	.slot-ne { top: -32px; right: 0; }
	/* Flanks: beside the prompt area. */
	.slot-w  { top: 50%; left: -32px; transform: translateY(-50%); }
	.slot-e  { top: 50%; right: -32px; transform: translateY(-50%); }
	/* Bottom row: under the footer (i6 i8 in the sketch). */
	.slot-sw { bottom: -32px; left: 0; }
	.slot-s  { bottom: -32px; left: 50%; transform: translateX(-50%); }
	.slot-se { bottom: -32px; right: 0; }

	.tpm-icon {
		position: absolute;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-elevated);
		border: 1px solid var(--border-light);
		border-radius: 9px;
		cursor: pointer;
		opacity: 0.65;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
		z-index: 1;
	}

	.tpm-icon:hover svg,
	.tpm-icon:focus-visible svg {
		transform: scale(1.12);
	}

	/* Hover / focus lift — keep the slot's positional transform intact. */
	.tpm-icon:hover,
	.tpm-icon:focus-visible {
		opacity: 1;
		border-color: var(--accent-color);
		box-shadow: 0 4px 14px var(--accent-glow, rgba(89, 181, 255, 0.25));
	}
	.slot-nw:hover, .slot-ne:hover, .slot-sw:hover, .slot-se:hover {
		transform: translateY(-3px);
	}
	.slot-n:hover, .slot-s:hover { transform: translateX(-50%) translateY(-3px); }
	.slot-w:hover, .slot-w:focus-visible { transform: translateY(-50%) translateX(-3px); }
	.slot-e:hover, .slot-e:focus-visible { transform: translateY(-50%) translateX(3px); }

	.tpm-icon:focus-visible {
		outline: none;
	}

	/* Tooltip: how the tag reads in the reference vocabulary. */
	.tpm-icon-tip {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 8px);
		transform: translateX(-50%) translateY(4px);
		width: max-content;
		max-width: 220px;
		padding: 6px 9px;
		border-radius: 7px;
		background: var(--bg-elevated, #252538);
		border: 1px solid var(--border-light, #3a3a4a);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
		font-size: 11px;
		line-height: 1.4;
		color: var(--text-secondary);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease, transform 0.15s ease;
		z-index: 5;
		white-space: normal;
	}

	.tpm-icon-tip b {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		text-transform: capitalize;
		margin-bottom: 1px;
	}

	/* Bottom-ring tooltips point up; top-ring would collide with the header,
	   so flip them below the mark instead. */
	.slot-sw .tpm-icon-tip,
	.slot-s .tpm-icon-tip,
	.slot-se .tpm-icon-tip {
		bottom: auto;
		top: calc(100% + 8px);
		transform: translateX(-50%) translateY(-4px);
	}

	.tpm-icon:hover .tpm-icon-tip,
	.tpm-icon:focus-visible .tpm-icon-tip {
		opacity: 1;
		transform: translateX(-50%);
	}

	.tpm-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.tpm-textarea {
		min-height: 150px;
	}
</style>
