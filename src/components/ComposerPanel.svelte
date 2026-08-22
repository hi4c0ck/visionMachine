<script lang="ts">
	import FrameRuler from './FrameRuler.svelte';
	import MultiThumbSlider from './MultiThumbSlider.svelte';

	interface Keyframe {
		id: string;
		frame: number;
		label: string;
		valueStart: number;
		valueEnd: number;
	}

	let {
		projectId,
		projectName,
		totalFrames = 1200,
		onselectKeyframe,
		onnewKeyframe,
		ondeleteKeyframe,
		oncreateSession
	} = $props<{
		projectId: string | null;
		projectName: string;
		totalFrames?: number;
		onselectKeyframe?: (id: string) => void;
		onnewKeyframe?: (keyframe: Keyframe) => void;
		ondeleteKeyframe?: (id: string) => void;
		oncreateSession?: () => void;
	}>();

	let selectedFrame = $state(0);
	let isPlaying = $state(false);
	let keyframes = $state<Keyframe[]>([]);
	let selectedKeyframeId = $state<string | null>(null);
	let sessionCreated = $state(false);

	function play() {
		isPlaying = true;
		console.log('[Composer] Play');
	}

	function pause() {
		isPlaying = false;
		console.log('[Composer] Pause');
	}

	function stop() {
		isPlaying = false;
		selectedFrame = 0;
		console.log('[Composer] Stop');
	}

	function addKeyframe() {
		if (!projectId) return;
		
		const keyframe: Keyframe = {
			id: Date.now().toString(),
			frame: selectedFrame,
			label: `Key ${keyframes.length + 1}`,
			valueStart: Math.floor(selectedFrame * 0.3),
			valueEnd: Math.floor(selectedFrame * 0.7)
		};
		
		keyframes = [...keyframes, keyframe];
		selectedKeyframeId = keyframe.id;
		onnewKeyframe?.(keyframe);
		console.log('[Composer] Added keyframe at frame', selectedFrame);
	}

	function selectKeyframe(id: string) {
		selectedKeyframeId = id;
		const kf = keyframes.find(k => k.id === id);
		if (kf) {
			selectedFrame = kf.frame;
		}
		onselectKeyframe?.(id);
	}

	function deleteKeyframe(id: string) {
		keyframes = keyframes.filter(k => k.id !== id);
		if (selectedKeyframeId === id) {
			selectedKeyframeId = null;
		}
		ondeleteKeyframe?.(id);
		console.log('[Composer] Deleted keyframe:', id);
	}

	function handleFrameSelect(frame: number) {
		selectedFrame = frame;
	}

	function createSession() {
		console.log('[Composer] Create session for project:', projectId);
		sessionCreated = true;
		oncreateSession?.();
	}
</script>

<div class="composer-panel" role="main">
	<!-- Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<span class="project-title">{projectName || 'No Project Selected'}</span>
			{#if projectId}
				<span class="project-id">ID: {projectId}</span>
			{/if}
		</div>
		<div class="toolbar-center">
			<button class="tool-btn" onclick={play} title="Play">▶</button>
			<button class="tool-btn" onclick={pause} title="Pause">⏸</button>
			<button class="tool-btn" onclick={stop} title="Stop">⏹</button>
			<span class="time-display">Frame {selectedFrame} / {totalFrames}</span>
		</div>
		<div class="toolbar-right">
			<button class="tool-btn primary" onclick={addKeyframe} title="Add Keyframe (K)">+ Keyframe</button>
			<button class="tool-btn" onclick={createSession} disabled={sessionCreated} title="Create Session">
				{#if sessionCreated}✓ Session Created{:else}🔗 Create Session{/if}
			</button>
		</div>
	</div>

	<!-- Canvas Area -->
	<div class="canvas-area">
		{#if projectId}
			<div class="canvas-grid"></div>
			<div class="canvas-content">
				<div class="canvas-icon">◈</div>
				<div class="canvas-label">Video Canvas</div>
				<div class="canvas-hint">Project: {projectName}</div>
				<div class="canvas-hint">Frame: {selectedFrame} / {totalFrames}</div>
				<div class="canvas-hint">Keyframes: {keyframes.length}</div>
			</div>
		{:else}
			<div class="canvas-empty">
				<div class="empty-icon">◈</div>
				<div class="empty-title">Select a Project</div>
				<div class="empty-subtitle">Choose or create a project to start editing</div>
			</div>
		{/if}
	</div>

	<!-- Frame Ruler -->
	<div class="ruler-section">
		<FrameRuler
			{totalFrames}
			{selectedFrame}
			onframeSelect={handleFrameSelect}
		/>
	</div>

	<!-- MultiThumb Slider for Keyframe Values -->
	{#if selectedKeyframeId}
		<div class="slider-section">
			{#each keyframes as keyframe (keyframe.id)}
				{#if keyframe.id === selectedKeyframeId}
					<MultiThumbSlider
						values={[keyframe.valueStart, keyframe.valueEnd]}
						label={`Keyframe: ${keyframe.label}`}
						onchange={(v) => {
							keyframes = keyframes.map(k => 
								k.id === keyframe.id ? { ...k, valueStart: v[0], valueEnd: v[1] } : k
							);
						}}
					/>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Keyframes List -->
	{#if keyframes.length > 0}
		<div class="keyframes-panel">
			<h4>Keyframes ({keyframes.length})</h4>
			<div class="keyframe-list">
				{#each keyframes as keyframe (keyframe.id)}
					<div
						class="keyframe-item {selectedKeyframeId === keyframe.id ? 'active' : ''}"
						onclick={() => selectKeyframe(keyframe.id)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && selectKeyframe(keyframe.id)}
					>
						<span class="kf-frame">{keyframe.frame}f</span>
						<span class="kf-label">{keyframe.label}</span>
						<button type="button" class="kf-delete" onclick={() => deleteKeyframe(keyframe.id)}>×</button>
					</div>
				{/each}
			</div>
			<button class="add-more" onclick={addKeyframe}>+ Add Keyframe</button>
		</div>
	{/if}
</div>

<style>
	.composer-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		background: var(--bg-primary, #2B2B2B);
		outline: none;
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		background: var(--bg-secondary, #3C3F46);
		border-bottom: 1px solid var(--border-color, #4E525A);
		gap: 16px;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.project-title {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-primary, #EEEEEE);
	}

	.project-id {
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
		background: var(--bg-tertiary, #4E525A);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.toolbar-center {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tool-btn {
		padding: 6px 12px;
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 4px;
		color: var(--text-primary, #EEEEEE);
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tool-btn:hover {
		background: var(--bg-hover, #5A5D65);
	}

	.tool-btn.primary {
		background: var(--accent-primary, #59B5FF);
		border-color: var(--accent-primary, #59B5FF);
		color: white;
	}

	.tool-btn.primary:hover {
		background: var(--accent-primary-hover, #7EC8FF);
	}

	.tool-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.time-display {
		font-size: 0.85rem;
		color: var(--text-secondary, #BFBFBF);
		padding: 4px 12px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 4px;
		font-family: monospace;
	}

	/* Canvas */
	.canvas-area {
		flex: 1;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: 
			linear-gradient(rgba(89, 181, 255, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(89, 181, 255, 0.03) 1px, transparent 1px);
		background-size: 20px 20px;
		min-height: 300px;
	}

	.canvas-grid {
		position: absolute;
		inset: 0;
		background-image: 
			linear-gradient(rgba(89, 181, 255, 0.05) 1px, transparent 1px),
			linear-gradient(90deg, rgba(89, 181, 255, 0.05) 1px, transparent 1px);
		background-size: 40px 40px;
	}

	.canvas-content {
		position: relative;
		z-index: 1;
		text-align: center;
	}

	.canvas-icon {
		font-size: 4rem;
		color: var(--accent-primary, #59B5FF);
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.canvas-label {
		font-size: 1.5rem;
		color: var(--text-primary, #EEEEEE);
		font-weight: 500;
		margin-bottom: 8px;
	}

	.canvas-hint {
		font-size: 0.875rem;
		color: var(--text-muted, #808080);
		font-family: monospace;
	}

	.canvas-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: var(--text-muted, #808080);
	}

	.empty-icon {
		font-size: 5rem;
		opacity: 0.2;
	}

	.empty-title {
		font-size: 1.75rem;
		color: var(--text-secondary, #BFBFBF);
	}

	.empty-subtitle {
		font-size: 0.9rem;
	}

	/* Ruler Section */
	.ruler-section {
		background: var(--bg-secondary, #3C3F46);
		border-top: 1px solid var(--border-color, #4E525A);
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	/* Slider Section */
	.slider-section {
		background: var(--bg-secondary, #3C3F46);
		padding: 8px 16px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	/* Keyframes Panel */
	.keyframes-panel {
		background: var(--bg-secondary, #3C3F46);
		border-top: 1px solid var(--border-color, #4E525A);
		padding: 12px 16px;
		max-height: 150px;
		overflow-y: auto;
	}

	.keyframes-panel h4 {
		margin: 0 0 8px 0;
		font-size: 0.75rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.keyframe-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 8px;
	}

	.keyframe-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.keyframe-item:hover {
		background: var(--bg-hover, #5A5D65);
	}

	.keyframe-item.active {
		background: rgba(89, 181, 255, 0.15);
		border-color: var(--accent-primary, #59B5FF);
	}

	.kf-frame {
		font-size: 0.75rem;
		color: var(--accent-primary, #59B5FF);
		font-family: monospace;
	}

	.kf-label {
		font-size: 0.75rem;
		color: var(--text-primary, #EEEEEE);
	}

	.kf-delete {
		padding: 2px 6px;
		background: transparent;
		border: none;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 0.9rem;
		border-radius: 3px;
	}

	.kf-delete:hover {
		background: rgba(220, 38, 38, 0.15);
		color: #dc2626;
	}

	.add-more {
		padding: 6px 12px;
		background: transparent;
		border: 1px dashed var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 0.8rem;
		transition: all 0.15s ease;
	}

	.add-more:hover {
		border-color: var(--accent-primary, #59B5FF);
		color: var(--accent-primary, #59B5FF);
	}
</style>