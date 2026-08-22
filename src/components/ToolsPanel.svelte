<script lang="ts">
	interface Tool {
		id: string;
		label: string;
		icon: string;
		hotkey?: string;
	}

	let {
		tools,
		activeTool,
		collapsed,
		onselect
	} = $props<{
		tools: Tool[];
		activeTool: string | null;
		collapsed: boolean;
		onselect?: (id: string) => void;
	}>();

	function toggleCollapse() {
		collapsed = !collapsed;
	}

	function handleToolClick(id: string) {
		console.log('[Tools] Select:', id);
		onselect?.(id);
	}
</script>

<div class="tools-panel" class:collapsed>
	<button class="collapse-btn" onclick={toggleCollapse} title={collapsed ? 'Expand Tools' : 'Collapse Tools'}>
		{collapsed ? '→' : '←'}
	</button>
	
	{#if !collapsed}
		<div class="tools-header">
			<span>Tools</span>
		</div>
		<div class="tools-list">
			{#each tools as tool (tool.id)}
				<button
					class="tool-item {activeTool === tool.id ? 'active' : ''}"
					onclick={() => handleToolClick(tool.id)}
					title={`${tool.label} (${tool.hotkey ?? ''})`}
				>
					<span class="tool-icon">{tool.icon}</span>
					<span class="tool-label">{tool.label}</span>
					{#if tool.hotkey}
						<span class="tool-hotkey">{tool.hotkey}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tools-panel {
		display: flex;
		flex-direction: column;
		width: 180px;
		background: var(--bg-secondary, #3C3F46);
		border-left: 1px solid var(--border-color, #4E525A);
		flex-shrink: 0;
		transition: width 0.2s ease;
	}

	.tools-panel.collapsed {
		width: 40px;
	}

	.collapse-btn {
		width: 100%;
		padding: 10px;
		background: var(--bg-tertiary, #4E525A);
		border: none;
		border-bottom: 1px solid var(--border-color, #4E525A);
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.15s ease;
	}

	.collapse-btn:hover {
		background: var(--accent-primary, #59B5FF);
		color: white;
	}

	.tools-header {
		padding: 10px 12px;
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.tools-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tool-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		color: var(--text-secondary, #BFBFBF);
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.tool-item:hover {
		background: var(--bg-hover, #4E525A);
		color: var(--text-primary, #EEEEEE);
	}

	.tool-item.active {
		background: rgba(89, 181, 255, 0.15);
		border-color: var(--accent-primary, #59B5FF);
		color: var(--accent-primary, #59B5FF);
	}

	.tool-icon {
		font-size: 1.2rem;
		flex-shrink: 0;
	}

	.tool-label {
		flex: 1;
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tool-hotkey {
		font-size: 0.7rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
		background: var(--bg-tertiary, #4E525A);
		padding: 2px 6px;
		border-radius: 3px;
	}
</style>