<script lang="ts">
	let {
		totalFrames = 1200,
		markerInterval = 8,
		zoomLevel = 1,
		selectedFrame = 0,
		onframeSelect
	} = $props<{
		totalFrames?: number;
		markerInterval?: number;
		zoomLevel?: number;
		selectedFrame?: number;
		onframeSelect?: (frame: number) => void;
	}>();

	// Use $derived instead of $: reactive statements
	let visibleFrames = $derived(Math.floor(totalFrames * zoomLevel));
	let actualMarkerInterval = $derived(Math.max(1, Math.floor(markerInterval / zoomLevel)));

	// Generate marker positions
	let markers = $derived(
		Array.from(
			{ length: Math.ceil(totalFrames / actualMarkerInterval) },
			(_, i) => i * actualMarkerInterval
		)
	);

	function formatFrame(frame: number): string {
		if (frame % 100 === 0) return `${frame}`;
		if (frame % 10 === 0) return `${frame}`;
		return '';
	}

	let hoveredFrame = $state<number | null>(null);
	let mouseX = $state(0);

	function onMouseMove(e: MouseEvent, frame: number) {
		hoveredFrame = frame;
		mouseX = e.clientX;
	}

	function onMouseLeave() {
		hoveredFrame = null;
	}
</script>

<div class="frame-ruler" onkeydown={(e) => e.key === 'Enter' && onframeSelect?.(selectedFrame)} tabindex="0" role="slider" aria-valuenow={selectedFrame} aria-valuemin={0} aria-valuemax={totalFrames}>
	<div class="ruler-bar">
		<div class="ruler-line"></div>

		{#each markers as frame (frame)}
			<div
				class="marker"
				class:major={frame % 100 === 0}
				class:selected={selectedFrame === frame}
				onmouseenter={(e) => onMouseMove(e, frame)}
				onmouseleave={onMouseLeave}
				onclick={() => onframeSelect?.(frame)}
				tabindex="0"
				role="button"
				aria-label={`Frame ${frame}`}
			>
				<div class="tick" class:minor={frame % 100 !== 0}></div>
				{#if frame % 100 === 0 && frame > 0}
					<span class="label">{formatFrame(frame)}</span>
				{/if}
			</div>
		{/each}

		<div class="playhead" style="left: {(selectedFrame / totalFrames) * 100}%">
			<div class="playhead-tip"></div>
			<div class="playhead-line"></div>
		</div>
	</div>

	{#if hoveredFrame !== null}
		<div class="tooltip" style="left: {(hoveredFrame / totalFrames) * 100}%">
			<span>Frame {hoveredFrame}</span>
		</div>
	{/if}
</div>

<style>
	.frame-ruler {
		position: relative;
		height: 24px;
		background: var(--bg-primary, #1a1a1a);
		border-top: 1px solid var(--border-color, #2a2a2a);
		cursor: pointer;
		user-select: none;
		overflow: hidden;
		outline: none;
	}

	.frame-ruler:focus {
		box-shadow: inset 0 0 0 2px var(--accent-primary, #59B5FF);
	}

	.ruler-bar {
		position: relative;
		height: 100%;
		display: flex;
		align-items: flex-end;
	}

	.ruler-line {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: #3a3a3a;
	}

	.marker {
		position: absolute;
		bottom: 0;
		height: 100%;
		cursor: pointer;
		transition: all 0.1s;
		background: transparent;
		border: none;
		padding: 0;
	}

	.marker:hover {
		background: rgba(99, 102, 241, 0.1);
	}

	.marker.selected {
		background: rgba(99, 102, 241, 0.2);
	}

	.tick {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 1px;
		height: 8px;
		background: #4a4a4a;
		transition: all 0.1s;
	}

	.marker.major .tick {
		height: 12px;
		background: #6a6a6a;
	}

	.marker:hover .tick,
	.marker.selected .tick {
		background: #6366f1;
		height: 14px;
	}

	.label {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		color: #6a6a6a;
		white-space: nowrap;
		pointer-events: none;
	}

	.playhead {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		pointer-events: none;
		z-index: 10;
	}

	.playhead-tip {
		position: absolute;
		top: -6px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 4px solid transparent;
		border-right: 4px solid transparent;
		border-top: 6px solid #6366f1;
		filter: drop-shadow(0 0 4px #6366f1);
	}

	.playhead-line {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 2px;
		height: 100%;
		background: #6366f1;
		opacity: 0.8;
		box-shadow: 0 0 8px #6366f1;
	}

	.tooltip {
		position: absolute;
		top: -28px;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.9);
		color: #fff;
		padding: 3px 8px;
		border-radius: 4px;
		font-size: 11px;
		pointer-events: none;
		white-space: nowrap;
		z-index: 100;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 4px solid transparent;
		border-top-color: rgba(0, 0, 0, 0.9);
	}
</style>