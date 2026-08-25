<script lang="ts">
	import type { SessionData, PipeRow, PromptSegment, TagType, PipeKeyframe } from '$types';
	import {
		snapTo8nPlus1,
		validatePromptSegments,
		TAG_SPECIFICATIONS,
		FPS_PRESETS,
		getMaxFramesForResolution,
	} from '$types';

	let { session, onUpdate }: { session?: SessionData; onUpdate: (session: SessionData) => void } = $props();

	const MAX_KEYFRAMES = 3;
	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;
	const MIN_PIPE_LENGTH = 41;

	let pipes = $derived(session?.pipes ?? []);

	// View mode state
	let viewMode = $state<'list' | 'timeline'>('list');

	// Toast/notification state
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'error' | 'success' | 'warning'>('error');

	function showToast(message: string, type: 'error' | 'success' | 'warning' = 'error') {
		toastMessage = message;
		toastType = type;
		setTimeout(() => { toastMessage = null; }, 3000);
	}

	// Modal state
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
	const allTags = Object.keys(TAG_SPECIFICATIONS) as TagType[];

	// Add pipe state
	let showAddPipeModal = $state(false);

	function closeModal() {
		showAddModal = false;
		activePipeIndex = null;
		activeKfIndex = null;
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
	}

	function openAddModal(pipeIndex: number, kfIndex?: number) {
		try {
			activePipeIndex = pipeIndex;
			activeKfIndex = kfIndex ?? null;
			showAddModal = true;
		} catch (e) {
			console.error('[ComposerPanel] Failed to open add modal:', e);
		}
	}

	function confirmAdd() {
		if (activePipeIndex === null) return;
		const pipe = pipes[activePipeIndex];
		if (!pipe || pipe.keyframes.length >= MAX_KEYFRAMES) return;

		try {
			let baseFrame = 0;
			if (pipe.keyframes.length > 0) {
				const lastFrame = Math.max(...pipe.keyframes.map(k => k.frame));
				baseFrame = snapTo8nPlus1(lastFrame + 60);
				if (baseFrame >= pipe.lengthFrames) return;
			}

			const newKf: PipeKeyframe = {
				id: crypto.randomUUID(),
				frame: baseFrame,
				imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
				prompt: addMode === 'txt2img' ? modalPrompt : undefined,
				img2ImgSrc: addMode === 'img2img' ? modalImg2Img : undefined,
			};

			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== activePipeIndex) return p;
				return { ...p, keyframes: [...p.keyframes, newKf] };
			});

			onUpdate({ ...session, pipes: updatedPipes });
			closeModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to confirm add:', e);
		}
	}

	function deleteKeyframe(pipeIndex: number, keyframeId: string) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe) return;

			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== pipeIndex) return p;
				return { ...p, keyframes: p.keyframes.filter(k => k.id !== keyframeId) };
			});

			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to delete keyframe:', e);
		}
	}

	function updateQ(pipeIndex: number, value: number) {
		try {
			const updatedPipes = pipes.map((p, idx) =>
				idx === pipeIndex ? { ...p, qValue: Math.min(Q_MAX, Math.max(Q_MIN, value)) } : p
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update Q:', e);
		}
	}

	function updateC(pipeIndex: number, value: number) {
		try {
			const updatedPipes = pipes.map((p, idx) =>
				idx === pipeIndex ? { ...p, cValue: Math.min(C_MAX, Math.max(C_MIN, value)) } : p
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update C:', e);
		}
	}

	function openSegmentModal(pipeIndex: number, segment: PromptSegment) {
		try {
			activeSegmentPipeIndex = pipeIndex;
			activeSegmentId = segment.id;
			segmentValue = segment.value;
			segmentPrompt = segment.prompt || '';
			showSegmentModal = true;
		} catch (e) {
			console.error('[ComposerPanel] Failed to open segment modal:', e);
		}
	}

	function closeSegmentModal() {
		showSegmentModal = false;
		activeSegmentId = null;
		activeSegmentPipeIndex = null;
	}

	function confirmSegmentUpdate() {
		if (activeSegmentId === null || activeSegmentPipeIndex === null) return;

		try {
			const pipe = pipes[activeSegmentPipeIndex];
			if (!pipe) return;

			const segment = pipe.segments.find(s => s.id === activeSegmentId);
			if (!segment) return;

			const spec = TAG_SPECIFICATIONS[segment.tag];
			const updatedSegments = pipe.segments.map(s =>
				s.id === activeSegmentId
					? spec?.usePrompt
						? { ...s, prompt: segmentPrompt }
						: { ...s, value: segmentValue }
					: s
			);
			const validation = validatePromptSegments(updatedSegments);
			if (!validation.valid) return;

			const updatedPipes = pipes.map((p, idx) =>
				idx !== activeSegmentPipeIndex ? p : { ...p, segments: updatedSegments }
			);
			onUpdate({ ...session, pipes: updatedPipes });
			closeSegmentModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to update segment:', e);
		}
	}

	function addSegment(pipeIndex: number, tag: TagType) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe) return;

			const spec = TAG_SPECIFICATIONS[tag];
			if (!spec) return;

			const newSegment: PromptSegment = {
				id: crypto.randomUUID(),
				tag,
				value: spec.min ?? 0,
				prompt: '',
				frameStart: 0,
				frameEnd: pipe.lengthFrames,
				spec,
			};

			const updatedPipes = pipes.map((p, idx) =>
				idx !== pipeIndex ? p : { ...p, segments: [...p.segments, newSegment] }
			);
			onUpdate({ ...session, pipes: updatedPipes });
			closeTypePicker();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add segment:', e);
		}
	}

	function removeParam(pipeIndex: number, segmentId: string) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe) return;

			const updatedPipes = pipes.map((p, idx) =>
				idx !== pipeIndex ? p : { ...p, segments: p.segments.filter(s => s.id !== segmentId) }
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to remove param:', e);
		}
	}

	function updateParam(pipeIndex: number, segmentId: string, value: number) {
		try {
			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== pipeIndex) return p;
				return {
					...p,
					segments: p.segments.map(s => (s.id === segmentId ? { ...s, value } : s)),
				};
			});
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update param:', e);
		}
	}

	function moveParamFrame(pipeIndex: number, segmentId: string, delta: number) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe) return;

			const segment = pipe.segments.find(s => s.id === segmentId);
			if (!segment) return;

			const newStart = segment.frameStart + delta;
			const newEnd = segment.frameEnd + delta;
			if (newStart < 0 || newEnd > pipe.lengthFrames) return;

			const testSegments = pipe.segments.map(s =>
				s.id === segmentId ? { ...s, frameStart: newStart, frameEnd: newEnd } : s
			);
			const validation = validatePromptSegments(testSegments);
			if (!validation.valid) return;

			const updatedPipes = pipes.map((p, idx) =>
				idx !== pipeIndex ? p : { ...p, segments: testSegments }
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to move param:', e);
		}
	}

	function updatePipeLength(pipeIndex: number, newLength: number) {
		try {
			const snapped = snapTo8nPlus1(newLength);
			const maxLen = getMaxFramesForResolution(session?.resolution || '720p');
			if (snapped < MIN_PIPE_LENGTH) return;
			if (snapped > maxLen) return;

			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== pipeIndex) return p;
				const truncatedSegments = p.segments.filter(s => s.frameEnd <= snapped);
				return { ...p, lengthFrames: snapped, segments: truncatedSegments };
			});
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update pipe length:', e);
		}
	}

	function openGlobalPromptModal(pipeIndex: number) {
		try {
			activeGlobalPipeIndex = pipeIndex;
			const pipe = pipes[pipeIndex];
			globalPromptText = pipe?.globalPrompt?.text || '';
			showGlobalModal = true;
		} catch (e) {
			console.error('[ComposerPanel] Failed to open global prompt modal:', e);
		}
	}

	function closeGlobalPromptModal() {
		showGlobalModal = false;
		activeGlobalPipeIndex = null;
	}

	function confirmGlobalPrompt() {
		if (activeGlobalPipeIndex === null) return;

		try {
			const updatedPipes = pipes.map((p, idx) =>
				idx !== activeGlobalPipeIndex
					? p
					: { ...p, globalPrompt: { text: globalPromptText } }
			);
			onUpdate({ ...session, pipes: updatedPipes });
			closeGlobalPromptModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to update global prompt:', e);
		}
	}

	function updateFPS(fps: number) {
		try {
			onUpdate({ ...session, fps });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update FPS:', e);
		}
	}

	// Pipe management functions
	function deletePipe(pipeIndex: number) {
		if (!session || pipes.length <= 1) return;
		try {
			const updatedPipes = pipes.filter((_, idx) => idx !== pipeIndex);
			onUpdate({ ...session, pipes: updatedPipes });
			showToast(`Pipe ${pipeIndex + 1} deleted`, 'success');
		} catch (e) {
			console.error('[ComposerPanel] Failed to delete pipe:', e);
			showToast('Failed to delete pipe');
		}
	}

	function duplicatePipe(pipeIndex: number) {
		if (!session) return;
		try {
			const original = pipes[pipeIndex];
			const copy: PipeRow = {
				...original,
				id: crypto.randomUUID(),
				keyframes: original.keyframes.map(k => ({ ...k, id: crypto.randomUUID() })),
				segments: original.segments.map(s => ({ ...s, id: crypto.randomUUID() })),
			};
			const updatedPipes = [...pipes.slice(0, pipeIndex + 1), copy, ...pipes.slice(pipeIndex + 1)];
			onUpdate({ ...session, pipes: updatedPipes });
			showToast(`Pipe ${pipeIndex + 1} duplicated`, 'success');
		} catch (e) {
			console.error('[ComposerPanel] Failed to duplicate pipe:', e);
			showToast('Failed to duplicate pipe');
		}
	}

	function movePipeUp(pipeIndex: number) {
		if (!session || pipeIndex === 0) return;
		try {
			const updatedPipes = [...pipes];
			[updatedPipes[pipeIndex - 1], updatedPipes[pipeIndex]] = [updatedPipes[pipeIndex], updatedPipes[pipeIndex - 1]];
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to move pipe up:', e);
		}
	}

	function movePipeDown(pipeIndex: number) {
		if (!session || pipeIndex === pipes.length - 1) return;
		try {
			const updatedPipes = [...pipes];
			[updatedPipes[pipeIndex], updatedPipes[pipeIndex + 1]] = [updatedPipes[pipeIndex + 1], updatedPipes[pipeIndex]];
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to move pipe down:', e);
		}
	}

	function updateResolution(resolution: '480p' | '720p' | '1080p') {
		try {
			const updatedPipes = pipes.map(p => ({
				...p,
				lengthFrames: Math.min(p.lengthFrames, getMaxFramesForResolution(resolution || '720p')),
			}));
			onUpdate({ ...session, resolution, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update resolution:', e);
		}
	}

	function openTypePicker(pipeIndex: number) {
		try {
			activePipeForType = pipeIndex;
			showTypePicker = true;
		} catch (e) {
			console.error('[ComposerPanel] Failed to open type picker:', e);
		}
	}

	function closeTypePicker() {
		showTypePicker = false;
		activePipeForType = null;
	}

	function openAddPipeModal() {
		showAddPipeModal = true;
	}

	function closeAddPipeModal() {
		showAddPipeModal = false;
	}

	function confirmAddPipe() {
		if (!session) return;
		confirmAddPipeInner();
	}

	function confirmAddPipeInner() {
		if (!session) return;

		try {
			const defaultPipe: PipeRow = {
				id: crypto.randomUUID(),
				lengthFrames: getMaxFramesForResolution(session.resolution || '720p'),
				keyframes: [],
				qValue: Q_DEFAULT,
				cValue: C_DEFAULT,
				segments: [],
			};

			const updatedPipes = [...pipes, defaultPipe];
			onUpdate({ ...session, pipes: updatedPipes });
			closeAddPipeModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add pipe:', e);
		}
	}
</script>

{#if !session}
	<div class="error-state">
		<p><strong>Error: No session provided</strong></p>
	</div>
{:else if pipes.length === 0}
	<div class="composer-empty">
		<p>This session has no pipes yet.</p>
	</div>
{:else}
<div class="composer-panel">
	<!-- Scene Header -->
	<div class="scene-header">
		<div class="scene-info">
			<span class="scene-name">{session.name}</span>
			<span class="scene-meta">
				{pipes[0]?.lengthFrames || 121}f @ {session.fps}fps
			</span>
		</div>
		<div class="scene-controls">
			<button
				class="view-mode-btn {viewMode === 'list' ? 'active' : ''}"
				onclick={() => viewMode = 'list'}
			>List</button>
			<button
				class="view-mode-btn {viewMode === 'timeline' ? 'active' : ''}"
				onclick={() => viewMode = 'timeline'}
			>Timeline</button>
			<select
				class="fps-select"
				value={session.fps}
				onchange={(e) => updateFPS(Number(e.currentTarget.value))}
			>
				{#each FPS_PRESETS as fps}
					<option value={fps}>{fps} fps</option>
				{/each}
			</select>
			<select
				class="resolution-select"
				value={session.resolution}
				onchange={(e) => updateResolution(e.currentTarget.value)}
			>
				<option value="480p">480p</option>
				<option value="720p">720p</option>
				<option value="1080p">1080p</option>
			</select>
		</div>
	</div>

	<!-- Pipes List -->
	<div class="pipes-list">
		{#each pipes as pipe, pipeIdx (pipe.id)}
			<div class="pipe-row">
				<!-- Pipe Header -->
				<div class="pipe-header">
					<span class="pipe-label">Pipe {pipeIdx + 1}</span>
					<div class="pipe-actions">
						<button
							class="pipe-action-btn"
							onclick={(e) => { e.stopPropagation(); movePipeUp(pipeIdx); }}
							disabled={pipeIdx === 0}
							title="Move Up"
						>↑</button>
						<button
							class="pipe-action-btn"
							onclick={(e) => { e.stopPropagation(); movePipeDown(pipeIdx); }}
							disabled={pipeIdx === pipes.length - 1}
							title="Move Down"
						>↓</button>
						<button
							class="pipe-action-btn"
							onclick={(e) => { e.stopPropagation(); duplicatePipe(pipeIdx); }}
							title="Duplicate"
						>⧉</button>
						<button
							class="pipe-action-btn pipe-delete-btn"
							onclick={(e) => { e.stopPropagation(); deletePipe(pipeIdx); }}
							title="Delete Pipe"
						>×</button>
					</div>
				</div>

				<!-- Row 1: Keyframes + Q/C -->
				<div class="kf-row">
					{#each pipe.keyframes as kf, kfIdx (kf.id)}
						<div
							class="kf-box {kf.imageSrc ? 'has-image' : ''}"
							style="position: absolute; left: {kf.frame / pipe.lengthFrames * 100}%;"
							onclick={() => openAddModal(pipeIdx, kfIdx)}
							role="button"
							tabindex="0"
						>
							{#if kf.imageSrc}
								<img src={kf.imageSrc} alt={`KF ${kfIdx + 1}`} class="kf-thumb" />
							{:else}
								<span class="kf-label">k{kfIdx + 1}</span>
							{/if}
							<button
								class="delete-kf-btn"
								onclick={(e) => { e.stopPropagation(); deleteKeyframe(pipeIdx, kf.id); }}
							>×</button>
						</div>
					{/each}

					{#if pipe.keyframes.length < MAX_KEYFRAMES}
						<div
							class="add-kf-btn"
							onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)}
							role="button"
							tabindex="0"
						>+</div>
					{/if}

					<!-- Q/C Sliders -->
					<div class="qc-sliders">
						<div class="qc-group">
							<span class="qc-label">Q</span>
							<input
								type="range"
								min={Q_MIN}
								max={Q_MAX}
								step="1"
								value={pipe.qValue}
								oninput={(e) => updateQ(pipeIdx, Number(e.currentTarget.value))}
							/>
							<span class="qc-value">{pipe.qValue}</span>
						</div>
						<div class="qc-group">
							<span class="qc-label">C</span>
							<input
								type="range"
								min={C_MIN}
								max={C_MAX}
								step="0.5"
								value={pipe.cValue}
								oninput={(e) => updateC(pipeIdx, Number(e.currentTarget.value))}
							/>
							<span class="qc-value">{pipe.cValue}</span>
						</div>
					</div>
				</div>

				<!-- Row 2: Pipe Length Input -->
				<div class="length-row">
					<label class="length-label">Length:</label>
					<input
						type="number"
						class="length-input"
						value={pipe.lengthFrames}
						min={MIN_PIPE_LENGTH}
						max={getMaxFramesForResolution(session.resolution)}
						step="9"
						onchange={(e) => updatePipeLength(pipeIdx, Number(e.currentTarget.value))}
					/>
					<span class="length-unit">frames</span>
				</div>

				<!-- Global Prompt Bar -->
				<div
					class="global-prompt-bar"
					onclick={() => openGlobalPromptModal(pipeIdx)}
					role="button"
					tabindex="0"
				>
					<span class="global-label">GLOBAL</span>
					{#if pipe.globalPrompt?.text}
						<span class="global-preview">"{pipe.globalPrompt.text.substring(0, 30)}{pipe.globalPrompt.text.length > 30 ? '...' : ''}"</span>
					{:else}
						<span class="global-placeholder">Click to add global prompt</span>
					{/if}
					<span class="global-action">↗️</span>
				</div>

				<!-- Segments -->
				{#each pipe.segments as segment (segment.id)}
					<div
						class="param-row"
						style="--tag-color: {segment.spec.color}"
						onclick={() => openSegmentModal(pipeIdx, segment)}
						role="button"
						tabindex="0"
					>
						<div class="param-frame-indicator">
							<span class="param-frame">{segment.frameStart}-{segment.frameEnd}</span>
						</div>
						<div class="param-content">
							<span class="param-name" style="color: {segment.spec.color}">[{segment.spec.name}]</span>
							{#if segment.spec.usePrompt}
								<span class="param-prompt-text">{segment.prompt || '(empty)'}</span>
							{:else}
								<input
									type="range"
									min={segment.spec.min ?? 0}
									max={segment.spec.max ?? 100}
									step="1"
									value={segment.value}
									onclick={(e) => e.stopPropagation()}
									oninput={(e) => updateParam(pipeIdx, segment.id, Number(e.currentTarget.value))}
								/>
								<span class="param-value">{segment.value}</span>
							{/if}
						</div>
						<div class="param-controls" onclick={(e) => e.stopPropagation()}>
							<button class="move-btn" onclick={() => moveParamFrame(pipeIdx, segment.id, -8)} title="Move left (-8f)">&lt;</button>
							<button class="move-btn" onclick={() => moveParamFrame(pipeIdx, segment.id, 8)} title="Move right (+8f)">&gt;</button>
							<button class="remove-param-btn" onclick={() => removeParam(pipeIdx, segment.id)} title="Remove">×</button>
						</div>
					</div>
				{/each}

				<!-- Add Segment Button -->
				<div
					class="add-param-row"
					onclick={() => openTypePicker(pipeIdx)}
					role="button"
					tabindex="0"
				>
					<span>+</span>
					<span>Add Segment</span>
				</div>
			</div>
		{/each}

		<!-- Add Pipe Button -->
		<div
			class="add-pipe-btn"
			onclick={openAddPipeModal}
			role="button"
			tabindex="0"
		>
			<span class="add-pipe-icon">+</span>
			<span>Add Pipe</span>
		</div>
	</div>

	<!-- Add Pipe Modal -->
	{#if showAddPipeModal}
		<div class="modal-backdrop" onclick={closeAddPipeModal}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add New Pipe</span>
					<button class="modal-close" onclick={closeAddPipeModal}>×</button>
				</div>
				<div class="modal-body">
					<p class="modal-hint">A new empty pipe will be added to this session.</p>
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
		<div class="modal-backdrop" onclick={closeModal}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add Keyframe</span>
					<button class="modal-close" onclick={closeModal}>×</button>
				</div>
				<div class="modal-body">
					<div class="mode-tabs">
						<button class="mode-tab {addMode === 'url' ? 'active' : ''}" onclick={() => addMode = 'url'}>URL</button>
						<button class="mode-tab {addMode === 'txt2img' ? 'active' : ''}" onclick={() => addMode = 'txt2img'}>Text→Image</button>
						<button class="mode-tab {addMode === 'img2img' ? 'active' : ''}" onclick={() => addMode = 'img2img'}>Image→Image</button>
					</div>
					{#if addMode === 'url'}
						<input
							type="text"
							class="modal-input"
							placeholder="Image URL"
							value={modalUrl}
							oninput={(e) => modalUrl = e.currentTarget.value}
						/>
					{:else if addMode === 'txt2img'}
						<textarea
							class="modal-textarea"
							placeholder="Enter prompt..."
							value={modalPrompt}
							oninput={(e) => modalPrompt = e.currentTarget.value}
						></textarea>
					{:else}
						<input
							type="text"
							class="modal-input"
							placeholder="Source image URL"
							value={modalImg2Img}
							oninput={(e) => modalImg2Img = e.currentTarget.value}
						/>
					{/if}
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmAdd} disabled={!addMode || (addMode === 'url' && !modalUrl.trim())}>Add</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Segment Edit Modal -->
	{#if showSegmentModal && activeSegmentId && activeSegmentPipeIndex !== null}
		<div class="modal-backdrop" onclick={closeSegmentModal}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Edit Segment</span>
					<button class="modal-close" onclick={closeSegmentModal}>×</button>
				</div>
				<div class="modal-body">
					{#if segmentPrompt !== ''}
						<label class="form-label">Prompt</label>
						<textarea
							class="modal-textarea"
							value={segmentPrompt}
							oninput={(e) => segmentPrompt = e.currentTarget.value}
						></textarea>
					{:else}
						<label class="form-label">Value</label>
						<input
							type="number"
							class="modal-input"
							value={segmentValue}
							oninput={(e) => segmentValue = Number(e.currentTarget.value)}
						/>
					{/if}
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeSegmentModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmSegmentUpdate}>Save</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Type Picker Modal -->
	{#if showTypePicker && activePipeForType !== null}
		<div class="modal-backdrop" onclick={closeTypePicker}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Add Segment Type</span>
					<button class="modal-close" onclick={closeTypePicker}>×</button>
				</div>
				<div class="modal-body">
					<div class="type-grid">
						{#each allTags as tag}
							<div
								class="type-item"
								style="--tag-color: {TAG_SPECIFICATIONS[tag].color}"
								onclick={() => addSegment(activePipeForType, tag)}
								role="button"
								tabindex="0"
							>
								<span class="type-dot"></span>
								<span>{TAG_SPECIFICATIONS[tag].name}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notification -->
	{#if toastMessage}
		<div class="toast {toastType}">{toastMessage}</div>
	{/if}

	<!-- Global Prompt Modal -->
	{#if showGlobalModal && activeGlobalPipeIndex !== null}
		<div class="modal-backdrop" onclick={closeGlobalPromptModal}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">Global Prompt</span>
					<button class="modal-close" onclick={closeGlobalPromptModal}>×</button>
				</div>
				<div class="modal-body">
					<textarea
						class="modal-textarea"
						placeholder="Enter global prompt..."
						value={globalPromptText}
						oninput={(e) => globalPromptText = e.currentTarget.value}
					></textarea>
				</div>
				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeGlobalPromptModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmGlobalPrompt}>Save</button>
				</div>
			</div>
		</div>
	{/if}
</div>
{/if}

<style>
	.composer-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg-primary, #1A1A1D);
	}

	.error-state {
		padding: 20px;
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
		font-family: monospace;
	}

	.composer-empty {
		padding: 20px;
		text-align: center;
		color: var(--text-muted, #808080);
	}

	.scene-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		background: var(--bg-secondary, #252526);
		border-bottom: 1px solid var(--border-color, #3c3c3c);
	}

	.scene-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.scene-name {
		font-weight: 600;
		color: var(--text-primary, #ffffff);
	}

	.scene-meta {
		font-size: 12px;
		color: var(--text-muted, #808080);
	}

	.scene-controls {
		display: flex;
		gap: 8px;
	}

	.fps-select, .resolution-select {
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-primary, #fff);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
	}

	.pipes-list {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.pipe-row {
		background: var(--bg-secondary, #252526);
		border-radius: 8px;
		border: 1px solid var(--border-color, #3c3c3c);
		overflow: hidden;
	}

	.pipe-header {
		padding: 8px 12px;
		background: var(--bg-tertiary, #2d2d2d);
		border-bottom: 1px solid var(--border-color, #3c3c3c);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.pipe-label {
		font-weight: 600;
		font-size: 13px;
		color: var(--text-primary, #fff);
	}

	.kf-row {
		position: relative;
		height: 80px;
		padding: 8px;
		background: var(--bg-primary, #1a1a1a);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.kf-box {
		width: 56px;
		height: 56px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		position: relative;
		transition: all 0.15s;
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
		font-size: 11px;
		color: var(--text-muted, #888);
	}

	.delete-kf-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 18px;
		height: 18px;
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
		width: 40px;
		height: 40px;
		border-radius: 6px;
		background: var(--bg-input, #3c3c3c);
		border: 1px dashed var(--border-color, #555);
		color: var(--text-muted, #888);
		font-size: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add-kf-btn:hover {
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.qc-sliders {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-left: auto;
	}

	.qc-group {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.qc-label {
		font-size: 11px;
		color: var(--text-muted, #888);
		font-weight: 600;
	}

	.qc-value {
		font-size: 11px;
		color: var(--text-primary, #fff);
		min-width: 24px;
		text-align: right;
	}

	.length-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: var(--bg-secondary, #252526);
		border-top: 1px solid var(--border-color, #3c3c3c);
	}

	.length-label {
		font-size: 12px;
		color: var(--text-muted, #888);
	}

	.length-input {
		width: 60px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-primary, #fff);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
	}

	.length-unit {
		font-size: 11px;
		color: var(--text-muted, #888);
	}

	.global-prompt-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(59, 130, 246, 0.1);
		border-top: 1px solid rgba(59, 130, 246, 0.3);
		cursor: pointer;
		transition: background 0.15s;
	}

	.global-prompt-bar:hover {
		background: rgba(59, 130, 246, 0.15);
	}

	.global-label {
		font-size: 11px;
		font-weight: 600;
		color: #3b82f6;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.global-preview {
		font-size: 12px;
		color: var(--text-primary, #fff);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.global-placeholder {
		font-size: 12px;
		color: var(--text-muted, #666);
		flex: 1;
	}

	.global-action {
		font-size: 14px;
	}

	.param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: var(--bg-primary, #1a1a1a);
		border-bottom: 1px solid var(--border-color, #2a2a2a);
		cursor: pointer;
		transition: background 0.1s;
	}

	.param-row:hover {
		background: var(--bg-secondary, #252526);
	}

	.param-frame-indicator {
		min-width: 50px;
	}

	.param-frame {
		font-size: 10px;
		color: var(--text-muted, #666);
		font-family: monospace;
	}

	.param-content {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.param-name {
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}

	.param-prompt-text {
		font-size: 11px;
		color: var(--text-muted, #888);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.param-controls {
		display: flex;
		gap: 4px;
	}

	.move-btn, .remove-param-btn {
		width: 20px;
		height: 20px;
		border-radius: 3px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
		font-size: 10px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.move-btn:hover, .remove-param-btn:hover {
		background: #4a4a4a;
		color: var(--text-primary, #fff);
	}

	.add-param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		color: #3b82f6;
		font-size: 13px;
		cursor: pointer;
		transition: background 0.15s;
		border-top: 1px dashed var(--border-color, #444);
	}

	.add-param-row:hover {
		background: rgba(59, 130, 246, 0.05);
	}

	/* Modal Styles */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--bg-secondary, #252526);
		border: 1px solid var(--border-color, #3c3c3c);
		border-radius: 12px;
		width: 90%;
		max-width: 480px;
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
		font-weight: 600;
		color: var(--text-primary, #fff);
		font-size: 15px;
	}

	.modal-close {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: var(--bg-input, #3c3c3c);
		border: none;
		color: var(--text-muted, #888);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
	}

	.modal-close:hover {
		background: #4a4a4a;
		color: var(--text-primary, #fff);
	}

	.modal-body {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.form-label {
		font-size: 12px;
		color: var(--text-muted, #888);
		font-weight: 500;
	}

	.modal-input, .modal-textarea {
		width: 100%;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-primary, #fff);
		padding: 10px 12px;
		border-radius: 6px;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
		min-height: 80px;
	}

	.modal-input:focus, .modal-textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid var(--border-color, #3c3c3c);
	}

	.btn-cancel, .btn-confirm {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		border: none;
	}

	.btn-cancel {
		background: var(--bg-input, #3c3c3c);
		color: var(--text-muted, #aaa);
	}

	.btn-cancel:hover {
		background: #4a4a4a;
		color: var(--text-primary, #fff);
	}

	.btn-confirm {
		background: #3b82f6;
		color: white;
	}

	.btn-confirm:hover:not(:disabled) {
		background: #2563eb;
	}

	.btn-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.mode-tabs {
		display: flex;
		gap: 4px;
		background: var(--bg-input, #3c3c3c);
		padding: 4px;
		border-radius: 8px;
	}

	.mode-tab {
		flex: 1;
		padding: 6px 12px;
		border-radius: 6px;
		background: transparent;
		border: none;
		color: var(--text-muted, #888);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.mode-tab.active {
		background: #3b82f6;
		color: white;
	}

	.type-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}

	.type-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.type-item:hover {
		border-color: var(--tag-color, #3b82f6);
		background: rgba(59, 130, 246, 0.1);
	}

	.type-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--tag-color, #3b82f6);
	}

	.add-pipe-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 16px;
		margin-top: 8px;
		background: rgba(59, 130, 246, 0.08);
		border: 1px dashed var(--border-color, #444);
		border-radius: 8px;
		color: #3b82f6;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.add-pipe-btn:hover {
		background: rgba(59, 130, 246, 0.15);
		border-color: #3b82f6;
	}

	.add-pipe-icon {
		font-size: 18px;
		line-height: 1;
	}

	.modal-hint {
		color: var(--text-muted, #888);
		font-size: 13px;
		margin: 0;
	}

	.pipe-actions {
		display: flex;
		gap: 4px;
	}

	.pipe-action-btn {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: var(--bg-input, #3c3c3c);
		border: 1px solid var(--border-color, #555);
		color: var(--text-muted, #888);
		font-size: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.pipe-action-btn:hover:not(:disabled) {
		background: #4a4a4a;
		color: var(--text-primary, #fff);
	}

	.pipe-action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pipe-delete-btn:hover {
		background: rgba(220, 38, 38, 0.2);
		color: #dc2626;
		border-color: #dc2626;
	}

	.toast {
		position: fixed;
		bottom: 20px;
		right: 20px;
		padding: 12px 20px;
		border-radius: 8px;
		color: white;
		font-size: 14px;
		z-index: 2000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		animation: slideIn 0.3s ease;
	}

	.toast.error {
		background: #dc2626;
	}

	.toast.success {
		background: #16a34a;
	}

	.toast.warning {
		background: #d97706;
	}

	@keyframes slideIn {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
