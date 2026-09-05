<script lang="ts">
	import type { Segment } from '$types';
	import {
		frameToPx,
		frameToPercent,
		clientXToFrame,
		type FrameGeometry
	} from '$lib/frameGeometry';

	let {
		totalFrames,
		selectedFrame = 0,
		onframeSelect,
		geometry,
		coordinateElement
	} = $props<{
		totalFrames: number;
		selectedFrame?: number;
		onframeSelect?: (frame: number) => void;
		geometry: FrameGeometry | null;
		coordinateElement?: HTMLElement | null;
	}>();

	let markers = $derived(
		geometry
			? Array.from(
					{ length: Math.floor(geometry.contentEndFrame / 8) + 1 },
					(_, i) => i * 8
				)
			: []
	);

	function selectFrame(frame: number) {
		onframeSelect?.(frame);
	}

	function onPointerDown(e: PointerEvent) {
		if (!geometry) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const frame = clientXToFrame(e.clientX, rect, geometry);
		onframeSelect?.(frame);
	}
</script>

<div class="frame-ruler">
	<div
		class="coordinate-space"
		bind:this={coordinateElement}
		onpointerdown={onPointerDown}
	>
		<div class="ruler-line"></div>

		{#if geometry}
			{#each markers as frame (frame)}
				<button
					class="marker"
					class:major={frame % 100 === 0}
					style={`left: ${frameToPx(frame, geometry)}px`}
					onclick={() => selectFrame(frame)}
					aria-label={`Frame ${frame}`}>
				>
					<span class="tick"></span>
					{#if frame % 100 === 0 && frame !== 0}
						<span class="label">{frame}</span>
					{/if}
				</button>
			{/each}

			<div
				class="playhead"
				style={`left: ${frameToPx(selectedFrame, geometry)}px`}>
			></div>
		{/if}
	</div>
</div>

<style>
	.frame-ruler {
		position: relative;
		width: 100%;
		height: 28px;
		overflow: visible;
	}

	.coordinate-space {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}

	.ruler-line {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1px;
		background: var(--border-color, #333);
	}

	.marker {
		position: absolute;
		bottom: 0;
		transform: translateX(-50%);
		width: 1px;
		height: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: pointer;
	}

	.tick {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 1px;
		height: 7px;
		background: #555;
	}

	.marker.major .tick {
		height: 12px;
	}

	.label {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		white-space: nowrap;
		color: #777;
		pointer-events: none;
	}

	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		transform: translateX(-1px);
		background: #6366f1;
		pointer-events: none;
		z-index: 20;
	}
</style>
