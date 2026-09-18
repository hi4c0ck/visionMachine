<script lang="ts">
	import type { PipeRow, Segment, TagElement, GlobalElement, SoundElement } from '$types';
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
		resolveTagDragConflict,
		type TemporalDragState,
		type DragBounds,
	} from '$lib/dragMath';
	import {
		resizeSegment as resizeSegmentAction,
		resizeTagElement as resizeTagElementAction,
		updateGlobalRange as updateGlobalRangeAction,
		updateSoundRange as updateSoundRangeAction,
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
		onEditGlobalPrompt,
		onToggleSound,
		onRemoveSound,
		onEditSoundPrompt,
		onAddSegment,
		onDeleteSegment,
		onOpenTagMenu,
		onRemoveTag,
		onEditTagPrompt,
		// FIXED variant: the playhead pin follows the drag (live, during
		// pointermove); CURRENT variant leaves it at the last selectedFrame.
		livePin = false,
		// Per-pipe [+] visibility (hide when both tracks already exist).
		showAddTrack = true,
		fps
	} = $props<{
		pipe: PipeRow;
		sessionId?: string;
		selectedFrame?: number;
		onFrameChange: (f: number) => void;
		onAddTrack: (e: MouseEvent) => void;
		onToggleGlobal: (globalId: string) => void;
		onRemoveGlobal: (globalId: string) => void;
		onEditGlobalPrompt: (global: GlobalElement) => void;
		onToggleSound: (soundId: string) => void;
		onRemoveSound: (soundId: string) => void;
		onEditSoundPrompt: (sound: SoundElement) => void;
		onAddSegment: () => void;
		onDeleteSegment: (segId: string) => void;
		onOpenTagMenu: (segId: string, e: MouseEvent) => void;
		onRemoveTag: (segId: string, tagId: string) => void;
		onEditTagPrompt: (seg: Segment, tag: TagElement) => void;
		/** FIXED variant: playhead follows the drag thumb live. */
		livePin?: boolean;
		/** Panel hides the [+] button when the pipe already owns both
		    addable track types (Timeline + Global). */
		showAddTrack?: boolean;
		/** Session fps — drives the ruler pin notice seconds readout. */
		fps?: number;
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
		type: 'segment' | 'tag' | 'global' | 'sound';
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

	// Click on the zone pill opens the add-tag menu scoped to THAT zone.
	// The click stops propagation so the panel's document-level "close menus
	// on outside click" handler doesn't immediately close the menu we just
	// opened. A real pill/grip drag still emits a `click` on release;
	// lastPressWasDrag suppresses it so dragging never opens the menu.
	function onZonePillClick(e: MouseEvent, segId: string) {
		e.stopPropagation();
		if (lastPressWasDrag) return;
		onOpenTagMenu(segId, e);
	}

	function getTimeline(p: PipeRow | null | undefined): any {
		if (!p || !Array.isArray(p.elements)) return null;
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
		// Lane order = canonical tag-type order (issue 8): never first-seen
		// order, so lanes stay in a stable, predictable sequence.
		const types: string[] = LANE_TYPE_ORDER.filter((t) => lanes.has(t) || seenLanes.has(t));
		// Unknown types (e.g. legacy/custom) sort to the end, stable.
		for (const t of lanes.keys()) {
			if (!LANE_TYPE_ORDER.includes(t as TagType)) {
				types.push(t);
			}
		}
		return types.map((t) => {
			const active = lanes.get(t);
			if (active) return active;
			const spec = TAG_SPECIFICATIONS[t as TagType];
			return {
				type: t,
				color: spec?.color ?? 'var(--accent-color)',
				name: spec?.name ?? t,
				entries: [] as TagLaneEntry[],
			};
		});
	}

	function getGlobal(p: PipeRow | null | undefined): any {
		if (!p || !Array.isArray(p.elements)) return null;
		return p.elements.find((e: any) => e.tag === 'global_style') ?? null;
	}

	function getSound(p: PipeRow | null | undefined): any {
		if (!p || !Array.isArray(p.elements)) return null;
		return p.elements.find((e: any) => e.tag === 'sound') ?? null;
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
			sound: '#F5A623',
			tags: lanes.map((l) => ({ name: l.name, color: l.color })),
		};
	});



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

	// Get preview state for the sound range during drag
	function getPreviewSound(soundId: string) {
		if (!previewDragState || previewDragState.type !== 'sound' || previewDragState.id !== soundId) {
			return null;
		}
		return previewDragState;
	}

	// One pointerdown for every temporal element (segment thumb/body, tag thumb/body, global grips).
	
	// Track whether the last press turned into a real drag (>3px).
	// The browser still emits a `click` after a drag release; without this
	// flag that click would wrongly open the add-tag menu (zone pill) or the
	// prompt-edit modal (tag pill) after dragging.
	let lastPressWasDrag = $state(false);

	function handleElementPointerDown(
		e: PointerEvent,
		type: 'segment' | 'tag' | 'global' | 'sound',
		id: string,
		segmentId: string,
		handle: 'left' | 'right' | 'body',
		startFrame: number,
		endFrame: number
	) {
		e.preventDefault();
		e.stopPropagation();
		lastPressWasDrag = false;

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
		let [startFrame, endFrame] = calculateElementDrag(dragState, pointerFrame, bounds);

		// Same-type tags in a zone never overlap: constrain the live preview
		// against the zone's other same-type siblings (slide/clamp resolver).
		if (d.type === 'tag' && seg) {
			const dragged = seg.tags.find((t: TagElement) => t.id === d.id);
			if (dragged) {
				const occupied = seg.tags
					.filter((t: TagElement) => t.tag === dragged.tag && t.id !== dragged.id)
					.map((t: TagElement) => [t.frameStart, t.frameEnd] as [number, number]);
				if (occupied.length > 0) {
					[startFrame, endFrame] = resolveTagDragConflict(
						d.handle ?? 'body',
						[startFrame, endFrame],
						[d.startFrame, d.endFrame],
						occupied,
						bounds
					);
				}
			}
		}
		previewDragState = {
			type: dragState.type,
			id: dragState.id,
			segmentId: dragState.segmentId,
			handle: dragState.handle,
			startFrame,
			endFrame
		};

		// FIXED variant: the playhead pin follows the drag LIVE — left thumb
		// tracks the moving start edge, right thumb the end edge, body the
		// frame under the cursor. CURRENT variant (livePin=false) keeps the
		// pin at the last ruler select; only the preview changes.
		if (livePin) {
			const pinFrame =
				dragState.handle === 'left'
					? startFrame
					: dragState.handle === 'right'
						? endFrame
						: pointerFrame;
			onFrameChange(pinFrame);
		}
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
		// A real drag happened (>3px). Flag it so the subsequent `click` on
		// the zone pill is not read as an add-tag press and the click on the
		// tag pill is not read as a prompt-edit press.
		lastPressWasDrag = true;

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

		if (finalPreview.type === 'sound') {
			const result = await updateSoundRangeAction(
				sessionId,
				pipe.id,
				finalPreview.id,
				finalPreview.startFrame,
				finalPreview.endFrame
			);
			if (result.errors.length) {
				console.error('[TimelineSection] updateSoundRange:', result.errors);
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
				fps={fps}
				onframeSelect={(f) => onFrameChange(f)}
			/>
		</div>

		<!-- ═══ GLOBAL LANES (in coordinate space) ═══ -->
		{#each [getGlobal(pipe)] as global}
			{#if global}
				<div class="global-lane" style="--lane-color: #59B5FF;">
					{#if rulerGeometry}
						{@const gPrev = getPreviewGlobal(global.id)}
						{@const gStart = gPrev?.startFrame ?? global.frameStart ?? 0}
						{@const gEnd = gPrev?.endFrame ?? global.frameEnd ?? totalFrames - 1}
						{@const gText = (global.prompt ?? global.value ?? '').trim()}
						<div
							class="pill" class:disabled={!global.enabled}
							style="left: {frameToPx(gStart, rulerGeometry)}px; width: {rangeWidthPx(gStart, gEnd, rulerGeometry)}px;"
							role="button" tabindex="0"
							title="Global: {gStart}–{gEnd} · click to edit prompt{gText ? ' · “' + gText + '”' : ''}"
							onclick={() => { if (lastPressWasDrag) return; onEditGlobalPrompt(global); }}
							onkeydown={(e) => e.key === 'Enter' && !lastPressWasDrag && onEditGlobalPrompt(global)}
							onpointerdown={(e) => handleElementPointerDown(e, 'global', global.id, global.id, 'body', global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1)}
							onpointermove={handlePointerMove}
							onpointerup={handlePointerUp}>
								<span class="pill-label">Global</span>
								{#if gText}<span class="pill-text">{gText}</span>{/if}
								<button
									class="pill-toggle"
									onpointerdown={(e) => e.stopPropagation()}
									onclick={(e) => { e.stopPropagation(); onToggleGlobal(global.id); }}
									title={global.enabled ? 'Disable global' : 'Enable global'}>
									{#if global.enabled}◉{:else}○{/if}
								</button>
								<button
									class="pill-del"
									onpointerdown={(e) => e.stopPropagation()}
									onclick={(e) => { e.stopPropagation(); onRemoveGlobal(global.id); }}
									title="Remove global">×</button>
								<div
									class="pill-grip pill-grip-left"
									style="left: 0;"
									onpointerdown={(e) => handleElementPointerDown(e, 'global', global.id, global.id, 'left', global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									role="slider" aria-orientation="horizontal" tabindex="0"
									aria-valuemin={0} aria-valuemax={totalFrames - 1}
									aria-valuenow={gStart}
									title="Drag to resize global range start"></div>
								<div
									class="pill-grip pill-grip-right"
									style="left: 100%;"
									onpointerdown={(e) => handleElementPointerDown(e, 'global', global.id, global.id, 'right', global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									role="slider" aria-orientation="horizontal" tabindex="0"
									aria-valuemin={0} aria-valuemax={totalFrames - 1}
									aria-valuenow={gEnd}
									title="Drag to resize global range end"></div>
						</div>
					{/if}
				</div>
				{/if}
			{/each}

			<!-- ═══ SOUND LANE (global-alike, in coordinate space) ═══ -->
			{#each [getSound(pipe)] as sound}
				{#if sound}
					<div class="global-lane" style="--lane-color: #F5A623;">
						{#if rulerGeometry}
							{@const sPrev = getPreviewSound(sound.id)}
							{@const sStart = sPrev?.startFrame ?? sound.frameStart ?? 0}
							{@const sEnd = sPrev?.endFrame ?? sound.frameEnd ?? totalFrames - 1}
							{@const sText = (sound.prompt ?? '').trim()}
							<div
								class="pill" class:disabled={!sound.enabled}
								style="left: {frameToPx(sStart, rulerGeometry)}px; width: {rangeWidthPx(sStart, sEnd, rulerGeometry)}px;"
								role="button" tabindex="0"
								title="Sound: {sStart}–{sEnd} · click to edit prompt{sText ? ' · “' + sText + '”' : ''}"
								onclick={() => { if (lastPressWasDrag) return; onEditSoundPrompt(sound); }}
								onkeydown={(e) => e.key === 'Enter' && !lastPressWasDrag && onEditSoundPrompt(sound)}
								onpointerdown={(e) => handleElementPointerDown(e, 'sound', sound.id, sound.id, 'body', sound.frameStart ?? 0, sound.frameEnd ?? totalFrames - 1)}
								onpointermove={handlePointerMove}
								onpointerup={handlePointerUp}>
								<span class="pill-label">♪ Sound</span>
								{#if sText}<span class="pill-text">{sText}</span>{/if}
								<button
									class="pill-toggle"
									onpointerdown={(e) => e.stopPropagation()}
									onclick={(e) => { e.stopPropagation(); onToggleSound(sound.id); }}
									title={sound.enabled ? 'Disable sound' : 'Enable sound'}>
									{#if sound.enabled}◉{:else}○{/if}
								</button>
								<button
									class="pill-del"
									onpointerdown={(e) => e.stopPropagation()}
									onclick={(e) => { e.stopPropagation(); onRemoveSound(sound.id); }}
									title="Remove sound">×</button>
								<div
									class="pill-grip pill-grip-left"
									style="left: 0;"
									onpointerdown={(e) => handleElementPointerDown(e, 'sound', sound.id, sound.id, 'left', sound.frameStart ?? 0, sound.frameEnd ?? totalFrames - 1)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									role="slider" aria-orientation="horizontal" tabindex="0"
									aria-valuemin={0} aria-valuemax={totalFrames - 1}
									aria-valuenow={sStart}
									title="Drag to resize sound range start"></div>
								<div
									class="pill-grip pill-grip-right"
									style="left: 100%;"
									onpointerdown={(e) => handleElementPointerDown(e, 'sound', sound.id, sound.id, 'right', sound.frameStart ?? 0, sound.frameEnd ?? totalFrames - 1)}
									onpointermove={handlePointerMove}
									onpointerup={handlePointerUp}
									role="slider" aria-orientation="horizontal" tabindex="0"
									aria-valuemin={0} aria-valuemax={totalFrames - 1}
									aria-valuenow={sEnd}
									title="Drag to resize sound range end"></div>
						</div>
					{/if}
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
						<!-- ═══ ZONES: one shared lane — every zone pill sits on the same
						     horizontal line, placed left→right by frame range (like the
						     tag lanes below). Body drags move a zone; the round grips
						     resize it. Clicking a pill opens the tag menu scoped to
						     THAT zone; its × button (pill hover) deletes it. -->
						<div class="segment-lane">
							<span class="segment-lane-label">Zones</span>
							{#if rulerGeometry}
								{#each tl.segments as seg, segIdx (seg.id)}
									{@const sPrev = getPreviewSegment(seg)}
									{@const sStart = sPrev?.startFrame ?? seg.frameStart}
									{@const sEnd = sPrev?.endFrame ?? seg.frameEnd}
									<div
										class="segment-body"
										style="left: {frameToPx(sStart, rulerGeometry)}px; width: {rangeWidthPx(sStart, sEnd, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'body', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="button" tabindex="0"
										aria-label="Zone {segIdx + 1}, frames {sStart}–{sEnd}. Click to add a tag."
										title="Click to add a tag to Zone {segIdx + 1}"
										onclick={(e) => { e.stopPropagation(); onZonePillClick(e, seg.id); }}
										onkeydown={(e) => e.key === 'Enter' && onOpenTagMenu(seg.id, e as unknown as MouseEvent)}>
										<span class="seg-zone-badge">Z{segIdx + 1}</span>
										<span class="seg-label">{sStart}–{sEnd}</span>
										<button
											class="btn-icon-sm btn-del-sm seg-del"
											onpointerdown={(e) => e.stopPropagation()}
											onclick={(e) => { e.stopPropagation(); onDeleteSegment(seg.id); }}
											title={seg.tags.length > 0 ? `Delete zone ${segIdx + 1} and its ${seg.tags.length} tag${seg.tags.length !== 1 ? 's' : ''}` : `Delete zone ${segIdx + 1}`}>
											×{#if seg.tags.length > 0}<span class="seg-del-count">{seg.tags.length}</span>{/if}
										</button>
									</div>
									<div
										class="segment-handle segment-handle-left"
										style="left: {frameToPx(sStart, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'left', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal" tabindex="0"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={sStart}
										title="Drag to resize zone start">
									</div>
									<div
										class="segment-handle segment-handle-right"
										style="left: {frameToPx(sEnd, rulerGeometry)}px;"
										onpointerdown={(e) => handleElementPointerDown(e, 'segment', seg.id, seg.id, 'right', seg.frameStart, seg.frameEnd)}
										onpointermove={handlePointerMove}
										onpointerup={handlePointerUp}
										role="slider" aria-orientation="horizontal" tabindex="0"
										aria-valuemin={0} aria-valuemax={totalFrames - 1}
										aria-valuenow={sEnd}
										title="Drag to resize zone end">
									</div>
								{/each}
							{/if}
						</div>

						<!-- ═══ TAG LANES: one line per tag TYPE across all zones ═══
							 Each tag type gets its own horizontal lane; every pill of
							 that type (from any zone) sits on the same line, placed
							 left→right by frame range. Body drags move the pill;
							 the round grips on its edges resize start/end within
							 the parent zone (8-grid snap). -->
						{#each getTagLanes(pipe) as lane (lane.type)}
							<div class="tag-lane" class:empty={lane.entries.length === 0} style="--lane-color: {lane.color};">
								<div class="tag-lane-track">
									<span class="tag-lane-label" style="--lane-color: {lane.color};">{lane.name}</span>
									{#if rulerGeometry}
										{#each lane.entries as entry (entry.tag.id)}
											{@const tag = entry.tag}
											{@const seg = entry.seg}
											{@const zoneIndex = tl.segments.indexOf(seg) + 1}
											<div
												class="tag-body"
												style="left: {frameToPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, rulerGeometry)}px; width: {rangeWidthPx(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart, getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd, rulerGeometry)}px; --tag-color: {tag.spec?.color};"
												role="button"
												tabindex="0"
												title="{tag.spec?.name}: {tag.frameStart}–{tag.frameEnd} · Zone {zoneIndex}{tag.prompt ? ' · \u201c' + tag.prompt + '\u201d' : ''} · Drag to move, grips to resize, click to edit prompt"
												onclick={() => { if (lastPressWasDrag) return; onEditTagPrompt(seg, tag); }}
												onkeydown={(e) => e.key === 'Enter' && !lastPressWasDrag && onEditTagPrompt(seg, tag)}
												onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'body', tag.frameStart, tag.frameEnd)}
												onpointermove={handlePointerMove}
												onpointerup={handlePointerUp}>
												<span class="tag-pill-zone">Z{zoneIndex}</span>
												<span class="tag-pill-prompt">{tag.prompt ?? tag.spec?.name}</span>
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

		<!-- ═══ [+] BUTTON (chrome column, outside coordinate space) ═══
		     Per-pipe visibility: hidden when the pipe already owns BOTH
		     addable track types (Timeline + Global) — the menu would be empty. -->
		<div class="timeline-actions">
			{#if showAddTrack}
				<button
					class="btn-add-track"
					onclick={(e) => { e.stopPropagation(); onAddTrack(e); }}
					title="Add track">
					+
				</button>
			{/if}
		</div>
	</div>
</div>


