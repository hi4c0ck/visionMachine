<script lang="ts">
	import type { TagType } from '$types';
	import { TAG_SPECIFICATIONS } from '$types';

	// Tag-type selector dropdown — pure chrome. Renders the tag list +
	// Add/Cancel; the panel owns the store call (confirmTagSelector) via
	// onConfirm and keeps selectedSegmentId as the add target.
	let {
		open,
		x,
		y,
		segments,
		defaultSegmentId,
		/** Tag types already declared on the target zone — listed greyed (choice A). */
		declaredTypes = [],
		onConfirm,
		onNewSegment,
		menuVersion,
		onClose,
	} = $props<{
		open: boolean;
		x: number;
		y: number;
		/** Target zones to attach the new tag to (each renders as "Zone N"). */
		segments: Array<{ id: string; index: number }>;
		/** Zone pre-selected as the attach target (e.g. the invoking zone). */
		defaultSegmentId?: string;
		/** Tag types already present on the target zone, listed greyed but still
		 *  clickable so a zone can hold more than one of the same type when it
		 *  has room. Undeclared types are the normal, primary options. */
		declaredTypes?: TagType[];
		onConfirm: (type: TagType, segmentId: string) => void;
		/** "+ New segment" item — opens the zone (gap-pick) modal, choice (ii). */
		onNewSegment?: () => void;
		onClose: () => void;
		/** Incremented when the menu re-opens; forces re-seeding so the menu
		 *  always opens with the INVOKING zone pre-selected (a fresh menu each
		 *  time, not a persisted sticky choice). */
		menuVersion: number;
	}>();

	const TAG_TYPES: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];
	function isDeclared(t: TagType) {
		return declaredTypes.includes(t);
	}
	// Target zone. The menu attaches to the INVOKING zone only (the zone
	// pill that opened it). Picking a tag type adds it immediately — the
	// intermediate "Add" button was removed as a redundant step.
	let selectedSegId = $state<string>(defaultSegmentId ?? segments[0]?.id ?? '');
	$effect(() => {
		// Touch menuVersion so re-opens re-run the seeding.
		menuVersion;
		const ids: string[] = segments.map((s: { id: string }) => s.id);
		if (!open) return;
		selectedSegId = ids.includes(defaultSegmentId ?? '')
			? (defaultSegmentId as string)
			: (ids[0] ?? '');
	});

	// Add the tag of this type to the target zone and close the menu.
	async function addTag(type: TagType) {
		if (!selectedSegId) return;
		await onConfirm(type, selectedSegId);
		onClose();
	}
</script>

	{#if open}
		<div class="dropdown-menu tag-menu" role="menu" tabindex="-1" style="left: {x}px; top: {y}px;"
			onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="tag-menu-body">
				<div class="dropdown-label">Add Tag</div>
				{#each TAG_TYPES as tagType (tagType)}
					<button class="dropdown-item tag-item" class:declared={isDeclared(tagType)}
						onclick={() => addTag(tagType)}
						title={isDeclared(tagType) ? 'Already in this zone — adding another needs free space' : undefined}>
						<span class="tag-dot" style="background: {TAG_SPECIFICATIONS[tagType].color}"></span>
						<span>{TAG_SPECIFICATIONS[tagType].name}</span>
						{#if isDeclared(tagType)}<span class="tag-item-badge">+</span>{/if}
					</button>
				{/each}
				{#if onNewSegment}
					<div class="dropdown-section-divider"></div>
					<button class="dropdown-item new-segment-item" onclick={onNewSegment}>
						<span>＋ New segment</span>
					</button>
				{/if}
			</div>
		</div>
	{/if}

<style>
	.dropdown-menu {
		position: fixed;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		min-width: 160px;
		z-index: 1000;
		/* Cap the height so the menu always fits the viewport even when opened
		   from the low "+ Tag" button; the body scrolls, the Add row stays put. */
		max-height: calc(100vh - 16px);
		display: flex;
		flex-direction: column;
	}
	/* The scrollable middle (zone picker + tag types). The Add row stays
	   pinned below it, so it is never pushed below the fold. */
	.tag-menu .tag-menu-body {
		overflow-y: auto;
		flex: 1 1 auto;
		min-height: 0;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		color: var(--text-primary);
		cursor: pointer;
		font-size: 13px;
		transition: background 0.15s;
	}

	.dropdown-item:hover {
		background: var(--bg-tertiary);
	}

	.dropdown-item.tag-item {
		flex-direction: row;
	}

	.dropdown-item.tag-item .tag-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dropdown-item.tag-item.active {
		background: var(--accent-bg);
		color: var(--accent-color);
	}
	/* Declared types: greyed but still clickable (choice A). */
	.dropdown-item.tag-item.declared {
		opacity: 0.45;
	}
	.dropdown-item.tag-item.declared:hover {
		opacity: 0.7;
	}
	.dropdown-item.tag-item.declared.active {
		opacity: 1;
	}
	.tag-item-badge {
		margin-left: auto;
		font-size: 10px;
		color: var(--text-muted, var(--text-secondary));
	}
	.dropdown-section-divider {
		height: 1px;
		background: var(--border-color);
		padding: 0;
		margin: 4px 8px;
	}
	.new-segment-item {
		color: var(--accent-color);
		font-weight: 600;
	}

	.dropdown-label {
		padding: 10px 16px 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.dropdown-actions {
		display: flex;
		gap: 8px;
		padding: 8px;
		border-top: 1px solid var(--border-color);
	}

	.dropdown-actions .btn-confirm,
	.dropdown-actions .btn-cancel {
		flex: 1;
		padding: 8px;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
	}

	.dropdown-actions .btn-confirm {
		background: var(--accent-color);
		color: white;
		border: none;
	}

	.dropdown-actions .btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dropdown-actions .btn-cancel {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-color);
	}
</style>
