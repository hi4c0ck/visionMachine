<script lang="ts">
	import type { PipeRow } from '$types';
	import { snapTo8nPlus1 } from '$lib/frameMath';
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
		/** Resolution cap (8n+1). */
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

	const MIN_LENGTH = 41; // 8*5+1
	// Seconds → frames step (1 tick = one frame at the session fps). Display is
	// rounded to 1 decimal; the value itself keeps full precision for the
	// cross-calculation back to frames.
	const SEC_STEP = 1 / Math.max(1, fps);
	const FRAME_STEP = 8; // frame arrows snap on the 8-frame grid

	let frames = $state(pipe.lengthFrames);
	let seconds = $state(pipe.lengthFrames / Math.max(1, fps));

	// Seed both inputs from the pipe when the modal opens.
	$effect(() => {
		if (!open) return;
		frames = pipe.lengthFrames;
		seconds = pipe.lengthFrames / Math.max(1, fps);
	});

	// Frames (source of truth) — snap to a valid 8n+1 count within [41, maxFrames].
	function applyFrames(raw: number) {
		if (!Number.isFinite(raw)) return;
		frames = Math.max(MIN_LENGTH, Math.min(snapTo8nPlus1(raw), maxFrames));
		seconds = frames / Math.max(1, fps);
		onPreview(frames);
	}

	// Step the frame count by ±8 (the 8-frame grid), clamped to the valid
	// 8n+1 range. This drives the visible ▲/▼ arrows next to the frames field.
	function nudgeFrames(delta: number) {
		applyFrames(frames + delta * FRAME_STEP);
	}

	// Seconds → frames (live recalculation).
	function applySeconds(raw: number) {
		if (!Number.isFinite(raw) || raw <= 0) return;
		frames = Math.max(MIN_LENGTH, Math.min(snapTo8nPlus1(Math.round(raw * Math.max(1, fps))), maxFrames));
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
							disabled={frames <= MIN_LENGTH} title="-8 frames" aria-label="8 frames less">−</button>
						<input
							type="number"
							step={FRAME_STEP}
							min={MIN_LENGTH}
							max={maxFrames}
							value={frames}
							onchange={(e) => applyFrames(Number(e.currentTarget.value))}
							class="modal-input"
							aria-labelledby="pl-frames-label" />
						<button type="button" class="pl-step" onclick={() => nudgeFrames(1)}
							disabled={frames >= maxFrames} title="+8 frames" aria-label="8 frames more">+</button>
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
					<div class="pl-warning">
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
							<p class="pl-warning-detail">Zones removed: {trimPreview.lostZoneLabels.join(', ')}</p>
						{/if}
						{#if trimPreview.lostTagLabels && trimPreview.lostTagLabels.length > 0}
							<p class="pl-warning-detail">Tags removed: {trimPreview.lostTagLabels.join(', ')}</p>
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

	.pl-warning {
		padding: 10px 12px;
		background: rgba(255, 176, 32, 0.1);
		border: 1px solid rgba(255, 176, 32, 0.4);
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.45;
	}

	.pl-warning p {
		margin: 0;
	}

	.pl-warning-detail {
		margin-top: 6px;
		font-size: 11px;
		color: var(--text-muted, var(--text-secondary));
	}
</style>
