<script lang="ts">
	import type { PipeRow, Segment, TagElement } from '$types';
	import FrameRuler from '../FrameRuler.svelte';
	import {
		createFrameGeometry,
		type FrameGeometry,
		frameToPx,
		clientXToFrame,
		rangeWidthPx,
	} from '$lib/frameGeometry';
	import {
		calculateElementDrag,
		getDragBounds,
		type TemporalDragState,
		type DragBounds,
	} from '$lib/dragMath';
	import {
		resizeSegment as resizeSegmentAction,
		resizeTagElement as resizeTagElementAction,
	} from '$lib/composerStore';

	// Timeline area: one frame coordinate canvas (ruler + global lanes +
	// timeline lane + [+]) for a single pipe. Owns its geometry (the
	// .timeline-coordinate element + ResizeObserver) and the temporal drag
	// engine; the panel fires action callbacks back.
	let {
		pipe,
		sessionId,
		selectedFrame,
		onFrameChange,
		onAddTrack,
		onToggleGlobal,
		onRemoveGlobal,
		onAddSegment,
		onDeleteSegment,
		onOpenTagMenu,
		onRemoveTag,
		onEditTagPrompt,
	} = $props<{
		pipe: PipeRow;
		sessionId?: string;
		selectedFrame?: number;
		onFrameChange: (f: number) => void;
		onAddTrack: (e: MouseEvent) => void;
		onToggleGlobal: (globalId: string) => void;
		onRemoveGlobal: (globalId: string) => void;
		onAddSegment: () => void;
		onDeleteSegment: (segId: string) => void;
		onOpenTagMenu: (segId: string, e: MouseEvent) => void;
		onRemoveTag: (segId: string, tagId: string) => void;
		onEditTagPrompt: (seg: Segment, tag: TagElement) => void;
	}>();

	// Every element inside a pipe lives in THAT pipe's frame-length space
	// (8n+1 count → last usable frame = lengthFrames - 1). The section owns
	// its frame space, so it derives totalFrames from its own pipe rather
	// than receiving it from the panel (which would impose the *active*
	// pipe's length on every section).
	const DEFAULT_FRAME_COUNT = 241;
	let totalFrames = $derived(pipe?.lengthFrames ?? DEFAULT_FRAME_COUNT);

	// ── Geometry: this pipe's single canonical coordinate element ──────────
	// Every track (global/timeline/tags) and the ruler resolve px math
	// through this one element → one coordinate system.
	let rulerElement = $state<HTMLElement | null>(null);
	let rulerGeometry = $state<FrameGeometry | null>(null);

	function updateRulerGeometry() {
		if (!rulerElement) {
			rulerGeometry = null;
			return;
		}
		const rect = rulerElement.getBoundingClientRect();
		if (rect.width <= 0) {
			rulerGeometry = null;
			return;
		}
		rulerGeometry = createFrameGeometry(totalFrames, rect.width);
	}

	$effect(() => {
		if (!rulerElement) return;
		updateRulerGeometry();
		const observer = new ResizeObserver(updateRulerGeometry);
		observer.observe(rulerElement);
		return () => observer.disconnect();
	});

	// Recompute geometry when totalFrames changes
	$effect(() => {
		if (rulerElement) updateRulerGeometry();
	});

	// ── Drag engine ─────────────────────────────────────────────────────────
	type DragState = TemporalDragState & {
		captureElement: HTMLElement;
		pointerId: number;
		startClientX: number;
	};

	// Transient preview state for visual feedback during drag
	let previewDragState = $state<{
		type: 'segment' | 'tag';
		id: string;
		segmentId?: string;
		handle?: 'left' | 'right' | 'body';
		startFrame: number;
		endFrame: number;
	} | null>(null);

	// Actual drag state for tracking interaction
	let dragState = $state<DragState | null>(null);

	// Clear a dangling drag on outside click (defensive parity with panel)
	$effect(() => {
		function handler() {
			dragState = null;
		}
		document.addEventListener('click', handler);
		return () => document.removeEventListener('click', handler);
	});

	function getTimeline(p: PipeRow): any {
		return p.elements.find((e: any) => e.tag === 'timeline') ?? null;
	}

	function getGlobal(p: PipeRow): any {
		return p.elements.find((e: any) => e.tag === 'global_style') ?? null;
	}

	// Get preview state for a segment during drag
	function getPreviewSegment(seg: Segment) {
		if (!previewDragState || previewDragState.type !== 'segment' || previewDragState.id !== seg.id) {
			return null;
		}
		return previewDragState;
	}

	// Get preview state for a tag during drag
	function getPreviewTag(tagId: string) {
		if (!previewDragState || previewDragState.type !== 'tag' || previewDragState.id !== tagId) {
			return null;
		}
		return previewDragState;
	}

	// One pointerdown for every temporal element (segment thumb/body, tag thumb/body).
	function handleElementPointerDown(
		e: PointerEvent,
		type: 'segment' | 'tag',
		id: string,
		segmentId: string,
		handle: 'left' | 'right' | 'body',
		startFrame: number,
		endFrame: number
	) {
		e.preventDefault();
		e.stopPropagation();

		if (!rulerElement || !rulerGeometry) return;

		const element = e.currentTarget as HTMLElement;
		const rect = rulerElement.getBoundingClientRect();
		const pointerStartFrame = clientXToFrame(e.clientX, rect, rulerGeometry);

		element.setPointerCapture(e.pointerId);

		dragState = {
			type,
			id,
			segmentId,
			handle,
			startFrame,
			endFrame,
			pointerStartFrame,
			captureElement: element,
			pointerId: e.pointerId,
			startClientX: e.clientX
		};

		previewDragState = {
			type,
			id,
			segmentId,
			handle,
			startFrame,
			endFrame
		};
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragState || !rulerElement || !rulerGeometry) return;
		if (e.pointerId !== dragState.pointerId) return;

		const rect = rulerElement.getBoundingClientRect();
		const pointerFrame = clientXToFrame(e.clientX, rect, rulerGeometry);

		// Single math path for both element types — bounds resolved per type.
		// Capture a non-null local so the closure below keeps the narrowing.
		const d = dragState;
		const seg = d.type === 'tag'
			? getTimeline(pipe)?.segments.find((s: Segment) => s.id === d.segmentId)
			: undefined;
		const bounds: DragBounds = getDragBounds(d, totalFrames, seg);
		const [startFrame, endFrame] = calculateElementDrag(dragState, pointerFrame, bounds);
		previewDragState = {
			type: dragState.type,
			id: dragState.id,
			segmentId: dragState.segmentId,
			handle: dragState.handle,
			startFrame,
			endFrame
		};
	}

	async function handlePointerUp(e: PointerEvent) {
		if (!dragState) return;
		if (e.pointerId !== dragState.pointerId) return;

		// Click-vs-drag guard: a zero-move release is a click, not a drag —
		// skip the (no-op) resize commit so the subsequent `click` event
		// can edit the tag prompt without a swallowed interaction.
		const startClientX = dragState.startClientX;
		const finalPreview = previewDragState;

		try {
			dragState.captureElement.releasePointerCapture(dragState.pointerId);
		} catch {
			// Already released
		}

		dragState = null;

		if (Math.abs(e.clientX - startClientX) < 3) {
			previewDragState = null;
			return;
		}

		// Commit to THIS section's pipe, never another pipe: each pipe renders
		// its own section, so the drag that started on pipe N must resize pipe N.
		if (!finalPreview || !sessionId || !pipe) {
			previewDragState = null;
			return;
		}

		if (finalPreview.type === 'segment') {
			const result = await resizeSegmentAction(
				sessionId,
				pipe.id,
				finalPreview.id,
				finalPreview.startFrame,
				finalPreview.endFrame
			);
			if (result.errors.length) {
				console.error('[TimelineSection] resizeSegment:', result.errors);
			}
		}

		if (finalPreview.type === 'tag') {
			const result = await resizeTagElementAction(
				sessionId,
				pipe.id,
				finalPreview.segmentId!,
				finalPreview.id,
				finalPreview.startFrame,
				finalPreview.endFrame
			);
			if (result.errors.length) {
				console.error('[TimelineSection] resizeTag:', result.errors);
			}
		}

		previewDragState = null;
	}
</script>

<!-- ═══ TIMELINE AREA: single frame coordinate canvas + chrome column ═══ -->
<div class="timeline-area">
	<div class="timeline-coordinate" bind:this={rulerElement}>
		<div class="timeline-ruler">
			<FrameRuler
				{totalFrames}
				{selectedFrame}
				geometry={rulerGeometry}
				onframeSelect={(f) => onFrameChange(f)}
			/>
		</div>

		<!-- ═══ GLOBAL LANES (in coordinate space) ═══ -->
		{#each [getGlobal(pipe)] as global}
			{#if global}
				<div class="global-lane">
					{#if rulerGeometry}
						<div
							class="global-range"
							style="left: {frameToPx(global.frameStart ?? 0, rulerGeometry)}px; width: {rangeWidthPx(global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1, rulerGeometry)}px;"
						></div>
					{/if}
					<div class="global-actions">
						<button class="btn-icon-sm" onclick={() => onToggleGlobal(global.id)} title="Toggle global">
							{#if global.enabled}◉{:else}○{/if}
						</button>
						<button class="btn-icon-sm btn-del-sm" onclick={() => onRemoveGlobal(global.id)} title="Remove global">×</button>
					</div>
				</div>
			{/if}
		{/each}

		<!-- ═══ TIMELINE LANE (in coordinate space) ═══ -->
		<div class="timeline-lane">
			{#each [getTimeline(pipe)] as tl}
				{#if tl}
					{#each tl.segments as seg (seg.id)}
						<div class="segment-row">
							<div class="segment-coordinate-row" style="height: {28 + seg.tags.length * 24}px;">
								{#if rulerGeometry}
									<!-- Left handle -->
									<div
										class="segment-handle segment-handle-left"
										style="left: {frameToPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'left', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={getPreviewSegment(seg)?.startFrame ?? seg.frameStart}
										title="Drag to resize start">
									</div>
									<!-- Body -->
									<div
										class="segment-body"
										style="left: {frameToPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, rulerGeometry)}px; width: {rangeWidthPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, getPreviewSegment(seg)?.endFrame ?? seg.frameEnd, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'body', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={getPreviewSegment(seg)?.startFrame ?? seg.frameStart}>
										<span class="seg-label">{getPreviewSegment(seg) ? `${getPreviewSegment(seg)!.startFrame}–${getPreviewSegment(seg)!.endFrame}` : `${seg.frameStart}–${seg.frameEnd}`}</span>
									</div>
									<!-- Right handle -->
									<div
										class="segment-handle segment-handle-right"
										style="left: {frameToPx(getPreviewSegment(seg)?.endFrame ?? seg.frameEnd, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'right', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={getPreviewSegment(seg)?.endFrame ?? seg.frameEnd}
										title="Drag to resize end">
									</div>
									<!-- Tags: absolute rows stacked below body, same coordinate space -->
									{#each seg.tags as tag, tagIdx (tag.id)}
										<div class="tag-coordinate-row" style="top: {28 + tagIdx * 24}px;">
											<div
												class="tag-handle tag-handle-left"
												style="left: {frameToPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, rulerGeometry)}px; --tag-color: {tag.spec?.color};"
												onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'left', tag.frameStart, tag.frameEnd)}
												onpointermove={handlePointerMove}
												onpointerup={handlePointerUp}
												role="slider" aria-orientation="horizontal"
												aria-valuemin={seg.frameStart} aria-valuemax={seg.frameEnd}
												aria-valuenow={getPreviewTag(tag.id)?.startFrame ?? tag.frameStart}>
											</div>
											<div
												class="tag-body"
												style="left: {frameToPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, rulerGeometry)}px; width: {rangeWidthPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd, rulerGeometry)}px; --tag-color: {tag.spec?.color};"
												role="button"
												tabindex="0"
												title="{tag.spec?.name}: {tag.frameStart}–{tag.frameEnd} · Click to edit prompt"
												onclick={() => onEditTagPrompt(seg, tag)}
												onkeydown={(e) => e.key === 'Enter' && onEditTagPrompt(seg, tag)}
												onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'body', tag.frameStart, tag.frameEnd)}
												onpointermove={handlePointerMove}
												onpointerup={handlePointerUp}>
												<span class="tag-name">{tag.spec?.name || tag.tag}</span>
												{#if tag.prompt}
													<span class="tag-prompt">{tag.prompt}</span>
												{/if}
												<button
													class="btn-del-tag"
													onclick={(e) => { e.stopPropagation(); onRemoveTag(seg.id, tag.id); }}
													title="Remove tag">×</button>
											</div>
											<div
												class="tag-handle tag-handle-right"
												style="left: {frameToPx(getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd, rulerGeometry)}px; --tag-color: {tag.spec?.color};"
												onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'right', tag.frameStart, tag.frameEnd)}
												onpointermove={handlePointerMove}
												onpointerup={handlePointerUp}
												role="slider" aria-orientation="horizontal"
												aria-valuemin={seg.frameStart} aria-valuemax={seg.frameEnd}
												aria-valuenow={getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd}>
											</div>
										</div>
									{/each}
								{/if}
							</div>

							<!-- Chrome row: NOT part of frame coordinate space -->
							<div class="segment-chrome">
								<button
									class="btn-add-tag"
									onclick={(e) => { e.stopPropagation(); onOpenTagMenu(seg.id, e); }}
									title="Add tag to segment">+ Tag</button>
								<button
									class="btn-icon-sm btn-del-sm seg-del"
									onclick={() => onDeleteSegment(seg.id)}
									title="Delete segment">×</button>
							</div>
						</div>
					{/each}
				{/if}
			{/each}

			<!-- No segments yet (no timeline, or empty timeline) — one placeholder,
			     segment add auto-creates the timeline when needed. -->
			{#if (getTimeline(pipe)?.segments.length ?? 0) === 0}
				<div class="seg-empty full-width" onclick={onAddSegment} role="button" tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && onAddSegment()}>
					<span>+ Add first segment</span>
				</div>
			{/if}
		</div>

		<!-- ═══ [+] BUTTON (chrome column, outside coordinate space) ═══ -->
		<div class="timeline-actions">
			<button
				class="btn-add-track"
				onclick={(e) => { e.stopPropagation(); onAddTrack(e); }}
				title="Add track">
				+
			</button>
		</div>
	</div>
</div>

<style>
	/* ── One frame coordinate canvas + chrome column ─────────────── */
	.timeline-area {
		position: relative;
		width: 100%;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		column-gap: 8px;
		align-items: start;
	}

	.timeline-coordinate {
		position: relative;
		min-width: 0;
		width: 100%;
	}

	.timeline-ruler {
		position: relative;
		width: 100%;
	}

	.global-lane {
		position: relative;
		width: 100%;
		height: 36px;
		background: var(--bg-tertiary);
		border-radius: 6px;
		margin-top: 4px;
	}

	.global-range {
		position: absolute;
		top: 7px;
		height: 22px;
		background: #59B5FF;
		opacity: 0.3;
		border-radius: 3px;
		pointer-events: none;
	}

	.global-actions {
		position: absolute;
		right: 4px;
		top: 8px;
		display: flex;
		gap: 4px;
	}

	/* NOTE: delimiters here must NOT shift the frame coordinate space.
	   .timeline-coordinate is the single canvas that rulerGeometry measures;
	   any padding/border on inner blocks offsets frameToPx() output and breaks
	   lane alignment (see coordinate-canvas E2E "shared coordinate space").
	   So all visual borders are drawn as inset shadows / absolute overlays. */
	.timeline-lane {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
		background: var(--surface-color);
		border-radius: 8px;
		box-shadow: inset 0 0 0 1px var(--border-color);
	}

	.segment-row {
		position: relative;
		width: 100%;
		background: var(--bg-secondary);
		border-radius: 6px;
		box-shadow: inset 0 0 0 1px var(--border-color);
	}

	/* Left accent stripe — absolute overlay, zero layout shift */
	.segment-row::before {
		content: "";
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--accent-color);
		border-radius: 3px 0 0 3px;
		pointer-events: none;
	}

	.segment-coordinate-row {
		position: relative;
		width: 100%;
		min-height: 28px;
	}

	.segment-body {
		position: absolute;
		top: 2px;
		height: 24px;
		background: var(--accent-color);
		opacity: 0.9;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 4px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
		cursor: grab;
		display: flex;
		align-items: center;
		padding: 0 8px;
		box-sizing: border-box;
		overflow: hidden;
		z-index: 2;
	}
	.segment-body:hover { opacity: 1; }
	.segment-body:active { cursor: grabbing; }

	.segment-handle {
		position: absolute;
		top: 0;
		height: 28px;
		width: 10px;
		transform: translateX(-50%);
		cursor: ew-resize;
		z-index: 4;
		background: var(--accent-color);
		border-radius: 3px;
		opacity: 0.95;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25), 0 1px 3px rgba(0,0,0,0.4);
		opacity: 0;
	}
	.segment-handle::after {
		content: "";
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 4px;
		width: 2px;
		background: rgba(255, 255, 255, 0.8);
		border-radius: 1px;
	}
	.segment-row:hover .segment-handle { opacity: 0.85; }
	.segment-handle:hover,
	.segment-handle:active { opacity: 1; }

	.tag-coordinate-row {
		position: absolute;
		left: 0;
		right: 0;
		height: 22px;
	}

	/* Divider between stacked tag rows → each tag visually its own line */
	.tag-coordinate-row:not(:first-child)::before {
		content: "";
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 1px;
		background: var(--border-color);
	}

	.tag-body {
		position: absolute;
		top: 1px;
		height: 20px;
		background: var(--tag-color, var(--accent-color));
		opacity: 0.92;
		border: 1px solid rgba(0, 0, 0, 0.35);
		border-radius: 3px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
		cursor: grab;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 6px;
		box-sizing: border-box;
		overflow: hidden;
		z-index: 2;
	}
	.tag-body:hover { opacity: 1; }
	.tag-body:active { cursor: grabbing; }

	.tag-handle {
		position: absolute;
		top: 0;
		height: 22px;
		width: 8px;
		transform: translateX(-50%);
		cursor: ew-resize;
		z-index: 4;
		background: var(--tag-color, var(--accent-color));
		border-radius: 2px;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
		opacity: 0.45;
	}
	.tag-handle::after {
		content: "";
		position: absolute;
		top: 6px;
		bottom: 6px;
		left: 3px;
		width: 2px;
		background: rgba(255, 255, 255, 0.85);
		border-radius: 1px;
	}
	.tag-coordinate-row:hover .tag-handle,
	.tag-handle:hover,
	.tag-handle:active { opacity: 1; }

	.btn-del-tag {
		position: absolute;
		right: 0;
		top: 0;
		z-index: 5;
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
		font-size: 12px;
	}
	.btn-del-tag:hover {
		background: var(--danger-bg);
		color: var(--danger-color);
	}

	.segment-chrome {
		position: relative;
		height: 24px;
		display: flex;
		align-items: center;
		gap: 4px;
		border-top: 1px dashed var(--border-color);
		margin-top: 4px;
		padding-top: 2px;
	}

	.timeline-actions {
		display: flex;
		align-items: flex-start;
	}
	.timeline-actions .btn-add-track {
		width: 32px;
		height: 32px;
		padding: 0;
	}

	.seg-label {
		font-size: 11px;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-name {
		font-size: 10px;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-prompt {
		font-size: 9px;
		color: rgba(255, 255, 255, 0.8);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100px;
	}

	.btn-add-tag,
	.btn-add-track {
		background: var(--bg-tertiary);
		border: 1px dashed var(--border-color);
		color: var(--text-secondary);
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		transition: all 0.2s;
	}

	.btn-add-tag:hover,
	.btn-add-track:hover {
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

	.btn-icon,
	.btn-icon-sm {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 14px;
		transition: all 0.2s;
	}

	.btn-icon:hover,
	.btn-icon-sm:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.btn-icon-sm.btn-del-sm:hover {
		background: var(--danger-bg);
		color: var(--danger-color);
	}

	.seg-empty {
		padding: 16px;
		text-align: center;
		color: var(--text-secondary);
		font-size: 12px;
		border: 1px dashed var(--border-color);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.seg-empty:hover {
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

	.full-width {
		width: 100%;
	}
</style>
