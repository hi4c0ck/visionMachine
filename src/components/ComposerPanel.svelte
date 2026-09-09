<script lang="ts">
	import type { SessionData, PipeRow, TagType, PipeKeyframe, TagElement, Segment, SubjectReference } from '$types';
	import { TAG_SPECIFICATIONS } from '$types';
	import FrameRuler from './FrameRuler.svelte';
	import KeyframeModal from './ComposerModals/KeyframeModal.svelte';
	import SubjectRefModal from './ComposerModals/SubjectRefModal.svelte';
	import SegmentModal from './ComposerModals/SegmentModal.svelte';
	import TagPromptModal from './ComposerModals/TagPromptModal.svelte';
	import { getNextAvailableRange } from '$lib/frameMath';
	import {
		addPipe as addPipeAction,
		removePipe as removePipeAction,
		removeKeyframe as removeKeyframeAction,
		addGlobalElement as addGlobalElementAction,
		toggleGlobalElement as toggleGlobalElementAction,
		removeGlobalElement as removeGlobalElementAction,
		addTimelineElement as addTimelineElementAction,
		addSegment as addSegmentAction,
		removeSegment as removeSegmentAction,
		resizeSegment as resizeSegmentAction,
		addTagElement as addTagElementAction,
		removeTagElement as removeTagElementAction,
		resizeTagElement as resizeTagElementAction,
		updateTagPrompt as updateTagPromptAction,
		removeSubjectRef as removeSubjectRefAction,
		toggleSubjectRef as toggleSubjectRefAction,
		movePipe as movePipeAction,
		duplicatePipe as duplicatePipeAction,
		setPipeLength as setPipeLengthAction,
	} from '$lib/composerStore';
import { flashToast } from '$lib/flashToast';
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

	let {
			session,
			totalFrames: propTotalFrames = 241,
			selectedFrame,
			activePipeIdx = $bindable(null),
			onframechange,
		} = $props<{
			session?: SessionData;
			totalFrames?: number;
			selectedFrame?: number;
			activePipeIdx?: number | null;
			onUpdate?: (session: SessionData) => void;
			onframechange?: (frame: number) => void;
		}>();

	const MAX_KEYFRAMES = 3;
	const MAX_SUBJECT_REFS = 5;
	const DEFAULT_FRAME_COUNT = 241;

	// ── Derived state ────────────────────────────────────────────────────────
	let pipes = $derived(session?.pipes ?? []);
	let totalFrames = $derived(
		pipes.length > 0
			? (pipes[activePipeIdx ?? 0]?.lengthFrames ?? DEFAULT_FRAME_COUNT)
			: (propTotalFrames ?? DEFAULT_FRAME_COUNT)
	);

	// ── Centralized geometry ───────────────────────────────────────────────
	// Single canonical coordinate element per pipe: the FrameRuler's
	// coordinate-space. Every track (global/timeline/tags) and the ruler
	// resolve px math through this one element → one coordinate system.
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

	// ── UI state ─────────────────────────────────────────────────────────────
	// Clamp activePipeIdx when pipes shrink (removals) — prevents stale index
	$effect(() => {
		if (activePipeIdx !== null && activePipeIdx >= pipes.length) {
			activePipeIdx = null;
		}
	});

	// ── Modal open-state (field state now lives in the ComposerModals components) ──
	// Keyframe modal
	let showKeyframeModal = $state(false);
	let editingKeyframeSlot = $state<number | null>(null);

	// Subject reference modal
	let showSubjectRefModal = $state(false);
	let editingSubjectRefId = $state<string | null>(null);

	// Segment modal — panel keeps the pre-seed start/end (handleAddSegment computes them)
	let showSegmentModal = $state(false);
	let segStart = $state(0);
	let segEnd = $state(8);

	// Tag prompt modal
	let showTagPromptModal = $state(false);
	let editingTagId = $state<string>('');
	let editingSegmentId = $state<string>('');
	let tagPrompt = $state('');

	// [+] menu
	let showAddMenu = $state(false);
	let addMenuX = $state(0);
	let addMenuY = $state(0);

	// Tag selector menu
	let showTagMenu = $state(false);
	let selectedSegmentId = $state<string>('');
	let selectedTagType = $state<TagType | null>(null);
	let tagMenuX = $state(0);
	let tagMenuY = $state(0);

	// Drag state for segments and tags
	// ── Drag state ────────────────────────────────────────────────────────────
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

	// Close menus on outside click
	$effect(() => {
		function handler() {
			showAddMenu = false;
			showTagMenu = false;
			dragState = null;
		}
		document.addEventListener('click', handler);
		return () => document.removeEventListener('click', handler);
	});

	// ── Helpers ─────────────────────────────────────────────────────────────

	function isKeyframeConfigured(pipe: PipeRow, slotIndex: number): boolean {
		const kf = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === slotIndex);
		if (!kf) return false;
		switch (kf.type) {
			case 'url': return !!(kf.imageSrc && kf.imageSrc.trim().length > 0);
			case 'txt2img': return !!(kf.prompt && kf.prompt.trim().length > 0);
			case 'img2img': return !!(kf.referenceUrl && kf.referenceUrl.trim().length > 0);
			default: return false;
		}
	}

	function getVisibleKeyframeSlots(pipe: PipeRow): number[] {
		const visible: number[] = [];
		for (let i = 1; i <= MAX_KEYFRAMES; i++) {
			if (i === 1) {
				visible.push(i);
			} else if (isKeyframeConfigured(pipe, i - 1)) {
				visible.push(i);
			} else {
				break;
			}
		}
		return visible;
	}

	function getTimeline(pipe: PipeRow): any {
		return pipe.elements.find((e: any) => e.tag === 'timeline') ?? null;
	}

	function getGlobal(pipe: PipeRow): any {
		return pipe.elements.find((e: any) => e.tag === 'global_style') ?? null;
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

	// ── Actions ─────────────────────────────────────────────────────────────

	async function handleAddPipe() {
		if (!session?.id) return;
		const result = await addPipeAction(session.id);
		if (result.errors.length > 0) console.error('[ComposerPanel] addPipe:', result.errors);
	}

	async function handleRemovePipe(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removePipeAction(session.id, pipe.id);
		if (result.errors.length > 0) {
			flashToast(`Failed to remove pipe: ${result.errors.join(', ')}`);
			console.error('[ComposerPanel] removePipe:', result.errors);
		}
	}

	async function handleMovePipe(idx: number, dir: -1 | 1) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const target = idx + dir;
		if (target < 0 || target >= pipes.length) return;
		const result = await movePipeAction(session.id, pipe.id, target);
		if (result.errors.length > 0) {
			flashToast(`Failed to reorder pipe: ${result.errors.join(', ')}`);
		}
	}

	async function handleDuplicatePipe(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await duplicatePipeAction(session.id, pipe.id);
		if (result.errors.length > 0) {
			flashToast(`Failed to duplicate pipe: ${result.errors.join(', ')}`);
			console.error('[ComposerPanel] duplicatePipe:', result.errors);
		}
	}

	async function handlePipeLengthChange(idx: number, raw: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		if (!Number.isFinite(raw)) return;
		const clamped = Math.max(41, raw); // min 8*5+1
		const result = await setPipeLengthAction(session.id, pipe.id, clamped);
		if (result.errors.length > 0) {
			flashToast(`Failed to set pipe length: ${result.errors.join(', ')}`);
		}
	}

	// ── Keyframe ────────────────────────────────────────────────────────────

	function openKeyframeModal(idx: number, slotIndex?: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		activePipeIdx = idx;
		editingKeyframeSlot = slotIndex ?? (getVisibleKeyframeSlots(pipe).length + 1);
		showKeyframeModal = true;
		closeMenus();
	}

	async function handleRemoveKeyframe(idx: number, kfId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeKeyframeAction(session.id, pipe.id, kfId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeKeyframe:', result.errors);
	}

	// ── Subject Reference ───────────────────────────────────────────────────

	function openSubjectRefModal(idx: number, refId?: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		activePipeIdx = idx;
		editingSubjectRefId = refId ?? null;
		showSubjectRefModal = true;
		closeMenus();
	}

	async function handleToggleSubjectRef(idx: number, refId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await toggleSubjectRefAction(session.id, pipe.id, refId);
		if (result.errors.length > 0) console.error('[ComposerPanel] toggleSubjectRef:', result.errors);
	}

	async function handleRemoveSubjectRef(idx: number, refId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeSubjectRefAction(session.id, pipe.id, refId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeSubjectRef:', result.errors);
	}

	// ── Track add menu ──────────────────────────────────────────────────────

	function handleToggleAddMenu(pipeIdx: number, e: MouseEvent) {
		activePipeIdx = pipeIdx;
		showAddMenu = !showAddMenu;
		showTagMenu = false;
		if (showAddMenu) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			addMenuX = rect.left;
			addMenuY = rect.bottom + 4;
		}
	}

	function handleAddTimeline(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		addTimelineElementAction(session.id, pipe.id).then(r => {
			if (r.errors?.length) console.error('[ComposerPanel] addTimeline:', r.errors);
		});
		showAddMenu = false;
	}

	function handleAddGlobal(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		addGlobalElementAction(session.id, pipe.id, 0, totalFrames - 1).then(r => {
			if (r.errors?.length) console.error('[ComposerPanel] addGlobal:', r.errors);
		});
		showAddMenu = false;
	}

	// Single coordinate space: all px math resolves through rulerGeometry
	// (the .timeline-coordinate element), never a per-lane fallback.

	// ── Segment interactions ────────────────────────────────────────────────

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
			? getTimeline(pipes[activePipeIdx!])?.segments.find((s: Segment) => s.id === d.segmentId)
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

		if (!finalPreview || !session?.id) {
			previewDragState = null;
			return;
		}

		const pipe = pipes[activePipeIdx!];
		if (!pipe) {
			previewDragState = null;
			return;
		}

		if (finalPreview.type === 'segment') {
			const result = await resizeSegmentAction(
				session.id,
				pipe.id,
				finalPreview.id,
				finalPreview.startFrame,
				finalPreview.endFrame
			);
			if (result.errors.length) {
				console.error('[ComposerPanel] resizeSegment:', result.errors);
			}
		}

		if (finalPreview.type === 'tag') {
			const result = await resizeTagElementAction(
				session.id,
				pipe.id,
				finalPreview.segmentId!,
				finalPreview.id,
				finalPreview.startFrame,
				finalPreview.endFrame
			);
			if (result.errors.length) {
				console.error('[ComposerPanel] resizeTag:', result.errors);
			}
		}

		previewDragState = null;
	}

	// ── Segment add ─────────────────────────────────────────────────────────

	function handleAddSegment(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		// No timeline yet is fine — SegmentServiceImpl.add() auto-creates one
		const tl = getTimeline(pipe);
		activePipeIdx = idx;

		// Use getNextAvailableRange to find first free gap, not just append after last
		const available = getNextAvailableRange(tl?.segments ?? [], pipe.lengthFrames, 8);
		if (available) {
			segStart = available.start;
			segEnd = available.end;
		} else {
			// Fallback: append at end (or from 0 when no segments yet)
			const segs = tl?.segments ?? [];
			const lastSeg = segs[segs.length - 1];
			segStart = lastSeg ? lastSeg.frameEnd : 0;
			segEnd = Math.min(segStart + 8, totalFrames - 1);
		}
		showSegmentModal = true;
		closeMenus();
	}

	// SegmentModal calls back with the snapped start/end it computed
	async function confirmSegment(start: number, end: number) {
		const pipe = pipes[activePipeIdx!];
		if (!pipe || !session?.id) return;
		const result = await addSegmentAction(session.id, pipe.id, start, end);
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] addSegment:', result.errors);
			return;
		}
		showSegmentModal = false;
	}

	async function handleDeleteSegment(idx: number, segId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeSegmentAction(session.id, pipe.id, segId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeSegment:', result.errors);
	}

	// ── Tags ────────────────────────────────────────────────────────────────

	function handleOpenTagMenu(segId: string, e: MouseEvent, idx: number) {
		activePipeIdx = idx;
		selectedSegmentId = segId;
		selectedTagType = null;
		tagMenuX = e.clientX;
		tagMenuY = e.clientY;
		showTagMenu = true;
		showAddMenu = false;
	}

	async function confirmTagSelector() {
		if (!selectedTagType || !session?.id) return;
		const pipe = pipes[activePipeIdx!];
		if (!pipe) return;
		const tl = getTimeline(pipe);
		if (!tl) return;
		const seg = tl.segments.find((s: Segment) => s.id === selectedSegmentId);
		if (!seg) return;
		const result = await addTagElementAction(session.id, pipe.id, selectedSegmentId, selectedTagType);
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] addTag:', result.errors);
			return;
		}
		showTagMenu = false;
		selectedTagType = null;
	}

	function handleEditTagPrompt(idx: number, seg: Segment, tag: TagElement) {
		activePipeIdx = idx;
		editingTagId = tag.id;
		editingSegmentId = seg.id;
		tagPrompt = tag.prompt || '';
		showTagPromptModal = true;
		closeMenus();
	}

	// TagPromptModal calls back with its edited prompt on confirm
	async function confirmTagPrompt(prompt: string) {
		const pipe = pipes[activePipeIdx!];
		if (!pipe || !session?.id) return;
		const result = await updateTagPromptAction(session.id, pipe.id, editingSegmentId, editingTagId, prompt);
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] updateTagPrompt:', result.errors);
			return;
		}
		tagPrompt = prompt;
		showTagPromptModal = false;
	}

	async function handleRemoveTag(idx: number, segId: string, tagId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeTagElementAction(session.id, pipe.id, segId, tagId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeTag:', result.errors);
	}

	async function handleRemoveGlobal(idx: number, globalId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeGlobalElementAction(session.id, pipe.id, globalId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeGlobal:', result.errors);
	}

	async function handleToggleGlobal(idx: number, globalId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await toggleGlobalElementAction(session.id, pipe.id, globalId);
		if (result.errors.length > 0) console.error('[ComposerPanel] toggleGlobal:', result.errors);
	}

	function closeMenus() {
		showAddMenu = false;
		showTagMenu = false;
	}
</script>

<div class="composer-panel">
	{#each pipes as pipe, pipeIdx (pipe.id)}
		<div class="pipe" class:active={activePipeIdx === pipeIdx}>
			
			<!-- ═══ PIPE HEADER ═══ -->
			<div class="pipe-header">
				<span class="pipe-label">Pipe {pipeIdx + 1}</span>
				<span class="pipe-meta">{pipe.lengthFrames}f</span>
				<span class="pipe-ops">
					<button class="btn-icon" onclick={() => handleMovePipe(pipeIdx, -1)} disabled={pipeIdx === 0} title="Move pipe up">↑</button>
					<button class="btn-icon" onclick={() => handleMovePipe(pipeIdx, 1)} disabled={pipeIdx === pipes.length - 1} title="Move pipe down">↓</button>
					<button class="btn-icon" onclick={() => handleDuplicatePipe(pipeIdx)} title="Duplicate pipe">⧉</button>
					<label class="pipe-len" title="Pipe length in frames (min 41)">
						<span>len</span>
						<input type="number" min="41" step="8" value={pipe.lengthFrames}
							onchange={(e) => handlePipeLengthChange(pipeIdx, Number(e.currentTarget.value))} />
					</label>
					<button class="btn-icon pipe-del" onclick={() => handleRemovePipe(pipeIdx)} title="Remove pipe">×</button>
				</span>
			</div>

			<!-- ═══ KEYFRAME ROW ═══ -->
			<div class="row-group">
				<div class="row-header">
					<span class="row-label">KEYFRAMES</span>
					<span class="row-count">{pipe.keyframes.length}/{MAX_KEYFRAMES}</span>
				</div>
				<div class="kf-row">
					{#each getVisibleKeyframeSlots(pipe) as kfNum}
						{#each [pipe.keyframes.find((kf: PipeKeyframe) => kf.slotIndex === kfNum)] as kf}
							{#if kf}
								<div 
									class="kf-chip kf-filled"
									onclick={() => openKeyframeModal(pipeIdx, kfNum)}
									onkeydown={(e) => e.key === 'Enter' && openKeyframeModal(pipeIdx, kfNum)}
									role="button"
									tabindex="0"
									title="Frame {kf.frame} · {kf.type} · Click to edit">
									{#if kf.imageSrc}
										<img src={kf.imageSrc} class="kf-img" alt="keyframe" />
									{:else}
										<span class="kf-label">k{kfNum}</span>
									{/if}
									<button 
										class="kf-del"
										onclick={(e) => { e.stopPropagation(); handleRemoveKeyframe(pipeIdx, kf.id); }}
										title="Remove keyframe">×</button>
								</div>
							{:else}
								<div 
									class="kf-chip kf-empty"
									onclick={() => openKeyframeModal(pipeIdx, kfNum)}
									onkeydown={(e) => e.key === 'Enter' && openKeyframeModal(pipeIdx, kfNum)}
									role="button"
									tabindex="0"
									title="Click to configure keyframe {kfNum}">
									<span class="kf-empty-label">+ k{kfNum}</span>
								</div>
							{/if}
						{/each}
					{/each}
				</div>
			</div>

			<!-- ═══ SUBJECT REFERENCES ROW ═══ -->
			{#if (pipe.subjectReferences?.length ?? 0) > 0}
				<div class="row-group">
					<div class="row-header">
						<span class="row-label">SUBJECT REFS</span>
						<span class="row-count">{(pipe.subjectReferences?.filter(r => r.visible !== false).length ?? 0)}/{MAX_SUBJECT_REFS}</span>
					</div>
					<div class="sr-row">
						{#each (pipe.subjectReferences ?? []) as sr (sr.id)}
							{#if sr.visible !== false}
								<div class="sr-chip" title="Frames {sr.frameStart ?? '—'}–{sr.frameEnd ?? '—'} · Click to edit">
									<button 
										class="sr-eye"
										onclick={(e) => { e.stopPropagation(); handleToggleSubjectRef(pipeIdx, sr.id); }}
										title={sr.visible === false ? 'Enable reference' : 'Disable reference'}>
										{#if sr.visible === false}
											<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>
										{:else}
											<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
										{/if}
									</button>
									{#if sr.imageUrl}
										<img src={sr.imageUrl} class="sr-img" alt="subject ref" />
									{:else}
										<span class="sr-dot"></span>
									{/if}
									{#if sr.useFrames}
										<span class="sr-range">{sr.frameStart}–{sr.frameEnd}</span>
									{:else}
										<span class="sr-label">full</span>
									{/if}
									<button 
										class="sr-del"
										onclick={(e) => { e.stopPropagation(); handleRemoveSubjectRef(pipeIdx, sr.id); }}
										title="Remove subject reference">×</button>
								</div>
							{/if}
						{/each}
						{#if (pipe.subjectReferences?.length ?? 0) < MAX_SUBJECT_REFS}
							<button 
								class="sr-add" 
								onclick={() => openSubjectRefModal(pipeIdx)} 
								title="Add subject reference">
								+ s{(pipe.subjectReferences?.length ?? 0) + 1}
							</button>
						{/if}
					</div>
				</div>
			{:else}
				<div class="row-group">
					<div class="row-header">
						<span class="row-label">SUBJECT REFS</span>
						<span class="row-count">0/{MAX_SUBJECT_REFS}</span>
					</div>
					<div class="sr-row">
						<button 
							class="sr-add" 
							onclick={() => openSubjectRefModal(pipeIdx)} 
							title="Add subject reference">
							+ s1
						</button>
					</div>
				</div>
			{/if}

			<!-- ═══ TIMELINE AREA: single frame coordinate canvas + chrome column ═══ -->
			<div class="timeline-area">
			<div class="timeline-coordinate" bind:this={rulerElement}>
				<div class="timeline-ruler">
						<FrameRuler
							{totalFrames}
							{selectedFrame}
							geometry={rulerGeometry}
							onframeSelect={(f) => { onframechange?.(f); }}
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
								<button class="btn-icon-sm" onclick={() => handleToggleGlobal(pipeIdx, global.id)} title="Toggle global">
									{#if global.enabled}◉{:else}○{/if}
								</button>
								<button class="btn-icon-sm btn-del-sm" onclick={() => handleRemoveGlobal(pipeIdx, global.id)} title="Remove global">×</button>
							</div>
						</div>
					{/if}
				{/each}

				<!-- ═══ TIMELINE LANE (in coordinate space) ═══ -->
				<div class="timeline-lane">
					{#each [getTimeline(pipe)] as tl}
						{#if tl}
							{#each tl.segments as seg (seg.id)}
								<div class="segment-row" style="height: {28 + seg.tags.length * 24 + 24}px;">
									<div class="segment-coordinate-row">
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
														onclick={() => handleEditTagPrompt(pipeIdx, seg, tag)}
														onkeydown={(e) => e.key === 'Enter' && handleEditTagPrompt(pipeIdx, seg, tag)}
														onpointerdown={(e) => handleElementPointerDown(e, 'tag', tag.id, seg.id, 'body', tag.frameStart, tag.frameEnd)}
														onpointermove={handlePointerMove}
														onpointerup={handlePointerUp}>
														<span class="tag-name">{tag.spec?.name || tag.tag}</span>
														{#if tag.prompt}
															<span class="tag-prompt">{tag.prompt}</span>
														{/if}
														<button
															class="btn-del-tag"
															onclick={(e) => { e.stopPropagation(); handleRemoveTag(pipeIdx, seg.id, tag.id); }}
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
											onclick={(e) => { e.stopPropagation(); handleOpenTagMenu(seg.id, e, pipeIdx); }}
											title="Add tag to segment">+ Tag</button>
										<button
											class="btn-icon-sm btn-del-sm seg-del"
											onclick={() => handleDeleteSegment(pipeIdx, seg.id)}
											title="Delete segment">×</button>
									</div>
								</div>
							{/each}

							{#if tl.segments.length === 0}
								<div class="seg-empty full-width" onclick={() => handleAddSegment(pipeIdx)} role="button" tabindex="0"
									onkeydown={(e) => e.key === 'Enter' && handleAddSegment(pipeIdx)}>
									<span>+ Add first segment</span>
								</div>
							{/if}
						{:else}
							<!-- No timeline — offer direct segment creation (auto-creates timeline) -->
							<div class="seg-empty full-width" onclick={() => handleAddSegment(pipeIdx)} role="button" tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && handleAddSegment(pipeIdx)}>
								<span>+ Add first segment</span>
							</div>
						{/if}
					{/each}
				</div>
				</div>

				<!-- ═══ [+] BUTTON (chrome column, outside coordinate space) ═══ -->
				<div class="timeline-actions">
					<button
						class="btn-add-track"
						onclick={(e) => { e.stopPropagation(); handleToggleAddMenu(pipeIdx, e); }}
						title="Add track">
						+
					</button>
				</div>
				</div>

				</div>
				{/each}

				<!-- ═══ ADD PIPE ═══ -->
	<button class="btn-add-pipe" onclick={handleAddPipe}>+ Add Pipe</button>

	<!-- ═══ [+] DROPDOWN MENU ═══ -->
	{#if showAddMenu && activePipeIdx !== null}
		<div class="dropdown-menu" style="left: {addMenuX}px; top: {addMenuY}px;"
			onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<button class="dropdown-item" onclick={() => handleAddTimeline(activePipeIdx)}>
				<span class="dropdown-icon">▬</span> Timeline
			</button>
			<button class="dropdown-item" onclick={() => handleAddGlobal(activePipeIdx)}>
				<span class="dropdown-icon">◈</span> Global
			</button>
		</div>
	{/if}

	<!-- ═══ TAG SELECTOR DROPDOWN ═══ -->
	{#if showTagMenu}
		<div class="dropdown-menu tag-menu" style="left: {tagMenuX}px; top: {tagMenuY}px;"
			onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="dropdown-label">Add Tag</div>
			{#each ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'] as tagType}
				<button class="dropdown-item tag-item"
					class:active={selectedTagType === tagType}
					onclick={() => selectedTagType = tagType as TagType}>
					<span class="tag-dot" style="background: {TAG_SPECIFICATIONS[tagType as TagType].color}"></span>
					<span>{TAG_SPECIFICATIONS[tagType as TagType].name}</span>
				</button>
			{/each}
			<div class="dropdown-actions">
				<button class="btn-confirm" onclick={confirmTagSelector} disabled={!selectedTagType}>Add</button>
				<button class="btn-cancel" onclick={closeMenus}>Cancel</button>
			</div>
		</div>
	{/if}
</div>

<!-- ═══ KEYFRAME MODAL ═══ -->
{#if activePipeIdx !== null}
	<KeyframeModal
		pipe={pipes[activePipeIdx]}
		sessionId={session?.id}
		maxFrames={totalFrames}
		editingSlot={editingKeyframeSlot}
		bind:open={showKeyframeModal}
	/>
{/if}

<!-- ═══ SUBJECT REFERENCE MODAL ═══ -->
{#if activePipeIdx !== null}
	<SubjectRefModal
		pipe={pipes[activePipeIdx]}
		sessionId={session?.id}
		maxFrames={totalFrames}
		editingRefId={editingSubjectRefId}
		maxSubjectRefs={MAX_SUBJECT_REFS}
		bind:open={showSubjectRefModal}
	/>
{/if}

<!-- ═══ SEGMENT MODAL ═══ -->
<SegmentModal
	startFrame={segStart}
	endFrame={segEnd}
	totalFrames={totalFrames}
	bind:open={showSegmentModal}
	onConfirm={(s, e) => confirmSegment(s, e)}
/>

<!-- ═══ TAG PROMPT MODAL ═══ -->
{#if activePipeIdx !== null}
	<TagPromptModal
		sessionId={session?.id}
		pipeId={pipes[activePipeIdx].id}
		segmentId={editingSegmentId}
		tagId={editingTagId}
		prompt={tagPrompt}
		bind:open={showTagPromptModal}
		onConfirm={(p) => confirmTagPrompt(p)}
	/>
{/if}

<style>
	/* Base styles */
	.composer-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		background: var(--bg-primary);
		color: var(--text-primary);
		min-height: 100%;
	}

	.pipe {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		background: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
	}

	.pipe.active {
		border-color: var(--accent-color);
		box-shadow: 0 0 0 2px var(--accent-color);
	}

	.pipe-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pipe-label {
		font-weight: 600;
		font-size: 14px;
	}

	.pipe-meta {
		font-size: 12px;
		color: var(--text-secondary);
		margin-left: auto;
	}

	.pipe-ops {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 4px;
	}

	.pipe-ops .btn-icon {
		min-width: 24px;
		height: 24px;
		font-size: 14px;
	}

	.pipe-ops .btn-icon:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.pipe-len {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--text-secondary);
	}

	.pipe-len input {
		width: 52px;
		padding: 3px 5px;
		font-size: 12px;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.pipe-len input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.pipe-del {
		color: var(--text-secondary);
	}

	.pipe-del:hover {
		color: #ef4444;
	}

	.row-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.row-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.row-count {
		margin-left: auto;
		opacity: 0.7;
	}

	.kf-row {
		display: flex;
		gap: 8px;
		align-items: center;
		min-height: 48px;
		width: 100%;
	}

	.kf-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		flex: 1 1 0;
		min-width: 0;
		justify-content: center;
	}

	.kf-filled {
		background: var(--accent-bg);
		border-color: var(--accent-color);
	}

	.kf-empty {
		opacity: 0.6;
		cursor: pointer;
	}

	.kf-empty:hover {
		opacity: 1;
		background: var(--bg-tertiary);
	}

	.kf-img {
		width: 24px;
		height: 24px;
		object-fit: cover;
		border-radius: 4px;
	}

	.kf-label {
		font-weight: 600;
	}

	.kf-empty-label {
		font-size: 12px;
	}

	.kf-del {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
	}

	.kf-del:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.sr-row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		min-height: 48px;
	}

	.sr-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		font-size: 12px;
	}

	.sr-eye {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sr-eye:hover {
		color: var(--text-primary);
	}

	.sr-img {
		width: 20px;
		height: 20px;
		object-fit: cover;
		border-radius: 3px;
	}

	.sr-dot {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--accent-color);
	}

	.sr-range, .sr-label {
		font-size: 11px;
		color: var(--text-secondary);
	}

	.sr-del {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: 4px;
	}

	.sr-del:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.sr-add {
		background: none;
		border: 1px dashed var(--border-color);
		color: var(--text-secondary);
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
	}

	.sr-add:hover {
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

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

	.timeline-lane {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}

	.segment-row {
		position: relative;
		width: 100%;
	}

	.segment-coordinate-row {
		position: relative;
		width: 100%;
		height: 28px;
	}

	.segment-body {
		position: absolute;
		top: 2px;
		height: 24px;
		background: var(--accent-color);
		opacity: 0.85;
		border-radius: 4px;
		cursor: grab;
		display: flex;
		align-items: center;
		padding: 0 8px;
		box-sizing: border-box;
		overflow: hidden;
		z-index: 2;
	}
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
		opacity: 0.75;
	}
	.segment-handle:hover,
	.segment-handle:active { opacity: 1; }

	.tag-coordinate-row {
		position: absolute;
		left: 0;
		right: 0;
		height: 22px;
	}

	.tag-body {
		position: absolute;
		top: 1px;
		height: 20px;
		background: var(--tag-color, var(--accent-color));
		opacity: 0.85;
		border-radius: 3px;
		cursor: grab;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 6px;
		box-sizing: border-box;
		overflow: hidden;
		z-index: 2;
	}
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
		opacity: 0.6;
	}
	.tag-handle:hover,
	.tag-handle:active { opacity: 1; }

	.btn-del-tag {
		position: absolute;
		right: 0;
		top: 0;
		z-index: 3;
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
	.btn-add-track,
	.btn-add-pipe {
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
	.btn-add-track:hover,
	.btn-add-pipe:hover {
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

	/* Dropdown menus */
	.dropdown-menu {
		position: fixed;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		min-width: 160px;
		z-index: 1000;
		overflow: hidden;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		color: var(--text-primary);
		cursor: pointer;
		font-size: 13px;
		transition: background 0.15s;
	}

	.dropdown-item:hover {
		background: var(--bg-tertiary);
	}

	.dropdown-item.tag-item {
		flex-direction: row;
	}

	.dropdown-item.tag-item .tag-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dropdown-item.tag-item.active {
		background: var(--accent-bg);
		color: var(--accent-color);
	}

	.dropdown-icon {
		font-size: 14px;
	}

	.dropdown-label {
		padding: 10px 16px 6px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.dropdown-actions {
		display: flex;
		gap: 8px;
		padding: 8px;
		border-top: 1px solid var(--border-color);
	}

	.dropdown-actions .btn-confirm,
	.dropdown-actions .btn-cancel {
		flex: 1;
		padding: 8px;
		border-radius: 6px;
		font-size: 12px;
		cursor: pointer;
	}

	.dropdown-actions .btn-confirm {
		background: var(--accent-color);
		color: white;
		border: none;
	}

	.dropdown-actions .btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dropdown-actions .btn-cancel {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-color);
	}

		/* Modal styles live in ./composer-modal.css (shared by ComposerModals/*) */

	.full-width {
		width: 100%;
	}
</style>