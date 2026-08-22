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

	interface Track {
		id: string;
		name: string;
		color: string;
		keyframes: Keyframe[];
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
	let selectedTrackId = $state<string | null>(null);
	let selectedKeyframeId = $state<string | null>(null);
	let sessionCreated = $state(false);

	// Default tracks for compositing
	const defaultTracks: Track[] = [
		{ id: 'position', name: 'Position', color: '#FF6B6B', keyframes: [] },
		{ id: 'scale', name: 'Scale', color: '#4ECDC4', keyframes: [] },
		{ id: 'rotation', name: 'Rotation', color: '#FFE66D', keyframes: [] },
		{ id: 'opacity', name: 'Opacity', color: '#95E1D3', keyframes: [] },
		{ id: 'zoom', name: 'Zoom', color: '#F38181', keyframes: [] },
	];

	let tracks = $state<Track[]>(defaultTracks);

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
		if (!projectId || !selectedTrackId) return;
		
		const track = tracks.find(t => t.id === selectedTrackId);
		if (!track) return;
		
		const keyframe: Keyframe = {
			id: Date.now().toString(),
			frame: selectedFrame,
			label: `${track.name} ${track.keyframes.length + 1}`,
			valueStart: Math.floor(selectedFrame * 0.3),
			valueEnd: Math.floor(selectedFrame * 0.7)
		};
		
		track.keyframes = [...track.keyframes, keyframe];
		selectedKeyframeId = keyframe.id;
		onnewKeyframe?.(keyframe);
		console.log('[Composer] Added keyframe at frame', selectedFrame);
	}

	function selectTrack(trackId: string) {
		selectedTrackId = trackId;
		selectedKeyframeId = null;
	}

	function selectKeyframe(id: string) {
		selectedKeyframeId = id;
		onselectKeyframe?.(id);
	}

	function deleteKeyframe(id: string) {
		for (const track of tracks) {
			track.keyframes = track.keyframes.filter(k => k.id !== id);
		}
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

	// Delete keyframe by track
	function deleteKeyframeFromTrack(trackId: string, id: string) {
		const track = tracks.find(t => t.id === trackId);
		if (track) {
			track.keyframes = track.keyframes.filter(k => k.id !== id);
		}
		if (selectedKeyframeId === id) {
			selectedKeyframeId = null;
		}
		ondeleteKeyframe?.(id);
	}

	// Get keyframe for track at specific frame (for editing)
	function getKeyframeInTrack(trackId: string, id: string): Keyframe | undefined {
		const track = tracks.find(t => t.id === trackId);
		return track?.keyframes.find(k => k.id === id);
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
			<button 
				class="tool-btn primary" 
				onclick={addKeyframe} 
				disabled={!selectedTrackId}
				title="Add Keyframe (K)"
			>+ Keyframe</button>
			<button class="tool-btn" onclick={createSession} disabled={sessionCreated} title="Create Session">
				{#if sessionCreated}✓ Session Created{:else}🔗 Create Session{/if}
			</button>
		</div>
	</div>

	<!-- Main Content: Preview + PipeRows -->
	<div class="composer-body">
		<!-- Left: Small Canvas Preview -->
		<div class="preview-area">
			{#if projectId}
				<div class="canvas-container">
					<div class="canvas">
						<div class="canvas-info">
							<div class="canvas-label">Preview</div>
							<div class="canvas-meta">
								<span>Frame: {selectedFrame}</span>
								<span>|</span>
								<span>Track: {selectedTrackId ? tracks.find(t => t.id === selectedTrackId)?.name : 'None'}</span>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="canvas-empty">
					<div class="empty-icon">◈</div>
					<div class="empty-title">Select a Project</div>
				</div>
			{/if}
		</div>

		<!-- Right: PipeRows Timeline -->
		<div class="timerow">
			<div class="timeline-header">
				<div class="track-labels">
					<span class="label">Tracks</span>
				</div>
				<div class="ruler-wrapper">
					<FrameRuler
						{totalFrames}
						{selectedFrame}
						onframeSelect={handleFrameSelect}
					/>
				</div>
			</div>

			<div class="tracks-container">
				{#each tracks as track (track.id)}
					<div 
						class="pipe-row {selectedTrackId === track.id ? 'active' : ''}"
						onclick={() => selectTrack(track.id)}
					>
						<div class="track-header" style={`border-left-color: ${track.color}`}>
							<span class="track-name">{track.name}</span>
							<span class="track-count">{track.keyframes.length} KF</span>
						</div>
						<div class="track-content">
							<!-- Keyframe markers -->
							{#each track.keyframes as keyframe (keyframe.id)}
								<div
									class="keyframe-marker {selectedKeyframeId === keyframe.id ? 'selected' : ''}"
									style={`left: ${(keyframe.frame / totalFrames) * 100}%; background: ${track.color};`}
									onclick={(e) => { e.stopPropagation(); selectKeyframe(keyframe.id); }}
									title={`Frame ${keyframe.frame}: ${keyframe.label}`}
								>
									<div class="diamond"></div>
								</div>
							{/each}
							
							<!-- Add button -->
							<button 
								class="add-kf-btn"
								onclick={(e) => { e.stopPropagation(); selectedTrackId = track.id; addKeyframe(); }}
								title="Add keyframe at current frame"
							>+</button>
						</div>
					</div>
				{/each}
			</div>

			<!-- Selected Keyframe Editor -->
			{#if selectedKeyframeId}
				<div class="keyframe-editor">
					{#each tracks as track (track.id)}
						{#each track.keyframes as keyframe (keyframe.id)}
							{#if keyframe.id === selectedKeyframeId}
								<div class="editor-panel">
									<div class="editor-header">
										<span class="editor-title">{keyframe.label}</span>
										<button class="delete-btn" onclick={() => deleteKeyframeFromTrack(track.id, keyframe.id)}>×</button>
									</div>
									<MultiThumbSlider
										values={[keyframe.valueStart, keyframe.valueEnd]}
										label={`${track.name} Range`}
										onchange={(v) => {
											keyframe.valueStart = v[0];
											keyframe.valueEnd = v[1];
										}}
									/>
								</div>
							{/if}
						{/each}
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.composer-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		background: var(--bg-primary, #2B2B2B);
		outline: none;
		height: 100%;
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
		flex-shrink: 0;
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

	/* Composer Body */
	.composer-body {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	/* Preview Area (Left Side) */
	.preview-area {
		width: 320px;
		min-width: 280px;
		background: var(--bg-secondary, #3C3F46);
		border-right: 1px solid var(--border-color, #4E525A);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 16px;
		gap: 12px;
	}

	.canvas-container {
		width: 100%;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.canvas {
		width: 100%;
		aspect-ratio: 16/9;
		background: #000;
		border-radius: 4px;
		border: 1px solid var(--border-color, #4E525A);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}

	.canvas::before {
		content: '';
		position: absolute;
		inset: 0;
		background: 
			linear-gradient(rgba(89, 181, 255, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(89, 181, 255, 0.03) 1px, transparent 1px);
		background-size: 20px 20px;
		pointer-events: none;
	}

	.canvas-info {
		text-align: center;
		z-index: 1;
	}

	.canvas-label {
		font-size: 0.875rem;
		color: var(--text-muted, #808080);
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.canvas-meta {
		font-size: 0.75rem;
		color: var(--text-secondary, #BFBFBF);
		font-family: monospace;
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: center;
	}

	.canvas-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: var(--text-muted, #808080);
		height: 100%;
		width: 100%;
	}

	.empty-icon {
		font-size: 3rem;
		opacity: 0.2;
	}

	.empty-title {
		font-size: 1rem;
		color: var(--text-secondary, #BFBFBF);
	}

	/* Timeline (Right Side) */
	.timerow {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--bg-primary, #2B2B2B);
	}

	.timeline-header {
		display: flex;
		border-bottom: 1px solid var(--border-color, #4E525A);
		background: var(--bg-secondary, #3C3F46);
		flex-shrink: 0;
	}

	.track-labels {
		width: 120px;
		min-width: 120px;
		border-right: 1px solid var(--border-color, #4E525A);
		display: flex;
		align-items: center;
		padding: 0 12px;
	}

	.track-labels .label {
		font-size: 0.7rem;
		color: var(--text-muted, #808080);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.ruler-wrapper {
		flex: 1;
		overflow: hidden;
	}

	/* Tracks Container */
	.tracks-container {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.pipe-row {
		display: flex;
		border-bottom: 1px solid var(--border-color, #4E525A);
		min-height: 48px;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.pipe-row:hover {
		background: var(--bg-hover, #4E525A);
	}

	.pipe-row.active {
		background: rgba(89, 181, 255, 0.1);
	}

	.track-header {
		width: 120px;
		min-width: 120px;
		border-right: 1px solid var(--border-color, #4E525A);
		border-left: 3px solid transparent;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 8px 12px;
		gap: 2px;
	}

	.track-name {
		font-size: 0.85rem;
		color: var(--text-primary, #EEEEEE);
		font-weight: 500;
	}

	.track-count {
		font-size: 0.7rem;
		color: var(--text-muted, #808080);
	}

	.track-content {
		flex: 1;
		position: relative;
		height: 48px;
		background-image: 
			linear-gradient(90deg, var(--border-color, #4E525A) 1px, transparent 1px);
		background-size: 10% 100%;
		overflow: visible;
	}

	/* Keyframe Markers */
	.keyframe-marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		cursor: pointer;
		z-index: 10;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease;
	}

	.keyframe-marker:hover {
		transform: translate(-50%, -50%) scale(1.2);
	}

	.keyframe-marker.selected {
		transform: translate(-50%, -50%) scale(1.3);
		filter: brightness(1.3);
	}

	.diamond {
		width: 10px;
		height: 10px;
		background: currentColor;
		transform: rotate(45deg);
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
	}

	.add-kf-btn {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		color: var(--text-muted, #808080);
		width: 20px;
		height: 20px;
		border-radius: 50%;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.add-kf-btn:hover {
		background: var(--accent-primary, #59B5FF);
		color: white;
		border-color: var(--accent-primary, #59B5FF);
	}

	/* Keyframe Editor */
	.keyframe-editor {
		border-top: 1px solid var(--border-color, #4E525A);
		background: var(--bg-secondary, #3C3F46);
		padding: 12px 16px;
		flex-shrink: 0;
	}

	.editor-panel {
		background: var(--bg-tertiary, #4E525A);
		border-radius: 6px;
		padding: 12px;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.editor-title {
		font-size: 0.85rem;
		color: var(--text-primary, #EEEEEE);
		font-weight: 500;
	}

	.delete-btn {
		background: transparent;
		border: none;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 1.2rem;
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.delete-btn:hover {
		background: rgba(220, 38, 38, 0.15);
		color: #dc2626;
	}
</style>
