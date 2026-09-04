<script lang="ts">
	import type { SessionData, PipeRow, TagType, PipeKeyframe, TagElement, Segment } from '$types';
	import { TAG_SPECIFICATIONS } from '$types';
	import FrameRuler from './FrameRuler.svelte';
	import {
		addPipe as addPipeAction,
		removePipe as removePipeAction,
		addKeyframe as addKeyframeAction,
		removeKeyframe as removeKeyframeAction,
		addGlobalElement as addGlobalElementAction,
		updateGlobalElement as updateGlobalElementAction,
		removeGlobalElement as removeGlobalElementAction,
		addTimelineElement as addTimelineElementAction,
		addSegment as addSegmentAction,
		removeSegment as removeSegmentAction,
		addTagElement as addTagElementAction,
		removeTagElement as removeTagElementAction,
		updateTagPrompt as updateTagPromptAction,
	} from '$lib/composerStore';
	import { snapTo8 } from '$lib/frameMath';

	let { session }: { session?: SessionData } = $props();

	const MAX_KEYFRAMES = 3;
	const DEFAULT_FRAME_COUNT = 241;

	// ── Derived state ────────────────────────────────────────────────────────
	let pipes = $derived(session?.pipes ?? []);
	let totalFrames = $derived(pipes.length > 0 ? (pipes[0]?.lengthFrames ?? DEFAULT_FRAME_COUNT) : DEFAULT_FRAME_COUNT);

	// ── UI state ─────────────────────────────────────────────────────────────
	let activePipeIdx = $state<number | null>(null);

	// Keyframe modal
	let showKeyframeModal = $state(false);
	let editingKeyframeSlot = $state<number | null>(null);
	let kfType = $state<'url' | 'txt2img' | 'img2img'>('url');
	let kfValue = $state('');
	let kfFrame = $state(0);

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
	let addMenuRef = $state<{ x: number; y: number } | null>(null);

	// [+] menu position tracking (relative to window)
	let addMenuX = $state(0);
	let addMenuY = $state(0);

	// Tag selector menu
	let showTagMenu = $state(false);
	let selectedSegmentId = $state<string>('');
	let selectedTagType = $state<TagType | null>(null);
	let tagMenuX = $state(0);
	let tagMenuY = $state(0);

	// Close menus on outside click
	function closeMenus() {
		showAddMenu = false;
		showTagMenu = false;
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	/** Check if a keyframe at a given slot is "configured" (has the required data) */
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

	/**
	 * Return which keyframe slot numbers are currently visible.
	 * Slot 1 always visible. Slot N visible only when slot N-1 is configured.
	 * Maximum MAX_KEYFRAMES slots.
	 */
	function getVisibleKeyframeSlots(pipe: PipeRow): number[] {
		const visible: number[] = [];
		for (let i = 1; i <= MAX_KEYFRAMES; i++) {
			if (i === 1) {
				visible.push(i);
			} else if (isKeyframeConfigured(pipe, i - 1)) {
				visible.push(i);
			} else {
				break; // stop: previous slot not configured yet
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
		// read existing if editing
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

	// ── Track add menu ──────────────────────────────────────────────────────

	function handleToggleAddMenu(pipeIdx: number, e: MouseEvent) {
		activePipeIdx = pipeIdx;
		showAddMenu = !showAddMenu;
		showTagMenu = false;
		if (showAddMenu) {
			// Position near the [+] button
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
		addGlobalElementAction(session.id, pipe.id, '').then(r => {
			if (r.errors?.length) console.error('[ComposerPanel] addGlobal:', r.errors);
		});
		showAddMenu = false;
	}

	// ── Segment ─────────────────────────────────────────────────────────────

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
		const spec = TAG_SPECIFICATIONS[selectedTagType];
		const result = await addTagElementAction(session.id, pipe.id, selectedSegmentId, selectedTagType, spec.color, seg.frameStart, seg.frameEnd);
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
		const result = await removeTagElementAction(session.id, pipe.id, tagId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeTag:', result.errors);
	}

	async function handleRemoveGlobal(idx: number, globalId: string) {
		const pipe = pipes[idx];
		if (!pipe || !session?.id) return;
		const result = await removeGlobalElementAction(session.id, pipe.id, globalId);
		if (result.errors.length > 0) console.error('[ComposerPanel] removeGlobal:', result.errors);
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
			<div class="kf-row">
				{#each getVisibleKeyframeSlots(pipe) as kfNum}
					{#each [pipe.keyframes.find((kf: PipeKeyframe) => kf.slotIndex === kfNum)] as kf}
						{#if kf}
							<!-- Configured -->
							<div class="kf-chip kf-filled"
								onclick={() => openKeyframeModal(pipeIdx, kfNum)}
								title="Frame {kf.frame} · {kf.type} · Click to edit">
								{#if kf.imageSrc}
									<img src={kf.imageSrc} class="kf-img" alt="keyframe" />
								{:else}
									<span class="kf-label">k{kfNum}</span>
								{/if}
								<button class="kf-del"
									onclick={(e) => { e.stopPropagation(); handleRemoveKeyframe(pipeIdx, kf.id); }}>×</button>
							</div>
						{:else}
							<!-- Empty / pending slot -->
							<div class="kf-chip kf-empty"
								onclick={() => openKeyframeModal(pipeIdx, kfNum)}
								title="Click to configure keyframe {kfNum}">
								<span class="kf-empty-label">+ k{kfNum}</span>
							</div>
						{/if}
					{/each}
				{/each}
			</div>

			<!-- ═══ FRAME RULER ═══ -->
			<div class="ruler-wrap">
				<FrameRuler {totalFrames} selectedFrame={null} segments={[]} onframeSelect={() => {}} />
			</div>

			<!-- ═══ GLOBAL TRACK (full-width, no title) ═══ -->
			{#each [getGlobal(pipe)] as global}
				{#if global}
					<div class="global-track">
						<div class="global-bar" title="Global style — spans frames 0–{totalFrames - 1}">
							<span class="global-text">{global.value || '—'}</span>
							<button class="btn-icon-sm btn-del-sm" onclick={() => handleRemoveGlobal(pipeIdx, global.id)} title="Remove global">×</button>
						</div>
					</div>
				{/if}
			{/each}

			<!-- ═══ TIMELINE TRACK ═══ -->
			{#each [getTimeline(pipe)] as tl}
				{#if tl}
					<div class="timeline-track">
						<div class="segment-row-list">
							{#each tl.segments as seg (seg.id)}
								<div class="seg-row"
									style="left: {(seg.frameStart / (totalFrames - 1)) * 100}%; width: {((seg.frameEnd - seg.frameStart) / (totalFrames - 1)) * 100}%;">
									<div class="seg-body">
										<span class="seg-range">{seg.frameStart}–{seg.frameEnd}</span>
										{#if seg.tags.length > 0}
											<span class="seg-tag-count">{seg.tags.length}</span>
										{/if}
									</div>
									<div class="seg-tags">
										{#each seg.tags as tag (tag.id)}
											<div class="tag-bar"
												style="left: {((tag.frameStart - seg.frameStart) / (seg.frameEnd - seg.frameStart)) * 100}%; width: {((tag.frameEnd - tag.frameStart) / (seg.frameEnd - seg.frameStart)) * 100}%; background: {tag.spec?.color || '#59B5FF'};"
												title="{tag.spec?.name}: {tag.frameStart}–{tag.frameEnd}"
												onclick={() => handleEditTagPrompt(pipeIdx, seg, tag)}
												role="button"
												tabindex="0"
												onkeydown={(e) => e.key === 'Enter' && handleEditTagPrompt(pipeIdx, seg, tag)}>
												<span class="tag-label">{tag.spec?.name || tag.tag}</span>
												{#if tag.prompt}
													<span class="tag-prompt-trunc">{tag.prompt}</span>
												{/if}
											</div>
										{/each}
									</div>
									<button class="btn-seg-tag"
										onclick={(e) => handleOpenTagMenu(seg.id, e, pipeIdx)}>+ Tag</button>
									<button class="btn-icon-sm btn-del-sm"
										onclick={() => handleDeleteSegment(pipeIdx, seg.id)}>×</button>
								</div>
							{/each}
							{#if tl.segments.length === 0}
								<div class="seg-empty" onclick={() => handleAddSegment(pipeIdx)} role="button" tabindex="0"
									onkeydown={(e) => e.key === 'Enter' && handleAddSegment(pipeIdx)}>
									<span>+ Add first segment</span>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<!-- No timeline — show nothing (timeline appears only after [+] → Timeline) -->
				{/if}
			{/each}

			<!-- ═══ [+] BUTTON ═══ -->
			<div class="add-track-wrap">
				<button class="btn-add-track"
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

<!-- ═══ SEGMENT MODAL ═══ -->
{#if showSegmentModal}
	<div class="modal-overlay" onclick={() => showSegmentModal = false} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>Add Segment</h3>
			</div>
			<div class="modal-body">
				<div class="modal-field">
					<label id="seg-start-label">Start frame</label>
					<input type="number" bind:value={segStart} step={8} min={0} max={totalFrames - 8} class="modal-input" aria-labelledby="seg-start-label" />
				</div>
				<div class="modal-field">
					<label id="seg-end-label">End frame</label>
					<input type="number" bind:value={segEnd} step={8} min={8} max={totalFrames} class="modal-input" aria-labelledby="seg-end-label" />
				</div>
				<div class="segment-preview">
					<div class="preview-bar">
						<div class="preview-seg" style="left: {(segStart / (totalFrames - 1)) * 100}%; width: {((segEnd - segStart) / (totalFrames - 1)) * 100}%"></div>
					</div>
					<span class="preview-range">{segStart} → {segEnd} ({segEnd - segStart} frames)</span>
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn-confirm" onclick={confirmSegment}>Add</button>
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
					<label id="prompt-label">Prompt</label>
					<textarea bind:value={tagPrompt} placeholder="Describe what happens in this tag segment..." class="modal-textarea" aria-labelledby="prompt-label"></textarea>
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
	/* ═══ LAYOUT ═══ */
	.composer-panel {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		overflow-y: auto;
		height: 100%;
	}

	/* ═══ PIPE ═══ */
	.pipe {
		border: 1px solid var(--border);
		border-radius: 3px;
		background: var(--bg-secondary);
	}

	.pipe.active {
		border-color: var(--accent);
	}

	/* ═══ PIPE HEADER ═══ */
	.pipe-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 10px;
		background: var(--bg-tertiary);
		border-bottom: 1px solid var(--border);
	}

	.pipe-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.pipe-meta {
		flex: 1;
		font-size: 0.6rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ KEYFRAME ROW ═══ */
	.kf-row {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 7px 10px;
		border-bottom: 1px solid var(--border);
	}

	.kf-chip {
		width: 52px;
		height: 36px;
		border-radius: 3px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		position: relative;
		overflow: hidden;
		transition: all 0.12s;
		flex-shrink: 0;
	}

	.kf-filled {
		background: var(--bg-elevated);
		border: 1px solid var(--border-light);
	}

	.kf-filled:hover {
		border-color: var(--accent);
	}

	.kf-empty {
		background: transparent;
		border: 1px dashed var(--border);
		color: var(--text-muted);
	}

	.kf-empty:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	.kf-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.kf-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.kf-empty-label {
		font-size: 0.6rem;
		color: var(--text-muted);
	}

	.kf-del {
		position: absolute;
		top: 1px;
		right: 1px;
		width: 13px;
		height: 13px;
		font-size: 0.55rem;
		padding: 0;
		background: rgba(0, 0, 0, 0.6);
		border: none;
		border-radius: 50%;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.12s;
	}

	.kf-chip:hover .kf-del {
		opacity: 1;
	}

	.kf-del:hover {
		background: rgba(220, 38, 38, 0.8);
		color: #fff;
	}

	/* ═══ FRAME RULER WRAP ═══ */
	.ruler-wrap {
		border-bottom: 1px solid var(--border);
	}

	/* ═══ GLOBAL TRACK ═══ */
	.global-track {
		padding: 3px 10px;
		border-bottom: 1px solid var(--border);
	}

	.global-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 22px;
		background: var(--accent-glow);
		border: 1px solid var(--accent);
		border-radius: 2px;
		padding: 0 8px;
	}

	.global-text {
		flex: 1;
		font-size: 0.6rem;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: 'JetBrains Mono', monospace;
	}

	.global-placeholder {
		flex: 1;
		font-size: 0.6rem;
		color: var(--text-muted);
	}

	/* ═══ TIMELINE TRACK ═══ */
	.timeline-track {
		padding: 3px 10px;
		border-bottom: 1px solid var(--border);
	}

	.segment-row-list {
		position: relative;
		height: 28px;
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: 2px;
		overflow: visible;
		margin-top: 2px;
	}

	.seg-row {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border-light);
		border-radius: 2px;
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s;
		overflow: visible;
	}

	.seg-row:hover {
		background: var(--bg-hover);
		border-color: var(--accent);
	}

	.seg-body {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		height: 14px;
	}

	.seg-range {
		font-size: 0.55rem;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', monospace;
	}

	.seg-tag-count {
		font-size: 0.5rem;
		color: var(--text-muted);
		background: var(--bg-tertiary);
		padding: 1px 3px;
		border-radius: 2px;
	}

	.seg-tags {
		position: absolute;
		top: 14px;
		left: 0;
		right: 0;
		height: 14px;
	}

	.tag-bar {
		position: absolute;
		top: 2px;
		height: 10px;
		border-radius: 2px;
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 0 4px;
		overflow: hidden;
		transition: opacity 0.12s;
		min-width: 18px;
	}

	.tag-bar:hover {
		opacity: 0.8;
	}

	.tag-label {
		font-size: 0.5rem;
		color: rgba(0, 0, 0, 0.85);
		font-weight: 600;
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.tag-prompt-trunc {
		font-size: 0.48rem;
		color: rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.btn-seg-tag {
		position: absolute;
		bottom: 1px;
		right: 3px;
		font-size: 0.5rem;
		padding: 1px 3px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 2px;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.12s;
	}

	.btn-seg-tag:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.seg-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.6rem;
		transition: color 0.12s;
	}

	.seg-empty:hover {
		color: var(--accent);
	}

	/* ═══ ADD TRACK BUTTON ═══ */
	.add-track-wrap {
		padding: 5px 10px;
		display: flex;
		justify-content: center;
	}

	.btn-add-track {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1px dashed var(--border);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.12s;
	}

	.btn-add-track:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	/* ═══ ADD PIPE BUTTON ═══ */
	.btn-add-pipe {
		align-self: flex-start;
		padding: 5px 14px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.12s;
		margin-top: 4px;
		font-family: inherit;
	}

	.btn-add-pipe:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	/* ═══ DROPDOWN MENU ═══ */
	.dropdown-menu {
		position: fixed;
		min-width: 130px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-light);
		border-radius: 4px;
		box-shadow: var(--shadow-md);
		z-index: 1000;
		padding: 4px;
	}

	.dropdown-label {
		font-size: 0.55rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 3px 8px 1px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 5px 8px;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: var(--text-secondary);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.1s;
		text-align: left;
		font-family: inherit;
	}

	.dropdown-item:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.dropdown-item.active {
		background: var(--accent-glow);
		color: var(--accent);
	}

	.dropdown-icon {
		font-size: 0.75rem;
		opacity: 0.7;
	}

	.tag-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dropdown-actions {
		display: flex;
		gap: 6px;
		padding: 4px 4px 2px;
		border-top: 1px solid var(--border);
		margin-top: 2px;
	}

	/* ═══ MODAL ═══ */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: 6px;
		box-shadow: var(--shadow-lg);
		min-width: 300px;
		max-width: 440px;
		width: 90%;
	}

	.modal-header {
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h3 {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-sub {
		font-size: 0.65rem;
		color: var(--text-muted);
		font-weight: 400;
	}

	.modal-body {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.mode-selector {
		display: flex;
		gap: 4px;
	}

	.mode-btn {
		flex: 1;
		padding: 5px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 0.68rem;
		cursor: pointer;
		transition: all 0.12s;
		font-family: inherit;
	}

	.mode-btn:hover,
	.mode-btn.active {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	.modal-field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.modal-field label {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.modal-input,
	.modal-textarea {
		padding: 7px 9px;
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-primary);
		font-size: 0.78rem;
		font-family: 'JetBrains Mono', monospace;
		transition: border-color 0.12s;
	}

	.modal-input:focus,
	.modal-textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.modal-textarea {
		min-height: 72px;
		resize: vertical;
	}

	.segment-preview {
		padding: 6px 0;
	}

	.preview-bar {
		position: relative;
		height: 14px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 2px;
		overflow: hidden;
	}

	.preview-seg {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--accent-glow);
		border: 1px solid var(--accent);
	}

	.preview-range {
		display: block;
		font-size: 0.6rem;
		color: var(--text-muted);
		margin-top: 3px;
		font-family: 'JetBrains Mono', monospace;
	}

	.modal-actions {
		display: flex;
		gap: 7px;
		justify-content: flex-end;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
	}

	.btn-confirm,
	.btn-cancel {
		padding: 5px 14px;
		border-radius: 3px;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.12s;
		font-family: inherit;
	}

	.btn-confirm {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--text-inverse);
	}

	.btn-confirm:hover:not(:disabled) {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}

	.btn-confirm:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.btn-cancel:hover {
		border-color: var(--border-light);
		color: var(--text-primary);
	}

	.btn-icon,
	.btn-icon-sm {
		width: 18px;
		height: 18px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.7rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.12s;
	}

	.btn-icon:hover,
	.btn-icon-sm:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.btn-del-sm:hover {
		border-color: rgba(220, 38, 38, 0.5);
		color: #ff6b6b;
		background: rgba(220, 38, 38, 0.1);
	}

	/* ═══ SCROLLBAR ═══ */
	.composer-panel::-webkit-scrollbar {
		width: 4px;
	}

	.composer-panel::-webkit-scrollbar-track {
		background: transparent;
	}

	.composer-panel::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 2px;
	}

	.composer-panel::-webkit-scrollbar-thumb:hover {
		background: var(--border-light);
	}
</style>
