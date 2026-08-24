<script lang="ts">
	import type { Project, Layer, Frame } from '$types/app';
	import App from '../App.ts';

	let { app }: { app: App } = $props();
	
	let isDrawing = $state(false);
	let lastPos = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let panOffset = $state({ x: 0, y: 0 });

	let selectedLayer = $derived(app.activeProject?.layers[app.activeLayerIndex] ?? null);
	let activeProject = $derived(app.activeProject);

	$effect(() => {
		if (!selectedLayer || !activeProject) return;
		
		const canvas = document.getElementById('canvas') as HTMLCanvasElement;
		if (!canvas) return;
		
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		
		canvas.width = activeProject.dimensions.width ?? 1920;
		canvas.height = activeProject.dimensions.height ?? 1080;
		
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		for (const layer of activeProject.layers) {
			if (!layer.visible) continue;
			// Draw layer content here when layer data is available
		}
	});

	$effect(() => {
		function handleResize() {
			const container = document.getElementById('canvas-container');
			if (!container) return;
			
			const rect = container.getBoundingClientRect();
			const projW = activeProject?.dimensions.width ?? 1920;
			const projH = activeProject?.dimensions.height ?? 1080;
			const scaleX = (rect.width - 40) / projW;
			const scaleY = (rect.height - 40) / projH;
			zoom = Math.min(scaleX, scaleY, 1);
		}
		
		window.addEventListener('resize', handleResize);
		handleResize();
		
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	function startDrawing(event: MouseEvent) {
		isDrawing = true;
		lastPos = { x: event.clientX, y: event.clientY };
	}

	function draw(event: MouseEvent) {
		if (!isDrawing || !selectedLayer) return;
		
		const canvas = document.getElementById('canvas') as HTMLCanvasElement;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		
		const rect = canvas.getBoundingClientRect();
		const x = (event.clientX - rect.left - panOffset.x) / zoom;
		const y = (event.clientY - rect.top - panOffset.y) / zoom;
		
		ctx.beginPath();
		ctx.moveTo(lastPos.x, lastPos.y);
		ctx.lineTo(x, y);
		ctx.strokeStyle = selectedLayer.strokeColor;
		ctx.lineWidth = selectedLayer.strokeWidth;
		ctx.stroke();
		
		lastPos = { x, y };
	}

	function stopDrawing() {
		isDrawing = false;
	}

	function addLayer() {
		app.addLayer();
	}

	function deleteLayer(layerId: string) {
		app.deleteLayer(layerId);
	}

	function toggleLayerVisibility(layerId: string) {
		app.toggleLayerVisibility(layerId);
	}

	function changeLayerOrder(layerId: string, direction: 'up' | 'down') {
		app.changeLayerOrder(layerId, direction);
	}
</script>

<div class="workspace">
	<div class="canvas-container" id="canvas-container">
		<canvas
			id="canvas"
			onmousedown={startDrawing}
			onmousemove={draw}
			onmouseup={stopDrawing}
			onmouseleave={stopDrawing}
			style="transform: scale({zoom}) translate({panOffset.x / zoom}px, {panOffset.y / zoom}px);"
		></canvas>
	</div>

	<div class="layer-panel" role="complementary" aria-label="Layers panel">
		<div class="panel-header">
			<h3 id="layer-panel-title">Layers</h3>
			<button onclick={addLayer} class="btn-add-layer" aria-label="Add new layer">
				<span class="material-symbols-outlined" aria-hidden="true">add</span>
				Add Layer
			</button>
		</div>
		
		<div class="layer-list" role="list" aria-labelledby="layer-panel-title">
			{#each activeProject?.layers ?? [] as layer (layer.id)}
				<div 
					class="layer-item {String(layer.id) === String(activeProject?.layers[activeProject?.activeLayerIndex]?.id) ? 'active' : ''}"
					role="listitem"
				>
					<button
						class="btn-visibility"
						onclick={() => toggleLayerVisibility(layer.id)}
						aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
					>
						<span class="material-symbols-outlined" aria-hidden="true">
							{layer.visible ? 'visibility' : 'visibility_off'}
						</span>
					</button>
					<span class="layer-name">{layer.name}</span>
					<div class="layer-actions">
						<button onclick={() => changeLayerOrder(layer.id, 'up')} class="btn-order" aria-label="Move layer up">↑</button>
						<button onclick={() => changeLayerOrder(layer.id, 'down')} class="btn-order" aria-label="Move layer down">↓</button>
						<button onclick={() => deleteLayer(layer.id)} class="btn-delete" aria-label="Delete layer">
							<span class="material-symbols-outlined" aria-hidden="true">delete</span>
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.workspace {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: 100%;
	}

	.canvas-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--canvas-bg, #252525);
		min-height: 400px;
		overflow: auto;
		padding: 20px;
		position: relative;
	}

	#canvas {
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		border-radius: 4px;
		cursor: crosshair;
		background: white;
	}

	.layer-panel {
		position: absolute;
		bottom: 20px;
		left: 20px;
		width: 200px;
		background: var(--sidebar-bg, #2c2c2c);
		border: 1px solid var(--sidebar-border, #444);
		border-radius: 8px;
		padding: 12px;
		max-height: 300px;
		overflow-y: auto;
		z-index: 10;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--sidebar-border, #444);
	}

	.panel-header h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary, #f5f5f5);
	}

	.btn-add-layer {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: var(--accent-color, #4CAF50);
		border: none;
		border-radius: 4px;
		color: white;
		font-size: 12px;
		cursor: pointer;
	}

	.btn-add-layer:hover {
		background: var(--accent-hover, #45a049);
	}

	.layer-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.layer-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: var(--layer-bg, #3a3a3a);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.layer-item:hover {
		background: var(--layer-hover, #4a4a4a);
	}

	.layer-item.active {
		background: var(--layer-active, #4CAF50);
		color: white;
	}

	.btn-visibility {
		padding: 4px;
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		border-radius: 2px;
	}

	.btn-visibility:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.layer-name {
		flex: 1;
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.layer-actions {
		display: flex;
		gap: 4px;
	}

	.btn-order {
		padding: 2px 6px;
		background: var(--button-bg, #4a4a4a);
		border: none;
		border-radius: 2px;
		color: inherit;
		font-size: 10px;
		cursor: pointer;
	}

	.btn-order:hover {
		background: var(--button-hover, #5a5a5a);
	}

	.btn-delete {
		padding: 2px;
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		border-radius: 2px;
	}

	.btn-delete:hover {
		background: var(--delete-bg, #f44336);
	}
</style>
