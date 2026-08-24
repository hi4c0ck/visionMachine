<script lang="ts" generics="T">
	import type { Tool } from '$types/app';

	let {
		tools,
		activeTool,
		onToolChange,
		onColorChange,
		onBrushSizeChange,
		onImportFile,
	}: {
		tools: Tool[];
		activeTool: string;
		onToolChange: (toolId: string) => void;
		onColorChange: (color: string) => void;
		onBrushSizeChange: (size: number) => void;
		onImportFile: (file: File) => void;
	} = $props();

	let selectedColor = $state('#ffffff');
	let brushSize = $state(8);
	let dragOver = $state(false);

	function handleToolClick(toolId: string) {
		onToolChange(toolId);
	}

	function handleColorChange(color: string) {
		selectedColor = color;
		onColorChange(color);
	}

	function handleBrushSizeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		brushSize = parseInt(target.value, 10);
		onBrushSizeChange(brushSize);
	}

	function handleFileDrop(event: DragEvent) {
		dragOver = false;
		const file = event.dataTransfer?.files[0];
		if (file) {
			onImportFile(file);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}
</script>

<div class="tools-panel" role="region" aria-label="Tools panel">
	<div class="panel-header">
		<h2>Tools</h2>
	</div>

	<div class="tools-grid">
		{#each tools as tool (tool.id)}
			<button
				class="tool-button {tool.id === activeTool ? 'active' : ''}"
				onclick={() => handleToolClick(tool.id)}
				title={tool.name}
				aria-label={tool.name}
				aria-pressed={tool.id === activeTool}
			>
				<span class="material-symbols-outlined" aria-hidden="true">{tool.icon}</span>
				<span class="tool-name">{tool.name}</span>
			</button>
		{/each}
	</div>

	<div class="color-picker">
		<label for="color-picker-input">Brush Color</label>
		<div class="color-swatches" role="group" aria-label="Color swatches">
			{#each ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'] as color}
				<button
					class="color-swatch {selectedColor === color ? 'active' : ''}"
					style="background-color: {color}"
					onclick={() => handleColorChange(color)}
					aria-label={`Select color ${color}`}
					aria-pressed={selectedColor === color}
				></button>
			{/each}
		</div>
		<input
			id="color-picker-input"
			type="color"
			bind:value={selectedColor}
			oninput={(e) => handleColorChange((e.target as HTMLInputElement).value)}
			class="color-input"
			aria-label="Custom color picker"
		/>
	</div>

	<div class="brush-size">
		<label for="brush-size-slider">Brush Size: {brushSize}px</label>
		<input
			id="brush-size-slider"
			type="range"
			min="1"
			max="100"
			value={brushSize}
			oninput={handleBrushSizeChange}
			onchange={handleBrushSizeChange}
			class="size-slider"
			aria-label="Brush size"
		/>
	</div>

	<div
		class="import-area {dragOver ? 'drag-over' : ''}"
		ondrop={handleFileDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		role="button"
		tabindex="0"
		aria-label="Drop image files here to import"
	>
		<span class="material-symbols-outlined" aria-hidden="true">upload_file</span>
		<p>Drop image files here</p>
		<input
			type="file"
			accept="image/*"
			class="file-input"
			aria-label="Import file input"
			onchange={(e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (file) onImportFile(file);
			}}
		/>
	</div>
</div>

<style>
	.tools-panel {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 16px;
		overflow-y: auto;
		height: 100%;
	}

	.panel-header {
		padding-bottom: 12px;
		border-bottom: 1px solid var(--sidebar-border, #444);
	}

	.panel-header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary, #f5f5f5);
	}

	.tools-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.tool-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 12px 8px;
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 8px;
		color: var(--text-primary, #f5f5f5);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tool-button:hover {
		background: var(--button-hover, #4a4a4a);
		transform: translateY(-2px);
	}

	.tool-button.active {
		background: var(--accent-color, #4CAF50);
		border-color: var(--accent-color, #4CAF50);
	}

	.tool-button .material-symbols-outlined {
		font-size: 24px;
	}

	.tool-name {
		font-size: 10px;
		text-align: center;
	}

	.color-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.color-picker label {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.color-swatches {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.color-swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.color-swatch:hover {
		transform: scale(1.1);
	}

	.color-swatch.active {
		border-color: var(--text-primary, #f5f5f5);
		box-shadow: 0 0 0 2px var(--accent-color, #4CAF50);
	}

	.color-input {
		width: 100%;
		height: 32px;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		background: transparent;
	}

	.brush-size {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.brush-size label {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.size-slider {
		width: 100%;
		height: 4px;
		border-radius: 2px;
		background: var(--slider-bg, #555);
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.size-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--accent-color, #4CAF50);
		cursor: pointer;
	}

	.import-area {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px;
		border: 2px dashed var(--border-color, #555);
		border-radius: 8px;
		text-align: center;
		transition: all 0.2s ease;
		cursor: pointer;
	}

	.import-area:hover,
	.import-area.drag-over {
		border-color: var(--accent-color, #4CAF50);
		background: var(--drag-over-bg, rgba(76, 175, 80, 0.1));
	}

	.import-area .material-symbols-outlined {
		font-size: 32px;
		color: var(--text-secondary, #aaa);
	}

	.import-area p {
		margin: 0;
		font-size: 12px;
		color: var(--text-secondary, #aaa);
	}

	.file-input {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
</style>
