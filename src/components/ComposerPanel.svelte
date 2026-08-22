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

	let pipes = $state<PipeRow[]>([
		{ id: 'p1', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
		{ id: 'p2', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
		{ id: 'p3', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
		{ id: 'p4', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
	]);

	// Modal state
	let showAddModal = $state(false);
	let activePipeId = $state<string | null>(null);
	let activeKfIndex = $state<number | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state('');

	function closeModal() {
		showAddModal = false;
		activePipeId = null;
		activeKfIndex = null;
		addMode = 'url';
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
	}

	function openAddModal(pipeId: string, kfIndex?: number) {
		activePipeId = pipeId;
		activeKfIndex = kfIndex ?? null;
		showAddModal = true;
	}

	function confirmAdd() {
		if (!activePipeId) return;
		const pipe = pipes.find(p => p.id === activePipeId);
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
		if (pipe.keyframes.length > pipe.qValues.length) {
			pipe.qValues = [...pipe.qValues, Q_DEFAULT];
			pipe.cValues = [...pipe.cValues, C_DEFAULT];
		}
		closeModal();
	}

	function deleteKeyframe(pipeId: string, kfId: string) {
		const pipe = pipes.find(p => p.id === pipeId);
		if (!pipe) return;
		const idx = pipe.keyframes.findIndex(k => k.id === kfId);
		pipe.keyframes = pipe.keyframes.filter(k => k.id !== kfId);
		if (idx >= 0) {
			pipe.qValues = pipe.qValues.filter((_, i) => i !== idx);
			pipe.cValues = pipe.cValues.filter((_, i) => i !== idx);
		}
	}

	function updateQ(pipeId: string, idx: number, val: number) {
		const pipe = pipes.find(p => p.id === pipeId);
		if (pipe && pipe.qValues[idx] !== undefined) {
			pipe.qValues[idx] = val;
		}
	}

	function updateC(pipeId: string, idx: number, val: number) {
		const pipe = pipes.find(p => p.id === pipeId);
		if (pipe && pipe.cValues[idx] !== undefined) {
			pipe.cValues[idx] = val;
		}
	}

	function getRemainingSlots(pipe: PipeRow): number {
		return MAX_KEYFRAMES - pipe.keyframes.length;
	}
</script>

<div class="composer-panel" role="main">

	<!-- Pipes List - fills available space -->
	<div class="pipes-list">
		{#each pipes as pipe (pipe.id)}
			<div class="pipe-row">
				<!-- Keyframes Row -->
				<div class="kf-row">
					{#each pipe.keyframes as kf, i (kf.id)}
						<div class="kf-box" onclick={() => openAddModal(pipe.id, i + 1)}>
							{#if kf.imageSrc}
								<img class="kf-thumb" src={kf.imageSrc} alt={`KF ${i+1}`} />
							{:else}
								<div class="kf-placeholder">+</div>
							{/if}
							<span class="kf-label">k{i + 1}</span>
							<button class="kf-delete" onclick={(e) => { e.stopPropagation(); deleteKeyframe(pipe.id, kf.id); }} title="Delete">×</button>
						</div>
					{/each}

					<!-- Add button: shows after each keyframe if max not reached -->
					{#each pipe.keyframes as kf, i (kf.id)}
						{#if i < pipe.keyframes.length && getRemainingSlots(pipe) > 0}
							<button class="add-kf-btn" 
							        onclick={() => openAddModal(pipe.id, i + 1)}
							        title="Add next keyframe">+</button>
						{/if}
					{/each}

					<!-- Final add button if slots remain -->
					{#if getRemainingSlots(pipe) > 0}
						<button class="add-kf-btn final"
						        onclick={() => openAddModal(pipe.id, pipe.keyframes.length)}
						        title="Add keyframe">+</button>
					{/if}
				</div>

				<!-- Frame Ruler with arrows -->
				<div class="ruler-row">
					<span class="ruler-arrow">&lt;</span>
					<div class="ruler-track"></div>
					<span class="ruler-arrow">&gt;</span>
				</div>

				<!-- Q/C Sliders Section -->
				{#if pipe.keyframes.length > 1}
					<div class="sliders-section">
						{#each pipe.keyframes as kf, i (kf.id)}
							{#if i < pipe.keyframes.length - 1}
								<div class="slider-segment">
									<label>q</label>
									<input type="range" class="slider-input" min={Q_MIN} max={Q_MAX} step="1"
									       value={pipe.qValues[i] ?? Q_DEFAULT}
									       oninput={(e) => updateQ(pipe.id, i, Number(e.currentTarget.value))} />
									<span>{pipe.qValues[i] ?? Q_DEFAULT}</span>
									
									<label>c</label>
									<input type="range" class="slider-input" min={C_MIN} max={C_MAX} step="0.5"
									       value={pipe.cValues[i] ?? C_DEFAULT}
									       oninput={(e) => updateC(pipe.id, i, Number(e.currentTarget.value))} />
									<span>{pipe.cValues[i] ?? C_DEFAULT}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				<!-- Max reached indicator -->
				{#if pipe.keyframes.length >= MAX_KEYFRAMES}
					<div class="max-reached">✓ Max {MAX_KEYFRAMES} keyframes</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Modal for adding/editing keyframe image -->
	{#if showAddModal}
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
						<textarea bind:value={modalUrl} placeholder="Paste image URL…" rows="3" class="modal-input"></textarea>
					{:else if addMode === 'txt2img'}
						<textarea bind:value={modalPrompt} placeholder="Describe the image…" rows="4" class="modal-input"></textarea>
					{:else}
						<textarea bind:value={modalImg2Img} placeholder="Reference image URL…" rows="2" class="modal-input"></textarea>
					{/if}
				</div>

				<div class="modal-footer">
					<button class="btn-cancel" onclick={closeModal}>Cancel</button>
					<button class="btn-confirm" onclick={confirmAdd}>Confirm</button>
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

	/* ── Pipes List - Fills entire available space ── */
	.pipes-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-primary, #1A1A1D);
		padding: 8px;
	}

	/* ── Pipe Row - Expands to fill space ── */
	.pipe-row {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		padding: 8px;
		gap: 4px;
		flex: 1;
		min-height: 0;
	}

	/* ── Keyframes Row - Horizontal layout ── */
	.kf-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 72px;
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.kf-box {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		cursor: pointer;
		flex-shrink: 0;
		padding: 4px;
		border-radius: 4px;
		transition: background 0.15s;
	}
	.kf-box:hover { background: rgba(255,255,255,0.05); }

	.kf-thumb {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border: 2px solid var(--border-color, #4E525A);
		border-radius: 2px;
	}

	.kf-placeholder {
		width: 64px;
		height: 64px;
		border: 2px dashed var(--border-color, #4E525A);
		border-radius: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted, #606060);
		font-size: 1.5rem;
	}

	.kf-label {
		font-size: 0.65rem;
		color: var(--text-muted, #606060);
		font-family: monospace;
	}

	.kf-delete {
		position: absolute;
		top: -6px;
		right: -6px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #dc2626;
		color: white;
		border: none;
		cursor: pointer;
		font-size: 0.8rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.kf-box:hover .kf-delete { opacity: 1; }

	/* ── Add Keyframe Button ── */
	.add-kf-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
		color: white;
		border: none;
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		opacity: 0.8;
		transition: opacity 0.15s;
	}
	.add-kf-btn:hover { opacity: 1; transform: scale(1.1); }
	.add-kf-btn.final {
		margin-left: auto;
		opacity: 1;
	}

	/* ── Frame Ruler ── */
	.ruler-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 0;
	}
	.ruler-arrow {
		font-size: 0.8rem;
		color: var(--text-muted, #606060);
		flex-shrink: 0;
		cursor: pointer;
	}
	.ruler-arrow:hover { color: var(--accent-primary); }
	.ruler-track {
		flex: 1;
		height: 12px;
		border-bottom: 1px solid var(--border-color, #4E525A);
		position: relative;
		cursor: pointer;
	}
	.ruler-track::before {
		content: '';
		position: absolute;
		top: -4px;
		left: 50%;
		width: 2px;
		height: 8px;
		background: var(--accent-primary);
		transform: translateX(-50%);
	}

	/* ── Sliders Section ── */
	.sliders-section {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 0;
		overflow-x: auto;
		border-top: 1px dashed var(--border-color, #3A3A3F);
		min-height: 32px;
	}
	.slider-segment {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: var(--bg-tertiary, #3A3A3F);
		border-radius: 4px;
		flex-shrink: 0;
	}
	.slider-segment label {
		font-size: 0.6rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		font-weight: 600;
		min-width: 12px;
	}
	.slider-segment input {
		width: 60px;
		appearance: none;
		background: var(--bg-primary, #1A1A1D);
		height: 4px;
		border-radius: 2px;
		cursor: pointer;
	}
	.slider-segment input::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
		cursor: pointer;
	}
	.slider-segment span {
		font-size: 0.6rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
		min-width: 24px;
		text-align: center;
	}

	/* ── Max Reached Indicator ── */
	.max-reached {
		font-size: 0.65rem;
		color: var(--text-muted, #606060);
		text-align: center;
		padding: 2px 0;
	}

	/* ── Modal ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.modal {
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 8px;
		width: 420px;
		max-width: 90vw;
		box-shadow: 0 20px 60px rgba(0,0,0,0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
	}
	.modal-title {
		font-size: 0.9rem;
		color: var(--text-primary, #E8E8E8);
		font-weight: 600;
	}
	.modal-close {
		background: none; border: none;
		color: var(--text-muted, #808080);
		font-size: 1.4rem;
		cursor: pointer;
		padding: 0 4px;
	}
	.modal-close:hover { color: var(--text-primary); }

	.mode-tabs {
		display: flex;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
	}
	.mode-tab {
		flex: 1;
		padding: 10px;
		background: transparent;
		border: none;
		color: var(--text-muted, #808080);
		font-size: 0.8rem;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		transition: all 0.15s;
	}
	.mode-tab:hover { color: var(--text-primary); }
	.mode-tab.active {
		color: var(--accent-primary, #FF6B35);
		border-bottom-color: var(--accent-primary);
	}

	.modal-body {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.modal-input {
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		color: var(--text-primary, #E8E8E8);
		padding: 10px 12px;
		font-size: 0.875rem;
		resize: vertical;
		font-family: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	.modal-input:focus {
		outline: none;
		border-color: var(--accent-primary, #FF6B35);
	}
	.modal-input::placeholder { color: var(--text-muted, #606060); }

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 12px 16px;
		border-top: 1px solid var(--border-color, #3A3A3F);
	}
	.btn-cancel {
		padding: 8px 18px;
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		color: var(--text-secondary, #A0A0A0);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.btn-cancel:hover { background: var(--bg-hover, #3A3A3F); }
	.btn-confirm {
		padding: 8px 20px;
		background: var(--accent-primary, #FF6B35);
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
	}
	.btn-confirm:hover { background: var(--accent-primary-hover, #FF8C61); }
</style>
