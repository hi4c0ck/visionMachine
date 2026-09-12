<script lang="ts">
	import {
		updateTagPrompt as updateTagPromptAction,
		updateTagValue as updateTagValueAction,
	} from '$lib/composerStore';
	import type { TagElement } from '$types';

	let {
		sessionId,
		pipeId,
		segmentId,
		tagId,
		prompt,
		/** The tag being edited — its spec drives the modal's mode. */
		tag,
		open = $bindable(false),
		onConfirm,
	} = $props<{
		sessionId: string | undefined;
		pipeId: string;
		segmentId: string;
		tagId: string;
		prompt: string;
		tag: TagElement | null;
		open: boolean;
		onConfirm: (prompt: string, value: number | null) => void;
	}>();

	import '../composer-modal.css';

	// Numeric tags (camera/rotation/zoom) get a value slider + number input;
	// prompt tags (scene/lighting/effect/transition) keep the textarea.
	// The mode is derived from the tag's spec — a single modal serves both.
	let spec = $derived(tag?.spec ?? null);
	let isNumeric = $derived(spec ? !spec.usePrompt : false);

	let tagPrompt = $state('');
	let tagValue = $state(0);

	// Seed from the panel-provided prompt/value when the modal opens
	$effect(() => {
		if (!open || !tag) return;
		tagPrompt = prompt;
		tagValue = tag.value ?? 0;
	});

	function specMin() {
		return spec?.min ?? 0;
	}
	function specMax() {
		return spec?.max ?? 360;
	}
	function specStep() {
		// Numeric step derived from the range so the slider is usable:
		// camera (0–360) → 1, rotation (−180–180) → 1, zoom (0.5–5) → 0.1
		const range = specMax() - specMin();
		if (range <= 0) return 0.1;
		return range > 50 ? 1 : 0.1;
	}
	function specUnit() {
		if (!spec) return '';
		switch (spec.name) {
			case 'Camera': return '°';
			case 'Rotation': return '°';
			case 'Zoom': return '×';
			default: return '';
		}
	}

	function clampValue(v: number): number {
		return Math.max(specMin(), Math.min(v, specMax()));
	}

	async function confirm() {
		if (!sessionId) return;
		if (isNumeric) {
			const result = await updateTagValueAction(sessionId, pipeId, segmentId, tagId, clampValue(tagValue));
			if (result.errors.length > 0) {
				console.error('[TagPromptModal] updateTagValue:', result.errors);
				return;
			}
			onConfirm(tagPrompt, clampValue(tagValue));
		} else {
			const result = await updateTagPromptAction(sessionId, pipeId, segmentId, tagId, tagPrompt);
			if (result.errors.length > 0) {
				console.error('[TagPromptModal] updateTagPrompt:', result.errors);
				return;
			}
			onConfirm(tagPrompt, null);
		}
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => open = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{isNumeric ? 'Edit Tag Value' : 'Edit Tag Prompt'}</h3>
			</div>
			<div class="modal-body">
				{#if isNumeric}
					<div class="modal-field">
						<label id="tag-value-label">{spec?.name} value</label>
						<div class="tag-value-row">
							<input
								type="range"
								min={specMin()}
								max={specMax()}
								step={specStep()}
								bind:value={tagValue}
								class="modal-slider"
								aria-labelledby="tag-value-label"
							/>
							<input
								type="number"
								min={specMin()}
								max={specMax()}
								step={specStep()}
								bind:value={tagValue}
								class="modal-input tag-value-num"
								aria-labelledby="tag-value-label"
							/>
							<span class="tag-value-unit">{specUnit()}</span>
						</div>
						<span class="tag-value-range">{specMin()}{specUnit()} – {specMax()}{specUnit()}</span>
					</div>
				{:else}
					<div class="modal-field">
						<label id="tag-prompt-label">Prompt</label>
						<textarea bind:value={tagPrompt} placeholder="Enter tag prompt..." class="modal-textarea" aria-labelledby="tag-prompt-label"></textarea>
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.tag-value-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.modal-slider {
		flex: 1 1 auto;
		min-width: 0;
		accent-color: var(--accent-color);
	}
	.tag-value-num {
		width: 72px;
		flex: 0 0 auto;
	}
	.tag-value-unit {
		font-size: 12px;
		color: var(--text-secondary);
		min-width: 18px;
	}
	.tag-value-range {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--text-muted, var(--text-secondary));
	}
</style>
