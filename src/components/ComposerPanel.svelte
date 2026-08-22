<script lang="ts">
	interface PipeKeyframe {
		id: string;
		frame: number;        // position on ruler (0-N)
		imageSrc?: string;    // url or data-uri
		prompt?: string;
		img2imgRef?: string;
	}

	interface PipeRow {
		id: string;
		keyframes: PipeKeyframe[];
		// Q/C per segment (between keyframes)
		qValues: number[];
		cValues: number[];
	}

	let {
		projectId,
		projectName,
		oncreateSession
	} = $props<{
		projectId: string | null;
		projectName: string;
		oncreateSession?: () => void;
	}>();

	let sessionCreated = $state(false);

	// Modal state
	let showAddModal = $state(false);
	let activePipeId = $state<string | null>(null);
	let activeKfIndex = $state<number | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state('');

	// Ruler settings
	const TOTAL_FRAMES = 441;  // 480p default (8n+1 constraint)
	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;

	let pipes = $state<PipeRow[]>([
		{ id: 'p1', keyframes: [], qValues: [], cValues: [] },
		{ id: 'p2', keyframes: [], qValues: [], cValues: [] },
		{ id: 'p3', keyframes: [], qValues: [], cValues: [] },
		{ id: 'p4', keyframes: [], qValues: [], cValues: [] },
	]);

	function closeModal() {
		showAddModal = false;
		activePipeId = null;
		activeKfIndex = null;
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = '';
		addMode = 'url';
	}

	function openAddModal(pipeId: string, kfIndex?: number) {
		activePipeId = pipeId;
		activeKfIndex = kfIndex ?? null;
		showAddModal = true;
	}

	function openEditModal(pipeId: string, kf: PipeKeyframe) {
		activePipeId = pipeId;
		const idx = pipes.find(p => p.id === pipeId)?.keyframes.indexOf(kf) ?? null;
		activeKfIndex = idx;
		addMode = kf.imageSrc ? 'url' : 'txt2img';
		modalUrl = kf.imageSrc ?? '';
		modalPrompt = kf.prompt ?? '';
		modalImg2Img = kf.img2imgRef ?? '';
		showAddModal = true;
	}

	function confirmAdd() {
		if (!activePipeId) return;
		const pipe = pipes.find(p => p.id === activePipeId);
		if (!pipe) return;

		// Determine frame: append after last or insert at specified index
		let newFrame: number;
		if (activeKfIndex !== null && activeKfIndex >= 0 && activeKfIndex < pipe.keyframes.length) {
			// Insert before existing keyframe at index
			newFrame = pipe.keyframes[activeKfIndex].frame;
			pipe.keyframes = [
				...pipe.keyframes.slice(0, activeKfIndex),
				{
					id: Date.now().toString(),
					frame: newFrame,
					imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
					prompt: addMode === 'txt2img' ? modalPrompt : undefined,
					img2imgRef: addMode === 'img2img' ? modalImg2Img || undefined : undefined,
				},
				...pipe.keyframes.slice(activeKfIndex)
			];
			// Adjust q/c values for insertion
			pipe.qValues = [...pipe.qValues.slice(0, activeKfIndex), Q_DEFAULT, ...pipe.qValues.slice(activeKfIndex)];
			pipe.cValues = [...pipe.cValues.slice(0, activeKfIndex), C_DEFAULT, ...pipe.cValues.slice(activeKfIndex)];
		} else {
			// Append at end
			const lastFrame = pipe.keyframes.length > 0
				? Math.max(...pipe.keyframes.map(k => k.frame))
				: 0;
			newFrame = lastFrame + 60;
			pipe.keyframes = [...pipe.keyframes, {
				id: Date.now().toString(),
				frame: newFrame,
				imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
				prompt: addMode === 'txt2img' ? modalPrompt : undefined,
				img2imgRef: addMode === 'img2img' ? modalImg2Img ?? undefined : undefined,
			}];
			pipe.qValues = [...pipe.qValues, Q_DEFAULT];
			pipe.cValues = [...pipe.cValues, C_DEFAULT];
		}
		closeModal();
	}

	function deleteKeyframe(pipeId: string, kfId: string) {
		const pipe = pipes.find(p => p.id === pipeId);
		if (!pipe) return;
		const idx = pipe.keyframes.findIndex(k => k.id === kfId);
		if (idx === -1) return;
		pipe.keyframes = pipe.keyframes.filter(k => k.id !== kfId);
		pipe.qValues = pipe.qValues.filter((_, i) => i !== idx);
		pipe.cValues = pipe.cValues.filter((_, i) => i !== idx);
	}

	function addPipe() {
		pipes = [...pipes, { id: `p${Date.now()}`, keyframes: [], qValues: [], cValues: [] }];
	}

	function createSession() {
		sessionCreated = true;
		oncreateSession?.();
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

	function getKfPosition(kf: PipeKeyframe): number {
		return (kf.frame / TOTAL_FRAMES) * 100;
	}
</script>

<div class="composer-panel" role="main">

	<!-- Top bar -->
	<div class="topbar">
		<div class="topbar-left">
			<span class="project-title">{projectName || 'No Project Selected'}</span>
			{#if projectId}<span class="project-id">{projectId}</span>{/if}
		</div>
		<div class="topbar-right">
			<button class="btn-session" onclick={createSession} disabled={sessionCreated}>
				{#if sessionCreated}✓ Session Created{:else}🔗 Create Session{/if}
			</button>
		</div>
	</div>

	<!-- Pipes List -->
	<div class="pipes-list">
		{#each pipes as pipe (pipe.id)}
			<div class="pipe-row">
				<!-- Keyframes row -->
				<div class="keyframes-row">
					{#each pipe.keyframes as kf, i (kf.id)}
						<div class="kf-box" onclick={() => openEditModal(pipe.id, kf)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && openEditModal(pipe.id, kf)}>
							{#if kf.imageSrc}
								<img class="kf-thumb" src={kf.imageSrc} alt={`KF ${i+1}`} />
							{:else}
								<div class="kf-placeholder">+</div>
							{/if}
							<span class="kf-frame">{kf.frame}f</span>
							<!-- Add button inside box (bottom-right corner) -->
							<button class="add-inside"
							        onclick={(e) => { e.stopPropagation(); openAddModal(pipe.id, i + 1); }}
							        title="Add next keyframe">+</button>
						</div>
					{/each}
					
					<!-- Empty state: add button -->
					{#if pipe.keyframes.length === 0}
						<div class="add-first-kf" onclick={() => openAddModal(pipe.id, 0)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && openAddModal(pipe.id, 0)}>
							+
						</div>
					{/if}
				</div>

				<!-- Frame Ruler -->
				<div class="ruler-row">
					<span class="ruler-label">frame ruler</span>
					<div class="ruler-track">
						{#each Array.from({length: Math.ceil(TOTAL_FRAMES / 60) + 1}, (_, i) => i * 60) as marker (marker)}
							<div class="ruler-tick {marker % 120 === 0 ? 'major' : ''}"></div>
						{/each}
					</div>
				</div>

				<!-- Q/C Sliders Section -->
				{#if pipe.keyframes.length > 1}
					<div class="sliders-section">
						{#each pipe.keyframes as kf, i (kf.id)}
							{#if i < pipe.keyframes.length - 1}
								<div class="slider-segment">
									<label class="slider-label" for={`q-${pipe.id}-${i}`}>q</label>
									<input type="range" class="slider-input" id={`q-${pipe.id}-${i}`} min={Q_MIN} max={Q_MAX} step="1"
									       value={pipe.qValues[i] ?? Q_DEFAULT}
									       oninput={(e) => updateQ(pipe.id, i, Number(e.currentTarget.value))} />
									<span class="slider-val">{pipe.qValues[i] ?? Q_DEFAULT}</span>
									
									<label class="slider-label" for={`c-${pipe.id}-${i}`}>c</label>
									<input type="range" class="slider-input" id={`c-${pipe.id}-${i}`} min={C_MIN} max={C_MAX} step="0.5"
									       value={pipe.cValues[i] ?? C_DEFAULT}
									       oninput={(e) => updateC(pipe.id, i, Number(e.currentTarget.value))} />
									<span class="slider-val">{pipe.cValues[i] ?? C_DEFAULT}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				<!-- Delete empty pipe -->
				{#if pipe.keyframes.length === 0}
					<button class="delete-pipe" onclick={() => pipes = pipes.filter(p => p.id !== pipe.id)}>×</button>
				{/if}
			</div>
		{/each}

		<!-- Add new pipe button -->
		<button class="add-pipe-btn" onclick={addPipe}>
			+
		</button>
	</div>

	<!-- Add/Edit Modal -->
	{#if showAddModal}
		<div class="modal-backdrop" onclick={closeModal} role="presentation">
			<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
				<div class="modal-header">
					<span class="modal-title">Keyframe Image</span>
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

	/* ── Topbar ─────────────────────────────────────── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: var(--bg-secondary, #2A2A2E);
		border-bottom: 1px solid var(--border-color, #3A3A3F);
		flex-shrink: 0;
	}
	.project-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary, #E8E8E8); }
	.project-id { font-size: 0.7rem; color: var(--text-muted, #606060); background: var(--bg-tertiary, #3A3A3F); padding: 2px 6px; border-radius: 4px; font-family: monospace; }
	.btn-session { padding: 4px 12px; font-size: 0.8rem; background: var(--accent-primary, #FF6B35); color: white; border: none; border-radius: 4px; cursor: pointer; }
	.btn-session:disabled { opacity: 0.5; cursor: not-allowed; }

	/* ── Pipes List ─────────────────────────────────── */
	.pipes-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-primary, #1A1A1D);
		padding: 8px;
	}

	/* ── Pipe Row ───────────────────────────────────── */
	.pipe-row {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 6px;
		padding: 8px;
		gap: 6px;
		position: relative;
	}

	/* ── Keyframes Row ─────────────────────────────── */
	.keyframes-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 64px;
		overflow-x: auto;
	}

	.kf-box {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.kf-thumb {
		width: 56px;
		height: 56px;
		object-fit: cover;
		border-radius: 4px;
		border: 2px solid var(--border-color, #4E525A);
	}

	.kf-placeholder {
		width: 56px;
		height: 56px;
		border: 2px dashed var(--border-color, #4E525A);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted, #606060);
		font-size: 1.5rem;
		transition: all 0.15s;
	}
	.kf-placeholder:hover {
		border-color: var(--accent-primary, #FF6B35);
		color: var(--accent-primary);
	}

	.kf-frame {
		font-size: 0.6rem;
		color: var(--text-muted, #606060);
		font-family: monospace;
	}

	.add-inside {
		position: absolute;
		bottom: -4px;
		right: -4px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
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
	.kf-box:hover .add-inside { opacity: 1; }

	.add-first-kf {
		width: 56px;
		height: 56px;
		border: 2px dashed var(--border-color, #4E525A);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted, #606060);
		font-size: 1.5rem;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.add-first-kf:hover {
		border-color: var(--accent-primary, #FF6B35);
		color: var(--accent-primary);
	}

	/* ── Frame Ruler ───────────────────────────────── */
	.ruler-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
	}
	.ruler-label {
		font-size: 0.6rem;
		color: var(--text-muted, #606060);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		white-space: nowrap;
	}
	.ruler-track {
		flex: 1;
		height: 16px;
		position: relative;
		display: flex;
		align-items: flex-end;
		gap: 0;
	}
	.ruler-tick {
		flex: 1;
		height: 4px;
		background: var(--border-color, #3A3A3F);
		margin: 0 1px;
	}
	.ruler-tick.major {
		height: 8px;
		background: var(--text-muted, #808080);
	}

	/* ── Sliders Section ───────────────────────────── */
	.sliders-section {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 0;
		overflow-x: auto;
	}
	.slider-segment {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		background: var(--bg-tertiary, #3A3A3F);
		border-radius: 4px;
		flex-shrink: 0;
	}
	.slider-label {
		font-size: 0.6rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		font-weight: 600;
		min-width: 12px;
	}
	.slider-input {
		width: 60px;
		appearance: none;
		background: var(--bg-primary, #1A1A1D);
		height: 4px;
		border-radius: 2px;
		cursor: pointer;
	}
	.slider-input::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
		cursor: pointer;
	}
	.slider-val {
		font-size: 0.6rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
		min-width: 24px;
		text-align: center;
	}

	/* ── Delete empty pipe ─────────────────────────── */
	.delete-pipe {
		position: absolute;
		top: 4px;
		right: 4px;
		background: transparent;
		border: none;
		color: var(--text-muted, #606060);
		font-size: 1rem;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
	}
	.delete-pipe:hover {
		background: rgba(220, 38, 38, 0.15);
		color: #dc2626;
	}

	/* ── Add pipe button ───────────────────────────── */
	.add-pipe-btn {
		align-self: center;
		padding: 8px 24px;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px dashed var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-muted, #808080);
		font-size: 1.2rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.add-pipe-btn:hover {
		border-color: var(--accent-primary, #FF6B35);
		color: var(--accent-primary);
	}

	/* ── Modal ─────────────────────────────────────── */
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
		border-radius: 12px;
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
		padding: 8px;
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
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.modal-input {
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 6px;
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
		gap: 8px;
		padding: 12px 16px;
		border-top: 1px solid var(--border-color, #3A3A3F);
	}
	.btn-cancel {
		padding: 6px 16px;
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px solid var(--border-color, #3A3A3F);
		border-radius: 6px;
		color: var(--text-secondary, #A0A0A0);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.btn-cancel:hover { background: var(--bg-hover, #3A3A3F); }
	.btn-confirm {
		padding: 6px 20px;
		background: var(--accent-primary, #FF6B35);
		border: none;
		border-radius: 6px;
		color: white;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
	}
	.btn-confirm:hover { background: var(--accent-primary-hover, #FF8C61); }
</style>
