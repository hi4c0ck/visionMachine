<script lang="ts">
	let {
		side,
		onResizeStart,
		onResizeEnd,
		minSize,
		maxSize,
	}: {
		side: 'left' | 'right';
		onResizeStart: (side: 'left' | 'right') => void;
		onResizeEnd: () => void;
		minSize: number;
		maxSize: number;
	} = $props();

	let rulerWidth = $state(0);
	let isActive = $state(false);

	$effect(() => {
		rulerWidth = minSize;
	});

	$effect(() => {
		if (!isActive) return;

		function onMouseMove(e: MouseEvent) {
			const sidebarWidth = side === 'left' ? e.clientX : window.innerWidth - e.clientX;
			rulerWidth = Math.min(Math.max(sidebarWidth, minSize), maxSize);
		}

		function onMouseUp() {
			isActive = false;
			onResizeEnd();
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);

		return () => {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};
	});

	function handleMouseDown() {
		isActive = true;
		onResizeStart(side);
	}
</script>

<div
	class="ruler {side} {isActive ? 'active' : ''}"
	role="slider"
	tabindex="0"
	aria-label={`${side} sidebar resize handle`}
	aria-valuenow={rulerWidth}
	aria-valuemin={minSize}
	aria-valuemax={maxSize}
	style:width={`${rulerWidth}px`}
	onmousedown={handleMouseDown}
	onkeydown={(e) => {
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			rulerWidth = Math.min(rulerWidth + 10, maxSize);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			rulerWidth = Math.max(rulerWidth - 10, minSize);
		}
	}}
>
	<div class="ruler-markings">
		{#each Array.from({ length: Math.ceil(rulerWidth / 10) }) as _, i}
			<div class="ruler-mark" style:left={`${i * 10}px`}></div>
		{/each}
	</div>
	<div class="ruler-handle"></div>
</div>

<style>
	.ruler {
		position: absolute;
		top: 0;
		bottom: 0;
		cursor: ew-resize;
		background: var(--ruler-bg, #2c2c2c);
		border: 1px solid var(--ruler-border, #444);
		z-index: 10;
	}

	.ruler.left {
		left: 0;
	}

	.ruler.right {
		right: 0;
	}

	.ruler.active {
		background: var(--ruler-active-bg, #3a3a3a);
		border-color: var(--ruler-active-border, #666);
	}

	.ruler-markings {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
	}

	.ruler-mark {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--ruler-mark, #555);
	}

	.ruler-mark::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 8px;
		background: inherit;
	}

	.ruler-handle {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 4px;
		height: 40px;
		background: var(--ruler-handle, #666);
		border-radius: 2px;
		opacity: 0.7;
	}

	.ruler:hover .ruler-handle {
		opacity: 1;
	}
</style>
