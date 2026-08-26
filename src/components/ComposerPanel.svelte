<script lang="ts">
	import type { SessionData, PipeRow, PromptSegment, TagType, PipeKeyframe } from '$types';
	import {
		snapTo8nPlus1,
		snapTo8,
		getMaxFrames,
	} from '$lib/frameMath';
	import {
		validatePromptSegments,
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
		addSegment as addSegmentAction,
		removeSegment,
		moveSegment as moveSegmentAction,
		resizeSegment as resizeSegmentAction,
		addKeyframe,
		removeKeyframe,
		moveKeyframe,
		setGlobalPrompt,
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

	// Global prompt modal state
	let showGlobalModal = $state(false);
	let activeGlobalPipeIndex = $state<number | null>(null);
	let globalPromptText = $state('');

	// Add segment type picker
	let showTypePicker = $state(false);
	let activePipeForType = $state<number | null>(null);

	// All tag types
	const allTags = Object.keys(TAG_SPECIFICATIONS) as TagType[];

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
	}

	async function confirmAddPipe() {
			if (!session?.id) {
				showToast('No active session', 'error');
				return;
			}
			try {
				const result = await addPipe(session.id);
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

	function closeSegmentModal() {
		showSegmentModal = false;
		activeSegmentId = null;
		activeSegmentPipeIndex = null;
	}

	async function confirmSegmentUpdate() {
		if (!session?.id || activeSegmentId === null || activeSegmentPipeIndex === null) return;
		const pipe = pipes[activeSegmentPipeIndex];
		if (!pipe) return;

		const segment = pipe.segments.find(s => s.id === activeSegmentId);
		if (!segment) return;

		try {
			// Update via store
			const testSegments = pipe.segments.map(s =>
				s.id === activeSegmentId
					? TAG_SPECIFICATIONS[s.tag].usePrompt
						? { ...s, prompt: segmentPrompt }
						: { ...s, value: segmentValue }
					: s
			);
			// Validate manually before saving
			const validation = validatePromptSegments(testSegments);
			if (!validation.valid) {
				showToast(`Validation failed: ${validation.errors.join(', ')}`, 'error');
				return;
			}
			// Apply directly since store doesn't have updateSegment yet
			onUpdate({ ...session, pipes: pipes.map((p, idx) => idx === activeSegmentPipeIndex ? { ...p, segments: testSegments } : p) });
			closeSegmentModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to update segment:', e);
			showToast('Failed to update segment', 'error');
		}
	}

	function closeGlobalPromptModal() {
		showGlobalModal = false;
		activeGlobalPipeIndex = null;
	}

	async function confirmGlobalPrompt() {
		if (!session?.id || activeGlobalPipeIndex === null) return;
		const pipe = pipes[activeGlobalPipeIndex];
		if (!pipe) return;

		try {
					// Use globalNodes if available, otherwise fall back to globalPrompt
					if (pipe.globalNodes && pipe.globalNodes.length > 0) {
						// Add as first global node
						const newNodes = [...pipe.globalNodes, { id: crypto.randomUUID(), tag: 'global_style', value: globalPromptText, enabled: true }];
						onUpdate({ ...session, pipes: pipes.map((p, idx) => idx === activeGlobalPipeIndex ? { ...p, globalNodes: newNodes } : p) });
					} else {
						const result = await setGlobalPrompt(session.id, pipe.id, globalPromptText);
						if (result.errors.length > 0) {
							showToast(result.errors[0], 'error');
							return;
						}
					}
					closeGlobalPromptModal();
					showToast('Global prompt saved', 'success');
				} catch (e) {
					console.error('[ComposerPanel] Failed to save global prompt:', e);
					showToast('Failed to save global prompt', 'error');
				}
	}

	let activeGlobalNodeIndex = $state<number | null>(null);
	let globalNodeModalOpen = $state(false);
	let editingGlobalNodeValue = $state('');

	// Segment body drag state (T4)
	let dragSegmentPipeIndex = $state<number | null>(null);
	let dragSegmentId = $state<string | null>(null);
	let dragSegmentStartX = $state(0);
	let dragSegmentStartFrame = $state(0);

	// Keyframe drag repositioning (T3 - R3)
	let isDraggingKeyframe = $state(false);
	let dragKeyframeStartX = $state(0);
	let dragKeyframeStartFrame = $state(0);
	let dragKeyframeId = $state<string | null>(null);
	let dragKeyframePipeIndex = $state<number | null>(null);

	function openGlobalNodeModal(pipeIndex: number, nodeIndex: number) {
		activeGlobalPipeIndex = pipeIndex;
		activeGlobalNodeIndex = nodeIndex;
		const node = pipes[pipeIndex]?.globalNodes?.[nodeIndex];
		editingGlobalNodeValue = node?.value || '';
		globalNodeModalOpen = true;
	}

	function closeGlobalNodeModal() {
		globalNodeModalOpen = false;
		activeGlobalNodeIndex = null;
	}

	async function confirmGlobalNodeEdit() {
		if (!session?.id || activeGlobalPipeIndex === null || activeGlobalNodeIndex === null) return;
		const pipe = pipes[activeGlobalPipeIndex];
		if (!pipe?.globalNodes) return;

		const newNodes = pipe.globalNodes.map((n, i) =>
			i === activeGlobalNodeIndex ? { ...n, value: editingGlobalNodeValue } : n
		);
		onUpdate({ ...session, pipes: pipes.map((p, idx) => idx === activeGlobalPipeIndex ? { ...p, globalNodes: newNodes } : p) });
		closeGlobalNodeModal();
	}

	async function toggleGlobalNode(pipeIndex: number, nodeIndex: number) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe?.globalNodes) return;

		const newNodes = pipe.globalNodes.map((n, i) =>
			i === nodeIndex ? { ...n, enabled: !n.enabled } : n
		);
		onUpdate({ ...session, pipes: pipes.map((p, idx) => idx === pipeIndex ? { ...p, globalNodes: newNodes } : p) });
	}

	async function deleteGlobalNode(pipeIndex: number, nodeIndex: number) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe?.globalNodes) return;

		const newNodes = pipe.globalNodes.filter((_, i) => i !== nodeIndex);
		onUpdate({ ...session, pipes: pipes.map((p, idx) => idx === pipeIndex ? { ...p, globalNodes: newNodes } : p) });
	}

	async function addGlobalNode(pipeIndex: number) {
		if (!session?.id) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const newNode = { id: crypto.randomUUID(), tag: 'global_style', value: '', enabled: true };
		const newNodes = [...(pipe.globalNodes ?? []), newNode];
		onUpdate({ ...session, pipes: pipes.map((p, idx) => idx === pipeIndex ? { ...p, globalNodes: newNodes } : p) });
		openGlobalNodeModal(pipeIndex, newNodes.length - 1);
	}

	function closeTypePicker() {
		showTypePicker = false;
		activePipeForType = null;
	}

	async function confirmAddSegment() {
		if (!session?.id || activePipeForType === null) return;
		const pipe = pipes[activePipeForType];
		if (!pipe) return;

		try {
			const result = await addSegmentAction(session.id, pipe.id, activeSelectedTag!);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			} else {
				showToast('Segment added', 'success');
			}
			closeTypePicker();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add segment:', e);
			showToast('Failed to add segment', 'error');
		}
	}

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
		
		// Find first free slot (1-3)
		const usedSlots = pipe.keyframes.map(k => k.slot_index).filter(s => s != null);
		let slot = kfSlot ?? 1;
		for (let i = 1; i <= 3; i++) {
			if (!usedSlots.includes(i)) {
				slot = i;
				break;
			}
		}
		
		activePipeIndex = pipeIndex;
		activeKfIndex = slot;
		showAddModal = true;
	}

	async function confirmAdd() {
		if (!session?.id || activePipeIndex === null) return;
		const pipe = pipes[activePipeIndex];
		if (!pipe) return;

		// Find first free slot (1-3) if not specified
		const usedSlots = pipe.keyframes.map(k => k.slot_index).filter(s => s != null);
		let slotIndex = activeKfIndex ?? 1;
		for (let i = 1; i <= 3; i++) {
			if (!usedSlots.includes(i)) {
				slotIndex = i;
				break;
			}
		}

		// Try to determine base frame from last keyframe
		let baseFrame = 0;
		if (pipe.keyframes.length > 0) {
			const lastFrame = Math.max(...pipe.keyframes.map(k => k.frame));
			baseFrame = snapTo8nPlus1(lastFrame + 60);
			if (baseFrame >= pipe.lengthFrames) return;
		}

		const addModeType = addMode;
		const urlValue = modalUrl;
		const promptValue = modalPrompt;
		const img2ImgValue = modalImg2Img;
		const slot = slotIndex;
		const frame = baseFrame;

		try {
			const result = await addKeyframe(session.id, pipe.id, addModeType, {
				slot_index: slot,
				frame,
				imageSrc: addModeType === 'url' ? urlValue || undefined : undefined,
				prompt: addModeType === 'txt2img' ? promptValue : undefined,
				referenceUrl: addModeType === 'img2img' ? img2ImgValue : undefined,
			});
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to confirm add:', e);
			showToast('Failed to add keyframe', 'error');
		} finally {
			closeModal();
		}
	}

	function openSegmentModal(pipeIndex: number, segment: PromptSegment) {
		activeSegmentPipeIndex = pipeIndex;
		activeSegmentId = segment.id;
		segmentValue = segment.value;
		segmentPrompt = segment.prompt || '';
		showSegmentModal = true;
	}

	function openGlobalPromptModal(pipeIndex: number) {
		activeGlobalPipeIndex = pipeIndex;
		globalPromptText = pipes[pipeIndex]?.globalPrompt?.text || '';
		showGlobalModal = true;
	}

	function openTypePicker(pipeIndex: number) {
		activePipeForType = pipeIndex;
		showTypePicker = true;
	}

	let activeSelectedTag: TagType | null = null;

	function confirmTypeSelection() {
		if (!activeSelectedTag || !session?.id || activePipeForType === null) return;
		const pipe = pipes[activePipeForType];
		if (!pipe) return;

		const spec = TAG_SPECIFICATIONS[activeSelectedTag];
		if (!spec) return;

		const maxEnd = snapTo8(pipe.lengthFrames - 1);
		const newSegment: PromptSegment = {
			id: crypto.randomUUID(),
			tag: activeSelectedTag,
			value: spec.min ?? 0,
			prompt: '',
			frameStart: 0,
			frameEnd: maxEnd,
			spec,
		};

		const testSegments = [...pipe.segments, newSegment];
		// Re-validate with frame-boundary rules using maxEnd
		const validation = validatePromptSegments(testSegments);

		// Also check segment boundary validity via frameMath
		for (const seg of testSegments) {
			if (seg.frameStart % 8 !== 0) {
				validation.valid = false;
				validation.errors.push(`frameStart must be a multiple of 8`);
			}
			if (seg.frameEnd % 8 !== 0) {
				validation.valid = false;
				validation.errors.push(`frameEnd must be a multiple of 8`);
			}
			if (seg.frameEnd > maxEnd) {
				validation.valid = false;
				validation.errors.push(`frameEnd exceeds max usable frame (${maxEnd})`);
			}
			if (seg.frameEnd - seg.frameStart < 8) {
				validation.valid = false;
				validation.errors.push(`minimum span is 8 frames`);
			}
		}

		if (!validation.valid) {
			showToast(`Cannot add segment: ${validation.errors.join(', ')}`, 'error');
			closeTypePicker();
			return;
		}

		try {
			const updatedPipes = pipes.map((p, idx) =>
				idx !== activePipeForType ? p : { ...p, segments: testSegments }
			);
			onUpdate({ ...session, pipes: updatedPipes });
			closeTypePicker();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add segment:', e);
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

	function editParam(segment: PromptSegment, field: 'value' | 'prompt', newValue: any) {
		// This is handled by the segment modal
	}

	async function updateParam(pipeIndex: number, segmentId: string, value: number) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		
		const result = await moveSegment(session.id, pipe.id, segmentId, 0);
		if (result.errors.length > 0) {
			showToast(result.errors[0], 'error');
			return;
		}
		
		const updatedPipes = pipes.map((p, idx) => {
			if (idx !== pipeIndex) return p;
			return {
				...p,
				segments: p.segments.map(s => (s.id === segmentId ? { ...s, value } : s)),
			};
		});
		onUpdate({ ...session, pipes: updatedPipes });
	}

	async function removeParam(pipeIndex: number, segmentId: string) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			await removeSegment(session.id, pipe.id, segmentId);
		} catch (e) {
			console.error('[ComposerPanel] Failed to remove param:', e);
		}
	}

	async function resizeSegment(pipeIndex: number, segId: string, vals: [number, number]) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		const maxEnd = snapTo8(pipe.lengthFrames - 1);
		// MultiThumbSlider already snaps to step=8, but double-check
		const [newStart, newEnd] = vals.map(v => snapTo8(Math.max(0, Math.min(v, maxEnd))));
		
		if (newEnd <= newStart) {
			showToast('Segment must have positive span', 'error');
			return;
		}

		const testSegments = pipe.segments.map(s =>
			s.id === segId ? { ...s, frameStart: newStart, frameEnd: newEnd } : s
		);
		const validation = validatePromptSegments(testSegments);
		
		if (!validation.valid) {
			showToast(`Invalid segment: ${validation.errors.join(', ')}`, 'error');
			return;
		}

		try {
			const result = await resizeSegmentAction(session.id, pipe.id, segId, newStart, newEnd);
			if (result.errors.length > 0) {
				showToast(`Resize failed: ${result.errors.join(', ')}`, 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to resize segment:', e);
			showToast('Failed to resize segment', 'error');
		}
	}

	function moveParamFrame(pipeIndex: number, segmentId: string, delta: number) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe) return;

			const segment = pipe.segments.find(s => s.id === segmentId);
			if (!segment) return;

			// Snap to 8n boundaries
			const maxEnd = snapTo8(pipe.lengthFrames - 1);
			const newStart = snapTo8(segment.frameStart + delta);
			const newEnd = snapTo8(segment.frameEnd + delta);
			
			if (newStart < 0 || newEnd > maxEnd) {
				showToast('Segment out of bounds', 'error');
				return;
			}

			const testSegments = pipe.segments.map(s =>
				s.id === segmentId ? { ...s, frameStart: newStart, frameEnd: newEnd } : s
			);
			const validation = validatePromptSegments(testSegments, maxEnd);

			if (!validation.valid) {
				showToast(`Invalid position: ${validation.errors.join(', ')}`, 'error');
				return;
			}

			const updatedPipes = pipes.map((p, idx) =>
				idx !== pipeIndex ? p : { ...p, segments: testSegments }
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to move param frame:', e);
		}
	}

	async function deleteKeyframe(pipeIndex: number, keyframeId: string) {
		if (!session?.id || pipeIndex < 0) return;
		const pipe = pipes[pipeIndex];
		if (!pipe) return;

		try {
			const result = await removeKeyframe(session.id, pipe.id, keyframeId);
			if (result.errors.length > 0) {
				showToast(result.errors[0], 'error');
			}
		} catch (e) {
			console.error('[ComposerPanel] Failed to delete keyframe:', e);
		}
	}

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

	// Keyframe drag repositioning (T3 - R3)
	function handleKeyframePointerDown(pipeIndex: number, kfId: string, frame: number, e: PointerEvent) {
		e.preventDefault();
		isDraggingKeyframe = true;
		dragKeyframeStartX = e.clientX;
		dragKeyframeStartFrame = frame;
		dragKeyframeId = kfId;
		dragKeyframePipeIndex = pipeIndex;
		// Prevent click handler from firing during drag
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleKeyframePointerMove(e: PointerEvent) {
		if (!isDraggingKeyframe || dragKeyframePipeIndex === null || dragKeyframeId === null) return;
		// Live preview would require a separate state for drag offset
		// For now we just track the movement; actual commit happens on pointerup
	}

	async function handleKeyframePointerUp(e: PointerEvent) {
		if (!isDraggingKeyframe || dragKeyframePipeIndex === null || dragKeyframeId === null) return;
		isDraggingKeyframe = false;
		const deltaPx = e.clientX - dragKeyframeStartX;
		if (Math.abs(deltaPx) < 4) {
			// Treated as click, not drag — allow modal to open
			return;
		}
		const pipe = pipes[dragKeyframePipeIndex];
		if (!pipe) return;
		const trackWidth = (e.currentTarget as HTMLElement)?.offsetWidth || 1;
		const deltaFrames = Math.round((deltaPx / trackWidth) * pipe.lengthFrames / 8) * 8;
		const newFrame = snapTo8nPlus1(dragKeyframeStartFrame + deltaFrames);
		if (newFrame < 0 || newFrame >= pipe.lengthFrames) {
			showToast('Keyframe position out of bounds', 'error');
			return;
		}
		try {
			await moveKeyframe(session!.id, pipe.id, dragKeyframeId, deltaFrames);
		} catch (err) {
			showToast(`Failed to move keyframe: ${String(err)}`, 'error');
		} finally {
			dragKeyframeId = null;
			dragKeyframePipeIndex = null;
		}
	}

	function handleSegmentBodyDragStart(pipeIndex: number, segmentId: string, e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		const segment = pipe.segments.find(s => s.id === segmentId);
		if (!segment) return;

		dragSegmentPipeIndex = pipeIndex;
		dragSegmentId = segmentId;
		dragSegmentStartX = e.clientX;
		dragSegmentStartFrame = segment.frameStart;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleSegmentBodyDragMove(e: PointerEvent) {
		// Track movement for live preview
	}

	async function handleSegmentBodyDragEnd(e: PointerEvent) {
		if (dragSegmentPipeIndex === null || dragSegmentId === null) return;
		const pipe = pipes[dragSegmentPipeIndex];
		if (!pipe) return;

		const deltaPx = e.clientX - dragSegmentStartX;
		if (Math.abs(deltaPx) < 4) {
			// Treated as click, not drag
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
			return;
		}

		const trackWidth = (e.currentTarget as HTMLElement)?.parentElement?.offsetWidth || 1;
		const deltaFrames = Math.round((deltaPx / trackWidth) * pipe.lengthFrames / 8) * 8;
		const newStart = snapTo8nPlus1(dragSegmentStartFrame + deltaFrames);
		const segment = pipe.segments.find(s => s.id === dragSegmentId);
		if (!segment) {
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
			return;
		}
		const segLength = segment.frameEnd - segment.frameStart;
		const newEnd = newStart + segLength;

		if (newStart < 0 || newEnd > pipe.lengthFrames) {
			showToast('Segment position out of bounds', 'error');
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
			return;
		}

		try {
			const result = await moveSegmentAction(session!.id, pipe.id, dragSegmentId, deltaFrames);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			}
		} catch (err) {
			showToast(`Failed to move segment: ${String(err)}`, 'error');
		} finally {
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
		}
	}


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

						<!-- Row 1: Keyframes -->
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
								<button class="add-kf-btn" onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)}>+</button>
							{/if}
						</div>

						<!-- Row 2: Quality/Creativity -->
						<div class="qc-row">
							<label>Q: <input type="range" min={Q_MIN} max={Q_MAX} step="1" value={pipe.qValue} oninput={(e) => updateQ(pipeIdx, Number(e.currentTarget.value))} /></label>
							<span>{pipe.qValue}</span>
							<label>C: <input type="range" min={C_MIN} max={C_MAX} step="0.5" value={pipe.cValue} oninput={(e) => updateC(pipeIdx, Number(e.currentTarget.value))} /></label>
							<span>{pipe.cValue}</span>
						</div>

						<!-- Row 3: Segments -->
						<div class="segments-container">
							{#each pipe.segments as segment (segment.id)}
								<div class="param-row" style="--tag-color: {segment.spec.color}" onclick={() => openSegmentModal(pipeIdx, segment)} role="button" tabindex="0">
									<div class="param-frame-indicator">
										<span class="param-frame">{segment.frameStart}-{segment.frameEnd}</span>
									</div>
									<div class="param-content">
										<span class="param-name" style="color: {segment.spec.color}">[{segment.spec.name}]</span>
										{#if segment.spec.usePrompt}
											<input type="text" value={segment.prompt || ''} oninput={(e) => updateParam(pipeIdx, segment.id, e.currentTarget.value)} />
										{:else}
											<input type="number" min={segment.spec.min ?? 0} max={segment.spec.max ?? 100} step="1" value={segment.value} oninput={(e) => updateParam(pipeIdx, segment.id, Number(e.currentTarget.value))} />
										{/if}
									</div>
									<div class="param-controls" onclick={(e) => e.stopPropagation()}>
										<button class="move-btn" onclick={() => moveParamFrame(pipeIdx, segment.id, -8)} title="Move left (-8f)">&lt;</button>
										<button class="move-btn" onclick={() => moveParamFrame(pipeIdx, segment.id, 8)} title="Move right (+8f)">&gt;</button>
										<button class="remove-param-btn" onclick={() => removeParam(pipeIdx, segment.id)} title="Remove">×</button>
									</div>
								</div>
							{/each}
							<div class="add-param-row" onclick={() => openTypePicker(pipeIdx)} role="button" tabindex="0">
								<span>+</span>
								<span>Add Segment</span>
							</div>
						</div>

						<!-- Row 4: Length Input -->
						<div class="length-row">
							<label class="length-label">Length:</label>
							<input type="number" class="length-input" value={pipe.lengthFrames} min={MIN_PIPE_LENGTH} max={getMaxFramesForResolution(session.resolution || '720p')} onblur={(e) => updatePipeLength(pipeIdx, Number(e.currentTarget.value))} />
							<span>f</span>
						</div>

						<!-- Global Prompt Bar -->
						<div class="global-prompt-bar" onclick={() => openGlobalPromptModal(pipeIdx)} role="button" tabindex="0">
							{#if pipe.globalPrompt?.text}
								<span class="global-preview">"{pipe.globalPrompt.text.substring(0, 30)}{pipe.globalPrompt.text.length > 30 ? '...' : ''}"</span>
							{:else}
								<span class="global-add">+ Add global prompt</span>
							{/if}
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

							<!-- Segment Tracks by Tag Type - rendered as MultiThumbSlider -->
							{#each allTags as tagType}
								<div class="track-row">
									<span class="track-label" style="color: {TAG_SPECIFICATIONS[tagType].color}">
										{TAG_SPECIFICATIONS[tagType].name}
									</span>
									<div class="track-canvas">
										{#each pipe.segments.filter(s => s.tag === tagType) as segment (segment.id)}
											<MultiThumbSlider
												values={[segment.frameStart, segment.frameEnd]}
												min={0}
												max={pipe.lengthFrames}
												step={8}
												color={segment.spec.color}
												onchange={(vals) => resizeSegment(pipeIdx, segment.id, vals)}
												ondblclick={(e) => { e.stopPropagation(); openSegmentModal(pipeIdx, segment); }}
											/>
											<!-- Body drag overlay (T4) -->
											<div
												class="segment-body-drag"
												onpointerdown={(e) => handleSegmentBodyDragStart(pipeIdx, segment.id, e)}
												onpointermove={(e) => handleSegmentBodyDragMove(e)}
												onpointerup={(e) => handleSegmentBodyDragEnd(e)}
												style="left: calc({segment.frameStart / pipe.lengthFrames * 100}%); width: calc({(segment.frameEnd - segment.frameStart) / pipe.lengthFrames * 100}%);"
											></div>
										{/each}
									</div>
								</div>
							{/each}

							<!-- Add Segment Row -->
							<div class="add-segment-row">
								<span class="track-label">Add</span>
								<div class="track-canvas">
									<button onclick={() => openTypePicker(pipeIdx)}>+ Segment</button>
								</div>
							</div>

							<!-- Global Nodes (Task 5 - two-layer hierarchy) -->
							<div class="track-row">
								<span class="track-label">GLOBAL</span>
								<div class="track-canvas" style="position:relative;">
									{#each pipe.globalNodes ?? [] as node, nIdx (node.id)}
										<div class="global-node-chip {node.enabled === false ? 'disabled' : ''}"
											style="left: calc({nIdx * 100 / ((pipe.globalNodes ?? []).length + 1)}%);"
											onclick={() => openGlobalNodeModal(pipeIdx, nIdx)}
											role="button"
											tabindex="0"
											title="{node.value.substring(0, 20)}"
										>
											<span>{node.enabled ? '●' : '○'}</span>
											<span class="global-node-text">{node.value.substring(0, 15)}{node.value.length > 15 ? '...' : ''}</span>
										</div>
									{/each}
									<button class="add-global-btn"
										onclick={() => addGlobalNode(pipeIdx)}
										title="Add global node"
									>+ G</button>
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

	<!-- Segment Edit Modal -->
	{#if showSegmentModal && activeSegmentId && activeSegmentPipeIndex !== null}
		<div class="modal-backdrop" onclick={closeSegmentModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Edit Segment</span>
					<button class="modal-close" onclick={closeSegmentModal}>×</button>
				</div>
				<div class="modal-body">
					{#if activeSegmentPipeIndex !== null && activeSegmentId}
						{#each pipes as pipe, pIdx (pipe.id)}
							{#if pIdx === activeSegmentPipeIndex}
								{#each pipe.segments as segment (segment.id)}
									{#if segment.id === activeSegmentId}
										<div class="form-group">
											<label class="form-label">{TAG_SPECIFICATIONS[segment.tag].name} Value</label>
											{#if TAG_SPECIFICATIONS[segment.tag].usePrompt}
												<textarea bind:value={segmentPrompt} placeholder="Enter prompt..."></textarea>
											{:else}
												<input type="number" bind:value={segmentValue} min={segment.spec.min ?? 0} max={segment.spec.max ?? 100} />
											{/if}
										</div>
									{/if}
								{/each}
							{/if}
						{/each}
					{/if}
					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeSegmentModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmSegmentUpdate}>Save</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Type Picker Modal -->
	{#if showTypePicker && activePipeForType !== null}
		<div class="modal-backdrop" onclick={closeTypePicker} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add Segment Type</span>
					<button class="modal-close" onclick={closeTypePicker}>×</button>
				</div>
				<div class="modal-body">
					<div class="type-grid">
						{#each allTags as tag}
							<div class="type-item" style="--tag-color: {TAG_SPECIFICATIONS[tag].color}" onclick={() => { activeSelectedTag = tag; confirmTypeSelection(); }} role="button" tabindex="0">
								<span class="type-dot"></span>
								<span>{TAG_SPECIFICATIONS[tag].name}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Global Prompt Modal -->
	{#if showGlobalModal && activeGlobalPipeIndex !== null}
		<div class="modal-backdrop" onclick={closeGlobalPromptModal} role="dialog" aria-modal="true">
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Global Prompt</span>
					<button class="modal-close" onclick={closeGlobalPromptModal}>×</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label class="form-label">Global Style</label>
						<textarea bind:value={globalPromptText} placeholder="Enter global prompt for this pipe..."></textarea>
					</div>
					<div class="modal-actions">
						<button class="btn-cancel" onclick={closeGlobalPromptModal}>Cancel</button>
						<button class="btn-confirm" onclick={confirmGlobalPrompt}>Save</button>
					</div>
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
		background: var(--bg-secondary, #1e1e1e);
		color: var(--text-primary, #fff);
		font-family: system-ui, sans-serif;
	}

	.composer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: var(--bg-primary, #252526);
		border-bottom: 1px solid var(--border-color, #3c3c3c);
	}

	.composer-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary, #fff);
	}

	.view-mode-toggle {
		display: flex;
		gap: 4px;
		background: var(--bg-input, #3c3c3c);
		border-radius: 6px;
		padding: 4px;
	}

	.view-mode-btn {
		padding: 6px 12px;
		border: none;
		background: transparent;
		color: var(--text-muted, #888);
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		transition: all 0.15s;
	}

	.view-mode-btn.active {
		background: var(--accent, #007acc);
		color: white;
	}

	.composer-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		color: var(--text-muted, #888);
		font-size: 14px;
	}

	.pipes-list {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.pipe-row {
		background: var(--bg-secondary, #252526);
		border-radius: 8px;
		border: 1px solid var(--border-color, #3c3c3c);
		padding: 12px;
	}

	.pipe-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border-color, #3c3c3c);
	}

	.pipe-name {
		font-weight: 600;
		font-size: 13px;
		color: var(--text-primary, #fff);
	}

	.pipe-actions {
		display: flex;
		gap: 4px;
	}

	.pipe-actions button {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
		cursor: pointer;
		font-size: 12px;
	}

	.pipe-actions button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.pipe-actions button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.kf-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
		padding: 8px;
		background: var(--bg-tertiary, #2d2d2d);
		border-radius: 6px;
	}

	.kf-box {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
	}

	.kf-box:hover {
		border-color: var(--accent, #007acc);
	}

	.kf-box.has-image {
		padding: 0;
		overflow: hidden;
	}

	.kf-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.kf-label {
		font-size: 10px;
		color: var(--text-muted, #888);
		font-weight: 600;
	}

	.delete-kf-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #dc2626;
		color: white;
		border: none;
		font-size: 10px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add-kf-btn {
		width: 48px;
		height: 48px;
		border-radius: 4px;
		background: transparent;
		border: 1px dashed var(--border-color, #555);
		color: var(--text-muted, #888);
		font-size: 20px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.add-kf-btn:hover {
		border-color: var(--accent, #007acc);
		color: var(--accent, #007acc);
	}

	.qc-row {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 12px;
		padding: 8px;
		background: var(--bg-tertiary, #2d2d2d);
		border-radius: 6px;
	}

	.qc-row label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--text-muted, #888);
	}

	.qc-row input[type="range"] {
		width: 100px;
	}

	.qc-row span {
		font-size: 11px;
		color: var(--text-primary, #fff);
		min-width: 24px;
	}

	.segments-container {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
	}

	.param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-tertiary, #2d2d2d);
		border-radius: 4px;
		border-left: 3px solid var(--tag-color, #007acc);
		cursor: pointer;
		transition: background 0.15s;
	}

	.param-row:hover {
		background: var(--bg-input, #3c3c3c);
	}

	.param-frame-indicator {
		font-size: 10px;
		color: var(--text-muted, #888);
		min-width: 50px;
	}

	.param-frame {
		background: var(--bg-secondary, #1e1e1e);
		padding: 2px 6px;
		border-radius: 3px;
	}

	.param-content {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.param-name {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.param-content input[type="text"],
	.param-content input[type="number"] {
		flex: 1;
		padding: 4px 8px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		border-radius: 4px;
		color: var(--text-primary, #fff);
		font-size: 12px;
	}

	.param-content input[type="text"]:focus,
	.param-content input[type="number"]:focus {
		outline: none;
		border-color: var(--accent, #007acc);
	}

	.param-controls {
		display: flex;
		gap: 4px;
	}

	.move-btn {
		width: 20px;
		height: 20px;
		border-radius: 3px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
		cursor: pointer;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.move-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.remove-param-btn {
		width: 20px;
		height: 20px;
		border-radius: 3px;
		background: rgba(220, 38, 38, 0.2);
		border: 1px solid rgba(220, 38, 38, 0.5);
		color: #dc2626;
		cursor: pointer;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-param-btn:hover {
		background: rgba(220, 38, 38, 0.3);
	}

	.add-param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: transparent;
		border: 1px dashed var(--border-color, #555);
		border-radius: 4px;
		color: var(--text-muted, #888);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.add-param-row:hover {
		border-color: var(--accent, #007acc);
		color: var(--accent, #007acc);
	}

	.length-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.length-label {
		font-size: 11px;
		color: var(--text-muted, #888);
	}

	.length-input {
		width: 60px;
		padding: 4px 8px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		border-radius: 4px;
		color: var(--text-primary, #fff);
		font-size: 12px;
	}

	.length-input:focus {
		outline: none;
		border-color: var(--accent, #007acc);
	}

	.global-prompt-bar {
		padding: 8px 12px;
		background: var(--bg-tertiary, #2d2d2d);
		border-radius: 4px;
		color: var(--text-muted, #888);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
		border: 1px solid transparent;
	}

	.global-prompt-bar:hover {
		border-color: var(--accent, #007acc);
		color: var(--text-primary, #fff);
	}

	.global-preview {
		font-style: italic;
		opacity: 0.8;
	}

	.global-add {
		opacity: 0.6;
	}

	.add-pipe-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px;
		background: transparent;
		border: 1px dashed var(--border-color, #555);
		border-radius: 8px;
		color: var(--text-muted, #888);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s;
		margin-top: 8px;
	}

	.add-pipe-btn:hover {
		border-color: var(--accent, #007acc);
		color: var(--accent, #007acc);
	}

	/* Timeline View */
	.timeline-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.timeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px;
		background: var(--bg-primary, #252526);
		border-bottom: 1px solid var(--border-color, #3c3c3c);
	}

	.timeline-ruler {
		flex: 1;
		height: 40px;
	}

	.timeline-zoom-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: 12px;
	}

	.timeline-zoom-controls button {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
		cursor: pointer;
		font-size: 14px;
	}

	.timeline-zoom-controls button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.timeline-zoom-controls span {
		font-size: 11px;
		color: var(--text-muted, #888);
		min-width: 40px;
		text-align: center;
	}

	.timeline-container {
		flex: 1;
		overflow: auto;
		padding: 12px;
	}

	.timeline-tracks {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.pipe-timeline-track {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		margin-bottom: 12px;
		background: var(--bg-secondary, #252526);
		border-radius: 8px;
		border: 1px solid var(--border-color, #3c3c3c);
		overflow: hidden;
		isolation: isolate;
	}

	.pipe-timeline-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: var(--bg-tertiary, #2d2d2d);
		border-bottom: 1px solid var(--border-color, #3c3c3c);
		border-radius: 4px 4px 0 0;
	}

	.pipe-timeline-label span {
		font-weight: 600;
		font-size: 13px;
		color: var(--text-primary, #fff);
	}

	.pipe-timeline-actions {
		display: flex;
		gap: 4px;
	}

	.pipe-timeline-actions button {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
		cursor: pointer;
		font-size: 12px;
	}

	.pipe-timeline-actions button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.pipe-timeline-actions button.delete:hover {
		background: rgba(220, 38, 38, 0.2);
		color: #dc2626;
		border-color: #dc2626;
	}

	.pipe-timeline-actions button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.track-row {
		display: flex;
		align-items: center;
		height: 28px;
	}

	.track-label {
		width: 80px;
		min-width: 80px;
		padding: 6px 12px;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted, #888);
		text-align: center;
		border-right: 1px solid var(--border-color, #3c3c3c);
	}

	.track-canvas {
		position: relative;
		flex: 1;
		height: 100%;
		background: var(--bg-primary, #1a1a1a);
		overflow: hidden;
	}

	.keyframe-chip {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 28px;
		height: 28px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 10px;
		color: var(--text-muted, #888);
		transition: all 0.15s;
		z-index: 10;
	}

	.keyframe-chip.has-image {
		padding: 0;
		overflow: hidden;
	}

	.kf-timeline-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.delete-kf-tl-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #dc2626;
		color: white;
		border: none;
		font-size: 9px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 11;
	}

	.add-kf-tl-btn {
		position: absolute;
		top: 50%;
		left: 8px;
		transform: translateY(-50%);
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px dashed var(--border-color, #555);
		color: var(--text-muted, #888);
		font-size: 16px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add-kf-tl-btn:hover {
		border-color: var(--accent, #007acc);
		color: var(--accent, #007acc);
	}

	.segment-block {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 24px;
		border-radius: 4px;
		background: var(--tag-color, #3b82f6);
		opacity: 0.7;
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 0 6px;
		transition: opacity 0.15s;
		overflow: hidden;
		min-width: 20px;
	}

	.segment-block:hover {
		opacity: 1;
	}

	.segment-block.disabled {
		opacity: 0.3;
	}

	.segment-label {
		font-size: 10px;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.segment-controls {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.segment-block:hover .segment-controls {
		opacity: 1;
	}

	.segment-controls button {
		width: 16px;
		height: 16px;
		border-radius: 2px;
		background: rgba(0,0,0,0.3);
		border: none;
		color: white;
		font-size: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.segment-controls button:hover {
		background: rgba(0,0,0,0.5);
	}

	.add-segment-row {
		display: flex;
		align-items: center;
		height: 28px;
		margin-top: 4px;
	}

	.add-segment-row button {
		padding: 4px 12px;
		background: transparent;
		border: 1px dashed var(--border-color, #555);
		border-radius: 4px;
		color: var(--text-muted, #888);
		font-size: 11px;
		cursor: pointer;
	}

	.add-segment-row button:hover {
		border-color: var(--accent, #007acc);
		color: var(--accent, #007acc);
	}

	.global-prompt-track {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: var(--bg-tertiary, #2d2d2d);
		border-radius: 4px;
		margin-top: 4px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.global-prompt-track:hover {
		background: var(--bg-input, #3c3c3c);
	}

	.global-text {
		flex: 1;
		font-size: 12px;
		color: var(--text-muted, #888);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.add-pipe-tl-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: transparent;
		border: 1px dashed var(--border-color, #555);
		border-radius: 8px;
		color: var(--text-muted, #888);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s;
		margin-top: 12px;
	}

	.add-pipe-tl-btn:hover {
		border-color: var(--accent, #007acc);
		color: var(--accent, #007acc);
	}

	/* Toast */
	.toast {
		position: fixed;
		bottom: 20px;
		right: 20px;
		padding: 12px 20px;
		border-radius: 6px;
		font-size: 13px;
		z-index: 1000;
		animation: slideIn 0.2s ease;
	}

	@keyframes slideIn {
		from { transform: translateX(100%); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}

	.toast-success {
		background: #16a34a;
		color: white;
	}

	.toast-error {
		background: #dc2626;
		color: white;
	}

	/* Modals */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--bg-primary, #1e1e1e);
		border: 1px solid var(--border-color, #3c3c3c);
		border-radius: 12px;
		min-width: 400px;
		max-width: 90vw;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-color, #3c3c3c);
	}

	.modal-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary, #fff);
	}

	.modal-close {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: var(--bg-input, #3c3c3c);
		border: none;
		color: var(--text-muted, #888);
		font-size: 18px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-close:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.modal-body {
		padding: 20px;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-label {
		display: block;
		margin-bottom: 8px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted, #888);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.form-group input[type="text"],
	.form-group textarea {
		width: 100%;
		padding: 10px 12px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #fff);
		font-size: 13px;
		font-family: inherit;
	}

	.form-group input[type="text"]:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--accent, #007acc);
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
		padding: 8px 16px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-muted, #888);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.mode-buttons button.active {
		background: var(--accent, #007acc);
		border-color: var(--accent, #007acc);
		color: white;
	}

	.mode-buttons button:hover:not(.active) {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 20px;
	}

	.btn-cancel,
	.btn-confirm {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-cancel {
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
	}

	.btn-cancel:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-primary, #fff);
	}

	.btn-confirm {
		background: var(--accent, #007acc);
		border: 1px solid var(--accent, #007acc);
		color: white;
	}

	.btn-confirm:hover:not(:disabled) {
		background: #005fa3;
		border-color: #005fa3;
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Type Picker Grid */
	.type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 8px;
	}

	.type-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.type-item:hover {
		border-color: var(--tag-color, #007acc);
		background: rgba(0, 124, 204, 0.1);
	}

	.type-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--tag-color, #007acc);
		flex-shrink: 0;
	}

	.type-item span:last-child {
		font-size: 12px;
		color: var(--text-primary, #fff);
		font-weight: 500;
	}
</style>

