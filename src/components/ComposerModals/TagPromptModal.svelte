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
		<!-- Fake frame: a 3x3 grid that reserves real cells for the icon
		     ring, with the card in the center cell. Outer bounds come from
		     the slot columns/rows, so the card is correctly inset. -->
		<div class="tpm-frame" onclick={(e) => e.stopPropagation()}>
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
			<div class="tpm-center" role="dialog" aria-modal="true" tabindex="-1">
				<div class="modal tpm-modal">
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
			</div>
		</div>
	</div>
{/if}

<style>
	/* Fake frame: 3x3 grid. The ring cells define the outer bounds; the card
	   occupies the center cell and is correctly inset from every icon. */
	.tpm-frame {
		position: relative;
		display: grid;
		grid-template-columns: 64px minmax(0, 420px) 64px;
		grid-template-rows: 64px minmax(0, auto) 64px;
		gap: 20px;
	}

	/* Ring cells: 40px icon tiles sitting inside 64px grid slots, so every
	   mark has fair space on the dark backdrop. */
	.tpm-icon {
		width: 40px;
		height: 40px;
		align-self: center;
		justify-self: center;
		position: relative;
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
	}

	/* Slot → grid cell mapping (icons in promptIcons.ts carry the pos). */
	.slot-nw { grid-column: 1; grid-row: 1; }
	.slot-n  { grid-column: 2; grid-row: 1; }
	.slot-ne { grid-column: 3; grid-row: 1; }
	.slot-w  { grid-column: 1; grid-row: 2; }
	.slot-e  { grid-column: 3; grid-row: 2; }
	.slot-sw { grid-column: 1; grid-row: 3; }
	.slot-s  { grid-column: 2; grid-row: 3; }
	.slot-se { grid-column: 3; grid-row: 3; }

	/* The card lives in the center cell, stretched to the slot width so the
	   prompt zone stays the modal's default readable size. */
	.tpm-center {
		grid-column: 2;
		grid-row: 2;
		display: flex;
		justify-content: center;
	}

	.tpm-modal {
		width: 100%;
		max-width: 420px;
	}

	.tpm-icon:hover svg,
	.tpm-icon:focus-visible svg {
		transform: scale(1.12);
	}

	.tpm-icon:hover,
	.tpm-icon:focus-visible {
		opacity: 1;
		border-color: var(--accent-color);
		box-shadow: 0 4px 14px var(--accent-glow, rgba(89, 181, 255, 0.25));
		transform: translateY(-3px);
	}

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

	/* Side-ring tooltips: point inward toward the card so they never run off
	   the screen edge. */
	.slot-w .tpm-icon-tip {
		left: auto;
		right: calc(100% + 8px);
		bottom: 50%;
		transform: translateY(50%);
		text-align: right;
	}
	.slot-e .tpm-icon-tip {
		left: calc(100% + 8px);
		bottom: 50%;
		transform: translateY(50%);
		text-align: left;
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
