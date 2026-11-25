<script lang="ts">
	import type { PipeRow } from '$types';
	import { fitFramesToGrid, frameGridForModel } from '$lib/frameMath';
	import { getSettings, setOnSettingsChange, unregisterSettingsChange } from '$lib/settings/store';
	import '../composer-modal.css';

	let {
		pipe,
		fps,
		maxFrames,
		/** Live preview of what would be trimmed when committing the current
		 *  pending frame count (computed by the panel, keyed off `onPreview`). */
		trimPreview,
		open = $bindable(false),
		onConfirm,
		onPreview,
	} = $props<{
		pipe: PipeRow;
		/** Session fps — frames ↔ seconds conversion. */
		fps: number;
		/** Resolution cap — the model grid is fitted UNDER this ceiling. */
		maxFrames: number;
		/** Computed by the panel for the current pending frames: which zones/tags
		 *  would be trimmed away when the pipe shrinks to it. Empty when growing. */
		trimPreview: {
			trimmedZones: number;
			trimmedTags: number;
			/** Zones fully clipped out (start beyond the new length). */
			lostZoneLabels?: string[];
			/** Tags fully clipped out. */
			lostTagLabels?: string[];
		};
		open: boolean;
		onConfirm: (frames: number) => void;
		/** Fires on every pending-frames change so the panel recomputes the
		 *  trim preview live as the user types. */
		onPreview: (frames: number) => void;
	}>();

	// The settings store is a non-reactive singleton, so read the picked
	// model id reactively through its change notification (never inside
	// $derived alone — that would freeze on the first render).
	let currentModelId = $state(getSettings().providers.video?.model ?? '');
	$effect(() => {
		const sync = () => { currentModelId = getSettings().providers.video?.model ?? ''; };
		setOnSettingsChange(sync);
		return () => unregisterSettingsChange(sync);
	});
	const grid = $derived(frameGridForModel(currentModelId));
	const minLength = $derived(grid.min);
	// Seconds → frames step (1 tick = one frame at the session fps). Display is
	// rounded to 1 decimal; the value itself keeps full precision for the
	// cross-calculation back to frames.
	const SEC_STEP = $derived(1 / Math.max(1, fps));
	const FRAME_STEP = $derived(grid.step);

	// svelte-ignore state_referenced_locally — intentional: seed from pipe, sync via effect
	let frames = $state(pipe.lengthFrames);
	// svelte-ignore state_referenced_locally — intentional: seed from pipe/fps, sync via effect
	let seconds = $state(pipe.lengthFrames / Math.max(1, fps));

	// Seed both inputs from the pipe when the modal opens.
	$effect(() => {
		if (!open) return;
		frames = pipe.lengthFrames;
		seconds = pipe.lengthFrames / Math.max(1, fps);
	});

	// Frames (source of truth) — ceil onto the model's grid, clamped to
	// [grid.min, resolution cap]. The default grid reproduces the old 8n+1.
	function applyFrames(raw: number) {
		if (!Number.isFinite(raw)) return;
		frames = fitFramesToGrid(raw, grid, maxFrames);
		seconds = frames / Math.max(1, fps);
		onPreview(frames);
	}

	// Step the frame count by ±one grid interval, clamped to the valid range.
	// This drives the visible ▲/▼ arrows next to the frames field.
	function nudgeFrames(delta: number) {
		applyFrames(frames + delta * FRAME_STEP);
	}

	// Seconds → frames (live recalculation).
	function applySeconds(raw: number) {
		if (!Number.isFinite(raw) || raw <= 0) return;
		frames = fitFramesToGrid(Math.round(raw * Math.max(1, fps)), grid, maxFrames);
		seconds = frames / Math.max(1, fps);
		onPreview(frames);
	}

	const trimmed = $derived(frames < pipe.lengthFrames);

	function confirm() {
		if (frames === pipe.lengthFrames) {
			open = false;
			return;
		}
		onConfirm(frames);
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => open = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Pipe Length</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="pl-frames-label">Frames</label>
					<div class="pl-stepper">
						<button type="button" class="pl-step" onclick={() => nudgeFrames(-1)}
							disabled={frames <= minLength} title={`−${FRAME_STEP} frames`} aria-label={`${FRAME_STEP} frames less`}>−</button>
						<input
							type="number"
							step={FRAME_STEP}
							min={minLength}
							max={maxFrames}
							value={frames}
							onchange={(e) => applyFrames(Number(e.currentTarget.value))}
							class="modal-input"
							aria-labelledby="pl-frames-label" />
						<button type="button" class="pl-step" onclick={() => nudgeFrames(1)}
							disabled={frames >= maxFrames} title={`+${FRAME_STEP} frames`} aria-label={`${FRAME_STEP} frames more`}>+</button>
					</div>
				</div>
				<div class="modal-field">
					<label id="pl-seconds-label">Seconds (at {fps} fps)</label>
					<input
						type="number"
						step={SEC_STEP}
						min="0.1"
						max={maxFrames / Math.max(1, fps)}
						value={Number(seconds.toFixed(1))}
						onchange={(e) => applySeconds(Number(e.currentTarget.value))}
						class="modal-input"
						aria-labelledby="pl-seconds-label" />
				</div>

				<!-- Trim warning: shrinking the pipe re-trims zones/tags into
				     the new frame space — show exactly what would be affected. -->
				{#if trimmed}
					<div class="gen-warning-box">
						<p>
							Shrinking from {pipe.lengthFrames}f to {frames}f
							{#if trimPreview.trimmedZones > 0 || trimPreview.trimmedTags > 0}
								will trim {trimPreview.trimmedZones} zone{(trimPreview.trimmedZones !== 1 ? 's' : '')}
								and {trimPreview.trimmedTags} tag{(trimPreview.trimmedTags !== 1 ? 's' : '')}.
							{:else}
								will not affect any existing zones or tags.
							{/if}
						</p>
						{#if trimPreview.lostZoneLabels && trimPreview.lostZoneLabels.length > 0}
							<p class="gen-warning-detail">Zones removed: {trimPreview.lostZoneLabels.join(', ')}</p>
						{/if}
						{#if trimPreview.lostTagLabels && trimPreview.lostTagLabels.length > 0}
							<p class="gen-warning-detail">Tags removed: {trimPreview.lostTagLabels.join(', ')}</p>
						{/if}
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => open = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirm} disabled={frames === pipe.lengthFrames}>Apply</button>
			</div>
		</div>
	</div>
{/if}


<style>
	.pl-stepper {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.pl-stepper .modal-input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.pl-step {
		width: 30px;
		height: 34px;
		flex: 0 0 auto;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
		transition: all 0.15s;
		padding: 0;
	}

	.pl-step:hover:not(:disabled) {
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

	.pl-step:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* .gen-warning-box and .gen-warning-detail are in the shared
	   composer-modal.css — no local rules needed. */
</style>
