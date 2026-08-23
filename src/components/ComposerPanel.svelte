<script lang="ts">
	import type { SceneData, PipeRow, PromptSegment, TagType } from '$types';
	import { 
		snapTo8nPlus1, 
		isValidFrameCount,
		getMaxFramesForResolution,
		validatePromptSegments,
		TAG_SPECIFICATIONS,
		FPS_PRESETS,
		addPromptSegment,
		removePromptSegment,
	} from '$types';

	let { scene }: { scene: SceneData } = $props();

	const MAX_KEYFRAMES = 3;
	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;
	const MIN_PIPE_LENGTH = 41; // 5 segments of 8 frames + 1

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
	let segmentValue = $state(0);
	let segmentPrompt = $state('');

	// Add segment type picker
	let showTypePicker = $state(false);
	let activePipeForType = $state<number | null>(null);
	const allTags = Object.keys(TAG_SPECIFICATIONS) as TagType[];

	// Helper to create empty pipe
	function createEmptyPipe(index: number): PipeRow {
		return {
			id: `pipe-${index}`,
			lengthFrames: snapTo8nPlus1(121), // Default: ~15 segments
			keyframes: [],
			qValue: Q_DEFAULT,
			cValue: C_DEFAULT,
			prompt: {
				global: '',
				segments: [],
			},
		};
	}

	function createDefaultSegment(tag: TagType, frameStart: number, frameEnd: number): PromptSegment {
		const spec = TAG_SPECIFICATIONS[tag];
		let value = 0;
		if (spec.min !== undefined && spec.max !== undefined) {
			value = Math.floor((spec.min + spec.max) / 2);
		}
		return {
			id: `${Date.now()}-${Math.random()}`,
			frameStart,
			frameEnd,
			tag,
			value,
			spec,
		};
	}

	// Modal functions
	function closeModal() {
		showAddModal = false;
		activePipeIndex = null;
		activeKfIndex = null;
		addMode = 'url';
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
	}

	function openAddModal(pipeIndex: number, kfIndex?: number) {
		activePipeIndex = pipeIndex;
		activeKfIndex = kfIndex ?? null;
		showAddModal = true;
	}

	function confirmAdd() {
		if (activePipeIndex === null) return;
		const pipe = scene.pipes[activePipeIndex];
		if (!pipe || pipe.keyframes.length >= MAX_KEYFRAMES) return;

		// Calculate frame position based on existing keyframes
		let baseFrame = 0;
		if (pipe.keyframes.length > 0) {
			const lastFrame = Math.max(...pipe.keyframes.map(k => k.frame));
			baseFrame = snapTo8nPlus1(lastFrame + 60);
			// Ensure within pipe bounds
			if (baseFrame >= pipe.lengthFrames) {
				baseFrame = snapTo8nPlus1(pipe.lengthFrames - 60);
			}
		}

		// Create new keyframe
		const newKeyframe = {
			id: Date.now().toString(),
			frame: baseFrame,
			type: addMode as any,
			imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
			prompt: addMode === 'txt2img' ? modalPrompt : undefined,
			referenceUrl: addMode === 'img2img' ? modalImg2Img || undefined : undefined,
			status: 'done' as const,
		};

		// Update pipe with new keyframe
		scene.pipes = scene.pipes.map((p, idx) => {
			if (idx !== activePipeIndex) return p;
			return {
				...p,
				keyframes: [...p.keyframes, newKeyframe],
			};
		});

		closeModal();
	}

	function deleteKeyframe(pipeIndex: number, kfId: string) {
		const pipe = scene.pipes[pipeIndex];
		if (!pipe) return;
		scene.pipes = scene.pipes.map((p, idx) => {
			if (idx !== pipeIndex) return p;
			return {
				...p,
				keyframes: p.keyframes.filter(k => k.id !== kfId),
			};
		});
	}

	function updateQ(pipeIndex: number, val: number) {
		const pipe = scene.pipes[pipeIndex];
		if (pipe) {
			scene.pipes = scene.pipes.map((p, idx) => 
				idx === pipeIndex ? { ...p, qValue: val } : p
			);
		}
	}

	function updateC(pipeIndex: number, val: number) {
		const pipe = scene.pipes[pipeIndex];
		if (pipe) {
			scene.pipes = scene.pipes.map((p, idx) => 
				idx === pipeIndex ? { ...p, cValue: val } : p
			);
		}
	}

	function openSegmentModal(pipeIndex: number, segment: PromptSegment) {
		activeSegmentId = segment.id;
		segmentValue = segment.value;
		segmentPrompt = segment.prompt || '';
		showSegmentModal = true;
	}

	function closeSegmentModal() {
		showSegmentModal = false;
		activeSegmentId = null;
	}

	function confirmSegmentUpdate() {
		if (activeSegmentId === null || activePipeIndex === null) return;
		
		const pipe = scene.pipes[activePipeIndex];
		if (!pipe) return;

		const spec = TAG_SPECIFICATIONS[pipe.prompt.segments.find(s => s.id === activeSegmentId)?.tag || 'scene'];

		scene.pipes = scene.pipes.map((p, idx) => {
			if (idx !== activePipeIndex) return p;
			return {
				...p,
				prompt: {
					...p.prompt,
					segments: p.prompt.segments.map(s => {
						if (s.id !== activeSegmentId) return s;
						return {
							...s,
							value: spec.usePrompt ? s.value : segmentValue,
							prompt: spec.usePrompt ? segmentPrompt : undefined,
						};
					}),
				},
			};
		});

		closeSegmentModal();
	}

	function openTypePicker(pipeIndex: number) {
		activePipeForType = pipeIndex;
		showTypePicker = true;
	}

	function closeTypePicker() {
		showTypePicker = false;
		activePipeForType = null;
	}

	function addSegmentWithType(tag: TagType) {
		if (activePipeForType === null) return;
		
		const pipe = scene.pipes[activePipeForType];
		if (!pipe) return;

		const maxFrame = pipe.prompt.segments.length > 0
			? Math.max(...pipe.prompt.segments.map(s => s.frameEnd))
			: 0;
		const frameStart = maxFrame;
		const frameEnd = Math.min(maxFrame + 60, pipe.lengthFrames);

		const newSegment = createDefaultSegment(tag, frameStart, frameEnd);

		// Validate before adding
		const testSegments = [...pipe.prompt.segments, newSegment];
		const validation = validatePromptSegments(testSegments);

		if (validation.valid) {
			scene.pipes = scene.pipes.map((p, idx) => {
				if (idx !== activePipeForType) return p;
				return {
					...p,
					prompt: {
						...p.prompt,
						segments: testSegments,
					},
				};
			});
		}

		closeTypePicker();
	}

	function removeParam(pipeIndex: number, segmentId: string) {
		const pipe = scene.pipes[pipeIndex];
		if (!pipe || pipe.prompt.segments.length <= 1) return;

		scene.pipes = scene.pipes.map((p, idx) => {
			if (idx !== pipeIndex) return p;
			return {
				...p,
				prompt: {
					...p.prompt,
					segments: p.prompt.segments.filter(s => s.id !== segmentId),
				},
			};
		});
	}

	function updateParam(pipeIndex: number, segmentId: string, value: number) {
		const pipe = scene.pipes[pipeIndex];
		if (!pipe) return;

		scene.pipes = scene.pipes.map((p, idx) => {
			if (idx !== pipeIndex) return p;
			return {
				...p,
				prompt: {
					...p.prompt,
					segments: p.prompt.segments.map(s => 
						s.id === segmentId ? { ...s, value } : s
					),
				},
			};
		});
	}

	function moveParamFrame(pipeIndex: number, segmentId: string, delta: number) {
		const pipe = scene.pipes[pipeIndex];
		if (!pipe) return;

		const segment = pipe.prompt.segments.find(s => s.id === segmentId);
		if (!segment) return;

		const newStart = snapTo8nPlus1(segment.frameStart + delta);
		const newEnd = snapTo8nPlus1(segment.frameEnd + delta);

		// Validate bounds
		if (newStart < 0 || newEnd > pipe.lengthFrames) return;

		// Check for overlaps
		const testSegments = pipe.prompt.segments.map(s => 
			s.id === segmentId ? { ...s, frameStart: newStart, frameEnd: newEnd } : s
		);
		const validation = validatePromptSegments(testSegments);

		if (validation.valid) {
			scene.pipes = scene.pipes.map((p, idx) => {
				if (idx !== pipeIndex) return p;
				return {
					...p,
					prompt: {
						...p.prompt,
						segments: testSegments,
					},
				};
			});
		}
	}

	function updatePipeLength(pipeIndex: number, newLength: number) {
		const snapped = snapTo8nPlus1(newLength);
		const maxLen = getMaxFramesForResolution(scene.resolution);

		// Validate
		if (snapped < MIN_PIPE_LENGTH) {
			console.warn(`Minimum pipe length is ${MIN_PIPE_LENGTH} frames`);
			return;
		}
		if (snapped > maxLen) {
			console.warn(`Maximum pipe length is ${maxLen} frames for ${scene.resolution}`);
			return;
		}

		// Update pipe and recalculate scene
		scene.pipes = scene.pipes.map((p, idx) => {
			if (idx !== pipeIndex) return p;
			// Truncate segments that exceed new length
			const truncatedSegments = p.prompt.segments.filter(s => s.frameEnd <= snapped);
			return {
				...p,
				lengthFrames: snapped,
				prompt: {
					...p.prompt,
					segments: truncatedSegments,
				},
			};
		});

		// Recalculate scene total length
		const maxPipeLength = Math.max(...scene.pipes.map(p => p.lengthFrames));
		scene = {
			...scene,
			totalLength: snapTo8nPlus1(maxPipeLength),
			lengthSeconds: parseFloat((snapTo8nPlus1(maxPipeLength) / scene.fps).toFixed(1)),
		};
	}

	function addTrack() {
		const newIdx = scene.pipes.length;
		scene = {
			...scene,
			pipes: [...scene.pipes, createEmptyPipe(newIdx)],
		};
	}

	function removeTrack(pipeIndex: number) {
		if (scene.pipes.length <= 1) return;
		scene = {
			...scene,
			pipes: scene.pipes.filter((_, idx) => idx !== pipeIndex),
		};
	}

	function updateFps(newFps: number) {
		if (!FPS_PRESETS.includes(newFps)) return;
		scene = {
			...scene,
			fps: newFps,
			lengthSeconds: parseFloat((scene.totalLength / newFps).toFixed(1)),
		};
	}

	function updateResolution(resolution: typeof scene.resolution) {
		scene = {
			...scene,
			resolution,
		};
		// Recalculate max pipe lengths
		scene = {
			...scene,
			pipes: scene.pipes.map(p => ({
				...p,
				lengthFrames: Math.min(p.lengthFrames, getMaxFramesForResolution(resolution)),
			})),
		};
	}
</script>

<div class="composer-panel">
	<!-- Scene Header -->
	<div class="scene-header">
		<div class="scene-info">
			<span class="scene-name">{scene.name}</span>
			<span class="scene-meta">{scene.totalLength}f @ {scene.fps}fps = {scene.lengthSeconds}s</span>
		</div>
		<div class="scene-controls">
			<select class="fps-select" value={scene.fps} onchange={(e) => updateFps(Number(e.currentTarget.value))}>
				{#each FPS_PRESETS as fps}
					<option value={fps}>{fps} fps</option>
				{/each}
			</select>
			<select class="resolution-select" value={scene.resolution} onchange={(e) => updateResolution(e.currentTarget.value)}>
				<option value="480p">480p</option>
				<option value="720p">720p</option>
				<option value="1080p">1080p</option>
			</select>
		</div>
	</div>

	<!-- Shared Frame Ruler -->
	<div class="ruler-container">
		<div class="ruler">
			<div class="ruler-ticks">
				{#each Array.from({ length: Math.ceil(scene.totalLength / 60) + 1 }, (_, i) => i * 60) as frame}
					<div class="ruler-mark" style="left: {frame / scene.totalLength * 100}%">
						<span>{frame}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Pipes List -->
	<div class="pipes-list">
		{#each scene.pipes as pipe, pipeIdx (pipe.id)}
			<div class="pipe-row">
				<!-- Pipe Header -->
				<div class="pipe-header">
					<span class="pipe-label">Pipe {pipeIdx + 1}</span>
					<button class="remove-pipe-btn" onclick={() => removeTrack(pipeIdx)} title="Remove pipe">×</button>
				</div>

				<!-- Row 1: Keyframes + Q/C -->
				<div class="kf-row">
					{#each pipe.keyframes as kf, kfIdx (kf.id)}
						<div 
							class="kf-box {kf.imageSrc ? 'has-image' : ''}"
							style="position: absolute; left: {kf.frame / pipe.lengthFrames * 100}%"
							onclick={() => openAddModal(pipeIdx, kfIdx)}
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
						<div class="add-kf-btn" onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)}>+</div>
					{/if}

					<!-- Q/C Sliders -->
					<div class="qc-sliders">
						<div class="qc-group">
							<span class="qc-label">Q</span>
							<input type="range" min={Q_MIN} max={Q_MAX} step="1"
							       value={pipe.qValue}
							       oninput={(e) => updateQ(pipeIdx, Number(e.currentTarget.value))} />
							<span class="qc-value">{pipe.qValue}</span>
						</div>
						<div class="qc-group">
							<span class="qc-label">C</span>
							<input type="range" min={C_MIN} max={C_MAX} step="0.5"
							       value={pipe.cValue}
							       oninput={(e) => updateC(pipeIdx, Number(e.currentTarget.value))} />
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
						max={getMaxFramesForResolution(scene.resolution)}
						step="9"
						onchange={(e) => updatePipeLength(pipeIdx, Number(e.currentTarget.value))}
					/>
					<span class="length-unit">frames</span>
				</div>

				<!-- Rows 3+: Segment Timelines -->
				{#each pipe.prompt.segments as segment (segment.id)}
					<div 
						class="param-row" 
						style="--tag-color: {segment.spec.color}"
						onclick={() => openSegmentModal(pipeIdx, segment)}
					>
						<div class="param-frame-indicator" style="left: {segment.frameStart / pipe.lengthFrames * 100}%">
							<span class="param-frame">{segment.frameStart}</span>
						</div>
						<div class="param-content">
							<span class="param-name" style="color: {segment.spec.color}">[{segment.spec.name}]</span>
							{#if segment.spec.usePrompt}
								<span class="param-prompt-text">{segment.prompt || '(empty)'}</span>
							{:else}
								<input type="range" min={segment.spec.min ?? 0} max={segment.spec.max ?? 100} step="1"
								       value={segment.value}
								       onclick={(e) => e.stopPropagation()}
								       oninput={(e) => updateParam(pipeIdx, segment.id, Number(e.currentTarget.value))} />
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

				<!-- Add Parameter Button -->
				<div class="add-param-row" onclick={() => openTypePicker(pipeIdx)}>
					<span>+</span>
					<span>Add Segment</span>
				</div>
			</div>
		{/each}

		<!-- Add Pipe Button -->
		<div class="add-pipe-btn" onclick={() => addTrack()}>+ Add Pipe</div>
	</div>

	<!-- Add Keyframe Modal -->
	{#if showAddModal && activePipeIndex !== null}
		<div class="modal-backdrop" onclick={closeModal} role="presentation">
			<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
				<div class="modal-header">
					<span class="modal-title">Add Keyframe Image</span>
					<button class="modal-close" onclick={closeModal}>×</button>
				</div>
				
				<div class="mode-tabs">
					<button class="mode-tab {addMode === 'url' ? 'active' : ''}" onclick={() => addMode = 'url'}>URL</button>
					<button class="mode-tab {addMode === 'txt2img' ? 'active' : ''}" onclick={() => addMode = 'txt2img'}>Text→Img</button>
					<button class="mode-tab {addMode === 'img2img' ? 'active' : ''}" onclick={() => addMode = 'img2img'}>Img→Img</button>
				</div>

				<div class="modal-body">
					{#if addMode === 'url'}
						<textarea class="modal-input" bind:value={modalUrl} placeholder="Paste image URL..."></textarea>
					{:else if addMode === 'txt2img'}
						<textarea class="modal-input" bind:value={modalPrompt} placeholder="Describe the image..." rows="3"></textarea>
					{:else}
						<textarea class="modal-input" bind:value={modalImg2Img} placeholder="Reference image URL..." rows="2"></textarea>
					{/if}
				</div>

				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmAdd}>Add</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Segment Edit Modal -->
	{#if showSegmentModal && activeSegmentId !== null}
		<div class="modal-backdrop" onclick={closeSegmentModal} role="presentation">
			<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
				<div class="modal-header">
					<span class="modal-title">Edit Segment</span>
					<button class="modal-close" onclick={closeSegmentModal}>×</button>
				</div>
				
				<div class="modal-body">
					{#each scene.pipes[activePipeIndex || 0]?.prompt.segments as segment (segment.id)}
						{#if segment.id === activeSegmentId}
							<div class="segment-info">
								<span class="segment-tag" style="color: {segment.spec.color}">[{segment.spec.name}]</span>
								<span class="segment-frames">{segment.frameStart}-{segment.frameEnd}</span>
							</div>
							
							{#if segment.spec.usePrompt}
								<label class="modal-label">Prompt:</label>
								<textarea 
									class="modal-input" 
									bind:value={segmentPrompt} 
									placeholder="Enter prompt text..."
									rows="4"
								></textarea>
							{:else}
								<label class="modal-label">Value:</label>
								<input 
									type="range" 
									min={segment.spec.min ?? 0} 
									max={segment.spec.max ?? 100} 
									step="1"
									bind:value={segmentValue}
								/>
								<span class="modal-value">{segmentValue}</span>
							{/if}
						{/if}
					{/each}
				</div>

				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeSegmentModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmSegmentUpdate}>Save</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Add Segment Type Picker -->
	{#if showTypePicker && activePipeForType !== null}
		<div class="modal-backdrop" onclick={closeTypePicker} role="presentation">
			<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
				<div class="modal-header">
					<span class="modal-title">Add Segment</span>
					<button class="modal-close" onclick={closeTypePicker}>×</button>
				</div>
				
				<div class="modal-body">
					<p class="modal-hint">Select segment type to add:</p>
					<div class="type-grid">
						{#each allTags as tag}
							<button 
								class="type-btn" 
								style="--btn-color: {TAG_SPECIFICATIONS[tag].color}"
								onclick={() => addSegmentWithType(tag)}
							>
								<span class="type-color" style="background: {TAG_SPECIFICATIONS[tag].color}"></span>
								<span>{TAG_SPECIFICATIONS[tag].name}</span>
							</button>
						{/each}
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
		min-height: 0;
		background: var(--bg-primary, #1A1A1D);
	}

	/* Scene Header */
	.scene-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: var(--bg-secondary, #2A2A2E);
		border-bottom: 1px solid var(--border-color, #4E525A);
		flex-shrink: 0;
	}

	.scene-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.scene-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
	}

	.scene-meta {
		font-size: 10px;
		color: var(--text-muted, #808080);
		font-family: monospace;
	}

	.scene-controls {
		display: flex;
		gap: 8px;
	}

	.fps-select, .resolution-select {
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #4E525A);
		color: var(--text-primary, #EEEEEE);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 11px;
		cursor: pointer;
	}

	/* Ruler Container */
	.ruler-container {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--bg-secondary, #2A2A2E);
		border-bottom: 2px solid var(--border-color, #4E525A);
		height: 36px;
		flex-shrink: 0;
	}

	.ruler {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.ruler-ticks {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: max-content;
		min-width: 100%;
	}

	.ruler-mark {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		justify-content: flex-end;
		padding-bottom: 4px;
	}

	.ruler-mark::before {
		content: '';
		width: 1px;
		height: 10px;
		background: var(--accent-primary, #59B5FF);
		margin-bottom: 2px;
	}

	.ruler-mark span {
		font-size: 9px;
		color: var(--text-muted, #808080);
		font-family: monospace;
	}

	/* Pipes List */
	.pipes-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
	}

	/* Pipe Row */
	.pipe-row {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		gap: 2px;
		padding: 6px;
		position: relative;
	}

	.pipe-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 4px;
	}

	.pipe-label {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.remove-pipe-btn {
		background: none;
		border: none;
		color: var(--text-muted, #606060);
		cursor: pointer;
		font-size: 14px;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.remove-pipe-btn:hover {
		background: rgba(220, 38, 38, 0.2);
		color: #dc2626;
	}

	/* Keyframes Row */
	.kf-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 56px;
		padding: 4px;
		position: relative;
		background: var(--bg-primary, #1A1A1D);
		border-radius: 4px;
	}

	.kf-box {
		position: relative;
		width: 48px;
		height: 48px;
		border-radius: 4px;
		border: 2px solid var(--border-color, #4E525A);
		background: var(--bg-tertiary, #3A3A3F);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
		z-index: 10;
	}

	.kf-box.has-image {
		padding: 2px;
	}

	.kf-box:hover {
		border-color: var(--accent-primary, #59B5FF);
		transform: translateY(-2px);
	}

	.kf-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 2px;
	}

	.kf-label {
		font-size: 10px;
		font-weight: bold;
		color: var(--text-muted, #606060);
		font-family: monospace;
	}

	.delete-kf-btn {
		position: absolute;
		top: -6px;
		right: -6px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #dc2626;
		color: #fff;
		border: none;
		cursor: pointer;
		font-size: 10px;
		display: none;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.kf-box:hover .delete-kf-btn {
		display: flex;
	}

	.add-kf-btn {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 16px;
		font-weight: bold;
		opacity: 0.8;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}

	.add-kf-btn:hover {
		opacity: 1;
		transform: scale(1.1);
	}

	/* Q/C Sliders */
	.qc-sliders {
		display: flex;
		gap: 12px;
		margin-left: auto;
		padding-left: 16px;
		border-left: 1px solid var(--border-color, #3A3A3F);
		align-items: center;
	}

	.qc-group {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.qc-label {
		font-size: 9px;
		font-weight: bold;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		min-width: 12px;
	}

	.qc-group input[type="range"] {
		width: 50px;
		height: 4px;
		appearance: none;
		background: var(--bg-primary, #1A1A1D);
		border-radius: 2px;
		outline: none;
	}

	.qc-group input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		cursor: pointer;
	}

	.qc-value {
		font-size: 9px;
		color: var(--text-muted, #808080);
		min-width: 16px;
		text-align: center;
		font-family: monospace;
	}

	/* Length Row */
	.length-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		background: var(--bg-tertiary, #3A3A3F);
		border-radius: 4px;
		margin-top: 2px;
	}

	.length-label {
		font-size: 10px;
		color: var(--text-muted, #808080);
		font-weight: 600;
		text-transform: uppercase;
	}

	.length-input {
		width: 70px;
		background: var(--bg-primary, #1A1A1D);
		border: 1px solid var(--border-color, #4E525A);
		color: var(--text-primary, #EEEEEE);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		font-family: monospace;
	}

	.length-input:focus {
		outline: none;
		border-color: var(--accent-primary, #59B5FF);
	}

	.length-unit {
		font-size: 10px;
		color: var(--text-muted, #606060);
	}

	/* Param Row - CLICKABLE */
	.param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		background: var(--bg-secondary, #2A2A2E);
		border-radius: 4px;
		margin-top: 2px;
		border-left: 3px solid var(--tag-color, #59B5FF);
		cursor: pointer;
		transition: all 0.15s;
	}

	.param-row:hover {
		background: var(--bg-hover, #3A3A3F);
		border-left-color: var(--tag-color, #59B5FF);
	}

	.param-frame-indicator {
		position: relative;
		width: 40px;
		height: 20px;
		flex-shrink: 0;
	}

	.param-frame {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		font-size: 8px;
		color: var(--text-muted, #606060);
		font-family: monospace;
		white-space: nowrap;
	}

	.param-content {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.param-name {
		font-size: 10px;
		font-weight: 600;
		min-width: 60px;
	}

	.param-prompt-text {
		font-size: 10px;
		color: var(--text-secondary, #BFBFBF);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 200px;
	}

	.param-content input[type="range"] {
		flex: 1;
		height: 4px;
		appearance: none;
		background: var(--bg-primary, #1A1A1D);
		border-radius: 2px;
		outline: none;
	}

	.param-content input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--tag-color, #59B5FF);
		cursor: pointer;
	}

	.param-value {
		font-size: 10px;
		color: var(--text-muted, #808080);
		min-width: 24px;
		text-align: center;
		font-family: monospace;
	}

	.param-controls {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.move-btn {
		background: none;
		border: 1px solid var(--border-color, #3A3A3F);
		color: var(--text-muted, #808080);
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 10px;
	}

	.move-btn:hover {
		border-color: var(--accent-primary, #59B5FF);
		color: var(--accent-primary, #59B5FF);
	}

	.remove-param-btn {
		background: none;
		border: none;
		color: var(--text-muted, #606060);
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
	}

	.remove-param-btn:hover {
		background: rgba(220, 38, 38, 0.2);
		color: #dc2626;
	}

	/* Add Param Row */
	.add-param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		margin-top: 2px;
		border: 1px dashed var(--border-color, #3A3A3F);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text-muted, #606060);
		font-size: 11px;
		transition: all 0.15s;
	}

	.add-param-row:hover {
		border-color: var(--accent-primary, #59B5FF);
		color: var(--accent-primary, #59B5FF);
		background: rgba(89, 181, 255, 0.05);
	}

	.add-param-row span:first-child {
		font-size: 14px;
		font-weight: bold;
	}

	/* Add Pipe Button */
	.add-pipe-btn {
		padding: 12px;
		text-align: center;
		color: var(--text-muted, #606060);
		cursor: pointer;
		border: 1px dashed var(--border-color, #3A3A3F);
		border-radius: 4px;
		margin-top: 4px;
		transition: all 0.15s;
	}

	.add-pipe-btn:hover {
		background: var(--bg-hover, #3A3A3F);
		color: var(--accent-primary, #59B5FF);
		border-color: var(--accent-primary, #59B5FF);
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 8px;
		width: 400px;
		max-width: 90vw;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
	}

	.modal-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
	}

	.modal-close {
		background: none;
		border: none;
		color: var(--text-muted, #808080);
		font-size: 20px;
		cursor: pointer;
		padding: 0 4px;
	}

	.modal-close:hover {
		color: var(--text-primary, #EEEEEE);
	}

	.mode-tabs {
		display: flex;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
	}

	.mode-tab {
		flex: 1;
		padding: 10px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 12px;
		transition: all 0.15s;
	}

	.mode-tab:hover {
		color: var(--text-primary, #EEEEEE);
	}

	.mode-tab.active {
		color: var(--accent-primary, #59B5FF);
		border-bottom-color: var(--accent-primary, #59B5FF);
	}

	.modal-body {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.modal-hint {
		font-size: 12px;
		color: var(--text-muted, #808080);
		margin: 0;
	}

	.modal-label {
		font-size: 11px;
		color: var(--text-muted, #808080);
		font-weight: 600;
		text-transform: uppercase;
	}

	.modal-value {
		font-size: 11px;
		color: var(--text-primary, #EEEEEE);
		font-family: monospace;
	}

	.modal-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		color: var(--text-primary, #EEEEEE);
		font-family: inherit;
		font-size: 13px;
		resize: vertical;
		box-sizing: border-box;
	}

	.modal-input:focus {
		outline: none;
		border-color: var(--accent-primary, #59B5FF);
	}

	.modal-footer {
		padding: 12px 16px;
		border-top: 1px solid var(--border-color, #3A3A3F);
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.btn-cancel, .btn-confirm {
		padding: 8px 18px;
		border-radius: 4px;
		font-size: 13px;
		cursor: pointer;
		border: none;
		transition: all 0.15s;
	}

	.btn-cancel {
		background: var(--bg-tertiary, #3A3A3F);
		color: var(--text-secondary, #BFBFBF);
		border: 1px solid var(--border-color, #3A3A3F);
	}

	.btn-cancel:hover {
		background: var(--bg-hover, #3A3A3F);
	}

	.btn-confirm {
		background: var(--accent-primary, #59B5FF);
		color: #fff;
	}

	.btn-confirm:hover {
		background: var(--accent-primary-hover, #7EC8FF);
	}

	/* Segment Info */
	.segment-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: var(--bg-tertiary, #3A3A3F);
		border-radius: 4px;
	}

	.segment-tag {
		font-size: 12px;
		font-weight: 600;
	}

	.segment-frames {
		font-size: 11px;
		color: var(--text-muted, #808080);
		font-family: monospace;
	}

	/* Type Picker Grid */
	.type-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}

	.type-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
		color: var(--text-primary, #EEEEEE);
		font-size: 12px;
	}

	.type-btn:hover {
		border-color: var(--btn-color, #59B5FF);
		background: rgba(89, 181, 255, 0.1);
	}

	.type-color {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
