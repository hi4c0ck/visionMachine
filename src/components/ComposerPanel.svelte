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

	// View mode state
	let viewMode = $state<'list' | 'timeline'>('list');

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
	let activeSegmentId = $state<string | null>(null);
	let activeSegmentPipeIndex = $state<number | null>(null);
	let segmentValue = $state(0);
	let segmentPrompt = $state('');

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

	// Add segment modal
	let showAddSegmentModal = $state(false);
	let activeSegmentAddPipeIndex = $state<number | null>(null);
	let newSegmentStart = $state(0);
	let newSegmentEnd = $state(121);

	// Add tag type picker
	let showTypePicker = $state(false);
	let activePipeForType = $state<number | null>(null);
	let activeSelectedTag: TagType | null = $state(null);

	// All tag types
	const allTags = Object.keys(TAG_SPECIFICATIONS) as TagType[];

	function getGlobalElement(pipe: PipeRow): GlobalElement | undefined {
		return pipe.elements.find(e => e.tag === 'global_style') as GlobalElement | undefined;
	}

	function getTimelineElement(pipe: PipeRow): TimelineElement | undefined {
		return pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
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
		if (!session?.id || activeGlobalPipeIndex === null || !activeGlobalElementId) return;
		const pipe = pipes[activeGlobalPipeIndex];
		if (!pipe) return;

		try {
			const result = await updateGlobalElementAction(
				session.id, 
				pipe.id, 
				activeGlobalElementId, 
				globalPromptText
			);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			} else {
				showToast('Global style updated', 'success');
			}
			closeGlobalModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to update global:', e);
			showToast('Failed to update global', 'error');
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
		showAddSegmentModal = true;
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
		showAddSegmentModal = false;
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
			if (tag.spec.usePrompt) {
				const result = await updateTagPromptAction(
					session.id, pipe.id, segment.id, activeTagId, tagPrompt
				);
				if (result.errors.length > 0) {
					showToast(result.errors[0], 'error');
				}
			} else {
				const result = await updateTagValueAction(
					session.id, pipe.id, segment.id, activeTagId, tagValue
				);
				if (result.errors.length > 0) {
					showToast(result.errors[0], 'error');
				}
			}
			showToast('Tag updated', 'success');
			closeTagModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to update tag:', e);
			showToast('Failed to update tag', 'error');
		}
	}

	function closeTagModal() {
		showTagModal = false;
		activeTagId = null;
		activeTagPipeIndex = null;
		activeTagSegmentIndex = null;
		tagValue = 0;
		tagPrompt = '';
	}

	async function removeTag(pipeIndex: number, segmentId: string, tagId: string) {
		if (!session?.id) return;
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

	async function resizeTag(pipeIndex: number, segmentId: string, tagId: string, vals: [number, number]) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const maxEnd = snapTo8(pipe.lengthFrames - 1);
		const [newStart, newEnd] = vals.map(v => snapTo8(Math.max(0, Math.min(v, maxEnd))));
		
		if (newEnd <= newStart) {
			showToast('Tag must have positive span', 'error');
			return;
		}

		try {
			const result = await resizeTagElementAction(session.id, pipe.id, segmentId, tagId, newStart, newEnd);
			if (result.errors.length > 0) {
				showToast(`Resize failed: ${result.errors.join(', ')}`, 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to resize tag:', e);
			showToast('Failed to resize tag', 'error');
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

	function deleteKeyframe(pipeIndex: number, keyframeId: string) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		removeKeyframe(session.id, pipe.id, keyframeId).catch(e => {
			console.error('[ComposerPanel] Failed to delete keyframe:', e);
		});
	}

	// ── Pipe Settings ─────────────────────────────────────────────────────────

	async function updateQ(pipeIndex: number, value: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			const result = await updateQAction(session.id, pipe.id, value);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to update Q:', e);
		}
	}

	async function updateC(pipeIndex: number, value: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			const result = await updateCAction(session.id, pipe.id, value);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to update C:', e);
		}
	}

	async function updatePipeLength(pipeIndex: number, newLength: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const maxEnd = getMaxFrames(session.resolution || '720p');
		const snapped = snapTo8nPlus1(newLength);
		const clamped = Math.max(MIN_PIPE_LENGTH, Math.min(snapped, maxEnd));

		try {
			const result = await setPipeLength(session.id, pipe.id, clamped);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
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

	async function handleUpdateFPS(fps: number) {
		if (!session?.id) return;
		try {
			const result = await storeUpdateFPS(session.id, fps);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to update FPS:', e);
		}
	}

	async function handleUpdateResolution(resolution: '480p' | '720p' | '1080p') {
		if (!session?.id) return;
		try {
			const result = await storeUpdateResolution(session.id, resolution);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to update resolution:', e);
		}
	}

	// ── Pipe Actions ──────────────────────────────────────────────────────────

	function movePipeUp(pipeIndex: number) {
		try {
			if (!session?.id || pipeIndex <= 0) return;
			const pipe = pipes[pipeIndex];
			if (!pipe) return;
			movePipeAction(session.id, pipe.id, 'up');
		} catch (e) {
			console.error('[ComposerPanel] Failed to move pipe up:', e);
		}
	}

	function movePipeDown(pipeIndex: number) {
		try {
			if (!session?.id || pipeIndex >= pipes.length - 1) return;
			const pipe = pipes[pipeIndex];
			if (!pipe) return;
			movePipeAction(session.id, pipe.id, 'down');
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
</script>

<div class="composer-panel">
	<!-- Header -->
	<div class="composer-header">
		<span class="composer-title">Composer</span>
		<div class="view-mode-toggle">
			<button class="view-mode-btn {viewMode === 'list' ? 'active' : ''}" onclick={() => viewMode = 'list'}>List</button>
			<button class="view-mode-btn {viewMode === 'timeline' ? 'active' : ''}" onclick={() => viewMode = 'timeline'}>Timeline</button>
		</div>
	</div>

	{#if !session}
		<div class="composer-empty">Select a session to compose</div>
	{:else}
		{#if viewMode === 'list'}
			<!-- List View -->
			<div class="pipes-list">
				{#each pipes as pipe, pipeIdx (pipe.id)}
					<div class="pipe-row">
						<div class="pipe-header">
							<span class="pipe-name">Pipe {pipeIdx + 1}</span>
							<div class="pipe-actions">
								<button onclick={() => movePipeUp(pipeIdx)} disabled={pipeIdx === 0} title="Move Up">↑</button>
								<button onclick={() => movePipeDown(pipeIdx)} disabled={pipeIdx === pipes.length - 1} title="Move Down">↓</button>
								<button onclick={() => deletePipe(pipeIdx)} title="Delete Pipe">×</button>
							</div>
						</div>

						<!-- Keyframes -->
						<div class="kf-row">
							{#each pipe.keyframes as kf, kfIdx (kf.id)}
								<div class="kf-box {kf.imageSrc ? 'has-image' : ''}" onclick={() => openAddModal(pipeIdx, kfIdx)} role="button" tabindex="0" title="Keyframe {kfIdx + 1}">
									{#if kf.imageSrc}
										<img src={kf.imageSrc} alt={`KF ${kfIdx + 1}`} class="kf-thumb" />
									{:else}
										<span class="kf-label">k{kfIdx + 1}</span>
									{/if}
									<button class="delete-kf-btn" onclick={(e) => { e.stopPropagation(); deleteKeyframe(pipeIdx, kf.id); }} title="Delete">×</button>
								</div>
							{/each}
							{#if pipe.keyframes.length < MAX_KEYFRAMES}
								<button class="add-kf-btn" onclick={() => openAddModal(pipeIdx)}>+</button>
							{/if}
						</div>

						<!-- Quality/Creativity -->
						<div class="qc-row">
							<label>Q: <input type="range" min={Q_MIN} max={Q_MAX} step="1" value={pipe.qValue} oninput={(e) => updateQ(pipeIdx, Number(e.currentTarget.value))} /></label>
							<span>{pipe.qValue}</span>
							<label>C: <input type="range" min={C_MIN} max={C_MAX} step="0.5" value={pipe.cValue} oninput={(e) => updateC(pipeIdx, Number(e.currentTarget.value))} /></label>
							<span>{pipe.cValue}</span>
						</div>

						<!-- Global Element -->
						{#if getGlobalElement(pipe)}
							<div class="global-element-row">
								<span class="global-label">GLOBAL:</span>
								{#each [getGlobalElement(pipe)] as global}
									<div class="global-chip {global.enabled ? '' : 'disabled'}" onclick={() => openGlobalModal(pipeIdx)} role="button" tabindex="0" title="Edit global style">
										<span>{global.enabled ? '●' : '○'}</span>
										<span class="global-text">{global.value.substring(0, 30)}{global.value.length > 30 ? '...' : ''}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="global-element-row">
								<span class="global-label">GLOBAL:</span>
								<button class="add-global-btn" onclick={() => openGlobalModal(pipeIdx)}>+ Add Global</button>
							</div>
						{/if}

						<!-- Timeline Segments -->
						{#if getTimelineElement(pipe)}
							<div class="segments-container">
								{#each getTimelineElement(pipe)!.segments as segment, segIdx (segment.id)}
									<div class="segment-block">
										<div class="segment-header">
											<span class="segment-range">[{segment.frameStart}-{segment.frameEnd}]</span>
											<div class="segment-actions">
												<button onclick={() => removeSegmentAction(pipeIdx, segment.id)} title="Delete Segment">×</button>
											</div>
										</div>
										
										<!-- Tags -->
										{#each segment.tags as tag, tagIdx (tag.id)}
											<div class="tag-row" onclick={() => openTagModal(pipeIdx, segIdx, tag)} role="button" tabindex="0">
												<span class="tag-name" style="color: {tag.spec.color}">[{tag.spec.name}]</span>
												<span class="tag-value">{tag.spec.usePrompt ? (tag.prompt?.substring(0, 20) || 'empty') : tag.value}</span>
												<button class="remove-tag-btn" onclick={(e) => { e.stopPropagation(); removeTag(pipeIdx, segment.id, tag.id); }} title="Remove">×</button>
											</div>
										{/each}
										
										<!-- Add Tag Buttons -->
										<div class="add-tag-row">
											{#each allTags as tagType}
												<button 
													class="add-tag-btn" 
													style="border-color: {TAG_SPECIFICATIONS[tagType].color}; color: {TAG_SPECIFICATIONS[tagType].color}"
													onclick={() => addTagElementAction(session!.id, pipe.id, segment.id, tagType).then(r => r.errors.length > 0 && showToast(r.errors[0], 'error'))}
												>
													+ {TAG_SPECIFICATIONS[tagType].name}
												</button>
											{/each}
										</div>
									</div>
								{/each}
								
								<!-- Add Segment Button -->
								<div class="add-segment-row" onclick={() => openAddSegmentModal(pipeIdx)} role="button" tabindex="0">
									<span>+</span>
									<span>Add Segment</span>
								</div>
							</div>
						{:else}
							<div class="segments-container">
								<div class="add-segment-row" onclick={() => openAddSegmentModal(pipeIdx)} role="button" tabindex="0">
									<span>+</span>
									<span>Add First Segment</span>
								</div>
							</div>
						{/if}

						<!-- Length Input -->
						<div class="length-row">
							<label class="length-label">Length:</label>
							<input type="number" class="length-input" value={pipe.lengthFrames} min={MIN_PIPE_LENGTH} max={getMaxFramesForResolution(session.resolution || '720p')} onblur={(e) => updatePipeLength(pipeIdx, Number(e.currentTarget.value))} />
							<span>f</span>
						</div>
					</div>
				{/each}
			</div>

			<!-- Add Pipe Button -->
			<div class="add-pipe-btn" onclick={openAddPipeModal} role="button" tabindex="0">
				<span>+</span>
				<span>Add Pipe</span>
			</div>
		{:else}
			<!-- Timeline View -->
			<div class="timeline-view">
				<!-- Timeline Header with Ruler -->
				<div class="timeline-header">
					<div class="timeline-ruler">
						<FrameRuler
							{totalFrames}
							markerInterval={8}
							{zoomLevel}
							{selectedFrame}
							onframeSelect={handleTimelineFrameSelect}
							onzoomChange={handleZoomChange}
						/>
					</div>
					<div class="timeline-zoom-controls">
						<button onclick={() => timelineZoom = Math.max(0.25, timelineZoom * 0.5)}>-</button>
						<span>{Math.round(timelineZoom * 100)}%</span>
						<button onclick={() => timelineZoom = Math.min(4, timelineZoom * 2)}>+</button>
					</div>
				</div>

				<!-- Timeline Tracks -->
				<div class="timeline-tracks">
					{#each pipes as pipe, pipeIdx (pipe.id)}
						<div class="pipe-timeline-track">
							<!-- Pipe Label -->
							<div class="pipe-timeline-label">
								<span>Pipe {pipeIdx + 1}</span>
								<div class="pipe-timeline-actions">
									<button onclick={() => movePipeUp(pipeIdx)} disabled={pipeIdx === 0} title="Move Up">↑</button>
									<button onclick={() => movePipeDown(pipeIdx)} disabled={pipeIdx === pipes.length - 1} title="Move Down">↓</button>
									<button class="delete" onclick={() => deletePipe(pipeIdx)} title="Delete Pipe">×</button>
								</div>
							</div>

							<!-- Keyframe Track -->
							<div class="track-row">
								<span class="track-label">KF</span>
								<div class="track-canvas">
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
											title="Keyframe {kfIdx + 1}"
										>
											{#if kf.imageSrc}
												<img src={kf.imageSrc} alt="KF" class="kf-timeline-thumb" />
											{:else}
												<span>k{kfIdx + 1}</span>
											{/if}
											<button class="delete-kf-tl-btn" onclick={(e) => { e.stopPropagation(); deleteKeyframe(pipeIdx, kf.id); }}>×</button>
										</div>
									{/each}
									{#if pipe.keyframes.length < MAX_KEYFRAMES}
										<div class="add-kf-tl-btn" onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)} role="button" tabindex="0">+</div>
									{/if}
								</div>
							</div>

							<!-- Global Track -->
							<div class="track-row">
								<span class="track-label">GLOBAL</span>
								<div class="track-canvas">
									{#if getGlobalElement(pipe)}
										{#each [getGlobalElement(pipe)] as global}
											<div class="global-chip-tl {global.enabled ? '' : 'disabled'}" onclick={() => openGlobalModal(pipeIdx)} role="button" tabindex="0" title="Edit global style">
												<span>{global.enabled ? '●' : '○'}</span>
												<span class="global-text-tl">{global.value.substring(0, 20)}{global.value.length > 20 ? '...' : ''}</span>
											</div>
										{/each}
									{:else}
										<button class="add-global-btn" onclick={() => openGlobalModal(pipeIdx)}>+ Add Global</button>
									{/if}
								</div>
							</div>

							<!-- Tag Tracks -->
							{#each allTags as tagType}
								
									{#if tagData.length > 0}
										<div class="track-row">
											<span class="track-label" style="color: {TAG_SPECIFICATIONS[tagType].color}">
												{TAG_SPECIFICATIONS[tagType].name}
											</span>
											<div class="track-canvas">
												{#each tagData as {tag, segment, segmentIndex} (tag.id)}
													<MultiThumbSlider
														values={[tag.frameStart, tag.frameEnd]}
														min={segment.frameStart}
														max={segment.frameEnd}
														step={8}
														color={tag.spec.color}
														onchange={(vals) => resizeTag(pipeIdx, segment.id, tag.id, vals)}
														ondblclick={(e) => { e.stopPropagation(); openTagModal(pipeIdx, segmentIndex, tag); }}
													/>
												{/each}
											</div>
										</div>
									{/if}
									
								{/each}

							<!-- Add Segment Row -->
							<div class="add-segment-row">
								<span class="track-label">Add</span>
								<div class="track-canvas">
									<button onclick={() => openAddSegmentModal(pipeIdx)}>+ Segment</button>
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Add Pipe Button in Timeline Mode -->
				<div class="add-pipe-tl-btn" onclick={openAddPipeModal} role="button" tabindex="0">
					<span class="add-pipe-icon">+</span>
					<span>Add Pipe</span>
				</div>
			</div>
		{/if}
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
					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeAddPipeModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmAddPipe}>Add</button>
					</div>
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

					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmAdd} disabled={
							(addMode === 'url' && !modalUrl.trim()) ||
							(addMode === 'txt2img' && !modalPrompt.trim()) ||
							(addMode === 'img2img' && !modalImg2Img.trim())
						}>Add</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Add Segment Modal -->
	{#if showAddSegmentModal && activeSegmentAddPipeIndex !== null}
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
					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeAddSegmentModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmAddSegment}>Add</button>
					</div>
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
					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeGlobalModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmGlobalEdit}>Save</button>
					</div>
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
					{#each pipes as pipe}
						{#each getTimelineElement(pipe)?.segments ?? [] as segment, segIdx (segment.id)}
							{#if segIdx === activeTagSegmentIndex}
								{#each segment.tags as tag (tag.id)}
									{#if tag.id === activeTagId}
										<div class="form-group">
											<label class="form-label">{TAG_SPECIFICATIONS[tag.tag].name} Value</label>
											{#if TAG_SPECIFICATIONS[tag.tag].usePrompt}
												<textarea bind:value={tagPrompt} placeholder="Enter prompt..."></textarea>
											{:else}
												<input type="number" bind:value={tagValue} min={tag.spec.min ?? 0} max={tag.spec.max ?? 100} step="1" />
											{/if}
										</div>
									{/if}
								{/each}
							{/if}
						{/each}
					{/each}
					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeTagModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmTagEdit}>Save</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Inherit existing styles */
	:global(.composer-panel) {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	
	:global(.composer-header) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
	}
	
	:global(.view-mode-toggle) {
		display: flex;
		gap: 0.5rem;
	}
	
	:global(.view-mode-btn) {
		padding: 0.5rem 1rem;
		border: 1px solid var(--border-color);
		background: var(--bg-secondary);
		color: var(--text-primary);
		cursor: pointer;
	}
	
	:global(.view-mode-btn.active) {
		background: var(--accent-color);
		color: var(--text-inverse);
	}
	
	:global(.pipes-list) {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	
	:global(.pipe-row) {
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 1rem;
		background: var(--bg-secondary);
	}
	
	:global(.pipe-header) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	
	:global(.pipe-actions button) {
		margin-left: 0.5rem;
		padding: 0.25rem 0.5rem;
	}
	
	:global(.kf-row) {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	
	:global(.kf-box) {
		width: 60px;
		height: 60px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		cursor: pointer;
	}
	
	:global(.kf-box.has-image img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 4px;
	}
	
	:global(.add-kf-btn) {
		padding: 0.5rem;
		border: 1px dashed var(--border-color);
		background: transparent;
		cursor: pointer;
	}
	
	:global(.qc-row) {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	
	:global(.global-element-row) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	
	:global(.global-label) {
		font-weight: bold;
	}
	
	:global(.global-chip) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--bg-tertiary);
		border-radius: 4px;
		cursor: pointer;
		flex: 1;
	}
	
	:global(.global-chip.disabled) {
		opacity: 0.5;
	}
	
	:global(.segments-container) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	
	:global(.segment-block) {
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 0.5rem;
		background: var(--bg-tertiary);
	}
	
	:global(.segment-header) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}
	
	:global(.segment-range) {
		font-family: monospace;
		font-size: 0.875rem;
	}
	
	:global(.tag-row) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--bg-secondary);
		border-radius: 4px;
		margin-bottom: 0.25rem;
		cursor: pointer;
	}
	
	:global(.tag-name) {
		font-weight: bold;
		min-width: 80px;
	}
	
	:global(.tag-value) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	
	:global(.remove-tag-btn) {
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
	}
	
	:global(.add-tag-row) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	
	:global(.add-tag-btn) {
		padding: 0.25rem 0.5rem;
		background: transparent;
		cursor: pointer;
		font-size: 0.75rem;
	}
	
	:global(.add-segment-row) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border: 1px dashed var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		margin-top: 0.5rem;
	}
	
	:global(.length-row) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	
	:global(.length-label) {
		font-weight: bold;
	}
	
	:global(.length-input) {
		width: 80px;
		padding: 0.25rem;
	}
	
	:global(.add-pipe-btn) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		border: 2px dashed var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		justify-content: center;
		margin: 1rem;
	}
	
	:global(.timeline-view) {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	
	:global(.timeline-header) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
	}
	
	:global(.timeline-ruler) {
		flex: 1;
	}
	
	:global(.timeline-zoom-controls) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: 1rem;
	}
	
	:global(.timeline-tracks) {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}
	
	:global(.pipe-timeline-track) {
		margin-bottom: 2rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 1rem;
		background: var(--bg-secondary);
	}
	
	:global(.pipe-timeline-label) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	
	:global(.track-row) {
		display: flex;
		align-items: center;
		margin-bottom: 0.5rem;
	}
	
	:global(.track-label) {
		width: 80px;
		font-weight: bold;
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	
	:global(.track-canvas) {
		flex: 1;
		height: 40px;
		position: relative;
		background: var(--bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
	}
	
	:global(.keyframe-chip) {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 32px;
		height: 32px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		cursor: pointer;
		border: 2px solid var(--accent-color);
		background: var(--bg-secondary);
	}
	
	:global(.keyframe-chip.has-image img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 2px;
	}
	
	:global(.add-kf-tl-btn) {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: 1px dashed var(--border-color);
		background: transparent;
	}
	
	:global(.add-segment-row button) {
		width: 100%;
		height: 100%;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
	}
	
	:global(.add-pipe-tl-btn) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		border: 2px dashed var(--border-color);
		border-radius: 4px;
		cursor: pointer;
		justify-content: center;
		margin: 1rem;
	}
	
	:global(.modal-backdrop) {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	
	:global(.modal) {
		background: var(--bg-primary);
		border-radius: 8px;
		padding: 1.5rem;
		min-width: 300px;
		max-width: 500px;
		width: 90%;
	}
	
	:global(.modal-header) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	
	:global(.modal-title) {
		font-size: 1.25rem;
		font-weight: bold;
	}
	
	:global(.modal-close) {
		background: transparent;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--text-muted);
	}
	
	:global(.modal-body) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	
	:global(.form-group) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	
	:global(.form-label) {
		font-weight: bold;
		font-size: 0.875rem;
	}
	
	:global(.form-group input),
	:global(.form-group textarea) {
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-secondary);
		color: var(--text-primary);
	}
	
	:global(.form-group textarea) {
		min-height: 100px;
		resize: vertical;
	}
	
	:global(.mode-buttons) {
		display: flex;
		gap: 0.5rem;
	}
	
	:global(.mode-buttons button) {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid var(--border-color);
		background: var(--bg-secondary);
		color: var(--text-primary);
		cursor: pointer;
	}
	
	:global(.mode-buttons button.active) {
		background: var(--accent-color);
		color: var(--text-inverse);
		border-color: var(--accent-color);
	}
	
	:global(.modal-actions) {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	
	:global(.btn-cancel),
	:global(.btn-confirm) {
		padding: 0.5rem 1rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		cursor: pointer;
	}
	
	:global(.btn-cancel) {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}
	
	:global(.btn-confirm) {
		background: var(--accent-color);
		color: var(--text-inverse);
		border-color: var(--accent-color);
	}
	
	:global(.btn-confirm:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	:global(.toast) {
		position: fixed;
		bottom: 1rem;
		right: 1rem;
		padding: 1rem;
		border-radius: 4px;
		color: white;
		z-index: 2000;
		animation: slideIn 0.3s ease-out;
	}
	
	:global(.toast-success) {
		background: #22c55e;
	}
	
	:global(.toast-error) {
		background: #ef4444;
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
</style>
