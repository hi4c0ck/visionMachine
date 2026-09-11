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
		onConfirm,
		onClose,
	} = $props<{
		open: boolean;
		x: number;
		y: number;
		/** Target zones to attach the new tag to (each renders as "Zone N"). */
		segments: Array<{ id: string; index: number }>;
		/** Zone pre-selected as the attach target (e.g. the invoking zone). */
		defaultSegmentId?: string;
		onConfirm: (type: TagType, segmentId: string) => void;
		onClose: () => void;
	}>();

	const TAG_TYPES: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];
	let selectedType = $state<TagType | null>(null);
	// Selected target zone. Seeded on first render; kept across re-opens so
	// the user's last zone choice sticks. Falls back when the current
	// selection disappears (zone deleted between opens).
	let selectedSegId = $state<string>(defaultSegmentId ?? segments[0]?.id ?? '');
	$effect(() => {
		if (!open) return;
		const ids: string[] = segments.map((s: { id: string }) => s.id);
		if (!ids.includes(selectedSegId)) {
			selectedSegId = ids.includes(defaultSegmentId ?? '')
				? (defaultSegmentId as string)
				: (ids[0] ?? '');
		}
	});
</script>

{#if open}
	<div class="dropdown-menu tag-menu" role="menu" tabindex="-1" style="left: {x}px; top: {y}px;"
		onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
		<div class="dropdown-label">Add Tag</div>
		{#if segments.length > 1}
			<div class="dropdown-label zone-label">Attach to zone</div>
			{#each segments as s (s.id)}
				<button class="dropdown-item zone-item" class:active={selectedSegId === s.id}
					onclick={() => selectedSegId = s.id}>
					<span class="zone-num">Z{s.index}</span>
					<span>Zone {s.index}</span>
				</button>
			{/each}
			{/if}
		{#if segments.length === 1}
			<div class="dropdown-zone-fixed">Zone {segments[0].index}</div>
		{/if}
		{#each TAG_TYPES as tagType (tagType)}
			<button class="dropdown-item tag-item"
				class:active={selectedType === tagType}
				onclick={() => selectedType = tagType}>
				<span class="tag-dot" style="background: {TAG_SPECIFICATIONS[tagType].color}"></span>
				<span>{TAG_SPECIFICATIONS[tagType].name}</span>
			</button>
		{/each}
		<div class="dropdown-actions">
			<button class="btn-confirm" onclick={() => selectedType && onConfirm(selectedType, selectedSegId)} disabled={!selectedType || !selectedSegId}>Add</button>
			<button class="btn-cancel" onclick={onClose}>Cancel</button>
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
		overflow: hidden;
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

	.dropdown-label {
		padding: 10px 16px 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.zone-label {
		padding-top: 8px;
	}
	.zone-item .zone-num {
		width: 12px;
		flex-shrink: 0;
		font-weight: 700;
		font-size: 11px;
		color: var(--accent-color);
	}
	/* Single-zone case: no picker, just show which zone the tag lands on. */
	.dropdown-zone-fixed {
		padding: 4px 16px 8px;
		font-size: 11px;
		color: var(--text-secondary);
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
