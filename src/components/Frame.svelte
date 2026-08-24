<script lang="ts">
	import type { Frame as FrameType } from '$types/app';

	let {
		frame,
		isSelected,
		onClick,
		onDoubleClick,
		onResizeStart,
		onRotateStart,
	}: {
		frame: FrameType;
		isSelected: boolean;
		onClick: (frame: FrameType) => void;
		onDoubleClick: (frame: FrameType) => void;
		onResizeStart: (frame: FrameType) => void;
		onRotateStart: (frame: FrameType) => void;
	} = $props();

	function handleMouseDown(event: MouseEvent) {
		event.stopPropagation();
		onClick(frame);
	}

	function handleDblClick(event: MouseEvent) {
		event.stopPropagation();
		onDoubleClick(frame);
	}
</script>

<div
	class="frame-element {isSelected ? 'selected' : ''}"
	role="button"
	tabindex="0"
	aria-label={`Frame: ${frame.label}`}
	style:transform={`translate(${frame.x}px, ${frame.y}px) rotate(${frame.rotation}deg)`}
	onmousedown={handleMouseDown}
	ondblclick={handleDblClick}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(frame); } }}
>
	<div class="frame-content" style:background-image={`url('${frame.src}')`}>
		{frame.label}
	</div>
	<div 
		class="resize-handle" 
		role="button" 
		tabindex="0" 
		aria-label="Resize frame" 
		onmousedown={(e) => { e.stopPropagation(); onResizeStart(frame); }}
	></div>
	<div 
		class="rotate-handle" 
		role="button" 
		tabindex="0" 
		aria-label="Rotate frame" 
		onmousedown={(e) => { e.stopPropagation(); onRotateStart(frame); }}
	></div>
</div>

<style>
	.frame-element {
		position: absolute;
		cursor: move;
		user-select: none;
		transition: box-shadow 0.2s ease;
	}

	.frame-element.selected {
		box-shadow: 0 0 0 2px var(--selection-color, #4CAF50);
	}

	.frame-content {
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-primary, #f5f5f5);
		font-weight: 500;
	}

	.resize-handle {
		position: absolute;
		bottom: -5px;
		right: -5px;
		width: 10px;
		height: 10px;
		background: var(--handle-bg, #4CAF50);
		border-radius: 50%;
		cursor: se-resize;
	}

	.rotate-handle {
		position: absolute;
		top: -25px;
		left: 50%;
		transform: translateX(-50%);
		width: 12px;
		height: 12px;
		background: var(--handle-bg, #2196F3);
		border-radius: 50%;
		cursor: grab;
	}

	.rotate-handle::before {
		content: '↻';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 8px;
		color: white;
	}
</style>
