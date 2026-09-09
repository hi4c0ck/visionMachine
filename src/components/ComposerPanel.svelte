<script lang="ts">
	import type { SessionData, PipeRow, TagType, PipeKeyframe, TagElement, Segment } from '$types';
	import KeyframeModal from './ComposerModals/KeyframeModal.svelte';
	import SubjectRefModal from './ComposerModals/SubjectRefModal.svelte';
	import SegmentModal from './ComposerModals/SegmentModal.svelte';
	import TagPromptModal from './ComposerModals/TagPromptModal.svelte';
	import AddTrackMenu from './ComposerMenus/AddTrackMenu.svelte';
	import TagSelectorMenu from './ComposerMenus/TagSelectorMenu.svelte';
	import PipeHeader from './ComposerRows/PipeHeader.svelte';
	import KeyframesRow from './ComposerRows/KeyframesRow.svelte';
	import SubjectRefsRow from './ComposerRows/SubjectRefsRow.svelte';
	import TimelineSection from './ComposerTimeline/TimelineSection.svelte';
	import { getNextAvailableRange } from '$lib/frameMath';
	import { getVisibleKeyframeSlots } from '$lib/keyframeSlots';
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

	// Tag selector menu — selection state now lives in TagSelectorMenu
	let showTagMenu = $state(false);
	let selectedSegmentId = $state<string>('');
	let tagMenuX = $state(0);
	let tagMenuY = $state(0);

	// Close menus on outside click (drag engine state now lives in TimelineSection)
	$effect(() => {
		function handler() {
			showAddMenu = false;
			showTagMenu = false;
		}
		document.addEventListener('click', handler);
		return () => document.removeEventListener('click', handler);
	});

	// ── Helpers ─────────────────────────────────────────────────────────────
	// Keyframe-row display slots come from $lib/keyframeSlots (single source
	// of truth, shared with KeyframesRow). openKeyframeModal uses it to
	// compute the default next slot.

	function getTimeline(pipe: PipeRow): any {
		return pipe.elements.find((e: any) => e.tag === 'timeline') ?? null;
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
		editingKeyframeSlot = slotIndex ?? (getVisibleKeyframeSlots(pipe, MAX_KEYFRAMES).length + 1);
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
			// Clamp into the viewport: cap the right edge, and if the menu
			// would overflow the bottom, flip it above the trigger button.
			// magic numbers: track menu height 96px / width cap 180 — revisit
			// if AddTrackMenu content changes.
			const MENU_H = 96;
			addMenuX = Math.max(8, Math.min(rect.left, window.innerWidth - 180));
			let y = rect.bottom + 4;
			if (y + MENU_H > window.innerHeight) {
				y = Math.max(8, rect.top - MENU_H - 4);
			}
			addMenuY = y;
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
		// Global spans the full length of THIS pipe (its own frame space).
		addGlobalElementAction(session.id, pipe.id, 0, pipe.lengthFrames - 1).then(r => {
			if (r.errors?.length) console.error('[ComposerPanel] addGlobal:', r.errors);
		});
		showAddMenu = false;
	}

	// Drag engine + geometry moved to TimelineSection (owns the coordinate
	// canvas, ResizeObserver, and temporal drag state).

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
			// Clamp to THIS pipe's frame space, not the active pipe's.
			segEnd = Math.min(segStart + 8, pipe.lengthFrames - 1);
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
		// Clamp the tag menu into the viewport (menu is ~360px tall)
		const MENU_H = 360;
		tagMenuX = Math.max(8, Math.min(e.clientX, window.innerWidth - 200));
		let y = e.clientY;
		if (y + MENU_H > window.innerHeight) {
			y = Math.max(8, e.clientY - MENU_H);
		}
		tagMenuY = y;
		showTagMenu = true;
		showAddMenu = false;
	}

	// TagSelectorMenu calls back with the chosen tag type
	async function confirmTagSelector(tagType: TagType) {
		if (!session?.id) return;
		const pipe = pipes[activePipeIdx!];
		if (!pipe) return;
		const tl = getTimeline(pipe);
		if (!tl) return;
		const seg = tl.segments.find((s: Segment) => s.id === selectedSegmentId);
		if (!seg) return;
		const result = await addTagElementAction(session.id, pipe.id, selectedSegmentId, tagType);
		if (result.errors.length > 0) {
			console.error('[ComposerPanel] addTag:', result.errors);
			return;
		}
		showTagMenu = false;
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
			<PipeHeader
				{pipe}
				idx={pipeIdx}
				pipeCount={pipes.length}
				onMove={(dir) => handleMovePipe(pipeIdx, dir)}
				onDuplicate={() => handleDuplicatePipe(pipeIdx)}
				onRemove={() => handleRemovePipe(pipeIdx)}
				onLengthChange={(raw) => handlePipeLengthChange(pipeIdx, raw)}
			/>

			<!-- ═══ KEYFRAME ROW ═══ -->
			<KeyframesRow
				{pipe}
				maxKeyframes={MAX_KEYFRAMES}
				onEditSlot={(slotIndex) => openKeyframeModal(pipeIdx, slotIndex)}
				onRemoveKeyframe={(kfId) => handleRemoveKeyframe(pipeIdx, kfId)}
			/>

			<!-- ═══ SUBJECT REFERENCES ROW ═══ -->
			<SubjectRefsRow
				{pipe}
				maxSubjectRefs={MAX_SUBJECT_REFS}
				onToggle={(refId) => handleToggleSubjectRef(pipeIdx, refId)}
				onRemove={(refId) => handleRemoveSubjectRef(pipeIdx, refId)}
				onAdd={() => openSubjectRefModal(pipeIdx)}
			/>

			<!-- ═══ TIMELINE AREA ═══ (single coordinate canvas — now in TimelineSection) ═══ -->
			<TimelineSection
				{pipe}
				sessionId={session?.id}
				{selectedFrame}
				onFrameChange={(f) => onframechange?.(f)}
				onAddTrack={(e) => handleToggleAddMenu(pipeIdx, e)}
				onToggleGlobal={(globalId) => handleToggleGlobal(pipeIdx, globalId)}
				onRemoveGlobal={(globalId) => handleRemoveGlobal(pipeIdx, globalId)}
				onAddSegment={() => handleAddSegment(pipeIdx)}
				onDeleteSegment={(segId) => handleDeleteSegment(pipeIdx, segId)}
				onOpenTagMenu={(segId, e) => handleOpenTagMenu(segId, e, pipeIdx)}
				onRemoveTag={(segId, tagId) => handleRemoveTag(pipeIdx, segId, tagId)}
				onEditTagPrompt={(seg, tag) => handleEditTagPrompt(pipeIdx, seg, tag)}
			/>

				</div>
				{/each}

				<!-- ═══ ADD PIPE ═══ -->
	<button class="btn-add-pipe" onclick={handleAddPipe}>+ Add Pipe</button>

	<!-- ═══ [+] DROPDOWN MENU ═══ -->
	<AddTrackMenu
		open={showAddMenu}
		x={addMenuX}
		y={addMenuY}
		onAddTimeline={() => activePipeIdx !== null && handleAddTimeline(activePipeIdx)}
		onAddGlobal={() => activePipeIdx !== null && handleAddGlobal(activePipeIdx)}
	/>

	<!-- ═══ TAG SELECTOR DROPDOWN ═══ -->
	<TagSelectorMenu
		open={showTagMenu}
		x={tagMenuX}
		y={tagMenuY}
		onConfirm={(t) => confirmTagSelector(t)}
		onClose={() => closeMenus()}
	/>
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

	/* Base styles — the panel is now an orchestrator: pipe layout + Add-Pipe button.

       Pipe-header, keyframes, subject-refs, and timeline styles live in

       ComposerRows/* and ComposerTimeline/TimelineSection.svelte. */

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



	.btn-add-pipe {

		background: var(--bg-tertiary);

		border: 1px dashed var(--border-color);

		color: var(--text-secondary);

		cursor: pointer;

		padding: 6px 12px;

		border-radius: 6px;

		font-size: 12px;

		transition: all 0.2s;

		align-self: flex-start;

	}



	.btn-add-pipe:hover {

		border-color: var(--accent-color);

		color: var(--accent-color);

	}

</style>
