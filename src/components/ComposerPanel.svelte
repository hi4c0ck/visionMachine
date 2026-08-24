<script lang="ts">
	import type { ComposerConfig } from '$types/composer';
	import App from '../App.ts';

	let { app }: { app: App } = $props();
	let composerMode = $state<'text' | 'image'>('text');
	let config = $state<Partial<ComposerConfig>>({
		mode: 'text',
		theme: 'system',
		color: '#ffffff',
		alignment: 'left',
		fontSize: 16,
		text: '',
		width: 300,
		height: 60,
		borderRadius: 4,
		backgroundColor: '#000000',
		padding: 10,
		fontFamily: 'Inter',
		bold: false,
		italic: false,
		shadow: false,
	});

	let selectedLayer = $derived(app.activeProject?.layers[app.activeLayerIndex] ?? null);

	function onComposerModeChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		composerMode = target.value as 'text' | 'image';
		config.mode = composerMode;
		app.setComposerConfig(config);
	}

	function applyConfig() {
		if (!selectedLayer) return;
		app.applyComposerToLayer(selectedLayer, config);
	}

	function handleInputChange(key: string, event: Event) {
		const target = event.target as HTMLInputElement | HTMLSelectElement;
		const value = key === 'fontSize' ? parseInt(target.value, 10) : target.value;
		config = { ...config, [key]: value };
	}

	function handleBoolChange(key: string, event: Event) {
		const target = event.target as HTMLInputElement;
		config = { ...config, [key]: target.checked };
	}

	function previewConfig() {
		const tempCanvas = document.createElement('canvas');
		tempCanvas.width = config.width || 300;
		tempCanvas.height = config.height || 60;
		const ctx = tempCanvas.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = config.backgroundColor || '#000000';
		ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

		if (config.text) {
			ctx.fillStyle = config.color || '#ffffff';
			const fontSize = config.fontSize || 16;
			ctx.font = `${config.bold ? 'bold ' : ''}${config.italic ? 'italic ' : ''}${fontSize}px ${config.fontFamily || 'Inter'}`;
			ctx.textAlign = config.alignment || 'left';
			ctx.fillText(config.text, config.padding || 10, (tempCanvas.height / 2) + (fontSize / 3));
		}

		const previewWindow = window.open('', '_blank', 'width=400,height=200');
		if (previewWindow) {
			previewWindow.document.write(`<img src="${tempCanvas.toDataURL()}" />`);
		}
	}

	function saveAsTemplate() {
		const templateName = prompt('Enter template name:');
		if (templateName) {
			app.saveComposerTemplate(templateName, config);
		}
	}

	function loadTemplate(templateName: string) {
		const loaded = app.loadComposerTemplate(templateName);
		if (loaded) {
			config = { ...config, ...loaded };
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			applyConfig();
		}
	}
</script>

<div class="composer-panel" role="region" aria-label="Composer panel">
	<div class="panel-header">
		<span class="material-symbols-outlined" aria-hidden="true">compost</span>
		<h2>Composer</h2>
	</div>

	<div class="mode-selector">
		<label for="composer-mode">Composer Mode</label>
		<select
			id="composer-mode"
			value={composerMode}
			onchange={onComposerModeChange}
			class="mode-select"
			aria-label="Select composer mode"
		>
			<option value="text">Text</option>
			<option value="image">Image</option>
		</select>
	</div>

	{#if composerMode === 'text'}
		<div class="config-section">
			<label for="composer-text">Text Content</label>
			<textarea
				id="composer-text"
				bind:value={config.text}
				oninput={(e) => handleInputChange('text', e)}
				onkeydown={handleKeyDown}
				placeholder="Enter text content..."
				class="text-input"
				aria-label="Text content"
			></textarea>
		</div>

		<div class="config-section">
			<label for="font-size-slider">Font Size: {config.fontSize}px</label>
			<input
				id="font-size-slider"
				type="range"
				min="8"
				max="72"
				value={config.fontSize}
				oninput={(e) => handleInputChange('fontSize', e)}
				onchange={(e) => handleInputChange('fontSize', e)}
				class="size-slider"
				aria-label="Font size"
			/>
		</div>

		<div class="config-section">
			<fieldset>
				<legend>Alignment</legend>
				<div class="alignment-buttons" role="group" aria-label="Text alignment">
					<button
						id="align-left"
						class:active={config.alignment === 'left'}
						onclick={() => handleInputChange('alignment', { target: { value: 'left' } } as unknown as Event)}
						aria-label="Align left"
						aria-pressed={config.alignment === 'left'}
					>
						<span class="material-symbols-outlined" aria-hidden="true">format_align_left</span>
					</button>
					<button
						id="align-center"
						class:active={config.alignment === 'center'}
						onclick={() => handleInputChange('alignment', { target: { value: 'center' } } as unknown as Event)}
						aria-label="Align center"
						aria-pressed={config.alignment === 'center'}
					>
						<span class="material-symbols-outlined" aria-hidden="true">format_align_center</span>
					</button>
					<button
						id="align-right"
						class:active={config.alignment === 'right'}
						onclick={() => handleInputChange('alignment', { target: { value: 'right' } } as unknown as Event)}
						aria-label="Align right"
						aria-pressed={config.alignment === 'right'}
					>
						<span class="material-symbols-outlined" aria-hidden="true">format_align_right</span>
					</button>
				</div>
			</fieldset>
		</div>

		<div class="config-section">
			<fieldset>
				<legend>Text formatting options</legend>
				<label for="bold-checkbox">
					<input
						id="bold-checkbox"
						type="checkbox"
						checked={config.bold}
						onchange={(e) => handleBoolChange('bold', e)}
					/>
					Bold
				</label>
				<label for="italic-checkbox">
					<input
						id="italic-checkbox"
						type="checkbox"
						checked={config.italic}
						onchange={(e) => handleBoolChange('italic', e)}
					/>
					Italic
				</label>
				<label for="shadow-checkbox">
					<input
						id="shadow-checkbox"
						type="checkbox"
						checked={config.shadow}
						onchange={(e) => handleBoolChange('shadow', e)}
					/>
					Shadow
				</label>
			</fieldset>
		</div>
	{:else}
		<div class="config-section">
			<label for="image-url">Image URL</label>
			<input
				id="image-url"
				type="text"
				bind:value={config.imageSrc as string}
				oninput={(e) => handleInputChange('imageSrc', e)}
				placeholder="https://example.com/image.png"
				class="url-input"
				aria-label="Image URL"
			/>
		</div>

		<div class="config-section">
			<label for="width-slider">Width: {config.width}px</label>
			<input
				id="width-slider"
				type="range"
				min="50"
				max="1920"
				value={config.width}
				oninput={(e) => handleInputChange('width', e)}
				onchange={(e) => handleInputChange('width', e)}
				class="size-slider"
				aria-label="Image width"
			/>
		</div>

		<div class="config-section">
			<label for="height-slider">Height: {config.height}px</label>
			<input
				id="height-slider"
				type="range"
				min="50"
				max="1080"
				value={config.height}
				oninput={(e) => handleInputChange('height', e)}
				onchange={(e) => handleInputChange('height', e)}
				class="size-slider"
				aria-label="Image height"
			/>
		</div>
	{/if}

	<div class="config-section">
		<label for="border-radius-slider">Border Radius: {config.borderRadius}px</label>
		<input
			id="border-radius-slider"
			type="range"
			min="0"
			max="50"
			value={config.borderRadius}
			oninput={(e) => handleInputChange('borderRadius', e)}
			onchange={(e) => handleInputChange('borderRadius', e)}
			class="size-slider"
			aria-label="Border radius"
		/>
	</div>

	<div class="config-section">
		<label for="padding-slider">Padding: {config.padding}px</label>
		<input
			id="padding-slider"
			type="range"
			min="0"
			max="50"
			value={config.padding}
			oninput={(e) => handleInputChange('padding', e)}
			onchange={(e) => handleInputChange('padding', e)}
			class="size-slider"
			aria-label="Padding"
		/>
	</div>

	<div class="action-buttons">
		<button onclick={previewConfig} class="btn-preview" aria-label="Preview composition">
			<span class="material-symbols-outlined" aria-hidden="true">visibility</span>
			Preview
		</button>
		<button onclick={saveAsTemplate} class="btn-save" aria-label="Save as template">
			<span class="material-symbols-outlined" aria-hidden="true">save</span>
			Save as Template
		</button>
		<button 
			onclick={applyConfig} 
			class="btn-apply" 
			disabled={!selectedLayer}
			aria-label="Apply to selected layer"
		>
			<span class="material-symbols-outlined" aria-hidden="true">check</span>
			Apply to Layer
		</button>
	</div>

	<div class="templates-section">
		<strong>Saved Templates</strong>
		{#each app.composerTemplates as template}
			<button 
				onclick={() => loadTemplate(template.name)} 
				class="template-btn"
				aria-label={`Load template ${template.name}`}
			>
				{template.name}
			</button>
		{/each}
	</div>
</div>

<style>
	.composer-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		overflow-y: auto;
		height: 100%;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--sidebar-border, #444);
	}

	.panel-header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary, #f5f5f5);
	}

	.mode-selector {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.mode-select {
		width: 100%;
		padding: 8px 12px;
		background: var(--input-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
		cursor: pointer;
	}

	.config-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.config-section > label {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.text-input {
		width: 100%;
		min-height: 80px;
		padding: 10px;
		background: var(--input-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
		resize: vertical;
		font-family: inherit;
	}

	.url-input {
		width: 100%;
		padding: 8px 12px;
		background: var(--input-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
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

	fieldset {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	fieldset legend {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 4px;
	}

	.alignment-buttons {
		display: flex;
		gap: 8px;
	}

	.alignment-buttons button {
		flex: 1;
		padding: 8px;
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.alignment-buttons button.active {
		background: var(--accent-color, #4CAF50);
		border-color: var(--accent-color, #4CAF50);
	}

	.alignment-buttons button:hover:not(.active) {
		background: var(--button-hover, #4a4a4a);
	}

	.action-buttons {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.action-buttons button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.action-buttons button:hover:not(:disabled) {
		background: var(--button-hover, #4a4a4a);
		transform: translateY(-1px);
	}

	.action-buttons button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.templates-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--sidebar-border, #444);
	}

	.templates-section strong {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.template-btn {
		padding: 8px 12px;
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 13px;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.template-btn:hover {
		background: var(--button-hover, #4a4a4a);
	}

	fieldset label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	fieldset input[type="checkbox"] {
		cursor: pointer;
	}
</style>
