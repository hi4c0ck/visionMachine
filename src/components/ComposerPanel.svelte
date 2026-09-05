<script lang="ts">
	import type { SessionData, PipeRow, TagType, PipeKeyframe, TagElement, Segment, SubjectReference } from '$types';
	import { TAG_SPECIFICATIONS } from '$types';
	import FrameRuler from './FrameRuler.svelte';
	import MultiThumbSlider from './MultiThumbSlider.svelte';
	import { getNextAvailableRange } from '$lib/frameMath';
	import {
		addPipe as addPipeAction,
		removePipe as removePipeAction,
		addKeyframe as addKeyframeAction,
		removeKeyframe as removeKeyframeAction,
		addGlobalElement as addGlobalElementAction,
		updateGlobalRange as updateGlobalRangeAction,
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
		addSubjectRef as addSubjectRefAction,
		updateSubjectRefRange as updateSubjectRefRangeAction,
		removeSubjectRef as removeSubjectRefAction,
		toggleSubjectRef as toggleSubjectRefAction,
		updateSubjectRefUrl as updateSubjectRefUrlAction,
		updateSubjectRefUseFrames as updateSubjectRefUseFramesAction,
	} from '$lib/composerStore';
import { snapTo8 } from '$lib/frameMath';
import { createFrameGeometry, type FrameGeometry, framePercent, pointerToFrame, snapFrame, pxDeltaToFrame } from '$lib/frameGeometry';
import { useFrameGeometry } from '$lib/useFrameGeometry';

	let {
		session,
		totalFrames: propTotalFrames = 241,
		selectedFrame,
	} = $props<{
		session?: SessionData;
		totalFrames?: number;
		selectedFrame?: number;
		onUpdate?: (session: SessionData) => void;
		onframechange?: (frame: number) => void;
	}>();

	const MAX_KEYFRAMES = 3;
	const MAX_SUBJECT_REFS = 5;
	const DEFAULT_FRAME_COUNT = 241;

	// ── Derived state ────────────────────────────────────────────────────────
	let pipes = $derived(session?.pipes ?? []);
	let totalFrames = $derived(propTotalFrames ?? (pipes.length > 0 ? (pipes[0]?.lengthFrames ?? DEFAULT_FRAME_COUNT) : DEFAULT_FRAME_COUNT));

	// ── Centralized geometry ───────────────────────────────────────────────
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
	let activePipeIdx = $state<number | null>(null);

	// Keyframe modal
	let showKeyframeModal = $state(false);
	let editingKeyframeSlot = $state<number | null>(null);
	let kfType = $state<'url' | 'txt2img' | 'img2img'>('url');
	let kfValue = $state('');
	let kfFrame = $state(0);

	// Subject reference modal
	let showSubjectRefModal = $state(false);
	let editingSubjectRefId = $state<string | null>(null);
	let srImageUrl = $state('');
	let srUseFrames = $state(false);
	let srStart = $state(0);
	let srEnd = $state(8);

	// Segment modal
	let showSegmentModal = $state(false);
	let segStart = $state(0);
	let segEnd = $state(8);

	// Tag prompt modal
	let showTagPromptModal = $state(false);
	let editingTagId = $state<string>('');
	let tagPrompt = $state('');
	let editingSegmentId = $state<string>('');

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
	// Transient preview state for visual feedback during drag
	let previewDragState = $state<{
		type: 'segment' | 'tag';
		id: string;
		segmentId?: string;
		handle: 'left' | 'right' | 'body';
		startFrame: number;
		endFrame: number;
	} | null>(null);

	// Actual drag state for tracking interaction
	let dragState = $state<{
		type: 'segment' | 'tag';
		id: string;
		segmentId?: string;
		handle: 'left' | 'right' | 'body';
		startFrame: number;
		endFrame: number;
		mouseStartX: number;
	} | null>(null);

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

	// Drag listeners for segments and tags — attached via $effect per Svelte 5 pattern
	$effect(() => {
		function onPointerMove(e: MouseEvent) {
			handlePointerMove(e);
		}
		function onPointerUp() {
			handlePointerUp();
		}
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
		return () => {
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
		};
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

	// Frame to percentage for rendering — DEPRECATED, use framePercent() from geometry
	// Kept for backward compat during migration
	function frameToX(frame: number): number {
		if (rulerGeometry) {
			return framePercent(frame, rulerGeometry);
		}
		return (frame / Math.max(totalFrames - 1, 1)) * 100;
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
		if (result.errors.length > 0) console.error('[ComposerPanel] removePipe:', result.errors);
	}

	// ── Keyframe ────────────────────────────────────────────────────────────

	function openKeyframeModal(idx: number, slotIndex?: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		activePipeIdx = idx;
		editingKeyframeSlot = slotIndex ?? (getVisibleKeyframeSlots(pipe).length + 1);
		const existing = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === editingKeyframeSlot);
		if (existing) {
			kfType = existing.type;
			kfValue = existing.imageSrc ?? existing.prompt ?? existing.referenceUrl ?? '';
			kfFrame = existing.frame;
		} else {
			kfType = 'url';
			kfValue = '';
			kfFrame = snapTo8(pipe.keyframes.length > 0 ? pipe.keyframes[0].frame : 0);
		}
		showKeyframeModal = true;
		closeMenus();
	}

	async function confirmKeyframe() {
		const pipe = pipes[activePipeIdx!];
		if (!pipe || !session?.id || editingKeyframeSlot === null) return;
		if (!kfValue.trim()) return;

		const slotIndex = editingKeyframeSlot;
		const result = await addKeyframeAction(session.id, pipe.id, slotIndex, kfFrame, kfType, kfValue);
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] confirmKeyframe:', result.errors);
			return;
		}
		showKeyframeModal = false;
		kfValue = '';
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
		const existing = refId ? (pipe.subjectReferences ?? []).find(r => r.id === refId) : null;
		if (existing) {
			editingSubjectRefId = existing.id;
			srImageUrl = existing.imageUrl;
			srUseFrames = existing.useFrames ?? false;
			srStart = existing.frameStart ?? 0;
			srEnd = existing.frameEnd ?? Math.min(8, totalFrames - 1);
		} else {
			editingSubjectRefId = null;
			srImageUrl = '';
			srUseFrames = false;
			srStart = 0;
			srEnd = Math.min(8, totalFrames - 1);
		}
		showSubjectRefModal = true;
		closeMenus();
	}

	async function confirmSubjectRef() {
		const pipe = pipes[activePipeIdx!];
		if (!pipe || !session?.id) return;
		if (!srImageUrl.trim()) return;

		if (!editingSubjectRefId && (pipe.subjectReferences?.length ?? 0) >= MAX_SUBJECT_REFS) return;

		let result;
		if (editingSubjectRefId) {
			result = await updateSubjectRefRangeAction(session.id, pipe.id, editingSubjectRefId, srStart, srEnd);
			await updateSubjectRefUrlAction(session.id, pipe.id, editingSubjectRefId, srImageUrl);
			await updateSubjectRefUseFramesAction(session.id, pipe.id, editingSubjectRefId, srUseFrames);
		} else {
			result = await addSubjectRefAction(session.id, pipe.id, srImageUrl, srUseFrames, srUseFrames ? srStart : undefined, srUseFrames ? srEnd : undefined);
		}
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] confirmSubjectRef:', result.errors);
			return;
		}
		showSubjectRefModal = false;
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

	// ── Global range update ─────────────────────────────────────────────────

	async function handleGlobalRangeUpdate(idx: number, globalId: string, values: [number, number]) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await updateGlobalRangeAction(session.id, pipe.id, globalId, values[0], values[1]);
		if (result.errors.length > 0) console.error('[ComposerPanel] handleGlobalRangeUpdate:', result.errors);
	}

	// Find geometry context (centralized)
	function getGeometry(): FrameGeometry | null {
		return rulerGeometry;
	}

	// ── Segment interactions ────────────────────────────────────────────────

	function handleSegmentPointerDown(e: PointerEvent, seg: Segment, handle: 'left' | 'right' | 'body') {
		e.preventDefault();
		e.stopPropagation();
		const geo = getGeometry();
		if (!geo) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const startX = e.clientX;

		// Capture pointer to ensure all subsequent events are received by this element
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

		dragState = {
			type: 'segment',
			id: seg.id,
			segmentId: seg.id,
			handle,
			startFrame: seg.frameStart,
			endFrame: seg.frameEnd,
			mouseStartX: startX,
		};

		// Initialize preview with current values
		previewDragState = {
			type: 'segment',
			id: seg.id,
			handle,
			startFrame: seg.frameStart,
			endFrame: seg.frameEnd,
		};
	}

	function handlePointerMove(e: MouseEvent) {
		if (!dragState || !rulerGeometry) return;
		e.preventDefault();

		const dx = e.clientX - dragState.mouseStartX;
		const frameDelta = pxDeltaToFrame(dx, rulerGeometry);
		const snappedDelta = snapFrame(frameDelta);

		if (dragState.type === 'segment') {
			const start = dragState.startFrame;
			const end = dragState.endFrame;
			const duration = end - start;

			let newStart: number;
			let newEnd: number;

			if (dragState.handle === 'body') {
				newStart = snapFrame(Math.max(0, Math.min(start + snappedDelta, totalFrames - 1 - duration)));
				newEnd = newStart + duration;
			} else if (dragState.handle === 'left') {
				newStart = snapFrame(Math.max(0, Math.min(start + snappedDelta, end - 8)));
				newEnd = end;
			} else {
				newStart = start;
				newEnd = snapFrame(Math.min(totalFrames - 1, Math.max(start + 8, end + snappedDelta)));
			}

			// Update preview only, not store
			previewDragState = {
				type: 'segment',
				id: dragState.id,
				handle: dragState.handle,
				startFrame: newStart,
				endFrame: newEnd,
			};
		} else if (dragState.type === 'tag') {
			const seg = getTimeline(pipes[activePipeIdx!])?.segments.find((s: Segment) => s.id === dragState.segmentId);
			if (!seg) return;
			const segStart = seg.frameStart;
			const segEnd = seg.frameEnd;
			const duration = dragState.endFrame - dragState.startFrame;

			let newStart: number;
			let newEnd: number;

			if (dragState.handle === 'body') {
				newStart = snapFrame(Math.max(segStart, Math.min(dragState.startFrame + snappedDelta, segEnd - duration)));
				newEnd = newStart + duration;
			} else if (dragState.handle === 'left') {
				newStart = snapFrame(Math.max(segStart, Math.min(dragState.startFrame + snappedDelta, dragState.endFrame - 4)));
				newEnd = dragState.endFrame;
			} else {
				newStart = dragState.startFrame;
				newEnd = snapFrame(Math.min(segEnd, Math.max(dragState.startFrame + 4, dragState.endFrame + snappedDelta)));
			}

			// Update preview only, not store
			previewDragState = {
				type: 'tag',
				id: dragState.id,
				segmentId: dragState.segmentId,
				handle: dragState.handle,
				startFrame: newStart,
				endFrame: newEnd,
			};
		}
	}

	function handlePointerUp() {
		if (!dragState) return;

		// Commit the final preview state to store
		if (previewDragState) {
			if (previewDragState.type === 'segment') {
				resizeSegmentAction(
					session!.id,
					pipes[activePipeIdx!].id,
					previewDragState.startFrame,
					previewDragState.endFrame
				).catch(console.error);
			} else if (previewDragState.type === 'tag') {
				const seg = getTimeline(pipes[activePipeIdx!])?.segments.find((s: Segment) => s.id === previewDragState.segmentId);
				if (seg) {
					resizeTagElementAction(
						session!.id,
						pipes[activePipeIdx!].id,
						previewDragState.segmentId!,
						previewDragState.id,
						previewDragState.startFrame,
						previewDragState.endFrame
					).catch(console.error);
				}
			}
		}

		dragState = null;
		previewDragState = null;
	}

	// ── Segment add ─────────────────────────────────────────────────────────

	function handleAddSegment(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const tl = getTimeline(pipe);
		if (!tl) return;
		activePipeIdx = idx;

		// Use getNextAvailableRange to find first free gap, not just append after last
		const available = getNextAvailableRange(tl.segments, pipe.lengthFrames, 8);
		if (available) {
			segStart = available.start;
			segEnd = available.end;
		} else {
			// Fallback: append at end
			const lastSeg = tl.segments[tl.segments.length - 1];
			segStart = lastSeg ? lastSeg.frameEnd : 0;
			segEnd = Math.min(segStart + 8, totalFrames - 1);
		}
		showSegmentModal = true;
		closeMenus();
	}

	async function confirmSegment() {
		const pipe = pipes[activePipeIdx!];
		if (!pipe || !session?.id) return;
		const start = snapTo8(segStart);
		const end = Math.min(snapTo8(segEnd), totalFrames - 1);
		if (end <= start) return;
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

	async function confirmTagPrompt() {
		const pipe = pipes[activePipeIdx!];
		if (!pipe || !session?.id) return;
		const result = await updateTagPromptAction(session.id, pipe.id, editingSegmentId, editingTagId, tagPrompt);
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] updateTagPrompt:', result.errors);
			return;
		}
		showTagPromptModal = false;
		tagPrompt = '';
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

	async function handleRemoveSegment(idx: number, segId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeSegmentAction(session.id, pipe.id, segId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeSegment:', result.errors);
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
				<span class="pipe-meta">{totalFrames}f</span>
				<button class="btn-icon" onclick={() => handleRemovePipe(pipeIdx)} title="Remove pipe">×</button>
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

			<!-- ═══ FRAME RULER (CANONICAL) ═══ -->
			<div class="ruler-wrap ruler-aligned" bind:this={rulerElement}>
				<FrameRuler 
					{totalFrames} 
					{selectedFrame}
					segments={[]} 
					onframeSelect={(f) => {
						selectedFrame = f;
						onframechange?.(f);
					}} 
				/>
			</div>

			<!-- ═══ GLOBAL TRACK ═══ -->
			{#each [getGlobal(pipe)] as global}
				{#if global}
					<div class="global-track ruler-aligned">
						<MultiThumbSlider
							geometry={createFrameGeometry(totalFrames, 0)}
							values={[global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1]}
							color="#59B5FF"
							onchange={(vals) => handleGlobalRangeUpdate(pipeIdx, global.id, vals)}
						/>
						<div class="global-actions">
							<button class="btn-icon-sm" onclick={() => handleToggleGlobal(pipeIdx, global.id)} title="Toggle global">
								{#if global.enabled}◉{:else}○{/if}
							</button>
							<button class="btn-icon-sm btn-del-sm" onclick={() => handleRemoveGlobal(pipeIdx, global.id)} title="Remove global">×</button>
						</div>
					</div>
				{/if}
			{/each}

			<!-- ═══ TIMELINE TRACK ═══ -->
			{#each [getTimeline(pipe)] as tl}
				{#if tl}
					<div class="timeline-track ruler-aligned">
						{#each tl.segments as seg (seg.id)}
							<div class="segment-row">
								<!-- Segment range bar -->
								<div class="seg-bar">
									<!-- Left thumb -->
									<div
										class="thumb left"
										onpointerdown={(e) => handleSegmentPointerDown(e, seg, 'left')}
										style={`left: ${frameToX(getPreviewSegment(seg)?.startFrame ?? seg.frameStart)}%`}
										title="Drag to resize start">
									</div>
									<!-- Segment body -->
									<div
										class="seg-body"
										onpointerdown={(e) => handleSegmentPointerDown(e, seg, 'body')}
										style={`left: ${frameToX(getPreviewSegment(seg)?.startFrame ?? seg.frameStart)}%; width: ${frameToX(getPreviewSegment(seg)?.endFrame ?? seg.frameEnd) - frameToX(getPreviewSegment(seg)?.startFrame ?? seg.frameStart)}%`}>
										<span class="seg-label">{getPreviewSegment(seg) ? `${getPreviewSegment(seg)!.startFrame}–${getPreviewSegment(seg)!.endFrame}` : `${seg.frameStart}–${seg.frameEnd}`}</span>
									</div>
									<!-- Right thumb -->
									<div
										class="thumb right"
										onpointerdown={(e) => handleSegmentPointerDown(e, seg, 'right')}
										style={`left: ${frameToX(getPreviewSegment(seg)?.endFrame ?? seg.frameEnd)}%`}
										title="Drag to resize end">
									</div>
								</div>
								
								<!-- Tag sub-rows -->
								{#each seg.tags as tag (tag.id)}
									<div class="tag-row">
										<div class="tag-track">
											<!-- Tag bar with thumbs -->
											<div 
												class="tag-bar"
												onclick={() => handleEditTagPrompt(pipeIdx, seg, tag)}
												title="{tag.spec?.name}: {tag.frameStart}–{tag.frameEnd} · Click to edit prompt">
												<!-- Left thumb -->
												<div
													class="thumb small left"
													onpointerdown={(e) => {
														e.stopPropagation();
														const geo = getGeometry();
														if (!geo) return;
														const startX = e.clientX;
														(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
														dragState = {
															type: 'tag',
															id: tag.id,
															segmentId: seg.id,
															handle: 'left',
															startFrame: tag.frameStart,
															endFrame: tag.frameEnd,
															mouseStartX: startX,
														};
														previewDragState = {
															type: 'tag',
															id: tag.id,
															segmentId: seg.id,
															handle: 'left',
															startFrame: tag.frameStart,
															endFrame: tag.frameEnd,
														};
													}}
													style={`left: ${frameToX(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart)}%`}>
												</div>
												<!-- Tag body -->
												<div
													class="tag-body"
													onpointerdown={(e) => {
														e.stopPropagation();
														const geo = getGeometry();
														if (!geo) return;
														const startX = e.clientX;
														(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
														dragState = {
															type: 'tag',
															id: tag.id,
															segmentId: seg.id,
															handle: 'body',
															startFrame: tag.frameStart,
															endFrame: tag.frameEnd,
															mouseStartX: startX,
														};
														previewDragState = {
															type: 'tag',
															id: tag.id,
															segmentId: seg.id,
															handle: 'body',
															startFrame: tag.frameStart,
															endFrame: tag.frameEnd,
														};
													}}
													style={`left: ${frameToX(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart)}%; width: ${frameToX(getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd) - frameToX(getPreviewTag(tag.id)?.startFrame ?? tag.frameStart)}%`}>
													<span class="tag-name">{tag.spec?.name || tag.tag}</span>
													{#if tag.prompt}
														<span class="tag-prompt">{tag.prompt}</span>
													{/if}
												</div>
												<!-- Right thumb -->
												<div
													class="thumb small right"
													onpointerdown={(e) => {
														e.stopPropagation();
														const geo = getGeometry();
														if (!geo) return;
														const startX = e.clientX;
														(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
														dragState = {
															type: 'tag',
															id: tag.id,
															segmentId: seg.id,
															handle: 'right',
															startFrame: tag.frameStart,
															endFrame: tag.frameEnd,
															mouseStartX: startX,
														};
														previewDragState = {
															type: 'tag',
															id: tag.id,
															segmentId: seg.id,
															handle: 'right',
															startFrame: tag.frameStart,
															endFrame: tag.frameEnd,
														};
													}}
													style={`left: ${frameToX(getPreviewTag(tag.id)?.endFrame ?? tag.frameEnd)}%`}>
												</div>
											</div>
											<button 
												class="btn-del-tag"
												onclick={(e) => { e.stopPropagation(); handleRemoveTag(pipeIdx, seg.id, tag.id); }}
												title="Remove tag">×</button>
										</div>
									</div>
								{/each}
								
								<!-- Add tag button -->
								<div class="tag-add-row">
									<button 
										class="btn-add-tag"
										onclick={(e) => { e.stopPropagation(); handleOpenTagMenu(seg.id, e, pipeIdx); }}
										title="Add tag to segment">
										+ Tag
									</button>
								</div>
								
								<!-- Delete segment button -->
								<button 
									class="btn-icon-sm btn-del-sm seg-del"
									onclick={() => handleDeleteSegment(pipeIdx, seg.id)}
									title="Delete segment">×</button>
							</div>
						{/each}
						
						{#if tl.segments.length === 0}
							<div class="seg-empty full-width" onclick={() => handleAddSegment(pipeIdx)} role="button" tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && handleAddSegment(pipeIdx)}>
								<span>+ Add first segment</span>
							</div>
						{/if}
					</div>
				{:else}
					<!-- No timeline — show nothing -->
				{/if}
			{/each}

			<!-- ═══ [+] BUTTON ═══ -->
			<div class="add-track-wrap">
				<button 
					class="btn-add-track"
					onclick={(e) => handleToggleAddMenu(pipeIdx, e)}
					title="Add track">
					+
				</button>
			</div>

		</div>
	{/each}

	<!-- ═══ ADD PIPE ═══ -->
	<button class="btn-add-pipe" onclick={handleAddPipe}>+ Add Pipe</button>

	<!-- ═══ [+] DROPDOWN MENU ═══ -->
	{#if showAddMenu && activePipeIdx !== null}
		<div class="dropdown-menu" style="left: {addMenuX}px; top: {addMenuY}px;">
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
		<div class="dropdown-menu tag-menu" style="left: {tagMenuX}px; top: {tagMenuY}px;">
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
{#if showKeyframeModal}
	<div class="modal-overlay" onclick={() => showKeyframeModal = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{editingKeyframeSlot ? 'Edit Keyframe' : 'Add Keyframe'} <span class="modal-sub">Slot {editingKeyframeSlot ?? '?'}</span></h3>
			</div>
			<div class="modal-body">
				<div class="mode-selector">
					<button class="mode-btn {kfType === 'url' ? 'active' : ''}" onclick={() => kfType = 'url'}>URL</button>
					<button class="mode-btn {kfType === 'txt2img' ? 'active' : ''}" onclick={() => kfType = 'txt2img'}>Txt2Img</button>
					<button class="mode-btn {kfType === 'img2img' ? 'active' : ''}" onclick={() => kfType = 'img2img'}>Img2Img</button>
				</div>
				<div class="modal-field">
					<label id="kf-frame-label">Frame</label>
					<input type="number" bind:value={kfFrame} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="kf-frame-label" />
				</div>
				{#if kfType === 'url'}
					<div class="modal-field">
						<label id="kf-url-label">Image URL</label>
						<input type="text" bind:value={kfValue} placeholder="https://..." class="modal-input" aria-labelledby="kf-url-label" />
					</div>
				{:else if kfType === 'txt2img'}
					<div class="modal-field">
						<label id="kf-prompt-label">Prompt</label>
						<textarea bind:value={kfValue} placeholder="Describe the image..." class="modal-textarea" aria-labelledby="kf-prompt-label"></textarea>
					</div>
				{:else if kfType === 'img2img'}
					<div class="modal-field">
						<label id="kf-img-url-label">Reference Image URL</label>
						<input type="text" bind:value={kfValue} placeholder="https://..." class="modal-input" aria-labelledby="kf-img-url-label" />
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => showKeyframeModal = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirmKeyframe} disabled={!kfValue.trim()}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<!-- ═══ SUBJECT REFERENCE MODAL ═══ -->
{#if showSubjectRefModal}
	<div class="modal-overlay" onclick={() => showSubjectRefModal = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{editingSubjectRefId ? 'Edit Subject Reference' : 'Add Subject Reference'}</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="sr-url-label">Image URL</label>
					<input type="text" bind:value={srImageUrl} placeholder="https://..." class="modal-input" aria-labelledby="sr-url-label" />
				</div>
				<div class="modal-field">
					<label>
						<input type="checkbox" bind:checked={srUseFrames} />
						Use frame range
					</label>
				</div>
				{#if srUseFrames}
					<div class="modal-field">
						<label id="sr-start-label">Start Frame</label>
						<input type="number" bind:value={srStart} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="sr-start-label" />
					</div>
					<div class="modal-field">
						<label id="sr-end-label">End Frame</label>
						<input type="number" bind:value={srEnd} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="sr-end-label" />
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => showSubjectRefModal = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirmSubjectRef} disabled={!srImageUrl.trim()}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<!-- ═══ SEGMENT MODAL ═══ -->
{#if showSegmentModal}
	<div class="modal-overlay" onclick={() => showSegmentModal = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Add Segment</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="seg-start-label">Start Frame</label>
					<input type="number" bind:value={segStart} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="seg-start-label" />
				</div>
				<div class="modal-field">
					<label id="seg-end-label">End Frame</label>
					<input type="number" bind:value={segEnd} step={8} min={0} max={totalFrames - 1} class="modal-input" aria-labelledby="seg-end-label" />
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => showSegmentModal = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirmSegment} disabled={Math.min(snapTo8(segEnd), totalFrames - 1) <= snapTo8(segStart)}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<!-- ═══ TAG PROMPT MODAL ═══ -->
{#if showTagPromptModal}
	<div class="modal-overlay" onclick={() => showTagPromptModal = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Edit Tag Prompt</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="tag-prompt-label">Prompt</label>
					<textarea bind:value={tagPrompt} placeholder="Enter tag prompt..." class="modal-textarea" aria-labelledby="tag-prompt-label"></textarea>
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => showTagPromptModal = false}>Cancel</button>
				<button class="btn-confirm" onclick={confirmTagPrompt}>Confirm</button>
			</div>
		</div>
	</div>
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
	}

	.kf-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		min-width: 80px;
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

	.ruler-wrap {
		position: relative;
		width: 100%;
	}

	.global-track {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: var(--bg-tertiary);
		border-radius: 6px;
	}

	.global-actions {
		display: flex;
		gap: 4px;
	}

	.timeline-track {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.segment-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		position: relative;
	}

	.seg-bar {
		position: relative;
		height: 32px;
		background: var(--bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
		cursor: pointer;
	}

	.thumb {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		background: var(--accent-color);
		cursor: ew-resize;
		opacity: 0.5;
		z-index: 2;
	}

	.thumb:hover,
	.thumb.left:active,
	.thumb.right:active {
		opacity: 1;
	}

	.thumb.left {
		left: 0;
		border-radius: 4px 0 0 4px;
	}

	.thumb.right {
		right: 0;
		border-radius: 0 4px 4px 0;
	}

	.thumb.small {
		width: 6px;
	}

	.seg-body {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--accent-color);
		opacity: 0.8;
		cursor: grab;
		display: flex;
		align-items: center;
		padding: 0 8px;
	}

	.seg-body:active {
		cursor: grabbing;
	}

	.seg-label {
		font-size: 11px;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tag-row {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.tag-track {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		position: relative;
	}

	.tag-bar {
		position: relative;
		height: 24px;
		background: var(--bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
		cursor: pointer;
		flex: 1;
	}

	.tag-body {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--tag-color, var(--accent-color));
		opacity: 0.7;
		cursor: grab;
		display: flex;
		align-items: center;
		padding: 0 6px;
		overflow: hidden;
	}

	.tag-body:active {
		cursor: grabbing;
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

	.tag-add-row {
		margin-top: 4px;
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

	.btn-del-tag {
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

	.seg-del {
		margin-top: 4px;
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

	.add-track-wrap {
		margin-top: 8px;
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

	/* Modal styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		width: 90%;
		max-width: 480px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.modal-header {
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-color);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.modal-sub {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-secondary);
	}

	.modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.modal-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.modal-field label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.modal-field input[type="text"],
	.modal-field input[type="number"],
	.modal-field textarea {
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 10px 12px;
		color: var(--text-primary);
		font-size: 14px;
		width: 100%;
	}

	.modal-field input:focus,
	.modal-field textarea:focus {
		outline: none;
		border-color: var(--accent-color);
	}

	.modal-field textarea {
		min-height: 100px;
		resize: vertical;
	}

	.modal-field input[type="checkbox"] {
		margin-right: 8px;
	}

	.modal-footer {
		padding: 16px 20px;
		border-top: 1px solid var(--border-color);
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.modal-footer .btn-confirm,
	.modal-footer .btn-cancel {
		padding: 10px 20px;
		border-radius: 6px;
		font-size: 13px;
		cursor: pointer;
		border: none;
	}

	.modal-footer .btn-confirm {
		background: var(--accent-color);
		color: white;
	}

	.modal-footer .btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-footer .btn-cancel {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-color);
	}

	.mode-selector {
		display: flex;
		gap: 8px;
	}

	.mode-btn {
		flex: 1;
		padding: 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 13px;
		transition: all 0.2s;
	}

	.mode-btn:hover {
		border-color: var(--accent-color);
		color: var(--text-primary);
	}

	.mode-btn.active {
		background: var(--accent-bg);
		border-color: var(--accent-color);
		color: var(--accent-color);
	}

	.full-width {
		width: 100%;
	}
</style>