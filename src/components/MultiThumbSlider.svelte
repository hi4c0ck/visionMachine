<script lang="ts">
	import { createFrameGeometry, frameToPx, pxDeltaToFrame, snapFrame } from '$lib/frameGeometry';
	import type { FrameGeometry } from '$lib/frameGeometry';

	let {
		geometry,
		values = [30, 70],
		label = '',
		color = '#a8b5d6',
		enablePins = true,
		pinInterval = 8,
		mode = 'both',
		onchange
	} = $props<{
		geometry?: FrameGeometry;
		values?: [number, number];
		label?: string;
		color?: string;
		enablePins?: boolean;
		pinInterval?: number;
		mode?: 'left' | 'right' | 'body' | 'both';
		onchange?: (values: [number, number]) => void;
	}>();

	// Use $state for local reactive state
	let localValues = $state<[number, number]>(values ?? [30, 70]);

	const MIN_GAP = 8;

	// Use effect to sync props
	$effect(() => {
		if (values && (values[0] !== localValues[0] || values[1] !== localValues[1])) {
			localValues = [...values] as [number, number];
		}
	});

	// Generate pin positions from geometry
	let pins = $derived(
		Array.from(
			{ length: Math.floor((geometry?.contentEndFrame ?? 0) / pinInterval) },
			(_, i) => (i + 1) * pinInterval
		).filter(v => v <= (geometry?.contentEndFrame ?? 0))
	);

	type DragState = {
		side: 'left' | 'right' | 'body';
		origX: number;
		origValues: [number, number];
		duration: number;
	};

	let dragState: DragState | null = null;
	let trackEl: HTMLElement | null = null;

	function startDrag(side: 'left' | 'right' | 'body', e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const target = e.currentTarget as HTMLElement;
		dragState = {
			side,
			origX: e.clientX,
			origValues: [localValues[0], localValues[1]],
			duration: localValues[1] - localValues[0]
		};
		target.setPointerCapture(e.pointerId);
	}

	function commitDrag() {
		if (!dragState) return;
		onchange?.([localValues[0], localValues[1]]);
		dragState = null;
	}

	function releaseCapture(e: PointerEvent) {
		const target = e.currentTarget as HTMLElement;
		try { target.releasePointerCapture(e.pointerId); } catch {}
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragState || !geometry) return;

		const track = e.currentTarget as HTMLElement;
		const rect = track.getBoundingClientRect();
		const pxDelta = e.clientX - dragState.origX;
		const valueDelta = pxDeltaToFrame(pxDelta, geometry);
		const snappedDelta = snapFrame(valueDelta);

		const baseLeft = dragState.origValues[0];
		const baseRight = dragState.origValues[1];
		const contentEnd = geometry.contentEndFrame;

		if (dragState.side === 'left') {
			const newVal = baseLeft + snappedDelta;
			const maxLeft = baseRight - MIN_GAP;
			localValues[0] = Math.min(newVal, maxLeft);
			localValues[0] = Math.max(0, localValues[0]);
		} else if (dragState.side === 'right') {
			const newVal = baseRight + snappedDelta;
			const minRight = baseLeft + MIN_GAP;
			localValues[1] = Math.max(newVal, minRight);
			localValues[1] = Math.min(contentEnd, localValues[1]);
		} else {
			// body drag: translate both thumbs, preserve duration
			const newLeft = baseLeft + snappedDelta;
			const newRight = baseRight + snappedDelta;
			const clampedLeft = Math.max(0, Math.min(contentEnd, newLeft));
			const clampedRight = Math.max(0, Math.min(contentEnd, newRight));
			// If clamping pushes one thumb to edge, keep the other at same offset
			if (clampedLeft === 0) {
				localValues[0] = 0;
				localValues[1] = Math.min(contentEnd, dragState.duration);
			} else if (clampedRight === contentEnd) {
				localValues[1] = contentEnd;
				localValues[0] = Math.max(0, contentEnd - dragState.duration);
			} else {
				localValues[0] = clampedLeft;
				localValues[1] = clampedRight;
			}
		}
	}

	function onPointerUp(e: PointerEvent) {
		releaseCapture(e);
		commitDrag();
	}

	function handleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('.thumb-hit')) return;
		if (!geometry) return;

		const track = e.currentTarget as HTMLElement;
		const rect = track.getBoundingClientRect();
		const localX = e.clientX - rect.left;
		const rawFrame = (localX / rect.width) * geometry.contentEndFrame;
		const snapped = snapFrame(rawFrame);
		const clamped = Math.max(0, Math.min(geometry.contentEndFrame, snapped));

		const distToA = Math.abs(localValues[0] - clamped);
		const distToB = Math.abs(localValues[1] - clamped);

		if (distToA <= distToB) {
			const newLeft = Math.min(clamped, localValues[1] - MIN_GAP);
			if (newLeft >= 0) {
				localValues[0] = newLeft;
			}
		} else {
			const newRight = Math.max(clamped, localValues[0] + MIN_GAP);
			if (newRight <= geometry.contentEndFrame) {
				localValues[1] = newRight;
			}
		}

		onchange?.(localValues);
	}

	function getSnapStatus(v: number): boolean {
		return Math.abs(v % pinInterval) < 3;
	}

	function getThumbVisibility(side: 'left' | 'right'): boolean {
		if (mode === 'both') return true;
		if (mode === 'left') return side === 'left';
		if (mode === 'right') return side === 'right';
		return false;
	}
</script>

<div class="slider" style={`--c: ${color}`}>
	{#if label}<div class="label">{label}</div>{/if}

	{#if enablePins && pins.length > 0}
		<div class="pins-ruler">
			{#each pins as pin (pin)}
				<div class="pin" style={`left: ${frameToPx(pin, geometry) / (geometry?.width ?? 1) * 100}%`}>
					<span class="pin-line"></span>
					<span class="pin-value">{pin}</span>
				</div>
			{/each}
		</div>
	{/if}

	<div
		class="track-container"
		bind:this={trackEl}
		role="slider"
		tabindex="0"
		ontouchstart={(e) => e.preventDefault()}
		onpointerdown={(e) => {
			if ((e.target as HTMLElement).closest('.thumb-hit')) return;
			startDrag('body', e);
		}}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onclick={handleClick}
	>
		<div class="rail"></div>
		<div
			class="fill"
			style={`left: ${frameToPx(Math.min(localValues[0], localValues[1]), geometry)}px; width: ${Math.abs(frameToPx(localValues[1], geometry) - frameToPx(localValues[0], geometry))}px`}
		></div>

		{#if getThumbVisibility('left')}
		<div class="thumb-hit" onpointerdown={(e) => startDrag('left', e)} style={`left: ${frameToPx(localValues[0], geometry)}px`}>
			<div class="thumb thumb-a">
				{#if getSnapStatus(localValues[0])}<span class="guide-line"></span>{/if}
				<span class="thumb-value">{Math.round(localValues[0])}</span>
			</div>
		</div>
		{/if}

		{#if getThumbVisibility('right')}
		<div class="thumb-hit" onpointerdown={(e) => startDrag('right', e)} style={`left: ${frameToPx(localValues[1], geometry)}px`}>
			<div class="thumb thumb-b">
				{#if getSnapStatus(localValues[1])}<span class="guide-line"></span>{/if}
				<span class="thumb-value">{Math.round(localValues[1])}</span>
			</div>
		</div>
		{/if}
	</div>

	<div class="readout">
		<span class="value-chip value-a"><span class="dot dot-a"></span><span>{Math.round(localValues[0])}</span></span>
		<span class="value-chip value-b"><span class="dot dot-b"></span><span>{Math.round(localValues[1])}</span></span>
	</div>
</div>

<style>
	:global(.slider) {
		--c: #a8b5d6;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 0;
		width: 100%;
		font-family: system-ui, sans-serif;
		touch-action: none;
	}

	:global(.label) {
		font-size: 9px;
		color: #6e7681;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding-left: 2px;
	}

	/* Pin ruler */
	:global(.pins-ruler) {
		position: relative;
		height: 18px;
	}

	:global(.pin) {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	:global(.pin-line) {
		display: block;
		width: 1px;
		height: 6px;
		background: #3a3a3a;
		transition: all 0.12s;
	}

	:global(.pin:hover .pin-line) {
		background: var(--c);
		height: 8px;
		box-shadow: 0 0 4px var(--c);
	}

	:global(.pin-value) {
		font-size: 7px;
		color: #4a4a4a;
		margin-top: 2px;
		font-weight: 400;
		transition: color 0.12s;
	}

	:global(.pin:hover .pin-value) {
		color: var(--c);
		font-weight: 600;
	}

	/* Track container */
	:global(.track-container) {
		position: relative;
		height: 36px;
		cursor: pointer;
		user-select: none;
	}

	:global(.rail) {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		left: 0;
		right: 0;
		height: 10px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 5px;
	}

	:global(.fill) {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 10px;
		background: var(--c);
		border-radius: 5px;
		opacity: 0.5;
		pointer-events: none;
		transition: left 0.05s, width 0.05s;
	}

	/* Thumb hit areas */
	:global(.thumb-hit) {
		position: absolute;
		top: 50%;
		width: 36px;
		height: 36px;
		transform: translate(-50%, -50%);
		cursor: grab;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.thumb-hit:active) {
		cursor: grabbing;
	}

	/* Thumbs */
	:global(.thumb) {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		transition: transform 0.08s, box-shadow 0.12s;
		user-select: none;
	}

	:global(.thumb:hover) {
		transform: scale(1.12);
	}

	/* Left thumb - blue */
	:global(.thumb-a) {
		background: radial-gradient(circle at 35% 35%, #d0dbe8, #8ba4c4);
		border: 2px solid #6a8ab5;
		box-shadow: 0 2px 8px rgba(0,0,0,.4), inset 0 1px 2px rgba(255,255,255,.2);
	}

	/* Right thumb - green */
	:global(.thumb-b) {
		background: radial-gradient(circle at 35% 35%, #d0e8d8, #7fb89a);
		border: 2px solid #5a9a78;
		box-shadow: 0 2px 8px rgba(0,0,0,.4), inset 0 1px 2px rgba(255,255,255,.2);
	}

	:global(.thumb-value) {
		font-size: 7px;
		font-weight: 700;
		color: rgba(0, 0, 0, 0.7);
		pointer-events: none;
		line-height: 1;
	}

	/* Guide line when snapped */
	:global(.guide-line) {
		position: absolute;
		top: -16px;
		left: 50%;
		transform: translateX(-50%);
		width: 1px;
		height: 16px;
		background: linear-gradient(to bottom, transparent, var(--c));
		opacity: 0;
		transition: opacity 0.12s;
		pointer-events: none;
	}

	:global(.thumb:has(.guide-line)) .guide-line {
		opacity: 1;
	}

	/* Readout */
	:global(.readout) {
		display: flex;
		justify-content: space-between;
		padding: 0 4px;
	}

	:global(.value-chip) {
		font-size: 12px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	:global(.value-a) {
		color: #8ba4c4;
	}

	:global(.value-b) {
		color: #7fb89a;
	}

	:global(.dot) {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	:global(.dot-a) {
		background: #8ba4c4;
	}

	:global(.dot-b) {
		background: #7fb89a;
	}
</style>
