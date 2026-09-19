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
		<div class="modal tpm-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Edit {specName} Prompt</h3>
			</div>
			<div class="modal-body">
				<div class="tpm-viewport">
					{#each icons as ic, i (ic.id)}
						<button
							class="tpm-icon"
							class:SLOT_CLASS[ic.pos]
							type="button"
							aria-label={ic.tag + ' — ' + ic.meaning}
						>
							<PromptIcon id={ic.id} size={26} ariaLabel={ic.tag} />
							<span class="tpm-icon-tip" aria-hidden="true">
								<b>{ic.tag}</b>
								{ic.meaning}
							</span>
						</button>
					{/each}
					<div class="tpm-prompt-zone" style="grid-column: 2; grid-row: 2;">
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
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.tpm-modal {
		max-width: 620px;
	}

	.tpm-viewport {
		position: relative;
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr) 64px;
		grid-template-rows: auto auto auto;
		gap: 10px 14px;
		align-items: center;
		justify-items: center;
	}

	/* The 3×3 ring slots: corners + edges around the centered prompt zone. */
	.tpm-icon {
		grid-column: auto;
		grid-row: auto;
		position: relative;
		width: 46px;
		height: 46px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 10px;
		cursor: pointer;
		opacity: 0.55;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.slot-nw { grid-column: 1; grid-row: 1; }
	.slot-n  { grid-column: 2; grid-row: 1; }
	.slot-ne { grid-column: 3; grid-row: 1; }
	.slot-w  { grid-column: 1; grid-row: 2; }
	.slot-e  { grid-column: 3; grid-row: 2; }
	.slot-sw { grid-column: 1; grid-row: 3; }
	.slot-s  { grid-column: 2; grid-row: 3; }
	.slot-se { grid-column: 3; grid-row: 3; }

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

	.tpm-prompt-zone {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		min-width: 0;
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
