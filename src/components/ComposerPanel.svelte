<script lang="ts">
	import type { SessionData, PipeRow, PromptSegment, TagType } from '$types';
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

	// Helper to safely access pipes
	$: pipes = session?.pipes ?? [];
	
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
				if (baseFrame >= pipe.lengthFrames) {
					baseFrame = snapTo8nPlus1(pipe.lengthFrames - 60);
				}
			}

			const newKeyframe = {
				id: crypto.randomUUID(),
				frame: baseFrame,
				type: addMode,
				imageSrc: addMode === 'url' ? modalUrl || undefined : undefined,
				prompt: addMode === 'txt2img' ? modalPrompt : undefined,
				referenceUrl: addMode === 'img2img' ? modalImg2Img || undefined : undefined,
				status: 'done' as const,
			};

			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== activePipeIndex) return p;
				return { ...p, keyframes: [...p.keyframes, newKeyframe] };
			});

			onUpdate({ ...session, pipes: updatedPipes });
			closeModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add keyframe:', e);
		}
	}

	function deleteKeyframe(pipeIndex: number, kfId: string) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe) return;
			
			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== pipeIndex) return p;
				return { ...p, keyframes: p.keyframes.filter(k => k.id !== kfId) };
			});
			
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to delete keyframe:', e);
		}
	}

	function updateQ(pipeIndex: number, val: number) {
		try {
			const updatedPipes = pipes.map((p, idx) => 
				idx === pipeIndex ? { ...p, qValue: val } : p
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update Q:', e);
		}
	}

	function updateC(pipeIndex: number, val: number) {
		try {
			const updatedPipes = pipes.map((p, idx) => 
				idx === pipeIndex ? { ...p, cValue: val } : p
			);
			onUpdate({ ...session, pipes: updatedPipes });
		} catch (e) {
			console.error('[ComposerPanel] Failed to update C:', e);
		}
	}

	function openSegmentModal(pipeIndex: number, segment: PromptSegment) {
		try {
			activeSegmentId = segment.id;
			activeSegmentPipeIndex = pipeIndex;
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

			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== activeSegmentPipeIndex) return p;
				return {
					...p,
					segments: p.segments.map(s => {
						if (s.id !== activeSegmentId) return s;
						return {
							...s,
							value: spec.usePrompt ? s.value : segmentValue,
							prompt: spec.usePrompt ? segmentPrompt : undefined,
						};
					}),
				};
			});

			onUpdate({ ...session, pipes: updatedPipes });
			closeSegmentModal();
		} catch (e) {
			console.error('[ComposerPanel] Failed to update segment:', e);
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

	function addSegmentWithType(tag: TagType) {
		if (activePipeForType === null) return;
		
		try {
			const pipe = pipes[activePipeForType];
			if (!pipe) return;

			const maxFrame = pipe.segments.length > 0
				? Math.max(...pipe.segments.map(s => s.frameEnd))
				: 0;
			const frameStart = maxFrame;
			const frameEnd = Math.min(maxFrame + 60, pipe.lengthFrames);

			const spec = TAG_SPECIFICATIONS[tag];
			let value = 0;
			if (spec.min !== undefined && spec.max !== undefined) {
				value = Math.floor((spec.min + spec.max) / 2);
			}

			const newSegment: PromptSegment = {
				id: crypto.randomUUID(),
				frameStart,
				frameEnd,
				tag,
				value,
				spec,
			};

			const testSegments = [...pipe.segments, newSegment];
			const validation = validatePromptSegments(testSegments);

			if (validation.valid) {
				const updatedPipes = pipes.map((p, idx) => {
					if (idx !== activePipeForType) return p;
					return { ...p, segments: testSegments };
				});
				onUpdate({ ...session, pipes: updatedPipes });
			}

			closeTypePicker();
		} catch (e) {
			console.error('[ComposerPanel] Failed to add segment:', e);
		}
	}

	function removeParam(pipeIndex: number, segmentId: string) {
		try {
			const pipe = pipes[pipeIndex];
			if (!pipe || pipe.segments.length <= 1) return;

			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== pipeIndex) return p;
				return { ...p, segments: p.segments.filter(s => s.id !== segmentId) };
			});
			
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
					segments: p.segments.map(s => 
						s.id === segmentId ? { ...s, value } : s
					),
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

			const newStart = snapTo8nPlus1(segment.frameStart + delta);
			const newEnd = snapTo8nPlus1(segment.frameEnd + delta);

			if (newStart < 0 || newEnd > pipe.lengthFrames) return;

			const testSegments = pipe.segments.map(s => 
				s.id === segmentId ? { ...s, frameStart: newStart, frameEnd: newEnd } : s
			);
			const validation = validatePromptSegments(testSegments);

			if (validation.valid) {
				const updatedPipes = pipes.map((p, idx) => {
					if (idx !== pipeIndex) return p;
					return { ...p, segments: testSegments };
				});
				onUpdate({ ...session, pipes: updatedPipes });
			}
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
			const updatedPipes = pipes.map((p, idx) => {
				if (idx !== activeGlobalPipeIndex) return p;
				return {
					...p,
					globalPrompt: { text: globalPromptText },
				};
			});

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

	function updateResolution(resolution: typeof session?.resolution) {
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
      <select class="fps-select" value={session.fps} onchange={(e) => updateFPS(Number(e.currentTarget.value))}>
        {#each FPS_PRESETS as fps}
          <option value={fps}>{fps} fps</option>
        {/each}
      </select>
      <select class="resolution-select" value={session.resolution} onchange={(e) => updateResolution(e.currentTarget.value)}>
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
        </div>

        <!-- Row 1: Keyframes + Q/C -->
        <div class="kf-row">
          {#each pipe.keyframes as kf, kfIdx (kf.id)}
            <div 
              class="kf-box {kf.imageSrc ? 'has-image' : ''}"
              style="position: absolute; left: {kf.frame / pipe.lengthFrames * 100}%}"
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
            <div class="add-kf-btn" onclick={() => openAddModal(pipeIdx, pipe.keyframes.length)} role="button" tabindex="0">+</div>
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
            max={getMaxFramesForResolution(session.resolution)}
            step="9"
            onchange={(e) => updatePipeLength(pipeIdx, Number(e.currentTarget.value))}
          />
          <span class="length-unit">frames</span>
        </div>

        <!-- Global Prompt Bar -->
        <div class="global-prompt-bar" onclick={() => openGlobalPromptModal(pipeIdx)} role="button" tabindex="0">
          <span class="global-label">GLOBAL</span>
          {#if pipe.globalPrompt?.text}
            <span class="global-preview">"{pipe.globalPrompt.text.substring(0, 30)}{pipe.globalPrompt.text.length > 30 ? '...' : ''}"</span>
          {:else}
            <span class="global-placeholder">Click to add global prompt</span>
          {/if}
          <span class="global-action">✏️</span>
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

        <!-- Add Segment Button -->
        <div class="add-param-row" onclick={() => openTypePicker(pipeIdx)} role="button" tabindex="0">
          <span>+</span>
          <span>Add Segment</span>
        </div>
      </div>
    {/each}
  </div>

  <!-- Modals... -->
  <!-- (Modal code omitted for brevity - same structure with safe pipes access) -->
</div>
{/if}

<style>
  /* Styles from previous version */
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

  /* ... rest of styles ... */
</style>
