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
		updateGlobalRange as updateGlobalRangeAction,
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
		type: 'segment' | 'tag' | 'global';
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

	// Click on the zone pill (segment body) opens the add-tag menu scoped to
	// THAT zone — only when the press was a true click (no drag). A zone drag
	// still emits a `click` on release; zoneDragHappened suppresses it so
	// dragging a zone never accidentally opens the add-tag popup.
	function onZonePillClick(e: MouseEvent, segId: string) {
		e.stopPropagation();
		if (zoneDragHappened) return;
		onOpenTagMenu(segId, e);
	}

	function getTimeline(p: PipeRow): any {
		return p.elements.find((e: any) => e.tag === 'timeline') ?? null;
	}

	// ── Tag lanes (one horizontal line per ZONE) ────────────────────────────
	// Tags of a single zone share one horizontal lane; each zone gets its
	// own line (like the zone slider rows above) so a zone's tags stay
	// grouped with it instead of being split across type-based lanes that
	// made zones appear on separate, scattered lanes.
	type ZoneLaneEntry = { tag: TagElement; seg: Segment };
	type ZoneLane = { key: string; zoneIndex: number; segId: string; entries: ZoneLaneEntry[] };

	// Zones present in this pipe (in their timeline order); zone add/remove
	// naturally changes the lane list — no per-zone "ever-seen" persistence,
	// lanes follow the current zones.
	function getZoneLanes(p: PipeRow): ZoneLane[] {
		const tl = getTimeline(p);
		if (!tl) return [];
		const segs = (tl.segments ?? []) as Segment[];
		return segs.map((seg, i) => ({
			key: seg.id,
			zoneIndex: i + 1,
			segId: seg.id,
			entries: seg.tags.map((tag) => ({ tag, seg })) as ZoneLaneEntry[],
		}));
	}

	// Ruler legend: one color key entry per zone + its tag types.
	let legend = $derived.by(() => {
		const zones = getZoneLanes(pipe);
		if (zones.length === 0 && !getTimeline(pipe)) return null;
		const types: { name: string; color: string }[] = [];
		for (const lane of zones) {
			for (const e of lane.entries) {
				const spec = TAG_SPECIFICATIONS[e.tag.tag as TagType];
				const name = spec?.name ?? e.tag.spec?.name ?? e.tag.tag;
				const color = spec?.color ?? e.tag.spec?.color ?? 'var(--accent-color)';
				if (!types.some((t) => t.name === name)) types.push({ name, color });
			}
		}
		return {
			zone: 'var(--accent-color)',
			global: '#59B5FF',
			tags: types,
		};
	});

	function getGlobal(p: PipeRow): any {
		return p.elements.find((e: any) => e.tag === 'global_style') ?? null;
	}



	// ── Timeline collapse: per-pipe UI state. Collapsing hides the zone
	//    slider rows + tag lanes, leaving a compact summary header. Per-pipe
	//    (not session-wide) so each section owns its own disclosure state.
	let timelineCollapsed = $state(false);
	let collapsedPipeId = $state('');
	if (pipe?.id !== collapsedPipeId) {
		collapsedPipeId = pipe?.id ?? '';
		timelineCollapsed = false;
	}
	// Total tag count on this pipe — shown on the collapsed summary line.
	let totalTags = $derived.by(() => {
		const tl = getTimeline(pipe);
		if (!tl) return 0;
		return (tl.segments ?? []).reduce((n: number, s: Segment) => n + s.tags.length, 0);
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

	// Get preview state for the global range during drag
	function getPreviewGlobal(globalId: string) {
		if (!previewDragState || previewDragState.type !== 'global' || previewDragState.id !== globalId) {
			return null;
		}
		return previewDragState;
	}

	
	// Track whether the last zone-pill press turned into a drag. The browser
	// still emits a `click` after a drag release; without this flag that
	// click would wrongly open the add-tag menu after dragging a zone.
	let zoneDragHappened = $state(false);

	// One pointerdown for every temporal element (segment/thumb/body, tag/grips, global).
	function handleElementPointerDown(
		e: PointerEvent,
		type: 'segment' | 'tag' | 'global',
		id: string,
		segmentId: string,
		handle: 'left' | 'right' | 'body',
		startFrame: number,
		endFrame: number
	) {
		e.preventDefault();
		e.stopPropagation();
		zoneDragHappened = false;

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
		// A real drag happened (>3px). Flag it so the subsequent `click` on the
		// zone pill is not read as an add-tag press.
		zoneDragHappened = true;

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

		if (finalPreview.type === 'global') {
			const result = await updateGlobalRangeAction(
				sessionId,
				pipe.id,
				finalPreview.id,
				finalPreview.startFrame,
				finalPreview.endFrame
			);
			if (result.errors.length) {
				console.error('[TimelineSection] updateGlobalRange:', result.errors);
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
						{@const gPrev = getPreviewGlobal(global.id)}
						{@const gStart = gPrev?.startFrame ?? global.frameStart ?? 0}
						{@const gEnd = gPrev?.endFrame ?? global.frameEnd ?? totalFrames - 1}
						<div
							class="global-range"
							style="left: {frameToPx(gStart, rulerGeometry)}px; width: {rangeWidthPx(gStart, gEnd, rulerGeometry)}px;"
							onpointerdown={(e) => handleElementPointerDown(e, 'global', global.id, global.id, 'body', global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}
							role="slider" aria-orientation="horizontal" tabindex="0"
							aria-valuemin={0} aria-valuemax={totalFrames - 1}
							aria-valuenow={gStart}
							title="Global style range — drag to move, grips to resize"></div>
						<div
							class="global-handle global-handle-left"
							style="left: {frameToPx(gStart, rulerGeometry)}px;"
							onpointerdown={(e) => handleElementPointerDown(e, 'global', global.id, global.id, 'left', global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}
							role="slider" aria-orientation="horizontal" tabindex="0"
							aria-valuemin={0} aria-valuemax={totalFrames - 1}
							aria-valuenow={gStart}
							title="Drag to resize global range start"></div>
						<div
							class="global-handle global-handle-right"
							style="left: {frameToPx(gEnd, rulerGeometry)}px;"
							onpointerdown={(e) => handleElementPointerDown(e, 'global', global.id, global.id, 'right', global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}
							role="slider" aria-orientation="horizontal" tabindex="0"
							aria-valuemin={0} aria-valuemax={totalFrames - 1}
							aria-valuenow={gEnd}
							title="Drag to resize global range end"></div>
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
					<!-- ═══ TIMELINE HEADER: collapse chevron + zone/pill summary ═══
						 Collapsed view: one compact line instead of all the
						 zone rows + tag lanes. -->
					<div class="timeline-header" role="button" tabindex="0"
						class:open={!timelineCollapsed}
						onclick={() => timelineCollapsed = !timelineCollapsed}
						onkeydown={(e) => e.key === 'Enter' && (timelineCollapsed = !timelineCollapsed)}>
						<span class="tl-chevron">{timelineCollapsed ? '▸' : '▾'}</span>
						<span class="tl-title">Timeline</span>
						<span class="tl-summary">
							{tl.segments.length} zone{(tl.segments.length !== 1 ? 's' : '')} · {totalTags} tag{(totalTags !== 1 ? 's' : '')}
						</span>
					</div>

	{#if !timelineCollapsed}
		<!-- ═══ ZONES: one slider row per segment, each with its own
							delete button attached to the row (not a detached chrome
							row 300px below). -->
						{#each tl.segments as seg, segIdx (seg.id)}
							<div
								class="segment-row"
								role="group" tabindex="0"
								title="Click the zone pill to add a tag">
								<span class="seg-row-label">Zone {segIdx + 1}</span>
								{#if rulerGeometry}
									<div
										class="segment-body"
										style="left: {frameToPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, rulerGeometry)}px; width: {rangeWidthPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, getPreviewSegment(seg)?.endFrame ?? seg.frameEnd, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'body', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal" tabindex="0"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={getPreviewSegment(seg)?.startFrame ?? seg.frameStart}
										title="Click to add a tag to this zone · drag to move, grips to resize"
										onclick={(e) => onZonePillClick(e, seg.id)}>
										<span class="seg-label">{getPreviewSegment(seg) ? `${getPreviewSegment(seg)!.startFrame}–${getPreviewSegment(seg)!.endFrame}` : `${seg.frameStart}–${seg.frameEnd}`}</span>
									</div>
									<div
										class="segment-handle segment-handle-left"
										style="left: {frameToPx(getPreviewSegment(seg)?.startFrame ?? seg.frameStart, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'left', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal" tabindex="0"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={getPreviewSegment(seg)?.startFrame ?? seg.frameStart}
										title="Drag to resize zone start"
										onclick={(e) => e.stopPropagation()}></div>
									<div
										class="segment-handle segment-handle-right"
										style="left: {frameToPx(getPreviewSegment(seg)?.endFrame ?? seg.frameEnd, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'right', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal" tabindex="0"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={getPreviewSegment(seg)?.endFrame ?? seg.frameEnd}
										title="Drag to resize zone end"
										onclick={(e) => e.stopPropagation()}></div>
								{/if}
								<!-- Per-zone delete, attached to its row (hover reveal).
								     The tag-count badge warns before the zone's work is lost.
								     Stops click propagation so a delete press doesn't
								     also register as a zone click (add-tag). -->
								<button
									class="btn-icon-sm btn-del-sm seg-del"
									onclick={(e) => { e.stopPropagation(); onDeleteSegment(seg.id); }}
									title={seg.tags.length > 0 ? `Delete zone ${segIdx + 1} and its ${seg.tags.length} tag${seg.tags.length !== 1 ? 's' : ''}` : `Delete zone ${segIdx + 1}`}>
									×{#if seg.tags.length > 0}<span class="seg-del-count">{seg.tags.length}</span>{/if}
								</button>
								</div>
							{/each}

						<!-- ═══ ZONE TAG LANES: one line per ZONE (a zone's tags stay grouped on
							 their own lane). Each lane holds that zone's pills, placed left→right by
							 frame range. Body drags move the pill; the round grips on its edges resize
							 start/end within the zone (8-grid snap). Clicking the pill opens the add-tag
							 menu for that zone. -->
						{#each getZoneLanes(pipe) as lane (lane.key)}
							<div class="tag-lane" class:empty={lane.entries.length === 0}>
								<div class="tag-lane-track">
									<span class="tag-lane-label">Zone {lane.zoneIndex}</span>
									{#if rulerGeometry}
										{#each lane.entries as entry (entry.tag.id)}
											{@const tag = entry.tag}
											{@const seg = entry.seg}
											<div
												class="tag-body"
												style="left: {frameToPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, rulerGeometry)}px; width: {rangeWidthPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd, rulerGeometry)}px; --tag-color: {tag.spec?.color};"
												role="button"
												tabindex="0"
												title="{tag.spec?.name}: {tag.frameStart}–{tag.frameEnd} · Zone {lane.zoneIndex}{tag.prompt ? ' · \u201c' + tag.prompt + '\u201d' : ''} · Drag to move, grips to resize, click to edit prompt"
												onclick={() => onEditTagPrompt(seg, tag)}
												onkeydown={(e) => e.key === 'Enter' && onEditTagPrompt(seg, tag)}
												onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'body', tag.frameStart, tag.frameEnd)}
												onpointermove={handlePointerMove}
												onpointerup={handlePointerUp}>
												<span class="tag-pill-prompt">{tag.prompt ?? tag.spec?.name}</span>
												<button
													class="btn-del-tag"
													onpointerdown={(e) => e.stopPropagation()}
													onclick={(e) => { e.stopPropagation(); onRemoveTag(seg.id, tag.id); }}
													title="Remove tag">×</button>
												<div
													class="tag-handle tag-handle-left"
													style="left: 0;"
													onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'left', tag.frameStart, tag.frameEnd)}
													onpointermove={handlePointerMove}
													onpointerup={handlePointerUp}
													role="slider" aria-orientation="horizontal" tabindex="0"
													aria-valuemin={seg.frameStart} aria-valuemax={seg.frameEnd}
													aria-valuenow={getPreviewTag(tag.id)?.startFrame ?? tag.frameStart}
													title="Drag to resize tag start"></div>
												<div
													class="tag-handle tag-handle-right"
													style="left: 100%;"
													onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'right', tag.frameStart, tag.frameEnd)}
													onpointermove={handlePointerMove}
													onpointerup={handlePointerUp}
													role="slider" aria-orientation="horizontal" tabindex="0"
													aria-valuemin={seg.frameStart} aria-valuemax={seg.frameEnd}
													aria-valuenow={getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd}
													title="Drag to resize tag end"></div>
											</div>
										{/each}
								{/if}
								</div>
							</div>
						{/each}

							<!-- + Zone affordance: opens the modal with a picker of
						     every free gap (before/between/after zones). -->
						<div class="segment-chrome segment-chrome-append">
							<button
									class="btn-add-zone"
									onclick={onAddSegment}
									onkeydown={(e) => e.key === 'Enter' && onAddSegment()}
									title="Add a zone into any free space">+ Zone</button>
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


