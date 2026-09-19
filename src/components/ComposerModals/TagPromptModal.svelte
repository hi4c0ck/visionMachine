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
	// The tag-type palette color themes the ring: glyph + tile accents.
	const tagColor = $derived(TAG_SPECIFICATIONS[safeTagType].color);

	// On a light background, pale-yellow glyphs can't be read (camera tag's
	// #FFE66D is nearly white). Compute an adjusted color with contrast
	// ratio ≥ 2.5:1 against --bg-elevated, falling back to the raw color.
	function tagColorContrast(base: string, bg: string): string {
		const hx = (hex: string) => {
			const m = hex.match(/^#?([0-9a-f]{6})$/i);
			if (!m) return null;
			const n = parseInt(m[1], 16);
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
		};
		const lum = ([r, g, b]: readonly [number, number, number]) => {
			const f = (v: number) => {
				const s = v / 255;
				return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const ratio = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
		const c = hx(base), b = hx(bg);
		if (!c || !b) return base;
		const l1 = lum(c), l2 = lum(b);
		if (ratio(l1, l2) >= 2.5) return base;
		// dark bg → brighten, light bg → darken
		const target = l2 > 0.5 ? [0, 0, 0] : [255, 255, 255];
		// binary search t for contrast >= 3:1
		let lo = 0, hi = 1;
		const mix = (t: number) => c.map((v, i) => Math.round(v + (target[i] - v) * t));
		while (lo < hi - 0.001) {
			const mid = (lo + hi) / 2;
			if (ratio(lum(mix(mid) as [number, number, number]), l2) >= 3) hi = mid;
			else lo = mid;
		}
		return '#' + mix(hi).map((v) => v.toString(16).padStart(2, '0')).join('');
	}

	const themeBg = $derived(
		(typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated') : '').trim() || '#252538'
	);
	const tagColorSafe = $derived(tagColorContrast(tagColor, themeBg));

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
					<PromptIcon id={ic.id} size={24} color={tagColorSafe} ariaLabel={ic.tag} />
					<span class="tpm-icon-tip" aria-hidden="true">
						<b>{ic.tag}</b>
						{ic.meaning}
					</span>
				</button>
			{/each}
			<div class="tpm-center" role="dialog" aria-modal="true" tabindex="-1">
				<div class="modal tpm-modal" style="--tag-color: {tagColor}; --tag-color-safe: {tagColorSafe};">
					<div class="modal-header">
						<h3>Edit {specName} Prompt</h3>
					</div>
					<div class="modal-body">
						<textarea
							id="tag-prompt-area"
							bind:value={tagPrompt}
							placeholder="Describe this {specName.toLowerCase()}…"
							class="modal-textarea tpm-textarea"
							aria-label={specName + ' prompt'}
						></textarea>
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

	/* Ring cells: 44px icon tiles inside 64px grid slots, so every mark has
	   fair space on the dark backdrop. Tiles are themed with the tag-type
	   color: colored border + a soft colored wash, full glyph opacity so the
	   marks dominate their slot. */
	.tpm-icon {
		width: 44px;
		height: 44px;
		align-self: center;
		justify-self: center;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-elevated);
		border: 1.5px solid var(--tag-color, var(--accent-color));
		border-radius: 10px;
		cursor: pointer;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--tag-color, var(--accent-color)) 12%, transparent);
		transition:
			transform 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	/* A subtle colored wash behind the glyph, themed per tag type. */
	.tpm-icon::before {
		content: '';
		position: absolute;
		inset: 4px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--tag-color, var(--accent-color)) 14%, transparent);
		transition: background 0.15s ease;
	}
	.tpm-icon svg {
		position: relative;
		z-index: 1;
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
		transform: scale(1.15);
	}

	.tpm-icon:hover,
	.tpm-icon:focus-visible {
		transform: translateY(-3px);
		border-color: var(--tag-color, var(--accent-color));
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--tag-color, var(--accent-color)) 25%, transparent);
	}
	.tpm-icon:hover::before,
	.tpm-icon:focus-visible::before {
		background: color-mix(in srgb, var(--tag-color, var(--accent-color)) 26%, transparent);
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

	/* Prompt zone: full-width editable textarea. Visually distinct from a
	   readonly field — a tag-colored left rail signals "this is yours to
	   write", plus an editable affordance on focus. */
	.tpm-textarea {
		width: 100%;
		min-height: 170px;
		resize: vertical;
		line-height: 1.6;
		font-size: 0.9rem;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-left: 3px solid var(--tag-color, var(--accent-color));
		border-radius: 6px;
		padding: 12px 14px;
	}

	.tpm-textarea:focus {
		outline: none;
		border-color: var(--border-color);
		border-left-color: var(--tag-color, var(--accent-color));
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--tag-color, var(--accent-color)) 20%, transparent);
	}

	.tpm-textarea::placeholder {
		color: var(--text-muted);
	}
</style>
