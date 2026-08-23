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

	let showPreview = $state(false);
	let previewContent = $state<string>('Preview Area');

	function toggleCollapse() {
		collapsed = !collapsed;
	}

	function handleToolClick(id: string) {
		console.log('[Tools] Select:', id);
		onselect?.(id);
	}

	function togglePreview() {
		showPreview = !showPreview;
	}
</script>

<div class="tools-panel" class:collapsed>
	<!-- Collapse/expand toggle -->
	<button class="collapse-btn" onclick={toggleCollapse} title={collapsed ? 'Expand Tools' : 'Collapse Tools'}>
		{collapsed ? '→' : '←'}
	</button>
	
	{#if !collapsed}
		<!-- Large preview area at top -->
		<div class="preview-area" onclick={togglePreview} role="button" tabindex="0">
			{#if showPreview}
				<div class="preview-content">
					<span class="preview-title">Preview</span>
					<p>{previewContent}</p>
				</div>
			{:else}
				<span class="preview-placeholder">+</span>
			{/if}
		</div>

		<!-- Tool strips below preview -->
		<div class="tools-strips">
			<div class="strip-row">
				<button class="strip-btn large" title="Size" onclick={() => handleToolClick('size')}>
					Size
				</button>
			</div>
			<div class="strip-row">
				<button class="strip-btn small" title="Opacity" onclick={() => handleToolClick('opacity')}>
					Opac
				</button>
				<button class="strip-btn small" title="Flow" onclick={() => handleToolClick('flow')}>
					Flow
				</button>
			</div>
		</div>

		<!-- Main tools list -->
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

	/* ── Preview Area ── */
	.preview-area {
		margin: 8px;
		height: 100px;
		background: var(--bg-primary, #1A1A1D);
		border: 1px dashed var(--border-color, #4E525A);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
	}

	.preview-area:hover {
		border-color: var(--accent-primary, #FF6B35);
		background: rgba(255, 107, 53, 0.05);
	}

	.preview-placeholder {
		font-size: 2rem;
		color: var(--text-muted, #606060);
	}

	.preview-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		color: var(--text-secondary, #BFBFBF);
	}

	.preview-title {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--accent-primary, #FF6B35);
	}

	/* ── Tool Strips ── */
	.tools-strips {
		padding: 0 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border-bottom: 1px solid var(--border-color, #4E525A);
		padding-bottom: 8px;
		margin-bottom: 8px;
	}

	.strip-row {
		display: flex;
		gap: 4px;
	}

	.strip-btn {
		flex: 1;
		padding: 6px 4px;
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 4px;
		color: var(--text-secondary, #BFBFBF);
		cursor: pointer;
		font-size: 0.7rem;
		transition: all 0.15s;
	}

	.strip-btn:hover {
		background: var(--accent-primary, #FF6B35);
		color: white;
		border-color: var(--accent-primary, #FF6B35);
	}

	.strip-btn.large {
		flex: 2;
	}

	/* ── Tools List ── */
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
