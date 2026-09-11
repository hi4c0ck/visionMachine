<script lang="ts">
	import type { PipeRow, Segment, TagElement } from '$types';
	import { TAG_SPECIFICATIONS, type TagType } from '$types';
	import FrameRuler from '../FrameRuler.svelte';
	import '../composer-timeline.css';
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

	// ── Tag lanes (design: one horizontal line per tag TYPE) ───────────────
	// The reference layout groups tags by type across zones: all "Camera"
	// tags (from any zone) share one horizontal lane, placed left→right by
	// their frame ranges. Zones are the single slider rows; lanes are the
	// thin tracks under them. Pure render grouping — the data model is
	// unchanged (tags still live in segment.tags[], ranges stay parented
	// to their zone for drag bounds).
	//
	// LANES PERSIST ON THE SAME LINE: the lane list is anchored to the fixed
	// tag-type order (TagSelectorMenu TAG_TYPES), not to Map insertion order.
	// Every type that has ever been used in THIS pipe keeps its row forever
	// (even with zero pills right now); types not yet used stay hidden and
	// appear in canonical order when first added — so lanes never reorder
	// or jump when tags come and go.
	const LANE_TYPE_ORDER: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];

	type TagLaneEntry = { tag: TagElement; seg: Segment };
	type TagLane = { type: string; color: string; name: string; entries: TagLaneEntry[] };

	// Types whose lane has ever been shown on THIS pipe stay on their line
	// (rendered faded when empty) — rows only grow, never shrink or shift.
	// Reset when the pipe changes so lanes are per-pipe, not session-wide.
	let seenLanes = $state<Set<string>>(new Set());
	let seenPipeId = $state<string>('');
	if (pipe?.id !== seenPipeId) {
		seenPipeId = pipe?.id ?? '';
		seenLanes = new Set();
	}

	function getTagLanes(p: PipeRow): TagLane[] {
		const tl = getTimeline(p);
		if (!tl) return [];
		const lanes = new Map<string, TagLane>();
		for (const seg of (tl.segments ?? []) as Segment[]) {
			for (const tag of seg.tags) {
				let lane = lanes.get(tag.tag);
				if (!lane) {
					const spec = TAG_SPECIFICATIONS[tag.tag as TagType];
					lane = {
						type: tag.tag,
						color: spec?.color ?? tag.spec?.color ?? 'var(--accent-color)',
						name: spec?.name ?? tag.spec?.name ?? tag.tag,
						entries: [],
					};
					lanes.set(tag.tag, lane);
				}
				lane.entries.push({ tag, seg });
			}
		}
		// Persist ever-seen lanes on the same line (faded when empty).
		for (const type of lanes.keys()) seenLanes.add(type);
		return LANE_TYPE_ORDER
			.filter((t) => lanes.has(t) || seenLanes.has(t))
			.map((t) => {
				const active = lanes.get(t);
				if (active) return active;
				const spec = TAG_SPECIFICATIONS[t];
				return {
					type: t,
					color: spec?.color ?? 'var(--accent-color)',
					name: spec?.name ?? t,
					entries: [] as TagLaneEntry[],
				};
			});
	}

	function getGlobal(p: PipeRow): any {
		return p.elements.find((e: any) => e.tag === 'global_style') ?? null;
	}

	// ── Ruler legend: color key for the lane system (zone/global + tag types
	//    present in THIS pipe's timeline). Rendered inside the frame-ruler
	//    space so it aligns with the shared coordinate canvas. ─────────────
	let legend = $derived.by(() => {
		const lanes = getTagLanes(pipe);
		if (lanes.length === 0 && !getTimeline(pipe)) return null;
		return {
			zone: 'var(--accent-color)',
			global: '#59B5FF',
			tags: lanes.map((l) => ({ name: l.name, color: l.color })),
		};
	});

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
				legend={legend}
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
					<!-- ═══ ZONES: one slider row per segment ═══ -->
					{#each tl.segments as seg (seg.id)}
						<div class="segment-row">
							{#if rulerGeometry}
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
								<div
									class="segment-handle segment-handle-left"
									style="left: {frameToPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, rulerGeometry)}px;"
									onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'left', seg.frameStart, seg.frameEnd)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									role="slider" aria-orientation="horizontal"
									aria-valuemin={0} aria-valuemax={totalFrames - 1}
									aria-valuenow={getPreviewSegment(seg)?.startFrame ?? seg.frameStart}
									title="Drag to resize zone start"></div>
								<div
									class="segment-handle segment-handle-right"
									style="left: {frameToPx(getPreviewSegment(seg)?.endFrame ?? seg.frameEnd, rulerGeometry)}px;"
									onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'right', seg.frameStart, seg.frameEnd)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									role="slider" aria-orientation="horizontal"
									aria-valuemin={0} aria-valuemax={totalFrames - 1}
									aria-valuenow={getPreviewSegment(seg)?.endFrame ?? seg.frameEnd}
									title="Drag to resize zone end"></div>
							{/if}
						</div>
					{/each}

					<!-- ═══ TAG LANES: one line per tag TYPE across all zones ═══
					     Each tag type gets its own horizontal lane; every pill of
					     that type (from any zone) sits on the same line, placed
					     left→right by frame range. Drag is body-only so pills never
					     overlap their own lane. -->
					{#each getTagLanes(pipe) as lane (lane.type)}
						<div class="tag-lane" class:empty={lane.entries.length === 0} style="--lane-color: {lane.color};">
							<div class="tag-lane-track">
								<span class="tag-lane-label" style="--lane-color: {lane.color};">{lane.name}</span>
								{#if rulerGeometry}
									{#each lane.entries as entry (entry.tag.id)}
										{@const tag = entry.tag}
										{@const seg = entry.seg}
										<div
											class="tag-body"
											style="left: {frameToPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, rulerGeometry)}px; width: {rangeWidthPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd, rulerGeometry)}px; --tag-color: {tag.spec?.color};"
											role="button"
											tabindex="0"
											title="{tag.spec?.name}: {tag.frameStart}–{tag.frameEnd} · Zone {tl.segments.indexOf(seg) + 1} · Click to edit prompt"
											onclick={() => onEditTagPrompt(seg, tag)}
											onkeydown={(e) => e.key === 'Enter' && onEditTagPrompt(seg, tag)}
											onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'body', tag.frameStart, tag.frameEnd)}
											onpointermove={handlePointerMove}
											onpointerup={handlePointerUp}>
											<button
												class="btn-del-tag"
												// The parent .tag-body's onpointerdown calls preventDefault()
												// (to prevent text selection during drag), which suppresses the
												// native click event on children. Stopping propagation here
												// keeps the drag handler from running on this button so its
												// onclick still fires.
												onpointerdown={(e) => e.stopPropagation()}
												onclick={(e) => { e.stopPropagation(); onRemoveTag(seg.id, tag.id); }}
												title="Remove tag">×</button>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/each}

					<!-- Zone chrome: NOT part of the frame coordinate space -->
					{#each tl.segments as seg (seg.id)}
						<div class="segment-chrome">
							<button
								class="btn-add-tag"
								onclick={(e) => { e.stopPropagation(); onOpenTagMenu(seg.id, e); }}
								title="Add tag to zone">+ Tag</button>
							<button
								class="btn-icon-sm btn-del-sm seg-del"
								onclick={() => onDeleteSegment(seg.id)}
								title="Delete zone">×</button>
						</div>
					{/each}

					<!-- Append affordance: always present so a second (and later)
						 zone can be added — the empty placeholder above only covers
						 the first zone. -->
					<div class="segment-chrome">
						<button
							class="btn-add-tag btn-add-zone"
							onclick={onAddSegment}
							onkeydown={(e) => e.key === 'Enter' && onAddSegment()}
							title="Append a new zone after the last one">+ Zone</button>
					</div>

					<!-- No zones yet (no timeline, or empty timeline) — one placeholder,
						 zone add auto-creates the timeline when needed. -->
					{#if (tl.segments.length ?? 0) === 0}
						<div class="seg-empty full-width" onclick={onAddSegment} role="button" tabindex="0"
							onkeydown={(e) => e.key === 'Enter' && onAddSegment()}>
							<span>+ Add first zone</span>
						</div>
					{/if}
				{/if}
			{/each}
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


