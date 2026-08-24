<script lang="ts">
	import type { RangeValue } from '$types/app';

	let {
		label,
		value,
		onChange,
		min = 0,
		max = 100,
		step = 1,
	}: {
		label: string;
		value: RangeValue;
		onChange: (value: RangeValue) => void;
		min?: number;
		max?: number;
		step?: number;
	} = $props();

	let handle1 = $derived(value.min);
	let handle2 = $derived(value.max);
	let activeHandle = $state<'min' | 'max' | null>(null);

	function clamp(val: number, minVal: number, maxVal: number): number {
		return Math.min(Math.max(val, minVal), maxVal);
	}

	function updateHandle(newVal: number, handle: 'min' | 'max') {
		if (handle === 'min') {
			handle1 = clamp(newVal, min, handle2);
		} else {
			handle2 = clamp(newVal, handle1, max);
		}
		onChange({ min: handle1, max: handle2 });
	}

	function startDrag(handle: 'min' | 'max', event: MouseEvent) {
		activeHandle = handle;
		event.preventDefault();

		function onMouseMove(e: MouseEvent) {
			if (!activeHandle) return;
			const sliderRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const percent = (e.clientX - sliderRect.left) / sliderRect.width;
			updateHandle(Math.round(percent * (max - min) / step) * step + min, activeHandle);
		}

		function onMouseUp() {
			activeHandle = null;
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		}

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const newVal = parseFloat(target.value);
		updateHandle(newVal, target.dataset.handle as 'min' | 'max');
	}
</script>

<div class="multi-thumb-slider">
	<div class="slider-label">{label}</div>
	<div class="slider-track">
		<div 
			class="slider-fill" 
			style={`left: ${((handle1 - min) / (max - min)) * 100}%; width: ${((handle2 - handle1) / (max - min)) * 100}%`}
		></div>
		<div
			class="slider-handle handle-min {activeHandle === 'min' ? 'active' : ''}"
			style={`left: ${((handle1 - min) / (max - min)) * 100}%`}
			onmousedown={(e) => startDrag('min', e)}
			role="slider"
			tabindex="0"
			aria-label="Minimum value"
			aria-valuenow={handle1}
			aria-valuemin={min}
			aria-valuemax={handle2}
		>
			<span>{handle1}</span>
		</div>
		<div
			class="slider-handle handle-max {activeHandle === 'max' ? 'active' : ''}"
			style={`left: ${((handle2 - min) / (max - min)) * 100}%`}
			onmousedown={(e) => startDrag('max', e)}
			role="slider"
			tabindex="0"
			aria-label="Maximum value"
			aria-valuenow={handle2}
			aria-valuemin={handle1}
			aria-valuemax={max}
		>
			<span>{handle2}</span>
		</div>
	</div>
	<input
		type="range"
		min={min}
		max={max}
		step={step}
		value={handle1}
		data-handle="min"
		oninput={handleInput}
		class="slider-input input-min"
		aria-label="Minimum range"
	/>
	<input
		type="range"
		min={min}
		max={max}
		step={step}
		value={handle2}
		data-handle="max"
		oninput={handleInput}
		class="slider-input input-max"
		aria-label="Maximum range"
	/>
</div>

<style>
	.multi-thumb-slider {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 0;
	}

	.slider-label {
		font-size: 12px;
		color: var(--text-secondary, #aaa);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.slider-track {
		position: relative;
		height: 20px;
		background: var(--slider-bg, #3a3a3a);
		border-radius: 10px;
		cursor: pointer;
	}

	.slider-fill {
		position: absolute;
		height: 100%;
		background: var(--slider-fill, #4CAF50);
		border-radius: 10px;
		pointer-events: none;
	}

	.slider-handle {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 16px;
		height: 16px;
		background: var(--handle-bg, #fff);
		border: 2px solid var(--handle-border, #4CAF50);
		border-radius: 50%;
		cursor: grab;
		transition: transform 0.1s ease, box-shadow 0.2s ease;
	}

	.slider-handle.active {
		cursor: grabbing;
		transform: translate(-50%, -50%) scale(1.2);
		box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.3);
	}

	.slider-handle span {
		position: absolute;
		top: -20px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 10px;
		color: var(--text-primary, #f5f5f5);
		white-space: nowrap;
	}

	.slider-input {
		position: absolute;
		width: 100%;
		height: 20px;
		background: transparent;
		pointer-events: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.slider-input::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	.slider-input::-webkit-slider-runnable-track {
		height: 0;
		background: transparent;
	}
</style>
