<script lang="ts">
	interface PipeKeyframe {
		id: string;
		frame: number;
		imageSrc?: string;
		prompt?: string;
		img2imgRef?: string;
	}

	interface PipeRow {
		id: string;
		keyframes: PipeKeyframe[];
		qValues: number[];
		cValues: number[];
	}

	let { } = $props<{
		// No props needed - composer is self-contained
	}>();

	const MAX_KEYFRAMES = 3;
	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;
	const SEGMENT_HEIGHT = 28;
	const TRACK_PADDING_TOP = 52;
	const TRACK_PADDING_BOTTOM = 44;

	// Colors for tracks
	const TRACK_COLORS = [
		{ main: '#FF6B6B', light: '#FF6B6B33', border: '#FF6B6B' },
		{ main: '#FFE66D', light: '#FFE66D33', border: '#FFE66D' },
		{ main: '#4ECDC4', light: '#4ECDC433', border: '#4ECDC4' },
		{ main: '#45B7D1', light: '#45B7D133', border: '#45B7D1' },
		{ main: '#96CEB4', light: '#96CEB433', border: '#96CEB4' },
		{ main: '#DDA0DD', light: '#DDA0DD33', border: '#DDA0DD' },
		{ main: '#FF6B35', light: '#FF6B3533', border: '#FF6B35' },
		{ main: '#9B59B6', light: '#9B59B633', border: '#9B59B6' },
	];

	let pipes = $state<PipeRow[]>([
		createEmptyPipe(0),
		createEmptyPipe(1),
		createEmptyPipe(2),
		createEmptyPipe(3),
	]);

	function createEmptyPipe(index: number): PipeRow {
		return {
			id: `p${index + 1}`,
			keyframes: [],
			qValues: [],
			cValues: [],
		};
	}

	function createColorForPipe(index: number) {
		return TRACK_COLORS[index % TRACK_COLORS.length];
	}

	// Modal state
	let showAddModal = $state(false);
	let activePipeIndex = $state<number | null>(null);
	let activeKfIndex = $state<number | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state('');

	// Computed values
	let totalFrames = $derived(Math.max(
		...pipes.flatMap(p => p.keyframes.length > 0 ? [p.keyframes[p.keyframes.length - 1].frame + 120] : [0]),
		600
	));
	let trackHeight = $derived(pipes.length * (SEGMENT_HEIGHT + 8));
	let scrollHeight = $derived(TRACK_PADDING_TOP + trackHeight + TRACK_PADDING_BOTTOM);

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
			? Math.max(...pipe.keyframes.map(k => k.frame)) + 60
			: 0;

		const newKf: PipeKeyframe = {
			id: Date.now().toString(),
			frame: baseFrame,
			imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
			prompt: addMode === 'txt2img' ? modalPrompt : undefined,
			img2imgRef: addMode === 'img2img' ? modalImg2Img || undefined : undefined,
		};

		pipe.keyframes = [...pipe.keyframes, newKf];
		pipe.qValues = [...pipe.qValues, Q_DEFAULT];
		pipe.cValues = [...pipe.cValues, C_DEFAULT];
		closeModal();
	}

	function deleteKeyframe(pipeIndex: number, kfId: string) {
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		const idx = pipe.keyframes.findIndex(k => k.id === kfId);
		pipe.keyframes = pipe.keyframes.filter(k => k.id !== kfId);
		if (idx >= 0) {
			pipe.qValues = pipe.qValues.filter((_, i) => i !== idx);
			pipe.cValues = pipe.cValues.filter((_, i) => i !== idx);
		}
	}

	function updateQ(pipeIndex: number, segIdx: number, val: number) {
		const pipe = pipes[pipeIndex];
		if (pipe && pipe.qValues[segIdx] !== undefined) {
			pipe.qValues[segIdx] = val;
		}
	}

	function updateC(pipeIndex: number, segIdx: number, val: number) {
		const pipe = pipes[pipeIndex];
		if (pipe && pipe.cValues[segIdx] !== undefined) {
			pipe.cValues[segIdx] = val;
		}
	}

	function getRemainingSlots(pipe: PipeRow): number {
		return MAX_KEYFRAMES - pipe.keyframes.length;
	}

	function addTrack() {
		const newIdx = pipes.length;
		pipes = [...pipes, createEmptyPipe(newIdx)];
	}
</script>

<div class="composer-panel">
	<!-- Timeline Ruler -->
	<div class="ruler" style="height: {TRACK_PADDING_TOP}px">
		<div class="ruler-ticks">
			{#each Array.from({ length: Math.ceil(totalFrames / 60) + 1 }, (_, i) => i * 60) as frame}
				<div class="ruler-mark" style="left: {frame / totalFrames * 100}%">
					<span>{frame}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Tracks Container -->
	<div class="tracks-container" style="height: {scrollHeight}px">
		{#each pipes as pipe, pipeIdx (pipe.id)}
			<div class="track-row">
				<!-- Track Label -->
				<div class="track-label">
					<span>Pipe {pipeIdx + 1}</span>
				</div>

				<!-- Track Content -->
				<div class="track-content">
					{#if pipe.keyframes.length === 0}
						<!-- Empty track placeholder -->
						<div class="track-placeholder" onclick={() => openAddModal(pipeIdx)}>
							<span>+</span>
						</div>
					{:else}
						<!-- Keyframe markers -->
						{#each pipe.keyframes as kf, kfIdx (kf.id)}
							<div 
								class="keyframe-marker {kf.imageSrc ? 'has-image' : ''}"
								style="left: {kf.frame / totalFrames * 100}%"
								onclick={() => openAddModal(pipeIdx, kfIdx)}
							>
								{#if kf.imageSrc}
									<img src={kf.imageSrc} alt={`KF ${kfIdx + 1}`} class="kf-thumb" />
								{:else}
									<span>K{kfIdx + 1}</span>
								{/if}
								<button 
									class="delete-btn" 
									onclick={(e) => { e.stopPropagation(); deleteKeyframe(pipeIdx, kf.id); }}
								>×</button>
							</div>
						{/each}

						<!-- Segment bars with Q/C controls -->
						{#each pipe.keyframes as kf, kfIdx (kf.id)}
							{#if kfIdx < pipe.keyframes.length - 1}
								<div class="segment-bar" style="
									left: {kf.frame / totalFrames * 100}%;
									width: {(pipe.keyframes[kfIdx + 1].frame - kf.frame) / totalFrames * 100}%;
									background: {createColorForPipe(pipeIdx).main}40;
								">
									<div class="segment-controls">
										<div class="qc-control">
											<span class="qc-label">Q</span>
											<input type="range" min={Q_MIN} max={Q_MAX} step="1"
											       value={pipe.qValues[kfIdx] ?? Q_DEFAULT}
											       oninput={(e) => updateQ(pipeIdx, kfIdx, Number(e.currentTarget.value))} />
											<span>{pipe.qValues[kfIdx] ?? Q_DEFAULT}</span>
										</div>
										<div class="qc-control">
											<span class="qc-label">C</span>
											<input type="range" min={C_MIN} max={C_MAX} step="0.5"
											       value={pipe.cValues[kfIdx] ?? C_DEFAULT}
											       oninput={(e) => updateC(pipeIdx, kfIdx, Number(e.currentTarget.value))} />
											<span>{pipe.cValues[kfIdx] ?? C_DEFAULT}</span>
										</div>
									</div>
								</div>
							{/if}
						{/each}

						<!-- Add keyframe button -->
						{#if pipe.keyframes.length > 0 && pipe.keyframes.length < MAX_KEYFRAMES}
							<div class="add-kf-marker" 
							     style="left: {(pipe.keyframes[pipe.keyframes.length - 1].frame + 30) / totalFrames * 100}%"
							     onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)}>
								<span>+</span>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		{/each}

		<!-- Add Track Button -->
		<div class="add-track-btn-row" onclick={() => addTrack()}>
			<span>+</span>
		</div>
	</div>

	<!-- Add Keyframe Modal -->
	{#if showAddModal && activePipeIndex !== null}
		<div class="modal-backdrop" onclick={closeModal}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span>Add Keyframe Image</span>
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

	/* Timeline Ruler */
	.ruler {
		position: relative;
		border-bottom: 1px solid var(--border-color, #4E525A);
		background: var(--bg-secondary, #2A2A2E);
		overflow: hidden;
	}

	.ruler-ticks {
		position: relative;
		height: 100%;
	}

	.ruler-mark {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.ruler-mark::before {
		content: '';
		width: 1px;
		height: 8px;
		background: var(--accent-primary, #59B5FF);
	}

	.ruler-mark span {
		font-size: 9px;
		color: var(--text-muted, #808080);
		margin-top: 2px;
		font-family: monospace;
	}

	/* Tracks Container */
	.tracks-container {
		position: relative;
		overflow-y: auto;
		overflow-x: auto;
		flex: 1;
		min-height: 0;
	}

	/* Track Row */
	.track-row {
		display: flex;
		align-items: center;
		height: 28px;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
		position: relative;
	}

	.track-label {
		width: 80px;
		min-width: 80px;
		padding: 0 12px;
		background: var(--bg-secondary, #2A2A2E);
		border-right: 1px solid var(--border-color, #4E525A);
		display: flex;
		align-items: center;
		font-size: 11px;
		color: var(--text-muted, #606060);
		position: sticky;
		left: 0;
		z-index: 10;
	}

	.track-content {
		flex: 1;
		position: relative;
		height: 100%;
		min-width: 600px;
	}

	/* Empty Track Placeholder */
	.track-placeholder {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-tertiary, #3A3A3F);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-muted, #606060);
		font-size: 18px;
		transition: all 0.15s;
	}

	.track-placeholder:hover {
		background: var(--accent-primary, #59B5FF);
		color: #fff;
	}

	/* Keyframe Marker */
	.keyframe-marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--bg-tertiary, #3A3A3F);
		border: 2px solid var(--border-color, #4E525A);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
		z-index: 5;
	}

	.keyframe-marker.has-image {
		padding: 2px;
	}

	.keyframe-marker:hover {
		border-color: var(--accent-primary, #59B5FF);
		transform: translate(-50%, -50%) scale(1.1);
	}

	.kf-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

	.keyframe-marker span {
		font-size: 10px;
		font-weight: bold;
		color: var(--text-primary, #EEEEEE);
	}

	.delete-btn {
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

	.keyframe-marker:hover .delete-btn {
		display: flex;
	}

	/* Add Keyframe Marker */
	.add-kf-marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #fff;
		font-size: 14px;
		font-weight: bold;
		opacity: 0.7;
		transition: opacity 0.15s;
	}

	.add-kf-marker:hover {
		opacity: 1;
	}

	/* Segment Bar */
	.segment-bar {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		height: 12px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.segment-controls {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.qc-control {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.qc-label {
		font-size: 9px;
		font-weight: bold;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
	}

	.qc-control input[type="range"] {
		width: 50px;
		height: 4px;
		appearance: none;
		background: var(--bg-primary, #1A1A1D);
		border-radius: 2px;
		outline: none;
	}

	.qc-control input[type="range"]::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		cursor: pointer;
	}

	.qc-control span:last-child {
		font-size: 9px;
		color: var(--text-muted, #808080);
		min-width: 16px;
		text-align: center;
		font-family: monospace;
	}

	/* Add Track Button Row */
	.add-track-btn-row {
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-top: 1px dashed var(--border-color, #4E525A);
		cursor: pointer;
		color: var(--text-muted, #606060);
		font-size: 20px;
		transition: all 0.15s;
	}

	.add-track-btn-row:hover {
		background: var(--bg-hover, #3A3A3F);
		color: var(--accent-primary, #59B5FF);
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
		padding: 14px 16px;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.modal-title {
		color: var(--text-primary, #EEEEEE);
		font-size: 14px;
		font-weight: 600;
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
