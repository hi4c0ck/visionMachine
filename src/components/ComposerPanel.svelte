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
		name: string;
		color: string;
		keyframes: PipeKeyframe[];
		qValues: number[]; // one less than keyframes (between each pair)
		cValues: number[];
	}

	let {
		projectId,
		projectName,
		onselectKeyframe,
		onnewKeyframe,
		ondeleteKeyframe,
		oncreateSession
	} = $props<{
		projectId: string | null;
		projectName: string;
		onselectKeyframe?: (id: string) => void;
		onnewKeyframe?: (keyframe: any) => void;
		ondeleteKeyframe?: (id: string) => void;
		oncreateSession?: () => void;
	}>();

	let sessionCreated = $state(false);

	// Modal state
	let showAddModal = $state(false);
	let activePipeId = $state<string | null>(null);
	let addMode = $state<'url' | 'txt2img' | 'img2img'>('url');
	let modalUrl = $state('');
	let modalPrompt = $state('');
	let modalImg2Img = $state<string | null>(null);

	const Q_MIN = 5, Q_MAX = 30, Q_DEFAULT = 18;
	const C_MIN = 0.5, C_MAX = 15, C_DEFAULT = 7;

	let pipes = $state<PipeRow[]>([
		{ id: 'p1', name: 'Layer 1', color: '#FF6B6B', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
		{ id: 'p2', name: 'Layer 2', color: '#4ECDC4', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
		{ id: 'p3', name: 'Layer 3', color: '#FFE66D', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
		{ id: 'p4', name: 'Layer 4', color: '#A8E6CF', keyframes: [], qValues: [Q_DEFAULT], cValues: [C_DEFAULT] },
	]);

	function closeModal() {
		showAddModal = false;
		modalUrl = '';
		modalPrompt = '';
		modalImg2Img = null;
		addMode = 'url';
	}

	function openAddModal(pipeId: string) {
		activePipeId = pipeId;
		showAddModal = true;
	}

	function openEditModal(pipeId: string, kf: PipeKeyframe) {
		activePipeId = pipeId;
		addMode = kf.imageSrc ? 'url' : 'txt2img';
		modalUrl = kf.imageSrc ?? '';
		modalPrompt = kf.prompt ?? '';
		modalImg2Img = kf.img2imgRef ?? null;
		showAddModal = true;
	}

	function confirmAdd() {
		if (!activePipeId) return;
		const pipe = pipes.find(p => p.id === activePipeId);
		if (!pipe) return;

		const lastFrame = pipe.keyframes.length > 0
			? Math.max(...pipe.keyframes.map(k => k.frame))
			: 0;
		const newFrame = lastFrame + 60;

		const kf: PipeKeyframe = {
			id: Date.now().toString(),
			frame: newFrame,
			imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
			prompt: addMode === 'txt2img' ? modalPrompt : undefined,
			img2imgRef: addMode === 'img2img' ? modalImg2Img ?? undefined : undefined,
		};

		pipe.keyframes = [...pipe.keyframes, kf];
		// Add default Q/C values for the new segment
		pipe.qValues = [...pipe.qValues, Q_DEFAULT];
		pipe.cValues = [...pipe.cValues, C_DEFAULT];
		
		closeModal();
		onnewKeyframe?.(kf);
	}

	function deleteKeyframe(pipeId: string, kfId: string) {
		const pipe = pipes.find(p => p.id === pipeId);
		if (!pipe) return;
		pipe.keyframes = pipe.keyframes.filter(k => k.id !== kfId);
		// Remove corresponding Q/C value (keep same count as segments)
		pipe.qValues = pipe.qValues.slice(0, Math.max(pipe.keyframes.length, 1));
		pipe.cValues = pipe.cValues.slice(0, Math.max(pipe.keyframes.length, 1));
		ondeleteKeyframe?.(kfId);
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

	<!-- Pipe Rows -->
	<div class="pipes-container">
		{#each pipes as pipe (pipe.id)}
			<div class="pipe-row">
				<!-- Header -->
				<div class="pipe-header" style={`border-left-color: ${pipe.color}`}>
					<span class="pipe-name">{pipe.name}</span>
					<span class="pipe-count">{pipe.keyframes.length} KF</span>
				</div>

				<!-- Keyframe strip -->
				<div class="kf-strip">
					{#if pipe.keyframes.length === 0}
						<div class="add-kf-btn"
						     onclick={() => openAddModal(pipe.id)}
						     role="button"
						     tabindex="0"
						     onkeydown={(e) => e.key === 'Enter' && openAddModal(pipe.id)}>
							+
						</div>
					{:else}
						{#each pipe.keyframes as kf (kf.id)}
							<div class="kf-cell" onclick={() => openEditModal(pipe.id, kf)}>
								{#if kf.imageSrc}
									<img class="kf-thumb" src={kf.imageSrc} alt={`KF ${kf.frame}`} />
								{:else}
									<div class="kf-placeholder" style={`border-color: ${pipe.color}`}>+</div>
								{/if}
								<span class="kf-frame">{kf.frame}f</span>
								<button class="kf-delete"
								        onclick={(e) => { e.stopPropagation(); deleteKeyframe(pipe.id, kf.id); }}
								        title="Delete">×</button>
							</div>
						{/each}
						
						<div class="add-kf-btn append"
						     onclick={() => openAddModal(pipe.id)}
						     role="button"
						     tabindex="0"
						     onkeydown={(e) => e.key === 'Enter' && openAddModal(pipe.id)}>
							+
						</div>
					{/if}
				</div>

				<!-- Q/C sliders between keyframes -->
				{#if pipe.keyframes.length > 1}
					<div class="qc-row">
						{#each pipe.keyframes as kf, i (kf.id)}
							{#if i < pipe.keyframes.length - 1}
								<div class="qc-segment">
									<label class="qc-label">q</label>
									<input type="range" class="qc-slider" min={Q_MIN} max={Q_MAX} step="1"
									       value={pipe.qValues[i]}
									       oninput={(e) => updateQ(pipe.id, i, Number(e.currentTarget.value))} />
									<span class="qc-val">{pipe.qValues[i]}</span>
									
									<label class="qc-label">c</label>
									<input type="range" class="qc-slider" min={C_MIN} max={C_MAX} step="0.5"
									       value={pipe.cValues[i]}
									       oninput={(e) => updateC(pipe.id, i, Number(e.currentTarget.value))} />
									<span class="qc-val">{pipe.cValues[i]}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				<!-- Frame ruler -->
				<div class="ruler-row">
					<div class="ruler-hint">8n+ frames · editable</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Add/Edit Modal -->
	{#if showAddModal}
		<div class="modal-backdrop" onclick={closeModal}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">
						{#if activePipeId}{pipes.find(p => p.id === activePipeId)?.name} — Keyframe{/if}
					</span>
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
						<textarea bind:value={modalImg2Img ?? modalUrl} placeholder="Reference image URL…" rows="2" class="modal-input"></textarea>
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

	/* ── Pipes container ─────────────────────────────── */
	.pipes-container {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--bg-primary, #1A1A1D);
	}

	/* ── Pipe row ────────────────────────────────────── */
	.pipe-row {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #2A2A2E);
		min-height: 88px;
	}

	.pipe-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 10px;
		border-bottom: 1px solid var(--border-color, #3A3A3F);
		background: var(--bg-tertiary, #3A3A3F);
	}
	.pipe-name {
		font-size: 0.75rem; font-weight: 600;
		color: var(--text-primary, #E8E8E8);
		padding-left: 8px;
		border-left: 3px solid transparent;
	}
	.pipe-count { font-size: 0.65rem; color: var(--text-muted, #606060); }

	/* ── Keyframe strip ──────────────────────────────── */
	.kf-strip {
		display: flex;
		align-items: flex-start;
		gap: 0;
		padding: 8px 10px;
		min-height: 60px;
		overflow-x: auto;
	}

	.add-kf-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px; height: 32px;
		margin: 0 4px;
		background: var(--bg-tertiary, #3A3A3F);
		border: 1px dashed var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 1.2rem;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.add-kf-btn:hover {
		border-color: var(--accent-primary, #FF6B35);
		color: var(--accent-primary);
		background: rgba(255, 107, 53, 0.1);
	}
	.add-kf-btn.append { margin-left: auto; }

	.kf-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: background 0.15s;
		flex-shrink: 0;
	}
	.kf-cell:hover { background: rgba(255,255,255,0.05); }

	.kf-thumb {
		width: 48px; height: 48px;
		object-fit: cover;
		border-radius: 4px;
		border: 1px solid var(--border-color, #4E525A);
		display: block;
	}
	.kf-placeholder {
		width: 48px; height: 48px;
		border: 2px dashed;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted, #606060);
		font-size: 1.4rem;
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
	.kf-delete {
		position: absolute;
		top: -4px; right: -4px;
		width: 16px; height: 16px;
		border-radius: 50%;
		background: #dc2626;
		color: white;
		border: none;
		cursor: pointer;
		font-size: 0.7rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.kf-cell:hover .kf-delete { opacity: 1; }

	/* ── Q/C row ─────────────────────────────────────── */
	.qc-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		background: rgba(0,0,0,0.2);
		border-top: 1px solid var(--border-color, #3A3A3F);
		min-height: 32px;
		overflow-x: auto;
	}
	.qc-segment {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 8px;
		border-right: 1px solid var(--border-color, #3A3A3F);
	}
	.qc-label {
		font-size: 0.55rem;
		color: var(--text-muted, #606060);
		text-transform: uppercase;
		font-weight: 600;
	}
	.qc-slider {
		width: 40px;
		appearance: none;
		background: var(--bg-tertiary, #3A3A3F);
		border-radius: 2px;
		height: 4px;
		cursor: pointer;
	}
	.qc-slider::-webkit-slider-thumb {
		appearance: none;
		width: 10px; height: 10px;
		border-radius: 50%;
		background: var(--accent-primary, #FF6B35);
		cursor: pointer;
	}
	.qc-val {
		font-size: 0.55rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
		min-width: 20px;
		text-align: center;
	}

	/* ── Ruler hint ──────────────────────────────────── */
	.ruler-row {
		border-top: 1px solid var(--border-color, #3A3A3F);
		background: var(--bg-primary, #1A1A1D);
		height: 20px;
		display: flex;
		align-items: center;
		padding: 0 10px;
	}
	.ruler-hint {
		font-size: 0.6rem;
		color: var(--text-muted, #606060);
		font-style: italic;
	}

	/* ── Modal ───────────────────────────────────────── */
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
