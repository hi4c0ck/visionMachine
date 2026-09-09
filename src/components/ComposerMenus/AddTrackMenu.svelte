<script lang="ts">
	// [+] add-track dropdown — pure chrome. The panel owns position + the
	// store calls (handleAddTimeline / handleAddGlobal); this only renders.
	let {
		open,
		x,
		y,
		onAddTimeline,
		onAddGlobal,
	} = $props<{
		open: boolean;
		x: number;
		y: number;
		onAddTimeline: () => void;
		onAddGlobal: () => void;
	}>();
</script>

{#if open}
	<div class="dropdown-menu" role="menu" tabindex="-1" style="left: {x}px; top: {y}px;"
		onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
		<button class="dropdown-item" onclick={onAddTimeline}>
			<span class="dropdown-icon">▬</span> Timeline
		</button>
		<button class="dropdown-item" onclick={onAddGlobal}>
			<span class="dropdown-icon">◈</span> Global
		</button>
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

	.dropdown-icon {
		font-size: 14px;
	}
</style>
