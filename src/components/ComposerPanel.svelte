<script lang="ts">
	import type { SessionData, PipeRow, TagType, PipeKeyframe, TagElement, Segment, SubjectReference } from '$types';
	import { TAG_SPECIFICATIONS } from '$types';
	import FrameRuler from './FrameRuler.svelte';
	import MultiThumbSlider from './MultiThumbSlider.svelte';
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
	import { snapTo8, frameToPercent } from '$lib/frameMath';

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
	let dragState = $state<{
		type: 'segment' | 'tag';
		id: string;
		segmentId?: string;
		handle: 'left' | 'right' | 'body';
		startFrame: number;
		endFrame: number;
		mouseStartX: number;
		rulerWidth: number;
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

	// Drag listeners for segments and tags
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

	// Frame to percentage for rendering
	function frameToX(frame: number): number {
		return (frame / (totalFrames - 1)) * 100;
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
			result = await addSubjectRefAction(session.id, pipe.id, '', srImageUrl, srUseFrames ? srStart : undefined, srUseFrames ? srEnd : undefined);
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

	// ── Segment interactions ────────────────────────────────────────────────

	function handleSegmentPointerDown(e: MouseEvent, seg: Segment, handle: 'left' | 'right' | 'body') {
		e.preventDefault();
		e.stopPropagation();
		const ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
		if (!ruler) return;
		const rect = ruler.getBoundingClientRect();
		const startX = e.clientX;
		
		dragState = {
			type: 'segment',
			id: seg.id,
			segmentId: seg.id,
			handle,
			startFrame: seg.frameStart,
			endFrame: seg.frameEnd,
			mouseStartX: startX,
			rulerWidth: rect.width,
		};
	}

	function handlePointerMove(e: MouseEvent) {
		if (!dragState) return;
		e.preventDefault();
		
		const dx = e.clientX - dragState.mouseStartX;
		const percentDelta = (dx / dragState.rulerWidth) * 100;
		const frameDelta = Math.round((percentDelta / 100) * (totalFrames - 1));
		const snappedDelta = snapTo8(frameDelta);
		
		if (dragState.type === 'segment') {
			const start = dragState.startFrame;
			const end = dragState.endFrame;
			const duration = end - start;
			
			if (dragState.handle === 'body') {
				const newStart = snapTo8(Math.max(0, Math.min(start + snappedDelta, totalFrames - 1 - duration)));
				resizeSegmentAction(session!.id, pipes[activePipeIdx!].id, dragState.id, newStart, newStart + duration).catch(console.error);
			} else if (dragState.handle === 'left') {
				const newStart = snapTo8(Math.max(0, Math.min(start + snappedDelta, end - 8)));
				resizeSegmentAction(session!.id, pipes[activePipeIdx!].id, dragState.id, newStart, end).catch(console.error);
			} else {
				const newEnd = snapTo8(Math.min(totalFrames - 1, Math.max(start + 8, end + snappedDelta)));
				resizeSegmentAction(session!.id, pipes[activePipeIdx!].id, dragState.id, start, newEnd).catch(console.error);
			}
		} else if (dragState.type === 'tag') {
			const seg = getTimeline(pipes[activePipeIdx!])?.segments.find((s: Segment) => s.id === dragState.segmentId);
			if (!seg) return;
			const segStart = seg.frameStart;
			const segEnd = seg.frameEnd;
			const duration = dragState.endFrame - dragState.startFrame;
			
			if (dragState.handle === 'body') {
				const newStart = snapTo8(Math.max(segStart, Math.min(dragState.startFrame + snappedDelta, segEnd - duration)));
				resizeTagElementAction(session!.id, pipes[activePipeIdx!].id, dragState.segmentId, dragState.id, newStart, newStart + duration).catch(console.error);
			} else if (dragState.handle === 'left') {
				const newStart = snapTo8(Math.max(segStart, Math.min(dragState.startFrame + snappedDelta, dragState.endFrame - 8)));
				resizeTagElementAction(session!.id, pipes[activePipeIdx!].id, dragState.segmentId, dragState.id, newStart, dragState.endFrame).catch(console.error);
			} else {
				const newEnd = snapTo8(Math.min(segEnd, Math.max(dragState.startFrame + 8, dragState.endFrame + snappedDelta)));
				resizeTagElementAction(session!.id, pipes[activePipeIdx!].id, dragState.segmentId, dragState.id, dragState.startFrame, newEnd).catch(console.error);
			}
		}
	}

	function handlePointerUp() {
		dragState = null;
	}

	// ── Segment add ─────────────────────────────────────────────────────────

	function handleAddSegment(idx: number) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const tl = getTimeline(pipe);
		if (!tl) return;
		activePipeIdx = idx;
		const lastSeg = tl.segments[tl.segments.length - 1];
		segStart = lastSeg ? lastSeg.frameEnd : 0;
		segEnd = Math.min(segStart + 8, totalFrames - 1);
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
			<div class="ruler-wrap ruler-aligned">
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
							values={[global.frameStart ?? 0, global.frameEnd ?? totalFrames - 1]}
							min={0}
							max={totalFrames - 1}
							step={8}
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
										style={`left: ${frameToX(seg.frameStart)}%`}
										title="Drag to resize start">
									</div>
									<!-- Segment body -->
									<div 
										class="seg-body"
										onpointerdown={(e) => handleSegmentPointerDown(e, seg, 'body')}
										style={`left: ${frameToX(seg.frameStart)}%; width: ${frameToX(seg.frameEnd) - frameToX(seg.frameStart)}%`}>
										<span class="seg-label">{seg.frameStart}–{seg.frameEnd}</span>
									</div>
									<!-- Right thumb -->
									<div 
										class="thumb right"
										onpointerdown={(e) => handleSegmentPointerDown(e, seg, 'right')}
										style={`left: ${frameToX(seg.frameEnd)}%`}
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
														const ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
														if (ruler) {
															const rect = ruler.getBoundingClientRect();
															dragState = {
																type: 'tag',
																id: tag.id,
																segmentId: seg.id,
																handle: 'left',
																startFrame: tag.frameStart,
																endFrame: tag.frameEnd,
																mouseStartX: e.clientX,
																rulerWidth: rect.width,
															};
														}
													}}
													style={`left: ${frameToX(tag.frameStart)}%`}>
												</div>
												<!-- Tag body -->
												<div 
													class="tag-body"
													onpointerdown={(e) => {
														e.stopPropagation();
														const ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
														if (ruler) {
															const rect = ruler.getBoundingClientRect();
															dragState = {
																type: 'tag',
																id: tag.id,
																segmentId: seg.id,
																handle: 'body',
																startFrame: tag.frameStart,
																endFrame: tag.frameEnd,
																mouseStartX: e.clientX,
																rulerWidth: rect.width,
															};
														}
													}}
													style={`left: ${frameToX(tag.frameStart)}%; width: ${frameToX(tag.frameEnd) - frameToX(tag.frameStart)}%`}>
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
														const ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
														if (ruler) {
															const rect = ruler.getBoundingClientRect();
															dragState = {
																type: 'tag',
																id: tag.id,
																segmentId: seg.id,
																handle: 'right',
																startFrame: tag.frameStart,
																endFrame: tag.frameEnd,
																mouseStartX: e.clientX,
																rulerWidth: rect.width,
															};
														}
													}}
													style={`left: ${frameToX(tag.frameEnd)}%`}>
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
										onclick={(e) => handleOpenTagMenu(seg.id, e, pipeIdx)}
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

<!-- Document-wide pointer handlers for drag -->
<div 
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointerleave={handlePointerUp}
	style="position: fixed; inset: 0; pointer-events: none;"
	aria-hidden="true">
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
						<label id="kf-ref-label">Reference URL</label>
						<input type="text" bind:value={kfValue} placeholder="https://..." class="modal-input" aria-labelledby="kf-ref-label" />
					</div>
				{/if}
			</div>
			<div class="modal-actions">
				<button class="btn-confirm" onclick={confirmKeyframe}>Save</button>
				<button class="btn-cancel" onclick={() => showKeyframeModal = false}>Cancel</button>
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
						<input type="number" bind:value={srStart} step={8} min={0} max={totalFrames - 8} class="modal-input" aria-labelledby="sr-start-label" />
					</div>
					<div class="modal-field">
						<label id="sr-end-label">End Frame</label>
						<input type="number" bind:value={srEnd} step={8} min={srStart + 8} max={totalFrames - 1} class="modal-input" aria-labelledby="sr-end-label" />
					</div>
					<div class="modal-hint">
						Duration: {srEnd - srStart} frames ({((srEnd - srStart) / 24).toFixed(1)}s @ 24fps)
					</div>
				{/if}
			</div>
			<div class="modal-actions">
				<button class="btn-confirm" onclick={confirmSubjectRef}>Save</button>
				<button class="btn-cancel" onclick={() => showSubjectRefModal = false}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

<!-- ═══ SEGMENT MODAL ═══ -->
{#if showSegmentModal}
	<div class="modal-overlay" onclick={() => showSegmentModal = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Add Segment <span class="modal-sub">Frames {segStart}–{segEnd}</span></h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="seg-start-label">Start Frame</label>
					<input type="number" bind:value={segStart} step={8} min={0} max={totalFrames - 8} class="modal-input" aria-labelledby="seg-start-label" />
				</div>
				<div class="modal-field">
					<label id="seg-end-label">End Frame</label>
					<input type="number" bind:value={segEnd} step={8} min={segStart + 8} max={totalFrames - 1} class="modal-input" aria-labelledby="seg-end-label" />
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn-confirm" onclick={confirmSegment}>Save</button>
				<button class="btn-cancel" onclick={() => showSegmentModal = false}>Cancel</button>
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
					<textarea bind:value={tagPrompt} placeholder="Describe the tag's visual intent..." class="modal-textarea" aria-labelledby="tag-prompt-label"></textarea>
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn-confirm" onclick={confirmTagPrompt}>Save</button>
				<button class="btn-cancel" onclick={() => showTagPromptModal = false}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ── Main Panel ── */
	.composer-panel {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px;
		background: var(--bg-surface, #0f1117);
		border-right: 1px solid var(--border, #2a2d37);
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
	}

	/* ── Pipe ── */
	.pipe {
		background: var(--bg-elevated, #161820);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 4px;
		padding: 10px;
		position: relative;
	}

	.pipe.active {
		border-color: var(--accent, #59b5ff);
		box-shadow: 0 0 0 1px var(--accent, #59b5ff);
	}

	/* ── Pipe Header ── */
	.pipe-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border, #2a2d37);
	}

	.pipe-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-primary, #c8d0e0);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.pipe-meta {
		font-size: 10px;
		color: var(--text-secondary, #6e7681);
		margin-left: auto;
	}

	/* ── Row Group ── */
	.row-group {
		margin-bottom: 8px;
	}

	.row-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
		padding-left: 2px;
	}

	.row-label {
		font-size: 9px;
		font-weight: 600;
		color: var(--text-muted, #4a5060);
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}

	.row-count {
		font-size: 9px;
		color: var(--text-secondary, #6e7681);
		margin-left: auto;
	}

	/* ── Keyframe Row ── */
	.kf-row {
		display: flex;
		gap: 6px;
		align-items: center;
		padding: 6px 2px;
		background: var(--bg-muted, #1a1d26);
		border-radius: 3px;
		border: 1px solid var(--border, #2a2d37);
	}

	.kf-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.12s;
		position: relative;
		user-select: none;
	}

	.kf-chip.kf-filled {
		background: var(--accent-light, rgba(89, 181, 255, 0.15));
		border: 1px solid var(--accent, #59b5ff);
	}

	.kf-chip.kf-filled:hover {
		background: var(--accent-light, rgba(89, 181, 255, 0.25));
	}

	.kf-chip.kf-empty {
		background: transparent;
		border: 1px dashed var(--border, #2a2d37);
		color: var(--text-muted, #4a5060);
	}

	.kf-chip.kf-empty:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	.kf-img {
		width: 20px;
		height: 20px;
		object-fit: cover;
		border-radius: 2px;
	}

	.kf-label {
		font-size: 10px;
		font-weight: 600;
		color: var(--accent, #59b5ff);
	}

	.kf-empty-label {
		font-size: 10px;
		color: var(--text-muted, #4a5060);
	}

	.kf-del {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--text-muted, #4a5060);
		cursor: pointer;
		font-size: 12px;
		line-height: 1;
		border-radius: 2px;
		opacity: 0;
		transition: opacity 0.12s;
	}

	.kf-chip:hover .kf-del {
		opacity: 1;
	}

	.kf-del:hover {
		background: rgba(255, 89, 89, 0.2);
		color: #ff5959;
	}

	/* ── Subject Reference Row ── */
	.sr-row {
		display: flex;
		gap: 6px;
		align-items: center;
		padding: 6px 2px;
		background: var(--bg-muted, #1a1d26);
		border-radius: 3px;
		border: 1px solid var(--border, #2a2d37);
	}

	.sr-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		border-radius: 3px;
		background: var(--bg-elevated, #161820);
		border: 1px solid var(--border, #2a2d37);
		cursor: pointer;
		transition: all 0.12s;
	}

	.sr-chip:hover {
		border-color: var(--accent, #59b5ff);
	}

	.sr-eye {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		background: transparent;
		border: none;
		color: var(--text-muted, #4a5060);
		cursor: pointer;
		padding: 0;
	}

	.sr-eye:hover {
		color: var(--accent, #59b5ff);
	}

	.sr-img {
		width: 20px;
		height: 20px;
		object-fit: cover;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.sr-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent, #59b5ff);
		flex-shrink: 0;
	}

	.sr-label {
		font-size: 9px;
		color: var(--text-secondary, #6e7681);
	}

	.sr-range {
		font-size: 9px;
		color: var(--text-secondary, #6e7681);
	}

	.sr-del {
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--text-muted, #4a5060);
		cursor: pointer;
		font-size: 12px;
		line-height: 1;
		border-radius: 2px;
		opacity: 0;
		transition: opacity 0.12s;
	}

	.sr-chip:hover .sr-del {
		opacity: 1;
	}

	.sr-del:hover {
		background: rgba(255, 89, 89, 0.2);
		color: #ff5959;
	}

	.sr-add {
		padding: 3px 8px;
		background: transparent;
		border: 1px dashed var(--border, #2a2d37);
		border-radius: 3px;
		color: var(--text-muted, #4a5060);
		font-size: 10px;
		cursor: pointer;
		transition: all 0.12s;
	}

	.sr-add:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	/* ── Frame Ruler ── */
	.ruler-wrap {
		margin: 8px 0;
	}

	/* Shared alignment for ruler-aligned elements */
	.ruler-aligned {
		position: relative;
		width: 100%;
	}

	/* ── Global Track ── */
	.global-track {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 0;
		border-top: 1px solid var(--border, #2a2d37);
		border-bottom: 1px solid var(--border, #2a2d37);
		margin: 8px 0;
	}

	.global-actions {
		display: flex;
		gap: 4px;
		justify-content: flex-end;
	}

	/* ── Timeline Track ── */
	.timeline-track {
		padding: 8px 0;
		border-top: 1px solid var(--border, #2a2d37);
		margin: 8px 0;
	}

	.segment-row {
		position: relative;
		margin-bottom: 4px;
	}

	/* Segment bar - full width aligned with ruler */
	.seg-bar {
		position: relative;
		height: 28px;
		background: var(--bg-muted, #1a1d26);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 2px;
		overflow: visible;
	}

	/* Segment body - positioned absolutely within seg-bar */
	.seg-body {
		position: absolute;
		top: 2px;
		bottom: 2px;
		background: var(--accent, #59b5ff);
		border-radius: 2px;
		cursor: move;
		display: flex;
		align-items: center;
		padding: 0 8px;
		min-width: 24px;
		opacity: 0.7;
		transition: opacity 0.12s;
	}

	.seg-body:hover {
		opacity: 1;
	}

	.seg-label {
		font-size: 9px;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.7);
		white-space: nowrap;
	}

	/* Segment thumbs */
	.thumb {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 8px;
		background: var(--accent, #59b5ff);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 1px;
		cursor: ew-resize;
		z-index: 2;
	}

	.thumb.left {
		left: 0;
		border-radius: 2px 0 0 2px;
	}

	.thumb.right {
		right: 0;
		border-radius: 0 2px 2px 0;
	}

	.thumb.small {
		width: 6px;
		background: currentColor;
		opacity: 0.6;
	}

	/* ── Tag Rows ── */
	.tag-row {
		position: relative;
		height: 20px;
		margin-top: 2px;
	}

	.tag-track {
		position: relative;
		height: 100%;
	}

	.tag-bar {
		position: absolute;
		top: 2px;
		bottom: 2px;
		border-radius: 2px;
		cursor: pointer;
		display: flex;
		align-items: center;
		overflow: hidden;
		min-width: 20px;
		transition: opacity 0.12s;
	}

	.tag-bar:hover {
		opacity: 0.85;
	}

	.tag-body {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		padding: 0 6px;
		gap: 4px;
		min-width: 20px;
		cursor: move;
	}

	.tag-name {
		font-size: 8px;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.8);
		white-space: nowrap;
	}

	.tag-prompt {
		font-size: 7px;
		color: rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Add Tag Row ── */
	.tag-add-row {
		position: relative;
		height: 16px;
		margin-top: 2px;
	}

	.btn-add-tag {
		position: absolute;
		left: 0;
		top: 0;
		padding: 2px 6px;
		background: transparent;
		border: 1px dashed var(--border, #2a2d37);
		border-radius: 2px;
		color: var(--text-muted, #4a5060);
		font-size: 8px;
		cursor: pointer;
		transition: all 0.12s;
	}

	.btn-add-tag:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	/* ── Delete buttons ── */
	.btn-del-tag {
		position: absolute;
		right: 2px;
		top: 50%;
		transform: translateY(-50%);
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--text-muted, #4a5060);
		cursor: pointer;
		font-size: 10px;
		opacity: 0;
		transition: opacity 0.12s;
		border-radius: 2px;
	}

	.tag-row:hover .btn-del-tag {
		opacity: 1;
	}

	.btn-del-tag:hover {
		background: rgba(255, 89, 89, 0.2);
		color: #ff5959;
	}

	.seg-del {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		opacity: 0;
	}

	.segment-row:hover .seg-del {
		opacity: 1;
	}

	/* ── Empty State ── */
	.seg-empty {
		padding: 8px;
		text-align: center;
		background: var(--bg-muted, #1a1d26);
		border: 1px dashed var(--border, #2a2d37);
		border-radius: 2px;
		color: var(--text-muted, #4a5060);
		font-size: 10px;
		cursor: pointer;
		transition: all 0.12s;
		width: 100%;
		box-sizing: border-box;
	}

	.seg-empty:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	/* ── Controls ── */
	.btn-icon-sm {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border, #2a2d37);
		border-radius: 2px;
		color: var(--text-muted, #4a5060);
		cursor: pointer;
		font-size: 12px;
		line-height: 1;
		transition: all 0.12s;
	}

	.btn-icon-sm:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	.btn-icon-sm.btn-del-sm:hover {
		border-color: #ff5959;
		color: #ff5959;
		background: rgba(255, 89, 89, 0.1);
	}

	.btn-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border, #2a2d37);
		border-radius: 3px;
		color: var(--text-muted, #4a5060);
		font-size: 14px;
		cursor: pointer;
		transition: all 0.12s;
		line-height: 1;
	}

	.btn-icon:hover {
		border-color: #ff5959;
		color: #ff5959;
		background: rgba(255, 89, 89, 0.1);
	}

	/* ── Add Track Button ── */
	.add-track-wrap {
		margin-top: 8px;
		display: flex;
		justify-content: center;
	}

	.btn-add-track {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-muted, #1a1d26);
		border: 1px dashed var(--border, #2a2d37);
		border-radius: 4px;
		color: var(--text-muted, #4a5060);
		font-size: 16px;
		cursor: pointer;
		transition: all 0.12s;
	}

	.btn-add-track:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
		background: var(--accent-light, rgba(89, 181, 255, 0.1));
	}

	/* ── Add Pipe Button ── */
	.btn-add-pipe {
		width: 100%;
		padding: 10px;
		background: transparent;
		border: 1px dashed var(--border, #2a2d37);
		border-radius: 4px;
		color: var(--text-muted, #4a5060);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.12s;
		margin-top: 8px;
	}

	.btn-add-pipe:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	/* ── Dropdown Menu ── */
	.dropdown-menu {
		position: fixed;
		background: var(--bg-elevated, #161820);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 4px;
		padding: 4px;
		min-width: 120px;
		z-index: 1000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: none;
		border-radius: 2px;
		color: var(--text-primary, #c8d0e0);
		font-size: 11px;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s;
	}

	.dropdown-item:hover {
		background: var(--bg-muted, #1a1d26);
	}

	.dropdown-item.active {
		background: var(--accent-light, rgba(89, 181, 255, 0.15));
		color: var(--accent, #59b5ff);
	}

	.dropdown-icon {
		font-size: 10px;
		color: var(--text-muted, #4a5060);
	}

	.dropdown-label {
		font-size: 9px;
		font-weight: 600;
		color: var(--text-muted, #4a5060);
		text-transform: uppercase;
		letter-spacing: 0.8px;
		padding: 4px 10px 2px;
	}

	.tag-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tag-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dropdown-actions {
		display: flex;
		gap: 4px;
		padding: 4px;
		margin-top: 4px;
		border-top: 1px solid var(--border, #2a2d37);
	}

	/* ── Modal ── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		backdrop-filter: blur(2px);
	}

	.modal {
		background: var(--bg-surface, #0f1117);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 6px;
		min-width: 320px;
		max-width: 420px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border, #2a2d37);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary, #c8d0e0);
	}

	.modal-sub {
		font-weight: 400;
		color: var(--text-secondary, #6e7681);
		margin-left: 6px;
	}

	.modal-body {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.mode-selector {
		display: flex;
		gap: 4px;
	}

	.mode-btn {
		flex: 1;
		padding: 6px 10px;
		background: var(--bg-muted, #1a1d26);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 3px;
		color: var(--text-secondary, #6e7681);
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.mode-btn:hover {
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	.mode-btn.active {
		background: var(--accent-light, rgba(89, 181, 255, 0.15));
		border-color: var(--accent, #59b5ff);
		color: var(--accent, #59b5ff);
	}

	.modal-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.modal-field label {
		font-size: 9px;
		font-weight: 600;
		color: var(--text-muted, #4a5060);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.modal-input {
		padding: 8px 10px;
		background: var(--bg-muted, #1a1d26);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 3px;
		color: var(--text-primary, #c8d0e0);
		font-size: 12px;
		outline: none;
		transition: border-color 0.12s;
	}

	.modal-input:focus {
		border-color: var(--accent, #59b5ff);
	}

	.modal-textarea {
		padding: 8px 10px;
		background: var(--bg-muted, #1a1d26);
		border: 1px solid var(--border, #2a2d37);
		border-radius: 3px;
		color: var(--text-primary, #c8d0e0);
		font-size: 12px;
		font-family: inherit;
		resize: vertical;
		min-height: 80px;
		outline: none;
		transition: border-color 0.12s;
	}

	.modal-textarea:focus {
		border-color: var(--accent, #59b5ff);
	}

	.modal-hint {
		font-size: 9px;
		color: var(--text-secondary, #6e7681);
		padding: 6px 8px;
		background: var(--bg-muted, #1a1d26);
		border-radius: 3px;
	}

	.modal-actions {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid var(--border, #2a2d37);
		justify-content: flex-end;
	}

	.btn-confirm, .btn-cancel {
		padding: 6px 14px;
		border-radius: 3px;
		font-size: 11px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.btn-confirm {
		background: var(--accent, #59b5ff);
		border: 1px solid var(--accent, #59b5ff);
		color: #000;
	}

	.btn-confirm:hover:not(:disabled) {
		background: #7ac4ff;
		border-color: #7ac4ff;
	}

	.btn-confirm:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid var(--border, #2a2d37);
		color: var(--text-secondary, #6e7681);
	}

	.btn-cancel:hover {
		border-color: var(--text-muted, #4a5060);
		color: var(--text-primary, #c8d0e0);
	}
</style>
