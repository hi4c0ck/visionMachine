<script lang="ts">
	interface PipeKeyframe {
		id: string;
		frame: number;
		imageSrc?: string;
		prompt?: string;
		img2imgRef?: string;
	}

	interface PipeParam {
		id: string;
		name: 'segment' | 'scene' | 'camera' | 'lighting' | 'effect';
		frameStart: number;  // frame position (8n+ rule)
		frameEnd: number;
		value: number;
	}

	let { } = $props<{
		// No props needed
	}>();

	const MAX_KEYFRAMES = 3;
	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;

	// Param types with default ranges
	const PARAM_TYPES: Array<{ id: PipeParam['name']; label: string; min: number; max: number }> = [
		{ id: 'segment', label: 'Segment', min: 1, max: 10 },
		{ id: 'scene', label: 'Scene', min: 0, max: 100 },
		{ id: 'camera', label: 'Camera', min: 0, max: 100 },
		{ id: 'lighting', label: 'Lighting', min: 0, max: 100 },
		{ id: 'effect', label: 'Effect', min: 0, max: 100 },
	];

	let pipes = $state<Array<{
		id: string;
		keyframes: PipeKeyframe[];
		qValue: number;
		cValue: number;
		params: PipeParam[];
	}>>([
		createEmptyPipe(0),
		createEmptyPipe(1),
		createEmptyPipe(2),
		createEmptyPipe(3),
	]);

	function createEmptyPipe(index: number) {
		return {
			id: `p${index + 1}`,
			keyframes: [],
			qValue: Q_DEFAULT,
			cValue: C_DEFAULT,
			params: [
				createDefaultParam('segment', 0, 60),
				createDefaultParam('scene', 60, 120),
				createDefaultParam('camera', 120, 180),
			],
		};
	}

	function createDefaultParam(typeId: PipeParam['name'], frameStart: number, frameEnd: number): PipeParam {
		const type = PARAM_TYPES.find(t => t.id === typeId)!;
		return {
			id: Date.now().toString() + Math.random(),
			name: typeId,
			frameStart,
			frameEnd,
			value: Math.floor((type.min + type.max) / 2),
		};
	}

	// Find nearest 8n+ frame
	function snapTo8n(frame: number): number {
		return Math.round(frame / 8) * 8 + 8;
	}

	// Modal state
	let showAddModal = $state(false);
	let activePipeIndex = $state<number | null>(null);
	let activeKfIndex = $state<number | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state('');

	// Calculate total frames from all keyframes
	let totalFrames = $derived(Math.max(
		...pipes.flatMap(p => p.keyframes.length > 0 ? [p.keyframes[p.keyframes.length - 1].frame + 120] : [0]),
		...pipes.flatMap(p => p.params.map(param => param.frameEnd)),
		600  // minimum
	));

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
		const pipe = pipes[activePipeIndex];
		if (!pipe || pipe.keyframes.length >= MAX_KEYFRAMES) return;

		const baseFrame = pipe.keyframes.length > 0
			? snapTo8n(Math.max(...pipe.keyframes.map(k => k.frame)) + 60)
			: 0;

		const newKf: PipeKeyframe = {
			id: Date.now().toString(),
			frame: baseFrame,
			imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
			prompt: addMode === 'txt2img' ? modalPrompt : undefined,
			img2imgRef: addMode === 'img2img' ? modalImg2Img || undefined : undefined,
		};

		pipe.keyframes = [...pipe.keyframes, newKf];
		closeModal();
	}

	function deleteKeyframe(pipeIndex: number, kfId: string) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		pipe.keyframes = pipe.keyframes.filter(k => k.id !== kfId);
	}

	function updateQ(pipeIndex: number, val: number) {
		const pipe = pipes[pipeIndex];
		if (pipe) pipe.qValue = val;
	}

	function updateC(pipeIndex: number, val: number) {
		const pipe = pipes[pipeIndex];
		if (pipe) pipe.cValue = val;
	}

	function addParam(pipeIndex: number) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		
		// Find next available frame range
		const lastFrame = Math.max(
			...pipe.keyframes.map(k => k.frame),
			...pipe.params.map(p => p.frameEnd),
			0
		);
		const newStart = snapTo8n(lastFrame);
		const newEnd = snapTo8n(lastFrame + 60);
		
		const typeIndex = pipe.params.length % PARAM_TYPES.length;
		const typeId = PARAM_TYPES[typeIndex].id;
		
		pipe.params = [...pipe.params, createDefaultParam(typeId, newStart, newEnd)];
	}

	function removeParam(pipeIndex: number, paramId: string) {
		const pipe = pipes[pipeIndex];
		if (!pipe || pipe.params.length <= 1) return;
		pipe.params = pipe.params.filter(p => p.id !== paramId);
	}

	function updateParam(pipeIndex: number, paramId: string, value: number) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		const param = pipe.params.find(p => p.id === paramId);
		if (param) param.value = value;
	}

	function moveParamFrame(pipeIndex: number, paramId: string, delta: number) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		const param = pipe.params.find(p => p.id === paramId);
		if (!param) return;
		
		const newStart = snapTo8n(param.frameStart + delta);
		const newEnd = snapTo8n(param.frameEnd + delta);
		
		// Ensure non-overlapping
		if (newStart >= 0 && newEnd > newStart) {
			param.frameStart = newStart;
			param.frameEnd = newEnd;
		}
	}

	function addTrack() {
		const newIdx = pipes.length;
		pipes = [...pipes, createEmptyPipe(newIdx)];
	}

	function removeTrack(pipeIndex: number) {
		if (pipes.length <= 1) return;
		pipes = pipes.filter((_, idx) => idx !== pipeIndex);
	}
</script>

<div class="composer-panel">
	<!-- Shared Frame Ruler (stays fixed at top) -->
	<div class="ruler-container">
		<div class="ruler">
			<div class="ruler-ticks">
				{#each Array.from({ length: Math.ceil(totalFrames / 60) + 1 }, (_, i) => i * 60) as frame}
					<div class="ruler-mark" style="left: {frame / totalFrames * 100}%">
						<span>{frame}</span>
					</div>
				{/each}
			</div>
			<!-- Playhead indicator -->
			<div class="playhead" style="left: 0%"></div>
		</div>
	</div>

	<!-- Pipes List -->
	<div class="pipes-list">
		{#each pipes as pipe, pipeIdx (pipe.id)}
			<div class="pipe-row">
				<!-- Pipe Header with Q/C -->
				<div class="pipe-header">
					<span class="pipe-label">Pipe {pipeIdx + 1}</span>
					<button class="remove-pipe-btn" onclick={() => removeTrack(pipeIdx)} title="Remove pipe">×</button>
				</div>

				<!-- Row 1: Keyframes + Q/C at end -->
				<div class="kf-row">
					{#each pipe.keyframes as kf, kfIdx (kf.id)}
						<div 
							class="kf-box {kf.imageSrc ? 'has-image' : ''}"
							style="left: {kf.frame / totalFrames * 100}%"
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

					<!-- Q/C Sliders - at the END of keyframes row -->
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

				<!-- Rows 2+: Parameter Sliders (one per param, with frame position) -->
				{#each pipe.params as param (param.id)}
					<div class="param-row">
						<div class="param-frame-indicator" style="left: {param.frameStart / totalFrames * 100}%">
							<span class="param-frame">{param.frameStart}</span>
						</div>
						<div class="param-content">
							<span class="param-name">{param.name}</span>
							<input type="range" min={param.min} max={param.max} step="1"
							       value={param.value}
							       oninput={(e) => updateParam(pipeIdx, param.id, Number(e.currentTarget.value))} />
							<span class="param-value">{param.value}</span>
						</div>
						<div class="param-controls">
							<button class="move-btn" onclick={() => moveParamFrame(pipeIdx, param.id, -8)} title="Move left (-8f)">‹</button>
							<button class="move-btn" onclick={() => moveParamFrame(pipeIdx, param.id, 8)} title="Move right (+8f)">›</button>
							<button class="remove-param-btn" onclick={() => removeParam(pipeIdx, param.id)} title="Remove">×</button>
						</div>
					</div>
				{/each}

				<!-- Add Parameter Button -->
				<div class="add-param-row" onclick={() => addParam(pipeIdx)}>
					<span>+</span>
					<span>Add Param</span>
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
</div>

<style>
	.composer-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg-primary, #1A1A1D);
	}

	/* Ruler Container - Fixed at top */
	.ruler-container {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--bg-secondary, #2A2A2E);
		border-bottom: 2px solid var(--border-color, #4E525A);
		height: 40px;
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
		height: 12px;
		background: var(--accent-primary, #59B5FF);
		margin-bottom: 2px;
	}

	.ruler-mark span {
		font-size: 9px;
		color: var(--text-muted, #808080);
		font-family: monospace;
	}

	.playhead {
		position: absolute;
		top: 0;
		left: 0;
		width: 2px;
		height: 100%;
		background: #dc2626;
		z-index: 10;
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

	/* Param Row */
	.param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		background: var(--bg-secondary, #2A2A2E);
		border-radius: 4px;
		margin-top: 2px;
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
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		font-weight: 600;
		min-width: 60px;
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
		background: var(--accent-primary, #59B5FF);
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
</style>
