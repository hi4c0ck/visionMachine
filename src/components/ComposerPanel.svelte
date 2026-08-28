<script lang="ts">
	import type { 
		SessionData, 
		PipeRow, 
		TagType, 
		PipeKeyframe,
		GlobalElement,
		TimelineElement,
		Segment,
		TagElement
	} from '$types';
	import {
		snapTo8nPlus1,
		snapTo8,
		getMaxFrames,
	} from '$lib/frameMath';
	import {
		TAG_SPECIFICATIONS,
		FPS_PRESETS,
		getMaxFramesForResolution,
	} from '$types';
	import FrameRuler from './FrameRuler.svelte';
	import MultiThumbSlider from './MultiThumbSlider.svelte';
	import {
		addPipe as addPipeAction,
		removePipe,
		movePipe as movePipeAction,
		duplicatePipe,
		updateQ as updateQAction,
		updateC as updateCAction,
		setPipeLength,
		addGlobalElement as addGlobalElementAction,
		updateGlobalElement as updateGlobalElementAction,
		toggleGlobalElement,
		removeGlobalElement,
		addTimelineElement as addTimelineElementAction,
		addSegment as addSegmentAction,
		removeSegment,
		resizeSegment as resizeSegmentAction,
		addTagElement as addTagElementAction,
		removeTagElement as removeTagElementAction,
		resizeTagElement as resizeTagElementAction,
		updateTagValue as updateTagValueAction,
		updateTagPrompt as updateTagPromptAction,
		addKeyframe,
		removeKeyframe,
		moveKeyframe,
		updateFPS as storeUpdateFPS,
		updateResolution as storeUpdateResolution,
	} from '$lib/composerStore';

	let { session, onUpdate }: { session?: SessionData; onUpdate: (session: SessionData) => void } = $props();

	const MAX_KEYFRAMES = 3;
	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;
	const MIN_PIPE_LENGTH = 41;

	let pipes = $derived(session?.pipes ?? []);
	let totalFrames = $derived(pipes[0]?.lengthFrames ?? 121);

	// Toast/notification state
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');

	// Timeline state
	let timelineZoom = $state(1);
	let selectedFrame = $state<number | null>(null);

	// Add pipe modal state
	let showAddPipeModal = $state(false);
	let newPipeName = $state('');

	// Add keyframe modal state
	let showAddModal = $state(false);
	let activePipeIndex = $state<number | null>(null);
	let activeKfIndex = $state<number | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state('');

	// Segment modal state
	let showSegmentModal = $state(false);
	let activeSegmentAddPipeIndex = $state<number | null>(null);
	let newSegmentStart = $state(0);
	let newSegmentEnd = $state(121);

	// Tag modal state
	let showTagModal = $state(false);
	let activeTagId = $state<string | null>(null);
	let activeTagPipeIndex = $state<number | null>(null);
	let activeTagSegmentIndex = $state<number | null>(null);
	let tagValue = $state(0);
	let tagPrompt = $state('');

	// Global element modal state
	let showGlobalModal = $state(false);
	let activeGlobalPipeIndex = $state<number | null>(null);
	let activeGlobalElementId = $state<string | null>(null);
	let globalPromptText = $state('');

	// All tag types
	const allTags = Object.keys(TAG_SPECIFICATIONS) as TagType[];

	// Helper to collect tags of a specific type across all segments in a pipe
	function getTagsForType(pipe: PipeRow, tagType: TagType): Array<{ tag: TagElement; segment: Segment; segmentIndex: number }> {
	  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
	  if (!timeline) return [];
	  return timeline.segments.flatMap((segment, segIdx) =>
	    segment.tags
	      .filter(tag => tag.tag === tagType)
	      .map(tag => ({ tag, segment, segmentIndex: segIdx }))
	  );
	}

	function getGlobalElement(pipe: PipeRow): GlobalElement | undefined {
		return pipe.elements.find(e => e.tag === 'global_style') as GlobalElement | undefined;
	}

	function getTimelineElement(pipe: PipeRow): TimelineElement | undefined {
		return pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
	}

	function getTagById(pipeIndex: number, segmentIndex: number, tagId: string): TagElement | undefined {
		const pipe = pipes[pipeIndex];
		if (!pipe) return undefined;
		const timeline = getTimelineElement(pipe);
		if (!timeline || !timeline.segments[segmentIndex]) return undefined;
		return timeline.segments[segmentIndex].tags.find(t => t.id === tagId);
	}

	function showToast(message: string, type: 'success' | 'error' = 'success') {
		toastMessage = message;
		toastType = type;
		setTimeout(() => { toastMessage = null; }, 3000);
	}

	function closeAddPipeModal() {
		showAddPipeModal = false;
		newPipeName = '';
	}

	function openAddPipeModal() {
		showAddPipeModal = true;
		newPipeName = '';
	}

	async function confirmAddPipe() {
		if (!session?.id) {
			showToast('No active session', 'error');
			return;
		}
		try {
			const result = await addPipeAction(session.id);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
				return;
			}
			closeAddPipeModal();
			showToast('Pipe added', 'success');
		} catch (e) {
			console.error('[ComposerPanel] Failed to add pipe:', e);
			showToast('Failed to add pipe', 'error');
		}
	}

	// ── Global Element Actions ────────────────────────────────────────────────

	function openGlobalModal(pipeIndex: number) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		
		const global = getGlobalElement(pipe);
		activeGlobalPipeIndex = pipeIndex;
		activeGlobalElementId = global?.id || null;
		globalPromptText = global?.value || '';
		showGlobalModal = true;
	}

	async function confirmGlobalEdit() {
		if (!session?.id || activeGlobalPipeIndex === null) return;
		const pipe = pipes[activeGlobalPipeIndex];
		if (!pipe) return;

		try {
			let result;
			if (activeGlobalElementId) {
				result = await updateGlobalElementAction(
					session.id,
					pipe.id,
					activeGlobalElementId,
					globalPromptText
				);
			} else {
				result = await addGlobalElementAction(session.id, pipe.id, globalPromptText);
			}

			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			} else {
				showToast(activeGlobalElementId ? 'Global style updated' : 'Global style added', 'success');
			}
			closeGlobalModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to save global:', e);
			showToast('Failed to save global', 'error');
		}
	}

	function closeGlobalModal() {
		showGlobalModal = false;
		activeGlobalPipeIndex = null;
		activeGlobalElementId = null;
		globalPromptText = '';
	}

	// ── Segment Actions ───────────────────────────────────────────────────────

	function openAddSegmentModal(pipeIndex: number) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		
		activeSegmentAddPipeIndex = pipeIndex;
		newSegmentStart = 0;
		newSegmentEnd = snapTo8(pipe.lengthFrames - 1);
		showSegmentModal = true;
	}

	async function confirmAddSegment() {
		if (!session?.id || activeSegmentAddPipeIndex === null) return;
		const pipe = pipes[activeSegmentAddPipeIndex];
		if (!pipe) return;

		try {
			const result = await addSegmentAction(
				session.id,
				pipe.id,
				snapTo8(newSegmentStart),
				snapTo8(newSegmentEnd)
			);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			} else {
				showToast('Segment added', 'success');
			}
			closeAddSegmentModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add segment:', e);
			showToast('Failed to add segment', 'error');
		}
	}

	function closeAddSegmentModal() {
		showSegmentModal = false;
		activeSegmentAddPipeIndex = null;
		newSegmentStart = 0;
		newSegmentEnd = 121;
	}

	async function removeSegmentAction(pipeIndex: number, segmentId: string) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			const result = await removeSegment(session.id, pipe.id, segmentId);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to remove segment:', e);
		}
	}

	async function resizeSegment(pipeIndex: number, segmentId: string, vals: [number, number]) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const maxEnd = snapTo8(pipe.lengthFrames - 1);
		const [newStart, newEnd] = vals.map(v => snapTo8(Math.max(0, Math.min(v, maxEnd))));
		
		if (newEnd <= newStart) {
			showToast('Segment must have positive span', 'error');
			return;
		}

		try {
			const result = await resizeSegmentAction(session.id, pipe.id, segmentId, newStart, newEnd);
			if (result.errors.length > 0) {
				showToast(`Resize failed: ${result.errors.join(', ')}`, 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to resize segment:', e);
			showToast('Failed to resize segment', 'error');
		}
	}

	// ── Tag Actions ───────────────────────────────────────────────────────────

	function openTagModal(pipeIndex: number, segmentIndex: number, tag: TagElement) {
		activeTagPipeIndex = pipeIndex;
		activeTagSegmentIndex = segmentIndex;
		activeTagId = tag.id;
		tagValue = tag.value;
		tagPrompt = tag.prompt || '';
		showTagModal = true;
	}

	async function confirmTagEdit() {
		if (!session?.id || activeTagPipeIndex === null || activeTagSegmentIndex === null || !activeTagId) return;
		const pipe = pipes[activeTagPipeIndex];
		if (!pipe) return;
		
		const timeline = getTimelineElement(pipe);
		if (!timeline) return;
		
		const segment = timeline.segments[activeTagSegmentIndex];
		if (!segment) return;
		
		const tag = segment.tags.find(t => t.id === activeTagId);
		if (!tag) return;

		try {
			const result = tag.spec.usePrompt
				? await updateTagPromptAction(session.id, pipe.id, segment.id, tag.id, tagPrompt)
				: await updateTagValueAction(session.id, pipe.id, segment.id, tag.id, tagValue);
				
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to update tag:', e);
			showToast('Failed to update tag', 'error');
		}
		closeTagModal();
	}

	function closeTagModal() {
		showTagModal = false;
		activeTagId = null;
		activeTagPipeIndex = null;
		activeTagSegmentIndex = null;
		tagValue = 0;
		tagPrompt = '';
	}

	async function addTagElement(pipeIndex: number, segmentId: string, tagType: TagType) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			const result = await addTagElementAction(session.id, pipe.id, segmentId, tagType);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to add tag:', e);
			showToast('Failed to add tag', 'error');
		}
	}

	async function removeTag(pipeIndex: number, segmentId: string, tagId: string) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			const result = await removeTagElementAction(session.id, pipe.id, segmentId, tagId);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to remove tag:', e);
		}
	}

	// ── Resize Tag ────────────────────────────────────────────────────────────

	async function resizeTag(pipeIndex: number, segmentId: string, tagId: string, vals: [number, number]) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const maxEnd = snapTo8(pipe.lengthFrames - 1);
		const [newStart, newEnd] = vals.map(v => snapTo8(Math.max(0, Math.min(v, maxEnd))));
		
		if (newEnd <= newStart) return;

		try {
			const result = await resizeTagElementAction(session.id, pipe.id, segmentId, tagId, newStart, newEnd);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to resize tag:', e);
		}
	}

	// ── Keyframe Actions ──────────────────────────────────────────────────────

	function closeModal() {
		showAddModal = false;
		activePipeIndex = null;
		activeKfIndex = null;
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
	}

	function openAddModal(pipeIndex: number, kfSlot?: number) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		
		activePipeIndex = pipeIndex;
		activeKfIndex = kfSlot ?? pipe.keyframes.length;
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
		showAddModal = true;
	}

	async function confirmAdd() {
		if (!session?.id || activePipeIndex === null) return;
		const pipe = pipes[activePipeIndex];
		if (!pipe) return;

		try {
			const result = await addKeyframe(session.id, pipe.id, addMode, {
				imageSrc: addMode === 'url' ? modalUrl : undefined,
				prompt: addMode === 'txt2img' ? modalPrompt : addMode === 'img2img' ? modalPrompt : undefined,
				referenceUrl: addMode === 'img2img' ? modalImg2Img : undefined,
			});
			
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			} else {
				showToast('Keyframe added', 'success');
			}
			closeModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add keyframe:', e);
			showToast('Failed to add keyframe', 'error');
		}
	}

	// ── Drag Handlers ─────────────────────────────────────────────────────────

	let isDraggingKeyframe = $state(false);
	let dragKeyframeStartX = $state(0);
	let dragKeyframeStartFrame = $state(0);
	let dragKeyframeId = $state<string | null>(null);
	let dragKeyframePipeIndex = $state<number | null>(null);

	function handleKeyframePointerDown(pipeIndex: number, kfId: string, frame: number, e: PointerEvent) {
		e.preventDefault();
		isDraggingKeyframe = true;
		dragKeyframeStartX = e.clientX;
		dragKeyframeStartFrame = frame;
		dragKeyframeId = kfId;
		dragKeyframePipeIndex = pipeIndex;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleKeyframePointerMove(e: PointerEvent) {
		if (!isDraggingKeyframe || dragKeyframePipeIndex === null || dragKeyframeId === null) return;
	}

	async function handleKeyframePointerUp(e: PointerEvent) {
		if (!isDraggingKeyframe || dragKeyframePipeIndex === null || dragKeyframeId === null) return;
		isDraggingKeyframe = false;
		const deltaPx = e.clientX - dragKeyframeStartX;
		if (Math.abs(deltaPx) < 4) {
			return;
		}
		const pipe = pipes[dragKeyframePipeIndex];
		if (!pipe) return;
		const trackWidth = (e.currentTarget as HTMLElement)?.offsetWidth || 1;
		const deltaFrames = Math.round((deltaPx / trackWidth) * pipe.lengthFrames / 8) * 8;
		const newFrame = snapTo8(dragKeyframeStartFrame + deltaFrames);
		if (newFrame < 0 || newFrame >= pipe.lengthFrames) {
			showToast('Keyframe position out of bounds', 'error');
			return;
		}
		try {
			const result = await moveKeyframe(session!.id, pipe.id, dragKeyframeId, deltaFrames);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (err) {
			showToast(`Failed to move keyframe: ${String(err)}`, 'error');
		} finally {
			dragKeyframeId = null;
			dragKeyframePipeIndex = null;
		}
	}

	// ── Pipe Actions ──────────────────────────────────────────────────────────

	async function movePipeUp(pipeIndex: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe || pipeIndex === 0) return;

		try {
			await movePipeAction(session.id, pipe.id, 'up');
		} catch (e) {
			console.error('[ComposerPanel] Failed to move pipe up:', e);
		}
	}

	async function movePipeDown(pipeIndex: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe || pipeIndex === pipes.length - 1) return;

		try {
			await movePipeAction(session.id, pipe.id, 'down');
		} catch (e) {
			console.error('[ComposerPanel] Failed to move pipe down:', e);
		}
	}

	async function deletePipe(pipeIndex: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe || pipes.length <= 1) return;

		try {
			const result = await removePipe(session.id, pipe.id);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to delete pipe:', e);
		}
	}

	// ── Settings ──────────────────────────────────────────────────────────────

	function updateQ(pipeIndex: number, value: number) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		// Update locally for now, will persist via store
		const newPipes = pipes.map((p, i) => 
			i === pipeIndex ? { ...p, qValue: value } : p
		);
		// Rebuild session with updated pipes
		onUpdate({
			...session!,
			pipes: newPipes
		});
	}

	function updateC(pipeIndex: number, value: number) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		const newPipes = pipes.map((p, i) => 
			i === pipeIndex ? { ...p, cValue: value } : p
		);
		onUpdate({
			...session!,
			pipes: newPipes
		});
	}

	async function updatePipeLength(pipeIndex: number, value: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const maxFrames = getMaxFramesForResolution(session!.resolution || '720p');
		const snapped = snapTo8nPlus1(value);
		const clamped = Math.max(MIN_PIPE_LENGTH, Math.min(snapped, maxFrames));

		try {
			const result = await setPipeLength(session.id, pipe.id, clamped);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to update pipe length:', e);
		}
	}

	function handleTimelineFrameSelect(frame: number) {
		selectedFrame = frame;
	}

	function handleZoomChange(newZoom: number) {
		timelineZoom = newZoom;
	}
</script>

<div class="composer-panel">
	<!-- Header -->
	<div class="composer-header">
		<span class="composer-title">Composer</span>
		<div class="header-meta">
			<span class="meta-info">{pipes.length} pipe{pipes.length !== 1 ? 's' : ''} · {totalFrames} frames</span>
		</div>
	</div>

	{#if !session}
		<div class="composer-empty">Select a session to compose</div>
	{:else}
		<!-- Unified Composer View -->
		<div class="unified-composer">
			{#each pipes as pipe, pipeIdx (pipe.id)}
				<div class="pipe-unified-row">
					<!-- Pipe Header -->
					<div class="pipe-unified-header">
						<span class="pipe-unified-name">Pipe {pipeIdx + 1}</span>
						<div class="pipe-unified-actions">
							<button onclick={() => movePipeUp(pipeIdx)} disabled={pipeIdx === 0} title="Move Up">↑</button>
							<button onclick={() => movePipeDown(pipeIdx)} disabled={pipeIdx === pipes.length - 1} title="Move Down">↓</button>
							<button onclick={() => deletePipe(pipeIdx)} title="Delete Pipe">×</button>
						</div>
					</div>

					<!-- Keyframe Track -->
					<div class="pipe-track">
						<span class="track-label">KF</span>
						<div class="track-canvas timeline-canvas">
							{#each pipe.keyframes as kf, kfIdx (kf.id)}
								<div
									class="keyframe-chip {kf.imageSrc ? 'has-image' : ''} {isDraggingKeyframe && dragKeyframeId === kf.id ? 'dragging' : ''}"
									style="left: calc({kf.frame} / {pipe.lengthFrames} * 100%); cursor: grab;"
									onpointerdown={(e) => handleKeyframePointerDown(pipeIdx, kf.id, kf.frame, e)}
									onpointermove={(e) => handleKeyframePointerMove(e)}
									onpointerup={(e) => handleKeyframePointerUp(e)}
									onclick={(e) => { if (!isDraggingKeyframe) openAddModal(pipeIdx, kfIdx); }}
									role="button"
									tabindex="0"
									title="Keyframe {kfIdx + 1} (frame {kf.frame})"
								>
									{#if kf.imageSrc}
										<img src={kf.imageSrc} alt="KF" class="kf-timeline-thumb" />
									{:else}
										<span>k{kfIdx + 1}</span>
									{/if}
									<button class="delete-kf-tl-btn" onclick={(e) => { e.stopPropagation(); removeKeyframe(session!.id, pipe.id, kf.id); }}>×</button>
								</div>
							{/each}
							{#if pipe.keyframes.length < MAX_KEYFRAMES}
								<div class="add-kf-tl-btn" onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)} role="button" tabindex="0">+</div>
							{/if}
						</div>
					</div>

					<!-- Global Track -->
					{#if getGlobalElement(pipe)}
						<div class="pipe-track">
							<span class="track-label">Global</span>
							<div class="track-canvas global-track-canvas">
								{#each [getGlobalElement(pipe)] as global}
									<div 
										class="global-chip-tl {global.enabled ? '' : 'disabled'}" 
										onclick={() => openGlobalModal(pipeIdx)} 
										role="button" 
										tabindex="0" 
										title="Edit global style"
									>
										<span>{global.enabled ? '●' : '○'}</span>
										<span class="global-text-tl">{global.value.substring(0, 30)}{global.value.length > 30 ? '...' : ''}</span>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="pipe-track">
							<span class="track-label">Global</span>
							<div class="track-canvas global-track-canvas empty-track">
								<button class="add-global-btn" onclick={() => openGlobalModal(pipeIdx)}>+ Add Global</button>
							</div>
						</div>
					{/if}

					<!-- Segment Timeline Track -->
					{#if getTimelineElement(pipe)}
						<div class="pipe-track segments-track">
							<span class="track-label">Segments</span>
							<div class="track-canvas segment-timeline-canvas">
								{#each getTimelineElement(pipe)!.segments as segment, segIdx (segment.id)}
									<div 
										class="segment-block"
										style="left: calc({segment.frameStart} / {pipe.lengthFrames} * 100%); width: calc(({segment.frameEnd} - {segment.frameStart}) / {pipe.lengthFrames} * 100%);"
										onclick={() => {}}
										title="Segment {segIdx + 1}: {segment.frameStart}-{segment.frameEnd}"
									>
										<span class="segment-label">{segment.frameStart}-{segment.frameEnd}</span>
										<button 
											class="delete-segment-btn" 
											onclick={(e) => { e.stopPropagation(); removeSegmentAction(pipeIdx, segment.id); }}
											title="Delete Segment"
										>×</button>
										
										<!-- Tags in segment -->
										{#each segment.tags as tag, tagIdx (tag.id)}
											<div 
												class="tag-mini-chip"
												style="border-color: {tag.spec.color}; color: {tag.spec.color}"
												onclick={() => openTagModal(pipeIdx, segIdx, tag)}
												role="button"
												tabindex="0"
												title="{tag.spec.name}: {tag.spec.usePrompt ? tag.prompt || '(prompt)' : tag.value}"
											>
												{tag.spec.usePrompt ? 'P' : tag.value}
											</div>
										{/each}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Add Segment Button -->
					<div class="pipe-track add-segment-track">
						<span class="track-label">Add</span>
						<div class="track-canvas">
							<button onclick={() => openAddSegmentModal(pipeIdx)}>+ Segment</button>
						</div>
					</div>

					<!-- Quality/Creativity -->
					<div class="pipe-track qc-track">
						<span class="track-label">Settings</span>
						<div class="track-canvas qc-canvas">
							<label class="qc-item">
								<span class="qc-label">Q</span>
								<input type="range" min={Q_MIN} max={Q_MAX} step="1" value={pipe.qValue} oninput={(e) => updateQ(pipeIdx, Number(e.currentTarget.value))} />
								<span class="qc-value">{pipe.qValue}</span>
							</label>
							<label class="qc-item">
								<span class="qc-label">C</span>
								<input type="range" min={C_MIN} max={C_MAX} step="0.5" value={pipe.cValue} oninput={(e) => updateC(pipeIdx, Number(e.currentTarget.value))} />
								<span class="qc-value">{pipe.cValue}</span>
							</label>
							<label class="qc-item length-item">
								<span class="qc-label">Len</span>
								<input type="number" class="length-input" value={pipe.lengthFrames} min={MIN_PIPE_LENGTH} max={getMaxFramesForResolution(session.resolution || '720p')} onblur={(e) => updatePipeLength(pipeIdx, Number(e.currentTarget.value))} />
								<span class="qc-unit">f</span>
							</label>
						</div>
					</div>
				</div>
			{/each}

			<!-- Add Pipe Button -->
			<div class="add-pipe-btn" onclick={openAddPipeModal} role="button" tabindex="0">
				<span>+</span>
				<span>Add Pipe</span>
			</div>
		</div>
	{/if}

	<!-- Toast Notification -->
	{#if toastMessage}
		<div class="toast toast-{toastType}">{toastMessage}</div>
	{/if}

	<!-- Add Pipe Modal -->
	{#if showAddPipeModal}
		<div class="modal-backdrop" onclick={closeAddPipeModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add New Pipe</span>
					<button class="modal-close" onclick={closeAddPipeModal}>×</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label class="form-label">Pipe Name</label>
						<input type="text" bind:value={newPipeName} placeholder="Enter pipe name..." />
					</div>
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeAddPipeModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmAddPipe}>Add</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Add Keyframe Modal -->
	{#if showAddModal && activePipeIndex !== null}
		<div class="modal-backdrop" onclick={closeModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add Keyframe</span>
					<button class="modal-close" onclick={closeModal}>×</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label class="form-label">Source Type</label>
						<div class="mode-buttons">
							<button class="{addMode === 'url' ? 'active' : ''}" onclick={() => addMode = 'url'}>URL</button>
							<button class="{addMode === 'txt2img' ? 'active' : ''}" onclick={() => addMode = 'txt2img'}>Text to Image</button>
							<button class="{addMode === 'img2img' ? 'active' : ''}" onclick={() => addMode = 'img2img'}>Image to Image</button>
						</div>
					</div>

					{#if addMode === 'url'}
						<div class="form-group">
							<label class="form-label">Image URL</label>
							<input type="text" bind:value={modalUrl} placeholder="https://example.com/image.jpg" />
						</div>
					{:else if addMode === 'txt2img'}
						<div class="form-group">
							<label class="form-label">Prompt</label>
							<textarea bind:value={modalPrompt} placeholder="Describe the image..."></textarea>
						</div>
					{:else if addMode === 'img2img'}
						<div class="form-group">
							<label class="form-label">Reference Image URL</label>
							<input type="text" bind:value={modalImg2Img} placeholder="https://example.com/reference.jpg" />
						</div>
						<div class="form-group">
							<label class="form-label">Prompt</label>
							<textarea bind:value={modalPrompt} placeholder="Describe the transformation..."></textarea>
						</div>
					{/if}

				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmAdd} disabled={
						(addMode === 'url' && !modalUrl.trim()) ||
						(addMode === 'txt2img' && !modalPrompt.trim()) ||
						(addMode === 'img2img' && !modalImg2Img.trim())
					}>Add</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Add Segment Modal -->
	{#if showSegmentModal && activeSegmentAddPipeIndex !== null}
		<div class="modal-backdrop" onclick={closeAddSegmentModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add Segment</span>
					<button class="modal-close" onclick={closeAddSegmentModal}>×</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label class="form-label">Start Frame</label>
						<input type="number" bind:value={newSegmentStart} step="8" min="0" max={pipes[activeSegmentAddPipeIndex]?.lengthFrames ?? 121} />
					</div>
					<div class="form-group">
						<label class="form-label">End Frame</label>
						<input type="number" bind:value={newSegmentEnd} step="8" min={newSegmentStart} max={pipes[activeSegmentAddPipeIndex]?.lengthFrames ?? 121} />
					</div>
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeAddSegmentModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmAddSegment}>Add</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Global Element Modal -->
	{#if showGlobalModal && activeGlobalPipeIndex !== null}
		<div class="modal-backdrop" onclick={closeGlobalModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Edit Global Style</span>
					<button class="modal-close" onclick={closeGlobalModal}>×</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label class="form-label">Style Description</label>
						<textarea bind:value={globalPromptText} placeholder="Describe the global style..."></textarea>
					</div>
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeGlobalModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmGlobalEdit}>Save</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tag Edit Modal -->
	{#if showTagModal && activeTagPipeIndex !== null && activeTagSegmentIndex !== null && activeTagId}
		<div class="modal-backdrop" onclick={closeTagModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Edit Tag</span>
					<button class="modal-close" onclick={closeTagModal}>×</button>
				</div>
				<div class="modal-body">
					{#if activeTagPipeIndex !== null && activeTagSegmentIndex !== null && activeTagId}
						{#each [getTagById(activeTagPipeIndex, activeTagSegmentIndex, activeTagId)] as tag}
						{#if tag}
							<div class="form-group">
								<label class="form-label">Tag Type</label>
								<span class="tag-type-display" style="color: {tag.spec.color}">[{tag.spec.name}]</span>
							</div>
							{#if tag.spec.usePrompt}
								<div class="form-group">
									<label class="form-label">Prompt</label>
									<textarea bind:value={tagPrompt} placeholder="Enter prompt..."></textarea>
								</div>
							{:else}
								<div class="form-group">
									<label class="form-label">Value</label>
									<input type="number" bind:value={tagValue} step="0.1" />
								</div>
							{/if}
						{/if}
						{/each}
					{/if}
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeTagModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmTagEdit}>Save</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.composer-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.composer-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-secondary);
	}

	.composer-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		letter-spacing: 0.02em;
	}

	.header-meta {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.meta-info {
		font-size: 11px;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
	}

	.composer-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--text-muted);
		font-size: 13px;
	}

	.unified-composer {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.pipe-unified-row {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-secondary);
		overflow: hidden;
	}

	.pipe-unified-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border-bottom: 1px solid var(--border);
	}

	.pipe-unified-name {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.pipe-unified-actions {
		display: flex;
		gap: 4px;
	}

	.pipe-unified-actions button {
		padding: 4px 8px;
		font-size: 10px;
		border: 1px solid var(--border);
		background: var(--bg-primary);
		color: var(--text-muted);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.pipe-unified-actions button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.pipe-unified-actions button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pipe-track {
		display: flex;
		align-items: center;
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		gap: 12px;
	}

	.pipe-track:last-child {
		border-bottom: none;
	}

	.track-label {
		width: 65px;
		font-size: 9px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex-shrink: 0;
	}

	.track-canvas {
		flex: 1;
		min-height: 32px;
		position: relative;
		background: var(--bg-primary);
		border-radius: 4px;
		border: 1px solid var(--border);
		overflow: visible;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
	}

	.timeline-canvas {
		position: relative;
		height: 36px;
		overflow: visible;
	}

	/* Keyframe chips */
	.keyframe-chip {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 28px;
		height: 28px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		cursor: pointer;
		border: 2px solid var(--accent);
		background: var(--bg-secondary);
		color: var(--accent);
		font-weight: 700;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.15s;
		z-index: 2;
	}

	.keyframe-chip:hover {
		box-shadow: 0 0 12px var(--accent-glow);
		transform: translateY(-50%) scale(1.1);
	}

	.keyframe-chip.has-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 4px;
	}

	.keyframe-chip.dragging {
		opacity: 0.7;
		cursor: grabbing;
	}

	.delete-kf-tl-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ff4444;
		color: white;
		font-size: 9px;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
		z-index: 3;
	}

	.keyframe-chip:hover .delete-kf-tl-btn {
		opacity: 1;
	}

	.add-kf-tl-btn {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: 1px dashed var(--border-light);
		background: transparent;
		color: var(--text-muted);
		font-size: 14px;
		transition: all 0.15s;
	}

	.add-kf-tl-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	/* Global track */
	.global-track-canvas {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.global-track-canvas.empty-track {
		justify-content: center;
	}

	.global-chip-tl {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		font-size: 10px;
		transition: all 0.15s;
	}

	.global-chip-tl:hover {
		border-color: var(--accent);
		background: var(--accent-glow);
	}

	.global-chip-tl.disabled {
		opacity: 0.5;
	}

	.global-text-tl {
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-secondary);
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Segment timeline */
	.segment-timeline-canvas {
		position: relative;
		height: 40px;
		overflow: visible;
	}

	.segment-block {
		position: absolute;
		top: 4px;
		bottom: 4px;
		background: linear-gradient(135deg, rgba(89, 181, 255, 0.2), rgba(187, 136, 238, 0.2));
		border: 1px solid var(--accent);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 6px;
		cursor: pointer;
		transition: all 0.15s;
		overflow: hidden;
	}

	.segment-block:hover {
		background: linear-gradient(135deg, rgba(89, 181, 255, 0.3), rgba(187, 136, 238, 0.3));
		box-shadow: 0 0 12px var(--accent-glow);
	}

	.segment-label {
		font-size: 9px;
		font-weight: 600;
		color: var(--text-primary);
		font-family: 'JetBrains Mono', monospace;
	}

	.delete-segment-btn {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ff4444;
		color: white;
		border: none;
		cursor: pointer;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}

	.segment-block:hover .delete-segment-btn {
		opacity: 1;
	}

	.tag-mini-chip {
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 8px;
		font-weight: 600;
		cursor: pointer;
		background: var(--bg-tertiary);
		transition: all 0.15s;
	}

	.tag-mini-chip:hover {
		opacity: 0.8;
	}

	/* Add segment */
	.add-segment-track .track-canvas button {
		width: 100%;
		height: 100%;
		background: transparent;
		border: 1px dashed var(--border-light);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 11px;
		transition: all 0.15s;
	}

	.add-segment-track .track-canvas button:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	/* QC track */
	.qc-track .track-canvas {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.qc-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.qc-label {
		font-size: 9px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
	}

	.qc-value {
		font-size: 10px;
		color: var(--accent);
		font-family: 'JetBrains Mono', monospace;
		min-width: 20px;
		text-align: center;
	}

	.qc-item input[type="range"] {
		width: 60px;
		height: 4px;
		accent-color: var(--accent);
	}

	.length-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.length-input {
		width: 50px;
		padding: 2px 4px;
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--accent);
		font-size: 10px;
		font-family: 'JetBrains Mono', monospace;
		text-align: center;
	}

	.length-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.qc-unit {
		font-size: 9px;
		color: var(--text-muted);
	}

	/* Add pipe button */
	.add-pipe-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px;
		border: 2px dashed var(--border-light);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
		background: transparent;
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 500;
		margin-top: 4px;
	}

	.add-pipe-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-glow);
	}

	/* Modal styles */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 12px;
		min-width: 320px;
		max-width: 500px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		border-bottom: 1px solid var(--border);
	}

	.modal-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.modal-close {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg-tertiary);
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.modal-close:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.modal-body {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.form-group input[type="text"],
	.form-group input[type="number"],
	.form-group textarea {
		padding: 8px 12px;
		background: var(--bg-primary);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-primary);
		font-size: 13px;
		font-family: inherit;
		transition: all 0.15s;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.form-group textarea {
		min-height: 80px;
		resize: vertical;
	}

	.mode-buttons {
		display: flex;
		gap: 8px;
	}

	.mode-buttons button {
		flex: 1;
		padding: 8px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.mode-buttons button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.mode-buttons button.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 16px;
		border-top: 1px solid var(--border);
	}

	.btn-cancel,
	.btn-confirm {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
		border: 1px solid var(--border);
	}

	.btn-cancel {
		background: var(--bg-tertiary);
		color: var(--text-muted);
	}

	.btn-cancel:hover {
		border-color: var(--border-light);
		color: var(--text-primary);
	}

	.btn-confirm {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}

	.btn-confirm:hover:not(:disabled) {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Toast */
	.toast {
		position: fixed;
		bottom: 20px;
		right: 20px;
		padding: 12px 20px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		z-index: 2000;
		animation: slideIn 0.3s ease;
	}

	.toast-success {
		background: var(--accent);
		color: white;
	}

	.toast-error {
		background: #ff4444;
		color: white;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	/* Tag type display */
	.tag-type-display {
		font-size: 12px;
		font-weight: 600;
		padding: 4px 8px;
		background: var(--bg-tertiary);
		border-radius: 4px;
	}
</style>
