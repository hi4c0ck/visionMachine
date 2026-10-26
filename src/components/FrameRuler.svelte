<script lang="ts">
	import {
		frameToPx,
		clientXToFrame,
		type FrameGeometry
	} from '$lib/frameGeometry';
	import { TAG_SPECIFICATIONS, type TagType } from '$types';

	let {
		totalFrames,
		selectedFrame = 0,
		onframeSelect,
		geometry,
		legend = null,
		fps
	} = $props<{
		totalFrames: number;
		selectedFrame?: number;
		onframeSelect?: (frame: number) => void;
		geometry: FrameGeometry | null;
		/** Optional legend strip (zone + global + tag color key). */
		legend?: { zone: string; global: string; sound?: string; tags: Array<{ name: string; color: string }> } | null;
		/** Session fps — enables the pin notice seconds readout (frame / fps). */
		fps?: number;
	}>();

	const TAG_TYPES: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];

	// Default legend key (all tag types from TAG_SPECIFICATIONS) when the
	// caller enables the legend but passes no explicit tag list.
	let legendEntries = $derived(
		legend?.tags ??
		TAG_TYPES.map((t) => ({ name: TAG_SPECIFICATIONS[t].name, color: TAG_SPECIFICATIONS[t].color }))
	);
	let legendZone = $derived(legend?.zone ?? 'var(--accent-color)');
	let legendGlobal = $derived(legend?.global ?? '#59B5FF');
	let legendSound = $derived(legend?.sound ?? '#F5A623');

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
	{#if legend}
		<div class="ruler-legend" aria-label="Timeline legend">
			<span class="legend-item" title="Zone segment (accent)"><span class="legend-swatch" style="background: {legendZone}"></span>Zone</span>
			<span class="legend-item" title="Global style range"><span class="legend-swatch legend-swatch-global" style="background: {legendGlobal}"></span>Global</span>
			{#if legend?.sound}
				<span class="legend-item" title="Sound range"><span class="legend-swatch" style="background: {legendSound}"></span>Sound</span>
			{/if}
			{#each legendEntries as entry (entry.name)}
				<span class="legend-item" title={entry.name}><span class="legend-swatch" style="background: {entry.color}"></span>{entry.name}</span>
			{/each}
		</div>
	{/if}
	<div
		class="coordinate-space"
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
					<span class="tick"></span>
					{#if frame % 100 === 0 && frame !== 0}
						<span class="label">{frame}</span>
					{/if}
				</button>
			{/each}

			<div
				class="playhead"
				style={`left: ${frameToPx(selectedFrame, geometry)}px`}></div>

			<!-- Tiny, slightly-visible notice of the pin frame + time (1 decimal).
				 Themed: follows the active theme via CSS variables. Sibling of the
				 playhead so it resolves left against the coordinate space. -->
			{#if fps && fps > 0}
				<div
					class="pin-note"
					class:align-left={selectedFrame <= 8}
					class:align-right={selectedFrame >= totalFrames - 9}
					style={`left: ${frameToPx(selectedFrame, geometry)}px`}
					aria-hidden="true">
					{selectedFrame} · {(selectedFrame / fps).toFixed(1)}s
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.frame-ruler {
		position: relative;
		width: 100%;
	}

	/* Compact legend strip above the ruler ticks: zone/global + tag color key.
	   Sits in the frame-ruler space so it aligns with the coordinate canvas.
	   Adding it grows the ruler height by 16px; .coordinate-space keeps its
	   fixed 28px so the shared-coordinate-space invariant is unchanged. */
	.ruler-legend {
		height: 16px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 9px;
		color: var(--text-muted, #888);
		white-space: nowrap;
		overflow: hidden;
		padding: 0 2px;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.legend-swatch {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.legend-swatch-global {
		opacity: 0.5;
	}

	.coordinate-space {
		position: relative;
		width: 100%;
		height: 28px;
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
		/* Template A (Open Canvas): the ruler is fine-grained and subordinate
		   to the content — quiet themed ticks, not chunky dark bars. */
		background: var(--text-muted, #6b6b80);
		opacity: 0.5;
	}

	.marker.major .tick {
		height: 12px;
		background: var(--text-secondary, #a0a0b0);
		opacity: 0.7;
	}

	.label {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		font-family: var(--font-mono, monospace);
		white-space: nowrap;
		color: var(--text-muted, #6b6b80);
		pointer-events: none;
	}

	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		/* Template A: a quiet 1px playhead with a small cap — easy to locate,
		   not a heavy bar. */
		width: 1px;
		transform: translateX(-0.5px);
		background: var(--accent-color, #59B5FF);
		pointer-events: none;
		z-index: 20;
	}

	.playhead::before {
		content: "";
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent-color, #59B5FF);
	}

	/* Pin notice: tiny frame + seconds readout at the playhead position.
	   Muted themed colors so it stays visible without disrupting the ruler. */
	.pin-note {
		position: absolute;
		top: 1px;
		transform: translateX(-50%);
		font-size: 9px;
		line-height: 1.5;
		padding: 0 4px;
		border-radius: 3px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.06));
		color: var(--text-muted, #888);
		border: 1px solid var(--border-color, #3f3f46);
		white-space: nowrap;
		pointer-events: none;
		z-index: 21;
		opacity: 0.85;
	}

	.pin-note.align-left { transform: translateX(0); }
	.pin-note.align-right { transform: translateX(-100%); }
</style>
