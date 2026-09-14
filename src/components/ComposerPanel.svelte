<script lang="ts">
	import type { SessionData, PipeRow, TagType, PipeKeyframe, TagElement, Segment, ComposerFocus } from '$types';
	import KeyframeModal from './ComposerModals/KeyframeModal.svelte';
	import SubjectRefModal from './ComposerModals/SubjectRefModal.svelte';
	import SegmentModal from './ComposerModals/SegmentModal.svelte';
	import PipeLengthModal from './ComposerModals/PipeLengthModal.svelte';
	import TagPromptModal from './ComposerModals/TagPromptModal.svelte';
	import AddTrackMenu from './ComposerMenus/AddTrackMenu.svelte';
	import TagSelectorMenu from './ComposerMenus/TagSelectorMenu.svelte';
	import PipeHeader from './ComposerRows/PipeHeader.svelte';
	import KeyframesRow from './ComposerRows/KeyframesRow.svelte';
	import SubjectRefsRow from './ComposerRows/SubjectRefsRow.svelte';
	import TimelineSection from './ComposerTimeline/TimelineSection.svelte';
	import { getFreeGaps, getMaxFrames, type FreeGap } from '$lib/frameMath';
	import { getVisibleKeyframeSlots } from '$lib/keyframeSlots';
	import type { ComposerUiVariant } from '$lib/composerUiVariant';
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
			focus = $bindable({ level: 'project' } as ComposerFocus),
			onframechange,
			uiVariant = 'fixed',
			brokenRefs,
			onRefSaved,
		} = $props<{
			session?: SessionData;
			totalFrames?: number;
			selectedFrame?: number;
			activePipeIdx?: number | null;
			/** Context-sensitive tool-panel focus. The panel is the source of
			 * truth for what the user has selected in the composer; the tool
			 * panel renders one inspector per level. */
			focus?: ComposerFocus;
			onframechange?: (frame: number) => void;
			/** A/B presentation variant — same store/services/geometry, two
			 *  layouts. 'fixed' = tabbed Keyframes⇄SubjectRefs aux panel +
			 *  live drag-following frame pin. 'current' = the existing rows. */
			uiVariant?: ComposerUiVariant;
			/** Broken reference ids (D5), keyed `${pipeId}:${refId}` — chips are red-out. */
			brokenRefs?: Set<string>;
			/** A keyframe/subject reference was just saved → re-validate its URL. */
			onRefSaved?: (pipeId: string, refId: string) => void;
		}>();

	const MAX_KEYFRAMES = 3;
	const MAX_SUBJECT_REFS = 5;
	const DEFAULT_FRAME_COUNT = 241;

	// ── Derived state ──────────────────────────────────────────────────────────
	let pipes = $derived(session?.pipes ?? []);
	// Resolution cap (8n+1) the pipe length can grow to.
	let maxPipeFrames = $derived(getMaxFrames(session?.resolution ?? '720p'));
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

	// ── Focus for the context-sensitive tool panel ─────────────────────────
	// The panel is the source of truth for composer selection. Pipe selection
	// (clicking a pipe, opening any of its modals/menus) focuses that pipe;
	// while a tag-prompt edit is in flight the focus refines to that tag.
	// Segment-level focus happens on segment add/edit (SegmentModal open).
	$effect(() => {
		if (activePipeIdx === null) {
			focus = { level: 'session', id: session?.id ?? '' };
			return;
		}
		const pipe = pipes[activePipeIdx];
		if (!pipe) {
			focus = { level: 'session', id: session?.id ?? '' };
			return;
		}
		if (showTagPromptModal && editingTagId) {
			focus = { level: 'tag', pipeId: pipe.id, segmentId: editingSegmentId, tagId: editingTagId };
		} else if (showSegmentModal) {
			// Segment being created — focus the segment level so the inspector
			// shows pipe + segment context while the modal is up.
			focus = { level: 'pipe', pipeId: pipe.id };
		} else {
			focus = { level: 'pipe', pipeId: pipe.id };
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
	// Free gaps the "+ Zone" modal can target — a zone may be placed in any of
	// them (before/between/after existing zones), not just the first one.
	let segGaps = $state<FreeGap[]>([]);

	// Pipe length editor modal (frames ↔ seconds, with trim preview).
	let showPipeLengthModal = $state(false);
	// Live preview of what would be trimmed when the pipe shrinks to
	// `pendingPipeLength` (recomputed as the user types in the modal).
	let pendingPipeLength = $state(0);
	let pendingPipeIdx = $state(0);

	// Derived: zones/tags that would be trimmed (fully or partially
	// clipped) when committing the pending length. Empty when growing.
	let trimPreview = $derived.by(() => {
		const pipe = pipes[pendingPipeIdx];
		const empty = { trimmedZones: 0, trimmedTags: 0, lostZoneLabels: [] as string[], lostTagLabels: [] as string[] };
		if (!pipe || pendingPipeLength >= pipe.lengthFrames) return empty;
		const newMaxEnd = pendingPipeLength - 1;
		const tl = getTimeline(pipe);
		let trimmedZones = 0;
		let trimmedTags = 0;
		const lostZoneLabels: string[] = [];
		const lostTagLabels: string[] = [];
		const segs = (tl?.segments ?? []) as Segment[];
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			// Zone fully past the new end → removed with all its tags.
			if (seg.frameStart > newMaxEnd) {
				lostZoneLabels.push(`Zone ${i + 1} (${seg.frameStart}–${seg.frameEnd})`);
				trimmedZones++;
				trimmedTags += seg.tags.length;
				lostTagLabels.push(...seg.tags.map((t) => t.tag));
				continue;
			}
			// Zone extending past the new end → trimmed down (partially trimmed).
			if (seg.frameEnd > newMaxEnd) {
				trimmedZones++;
			}
			for (const tag of seg.tags) {
				if (tag.frameStart > newMaxEnd) {
					trimmedTags++;
					lostTagLabels.push(`${tag.tag} (${tag.frameStart}–${tag.frameEnd})`);
				} else if (tag.frameEnd > newMaxEnd) {
					trimmedTags++;
				}
			}
		}
		return { trimmedZones, trimmedTags, lostZoneLabels, lostTagLabels };
	});

	// Tag prompt modal
	let showTagPromptModal = $state(false);
	let editingTagId = $state<string>('');
	let editingSegmentId = $state<string>('');
	let tagPrompt = $state('');

	// [+] menu
	let showAddMenu = $state(false);
	let addMenuX = $state(0);
	let addMenuY = $state(0);

	// Variant B (fixed) aux-panel UI state ────────────────────────────────
	// Keyframes and Subject Refs are EXCLUSIVE disclosure panels (one shown,
	// the other hidden — not two independent expandable rows); each also has
	// its own independent collapse state, so switching tabs does not destroy
	// the other's disclosure state. Single panel-level set (shared across
	// visible pipes, reset on session/pipe-list change) — the panel is the
	// source of truth, the aux panel just reads it.
	let activeAuxPanel = $state<'keyframes' | 'subjects'>('keyframes');
	let keyframesCollapsed = $state(false);
	let subjectsCollapsed = $state(false);
	let auxTrackedPipeId = $state('');

	// Reset when the *first* pipe changes — a session-switch or pipe-list
	// swap is the moment the disclosure context becomes stale. Per-pipe
	// state (like TimelineSection's own) would be over-engineering here
	// because the panel is shared across all visible pipes.
	$effect(() => {
		const firstPipeId = pipes[0]?.id ?? '';
		if (firstPipeId !== auxTrackedPipeId) {
			auxTrackedPipeId = firstPipeId;
			activeAuxPanel = 'keyframes';
			keyframesCollapsed = false;
			subjectsCollapsed = false;
		}
	});

	// Per-pipe [+] visibility: hide the button when the pipe already owns BOTH
	// addable track types (Timeline + Global) — the menu would be empty.
	const hasTimeline = (p: PipeRow): boolean =>
		p.elements.some((e: any) => e.tag === 'timeline');
	const hasGlobal = (p: PipeRow): boolean =>
		p.elements.some((e: any) => e.tag === 'global_style');
	function showAddTrackButton(p: PipeRow): boolean {
		return !hasTimeline(p) || !hasGlobal(p);
	}

	// Tag selector menu — selection state now lives in TagSelectorMenu
	let showTagMenu = $state(false);
	let selectedSegmentId = $state<string>('');
	let tagMenuX = $state(0);
	let tagMenuY = $state(0);
	// Bumped on every menu open so the menu re-seeds to the INVOKING zone each
	// time (a fresh menu, not a sticky zone choice from the previous open).
	let tagMenuVersion = $state(0);

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

	// Pipe length editor modal — the modal is the primary precise path
	// (frames ↔ seconds + trim warnings); the quick input in the header
	// (handlePipeLengthChange) stays as a fast, no-questions set.
	function openPipeLengthModal(idx: number) {
		const pipe = pipes[idx];
		if (!pipe) return;
		pendingPipeIdx = idx;
		pendingPipeLength = pipe.lengthFrames;
		showPipeLengthModal = true;
		closeMenus();
	}

	// The modal fires this on every pending-frames change so the panel can
	// recompute the live trim preview (zones/tags that would be clipped).
	function handlePipeLengthPreview(frames: number) {
		pendingPipeLength = frames;
	}

	async function confirmPipeLength(frames: number) {
		const pipe = pipes[pendingPipeIdx];
		if (!pipe || !session?.id) return;
		const result = await setPipeLengthAction(session.id, pipe.id, frames);
		if (result.errors.length > 0) {
			flashToast(`Failed to set pipe length: ${result.errors.join(', ')}`);
			return;
		}
		if (result.warnings && result.warnings.length > 0) {
			flashToast(result.warnings.join(' '), 'info');
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

		// Enumerate EVERY free gap (before/between/after zones) that can host a
		// new zone. The modal lets the user pick one, so a zone can be inserted
		// anywhere allowed — not just the first gap the old append found.
		const gaps = getFreeGaps(tl?.segments ?? [], pipe.lengthFrames, 8);
		if (gaps.length === 0) {
			// Pipe fully packed: no free space fits the minimum 8-frame span.
			// Opening the modal here would leave no place to put a zone, so
			// surface the reason instead of a dead confirm.
			flashToast('No free space for a new segment — shrink an existing segment first');
			closeMenus();
			return;
		}
		segGaps = gaps;
		// Default to the first gap (before Zone 1, or between zones if leading
		// space is gone) so the modal opens with a confirmable prefill. The
		// end frame defaults to the maximum available in the chosen gap —
		// filling it is the common intent — rather than a bare min span.
		segStart = gaps[0].start;
		segEnd = gaps[0].end;
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
		// Clamp the tag menu into the viewport. The menu is tall (zone picker +
		// 7 tag types + actions) and the "+ Tag" button sits low on the page,
		// so open it *upward* when there isn't room below. Cap the menu height
		// (and make it scrollable) so the Add button is never below the fold.
		const MENU_H = 360;
		const menuTop = e.clientY + 8;
		const fitsBelow = menuTop + MENU_H <= window.innerHeight - 8;
		const fitsAbove = e.clientY - MENU_H >= 8;
		let y = menuTop;
		if (!fitsBelow) {
			// Prefer opening upward; if even that overflows the top, anchor to
			// the top of the viewport so the menu (now scrollable) stays in view.
			y = fitsAbove ? e.clientY - MENU_H : 8;
		}
		tagMenuX = Math.max(8, Math.min(e.clientX, window.innerWidth - 200));
		tagMenuY = y;
		// Clamp the menu BOTTOM into the viewport: the real menu is ~468px tall
		// (zone picker + 7 tag types + New segment + Add/Cancel), not the 360px
		// constant above. Without this the Add row lands below the fold when the
		// menu is anchored low (e.g. from a high zone row with 2+ zones).
		tagMenuY = Math.min(tagMenuY, Math.max(8, window.innerHeight - 480));
		tagMenuVersion++;
		showTagMenu = true;
		showAddMenu = false;
	}

	// Tag types already declared on the menu's target zone — passed to the
	// menu so it can grey them out (choice A). Derived per target zone, not
	// global, so each zone's own state drives its menu.
	let tagMenuDeclaredTypes = $derived.by(() => {
		const pipe = activePipeIdx !== null ? pipes[activePipeIdx] : undefined;
		if (!pipe) return [];
		const tl = getTimeline(pipe);
		const seg = (tl?.segments ?? []).find((s: Segment) => s.id === selectedSegmentId);
		if (!seg) return [];
		return seg.tags.map((t: TagElement) => t.tag);
	});

	// Zones the tag menu can attach to (one entry per existing zone).
	// Derived, so it stays current when zones are added/removed.
	let tagMenuSegments = $derived.by(() => {
		if (activePipeIdx === null) return [];
		const tl = getTimeline(pipes[activePipeIdx]);
		return (tl?.segments ?? []).map((s: Segment, i: number) => ({ id: s.id, index: i + 1 }));
	});

	// TagSelectorMenu calls back with the chosen tag type + target zone
	async function confirmTagSelector(tagType: TagType, segId: string) {
		if (!session?.id) return;
		const pipe = pipes[activePipeIdx!];
		if (!pipe) return;
		const tl = getTimeline(pipe);
		if (!tl) return;
		const seg = tl.segments.find((s: Segment) => s.id === segId);
		if (!seg) return;
		const result = await addTagElementAction(session.id, pipe.id, segId, tagType);
		if (result.errors.length > 0) {
			// "No free slot…" from the store: surface it instead of failing
			// silently, so the user knows to shrink an existing tag first.
			flashToast(result.errors[0] || 'Failed to add tag');
			console.error('[ComposerPanel] addTag:', result.errors);
			return;
		}
		showTagMenu = false;
	}

	// "+ New segment" in the tag menu — choice (ii): just opens the existing
	// zone (gap-pick) modal; the user adds the tag to the new zone afterward.
	function handleTagMenuNewSegment() {
		closeMenus();
		handleAddSegment(activePipeIdx!);
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
				onLengthEdit={() => openPipeLengthModal(pipeIdx)}
				fps={session?.fps}
			/>

			<!-- Variant B (fixed) auxiliary panel: tabbed, mutually-exclusive
			     Keyframes⇄SubjectRefs, each independently collapsible. Variant A
			     (current): two independent rows (existing layout). Store,
			     actions, geometry identical in both; only presentation differs. -->
			{#if uiVariant === 'fixed'}
				<!-- ═══ AUX PANEL: KEYFRAMES ⇄ SUBJECT REFS (exclusive tabs, each collapsible) ═══ -->
				<div class="aux-panel">
					<div class="aux-tabs" role="tablist">
						<button
							class="aux-tab" class:active={activeAuxPanel === 'keyframes'}
							role="tab" aria-selected={activeAuxPanel === 'keyframes'}
							onclick={() => (activeAuxPanel = 'keyframes')}>
							KEYFRAMES
							<span class="aux-tab-count">{pipe.keyframes.length}/{MAX_KEYFRAMES}</span>
						</button>
						<button
							class="aux-tab" class:active={activeAuxPanel === 'subjects'}
							role="tab" aria-selected={activeAuxPanel === 'subjects'}
							onclick={() => (activeAuxPanel = 'subjects')}>
							SUBJECT REFS
							<span class="aux-tab-count">
								{(pipe.subjectReferences ?? []).filter((r: any) => r.visible !== false).length}/{MAX_SUBJECT_REFS}
							</span>
						</button>
					</div>

					{#if activeAuxPanel === 'keyframes'}
						<div class="aux-section" class:open={!keyframesCollapsed}>
							<button
								class="aux-section-head"
								onclick={() => (keyframesCollapsed = !keyframesCollapsed)}
								title={keyframesCollapsed ? 'Expand keyframes' : 'Collapse keyframes'}>
								<span class="aux-chevron">{keyframesCollapsed ? '›' : '˅'}</span>
							</button>
							{#if !keyframesCollapsed}
								<div class="aux-body">
									<KeyframesRow
										{pipe}
										maxKeyframes={MAX_KEYFRAMES}
										onEditSlot={(slotIndex) => openKeyframeModal(pipeIdx, slotIndex)}
										onRemoveKeyframe={(kfId) => handleRemoveKeyframe(pipeIdx, kfId)}
										headerless={true}
										containsBroken={(id) => brokenRefs?.has(`${pipe.id}:${id}`) ?? false}
									/>
								</div>
							{/if}
						</div>
					{:else}
						<div class="aux-section" class:open={!subjectsCollapsed}>
							<button
								class="aux-section-head"
								onclick={() => (subjectsCollapsed = !subjectsCollapsed)}
								title={subjectsCollapsed ? 'Expand subject refs' : 'Collapse subject refs'}>
								<span class="aux-chevron">{subjectsCollapsed ? '›' : '˅'}</span>
							</button>
							{#if !subjectsCollapsed}
								<div class="aux-body">
									<SubjectRefsRow
										{pipe}
										maxSubjectRefs={MAX_SUBJECT_REFS}
										onToggle={(refId) => handleToggleSubjectRef(pipeIdx, refId)}
										onRemove={(refId) => handleRemoveSubjectRef(pipeIdx, refId)}
										onAdd={() => openSubjectRefModal(pipeIdx)}
										onEdit={(refId) => openSubjectRefModal(pipeIdx, refId)}
										headerless={true}
										containsBroken={(id) => brokenRefs?.has(`${pipe.id}:${id}`) ?? false}
									/>
								</div>
							{/if}
						</div>
				{/if}
				</div>
			{:else}
				<!-- Variant A — CURRENT: independent rows, existing layout -->

				<!-- ═══ KEYFRAME ROW ═══ -->
				<KeyframesRow
					{pipe}
					maxKeyframes={MAX_KEYFRAMES}
					onEditSlot={(slotIndex) => openKeyframeModal(pipeIdx, slotIndex)}
					onRemoveKeyframe={(kfId) => handleRemoveKeyframe(pipeIdx, kfId)}
					containsBroken={(id) => brokenRefs?.has(`${pipe.id}:${id}`) ?? false}
				/>

				<!-- ═══ SUBJECT REFERENCES ROW ═══ -->
				<SubjectRefsRow
					{pipe}
					maxSubjectRefs={MAX_SUBJECT_REFS}
					onToggle={(refId) => handleToggleSubjectRef(pipeIdx, refId)}
					onRemove={(refId) => handleRemoveSubjectRef(pipeIdx, refId)}
					onAdd={() => openSubjectRefModal(pipeIdx)}
					onEdit={(refId) => openSubjectRefModal(pipeIdx, refId)}
					containsBroken={(id) => brokenRefs?.has(`${pipe.id}:${id}`) ?? false}
				/>
			{/if}

			<!-- ═══ TIMELINE AREA ═══ (single coordinate canvas — now in TimelineSection) ═══ -->
			<TimelineSection
				{pipe}
				sessionId={session?.id}
				{selectedFrame}
				livePin={uiVariant === 'fixed'}
				fps={session?.fps}
				onFrameChange={(f) => onframechange?.(f)}
				onAddTrack={(e) => handleToggleAddMenu(pipeIdx, e)}
				onToggleGlobal={(globalId) => handleToggleGlobal(pipeIdx, globalId)}
				onRemoveGlobal={(globalId) => handleRemoveGlobal(pipeIdx, globalId)}
				onAddSegment={() => handleAddSegment(pipeIdx)}
				onDeleteSegment={(segId) => handleDeleteSegment(pipeIdx, segId)}
				onOpenTagMenu={(segId, e) => handleOpenTagMenu(segId, e, pipeIdx)}
				onRemoveTag={(segId, tagId) => handleRemoveTag(pipeIdx, segId, tagId)}
				onEditTagPrompt={(seg, tag) => handleEditTagPrompt(pipeIdx, seg, tag)}
				showAddTrack={showAddTrackButton(pipe)}
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
		segments={tagMenuSegments}
		defaultSegmentId={selectedSegmentId}
		declaredTypes={tagMenuDeclaredTypes}
		menuVersion={tagMenuVersion}
		onConfirm={(t, segId) => confirmTagSelector(t, segId)}
		onNewSegment={handleTagMenuNewSegment}
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
		onSaved={(refId) => onRefSaved?.(pipes[activePipeIdx]?.id ?? '', refId)}
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
		onSaved={(refId) => onRefSaved?.(pipes[activePipeIdx]?.id ?? '', refId)}
	/>
{/if}

		<!-- ═══ SEGMENT MODAL ═══ -->
	<SegmentModal
		startFrame={segStart}
		endFrame={segEnd}
		totalFrames={totalFrames}
		gaps={segGaps}
		bind:open={showSegmentModal}
		onConfirm={(s, e) => confirmSegment(s, e)}
	/>

	<!-- ═══ PIPE LENGTH MODAL ═══ -->
	{#if pipes[pendingPipeIdx]}
		<PipeLengthModal
			pipe={pipes[pendingPipeIdx]}
			fps={session?.fps ?? 24}
			maxFrames={maxPipeFrames}
			trimPreview={trimPreview}
			bind:open={showPipeLengthModal}
			onConfirm={confirmPipeLength}
			onPreview={handlePipeLengthPreview}
		/>
	{/if}

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

	/* ═══ VARIANT B (FIXED): tabbed aux panel ═════════════════════════════ */
	/* Keyframes ⇄ Subject Refs share ONE disclosure slot (mutually
	   exclusive tabs) with an independent collapse per active panel.
	   Uniform vertical rhythm (8px column gap on .pipe) and the same
	   horizontal padding as the rest of the pipe. */
	.aux-panel {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.aux-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}

	.aux-tab {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.aux-tab:hover {
		background: var(--bg-hover, var(--bg-tertiary));
		color: var(--text-primary);
	}

	.aux-tab.active {
		background: var(--accent-bg, var(--bg-tertiary));
		border-color: var(--accent-color);
		color: var(--text-primary);
	}

	.aux-tab-count {
		opacity: 0.7;
		font-weight: 500;
	}

	.aux-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 4px;
		background: var(--bg-primary);
		border-radius: 6px;
		border: 1px solid var(--border-color);
	}

	.aux-section-head {
		height: 22px;
		width: 100%;
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.aux-chevron {
		font-size: 11px;
		padding: 0 6px;
		border-radius: 4px;
	}

	.aux-section-head:hover .aux-chevron {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

</style>
