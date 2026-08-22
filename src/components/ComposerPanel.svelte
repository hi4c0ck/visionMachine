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
	}

	let { } = $props<{
		// No props needed - composer is self-contained
	}>();

	let pipes = $state<PipeRow[]>([
		{ id: 'p1', keyframes: [] },
		{ id: 'p2', keyframes: [] },
		{ id: 'p3', keyframes: [] },
		{ id: 'p4', keyframes: [] },
	]);

	// Modal state
	let showAddModal = $state(false);
	let activePipeId = $state<string | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state('');

	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;

	function closeModal() {
		showAddModal = false;
		activePipeId = null;
		addMode = 'url';
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
	}

	function openAddModal(pipeId: string) {
		activePipeId = pipeId;
		showAddModal = true;
	}

	function confirmAdd() {
		if (!activePipeId) return;
		const pipe = pipes.find(p => p.id === activePipeId);
		if (!pipe) return;

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
		closeModal();
	}

	function deleteKeyframe(pipeId: string, kfId: string) {
		const pipe = pipes.find(p => p.id === pipeId);
		if (!pipe) return;
		pipe.keyframes = pipe.keyframes.filter(k => k.id !== kfId);
	}

	function addPipe() {
		pipes = [...pipes, { id: `p${Date.now()}`, keyframes: [] }];
	}
</script>

<div class="composer-panel" role="main">

	<!-- Pipes List -->
	<div class="pipes-list">
		{#each pipes as pipe (pipe.id)}
			<div class="pipe-row">

				<!-- Keyframes Row -->
				<div class="kf-row">
					{#each pipe.keyframes as kf, i (kf.id)}
						<div class="kf-box" onclick={() => openAddModal(pipe.id)}>
							{#if kf.imageSrc}
								<img class="kf-thumb" src={kf.imageSrc} alt={`KF ${i+1}`} />
							{:else}
								<div class="kf-placeholder">+</div>
							{/if}
							<span class="kf-label">k{i + 1}</span>
						</div>
						
						<!-- Add button after each keyframe (shows when k1 has source, k2 has source, etc.) -->
						<button class="add-kf-btn"
						        onclick={() => openAddModal(pipe.id)}
						        title="Add next keyframe">+</button>
					{/each}

					<!-- Final add button -->
					<button class="add-kf-btn final"
					        onclick={() => openAddModal(pipe.id)}
					        title="Add keyframe">+</button>
				</div>

				<!-- Frame Ruler -->
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
									<input type="range" min={Q_MIN} max={Q_MAX} step="1" value={Q_DEFAULT} />
									<span>{Q_DEFAULT}</span>
									
									<label>c</label>
									<input type="range" min={C_MIN} max={C_MAX} step="0.5" value={C_DEFAULT} />
									<span>{C_DEFAULT}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

			</div>
		{/each}

		<!-- Add new pipe -->
		<button class="add-pipe-btn" onclick={addPipe}>+</button>
	</div>

	<!-- Modal for adding/editing keyframe image -->
	{#if showAddModal}
		<div class="modal-backdrop" onclick={closeModal}>
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

	/* ── Pipes List ─────────────────────────────── */
	.pipes-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-primary, #1A1A1D);
		padding: 8px;
	}

	/* ── Pipe Row ───────────────────────────────── */
	.pipe-row {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		padding: 8px;
		gap: 4px;
	}

	/* ── Keyframes Row ─────────────────────────── */
	.kf-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 64px;
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
		width: 48px;
		height: 48px;
		object-fit: cover;
		border: 2px solid var(--border-color, #4E525A);
		border-radius: 2px;
	}

	.kf-placeholder {
		width: 48px;
		height: 48px;
		border: 2px dashed var(--border-color, #4E525A);
		border-radius: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted, #606060);
		font-size: 1.2rem;
	}

	.kf-label {
		font-size: 0.6rem;
		color: var(--text-muted, #606060);
		font-family: monospace;
	}

	/* ── Add Keyframe Button ───────────────────── */
	.add-kf-btn {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
		color: white;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		opacity: 0.7;
		transition: opacity 0.15s;
	}
	.add-kf-btn:hover { opacity: 1; }
	.add-kf-btn.final {
		margin-left: auto;
		opacity: 0.9;
	}

	/* ── Frame Ruler ───────────────────────────── */
	.ruler-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 0;
	}
	.ruler-arrow {
		font-size: 0.7rem;
		color: var(--text-muted, #606060);
		flex-shrink: 0;
	}
	.ruler-track {
		flex: 1;
		height: 8px;
		border-bottom: 1px solid var(--border-color, #4E525A);
		position: relative;
	}

	/* ── Sliders Section ───────────────────────── */
	.sliders-section {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
		overflow-x: auto;
		border-top: 1px dashed var(--border-color, #3A3A3F);
	}
	.slider-segment {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: var(--bg-tertiary, #3A3A3F);
		border-radius: 4px;
		flex-shrink: 0;
	}
	.slider-segment label {
		font-size: 0.55rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		font-weight: 600;
	}
	.slider-segment input {
		width: 50px;
		appearance: none;
		background: var(--bg-primary, #1A1A1D);
		height: 3px;
		border-radius: 2px;
		cursor: pointer;
	}
	.slider-segment input::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
		cursor: pointer;
	}
	.slider-segment span {
		font-size: 0.55rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
		min-width: 20px;
		text-align: center;
	}

	/* ── Add Pipe Button ───────────────────────── */
	.add-pipe-btn {
		align-self: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px dashed var(--border-color, #4E525A);
		color: var(--text-muted, #808080);
		font-size: 1.5rem;
		cursor: pointer;
		transition: all 0.15s;
		margin-top: 4px;
	}
	.add-pipe-btn:hover {
		border-color: var(--accent-primary, #FF6B35);
		color: var(--accent-primary);
	}

	/* ── Modal ─────────────────────────────────── */
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
		width: 400px;
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
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
	}
	.modal-title {
		font-size: 0.85rem;
		color: var(--text-primary, #E8E8E8);
		font-weight: 600;
	}
	.modal-close {
		background: none; border: none;
		color: var(--text-muted, #808080);
		font-size: 1.3rem;
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
		padding: 8px;
		background: transparent;
		border: none;
		color: var(--text-muted, #808080);
		font-size: 0.75rem;
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
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.modal-input {
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		color: var(--text-primary, #E8E8E8);
		padding: 8px 10px;
		font-size: 0.85rem;
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
		gap: 8px;
		padding: 10px 16px;
		border-top: 1px solid var(--border-color, #3A3A3F);
	}
	.btn-cancel {
		padding: 6px 14px;
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 4px;
		color: var(--text-secondary, #A0A0A0);
		cursor: pointer;
		font-size: 0.8rem;
	}
	.btn-cancel:hover { background: var(--bg-hover, #3A3A3F); }
	.btn-confirm {
		padding: 6px 18px;
		background: var(--accent-primary, #FF6B35);
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
	}
	.btn-confirm:hover { background: var(--accent-primary-hover, #FF8C61); }
</style>
