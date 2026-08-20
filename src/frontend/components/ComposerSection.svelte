<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import FrameRuler from './FrameRuler.svelte';
  
  // ── Types ───────────────────────────────────────────────────────────────────
  
  type PromptTag = 
    | 'segment'
    | 'movement'
    | 'rotation'
    | 'focal_point'
    | 'lighting'
    | 'exposure'
    | 'lens_effect'
    | 'global_style';

  interface KeyframeSlot {
    slot_index: number;
    source_type: string;
    source_value: string;
    description?: string;
    has_image: boolean;
  }

  interface PromptNode {
    id: string;
    pipe_id: string;
    parent_id?: string;
    tag: PromptTag;
    value: string;
    frame_start?: number;
    frame_end?: number;
    enabled: boolean;
  }

  interface PipeRow {
    id: string;
    name: string;
    order_index: number;
    num_inference_steps: number;
    cfg_scale: number;
    target_frames?: number;
    task_id?: string;
    status: 'idle' | 'generating' | 'completed' | 'error';
    keyframes: KeyframeSlot[];
    prompt_nodes: PromptNode[];
  }

  interface SessionSettings {
    resolution: '480p' | '720p' | '1080p';
    aspect_ratio: '16:9' | '9:16' | '1:1';
    total_frames: number;
    fps: number;
    max_frames: number;
  }

  interface ComposerData {
    id: string;
    session_id: string;
    name: string;
    state: string;
    version: number;
    pipes: PipeRow[];
    settings: SessionSettings;
  }

  // ── Props ───────────────────────────────────────────────────────────────────
  
  export let composerData: ComposerData | null = null;
  export let sessionId: string = '';
  
  // ── State ───────────────────────────────────────────────────────────────────
  
  let pipes: PipeRow[] = [];
  let settings: SessionSettings = {
    resolution: '720p',
    aspect_ratio: '16:9',
    total_frames: 121,
    fps: 8,
    max_frames: 241,
  };
  let isGenerating = false;
  let loading = false;
  let error: string | null = null;
  
  // Modal state
  let showKeyframeModal = false;
  let showAddElementModal = false;
  let activePipeId: string = '';
  let activeSlot: number = 1;
  let modalSourceUrl: string = '';
  let modalGenPrompt: string = '';
  let modalElementType: PromptTag = 'segment';
  let modalSegmentLabel: string = '';
  let modalValue: string = '';
  
  // ── Tag Configuration ───────────────────────────────────────────────────────
  
  const TAG_CONFIG: Record<PromptTag, { 
    label: string; 
    color: string; 
    bg: string;
    icon: string;
    description: string;
  }> = {
    segment:       { label: 'Segment',      color: '#ffc107', bg: '#fff3cd', icon: '◈', description: 'Time range slice' },
    movement:      { label: 'Movement',     color: '#17a2b8', bg: '#d1ecf1', icon: '▶', description: 'Camera tracking shift' },
    rotation:      { label: 'Rotation',     color: '#28a745', bg: '#d4edda', icon: '↺', description: 'Lens axis rotation' },
    focal_point:   { label: 'Focal Point',  color: '#dc3545', bg: '#f8d7da', icon: '◎', description: 'Coordinate anchor' },
    lighting:      { label: 'Lighting',     color: '#8b5cf6', bg: '#e2d9f3', icon: '☀', description: 'Illumination change' },
    exposure:      { label: 'Exposure',     color: '#fd7e14', bg: '#ffe5d9', icon: '◐', description: 'Luminance curve' },
    lens_effect:   { label: 'Lens Effect',  color: '#20c997', bg: '#d1f2eb', icon: '✦', description: 'Optical override' },
    global_style:  { label: 'Global Style', color: '#a855f7', bg: '#f5e6ff', icon: '★', description: 'Final style layer' },
  };

  // Group prompt nodes by type for rendering in rows
  function getNodesByType(nodes: PromptNode[]): Map<PromptTag, PromptNode[]> {
    const grouped = new Map<PromptTag, PromptNode[]>();
    for (const node of nodes) {
      if (!grouped.has(node.tag)) {
        grouped.set(node.tag, []);
      }
      grouped.get(node.tag)!.push(node);
    }
    return grouped;
  }

  // Order of tags for display
  const TAG_ORDER: PromptTag[] = ['segment', 'movement', 'rotation', 'focal_point', 'lighting', 'exposure', 'lens_effect', 'global_style'];

  // ── Actions ─────────────────────────────────────────────────────────────────
  
  async function loadComposer() {
    if (!sessionId) return;
    loading = true;
    error = null;
    try {
      const result = await invoke('get_composer', { sessionId });
      initFromData(result as ComposerData);
    } catch (e) {
      error = `Failed to load composer: ${e}`;
    } finally {
      loading = false;
    }
  }

  function initFromData(data: ComposerData) {
    pipes = data.pipes;
    settings = data.settings;
  }

  onMount(async () => {
    if (composerData) {
      initFromData(composerData);
    } else if (sessionId) {
      await loadComposer();
    }
  });

  async function addPipe() {
    try {
      const pipe = await invoke('add_pipe', {
        sessionId,
        composerId: composerData?.id || '',
      });
      pipes.push(pipe as PipeRow);
    } catch (e) {
      error = `Failed to add pipe: ${e}`;
    }
  }

  async function removePipe(pipeId: string) {
    try {
      await invoke('remove_pipe', { pipeId });
      pipes = pipes.filter(p => p.id !== pipeId);
    } catch (e) {
      error = `Failed to remove pipe: ${e}`;
    }
  }

  async function updatePipeConfig(pipeId: string, field: 'num_inference_steps' | 'cfg_scale', value: number) {
    try {
      await invoke('update_pipe_config', {
        pipeId,
        ...(field === 'num_inference_steps' ? { numInferenceSteps: value } : { cfgScale: value }),
      });
      const pipe = pipes.find(p => p.id === pipeId);
      if (pipe) {
        pipe[field] = value;
        pipes = [...pipes];
      }
    } catch (e) {
      error = `Failed to update config: ${e}`;
    }
  }

  function openKeyframeModal(pipeId: string, slot: number) {
    activePipeId = pipeId;
    activeSlot = slot;
    modalSourceUrl = '';
    modalGenPrompt = '';
    showKeyframeModal = true;
  }

  async function setKeyframe(sourceType: 'url' | 'generated' | 'local') {
    const sourceValue = sourceType === 'url' ? modalSourceUrl : modalGenPrompt;
    if (!sourceValue) {
      error = 'Please provide a source';
      return;
    }
    try {
      await invoke('set_keyframe', {
        pipeId: activePipeId,
        slotIndex: activeSlot,
        sourceType,
        sourceValue,
      });
      await loadComposer();
      showKeyframeModal = false;
    } catch (e) {
      error = `Failed to set keyframe: ${e}`;
    }
  }

  async function clearKeyframe(pipeId: string, slot: number) {
    try {
      await invoke('clear_keyframe', { pipeId, slotIndex: slot });
      await loadComposer();
    } catch (e) {
      error = `Failed to clear keyframe: ${e}`;
    }
  }

  function openAddElementModal(pipeId: string, tag?: PromptTag) {
    activePipeId = pipeId;
    modalElementType = tag || 'segment';
    modalValue = '';
    modalSegmentLabel = '';
    showAddElementModal = true;
  }

  async function addElement() {
    const value = modalElementType === 'segment' ? modalSegmentLabel : modalValue;
    if (!value) {
      error = 'Please provide a value';
      return;
    }
    try {
      await invoke('add_prompt_node', {
        pipeId: activePipeId,
        parentId: null,
        tag: modalElementType,
        value,
        frameStart: null,
        frameEnd: null,
      });
      await loadComposer();
      showAddElementModal = false;
    } catch (e) {
      error = `Failed to add element: ${e}`;
    }
  }

  async function addElementToSegment(segmentId: string, tag: PromptTag) {
    // Validate: can only add children of certain types under segments
    const allowedChildTags: PromptTag[] = ['movement', 'rotation', 'focal_point', 'lighting', 'exposure', 'lens_effect'];
    if (!allowedChildTags.includes(tag)) {
      error = `Cannot add ${tag} under segment. Allowed: ${allowedChildTags.join(', ')}`;
      return;
    }
    
    const value = modalValue;
    if (!value) {
      error = 'Please provide a value';
      return;
    }
    try {
      await invoke('add_prompt_node', {
        pipeId: activePipeId,
        parentId: segmentId,
        tag,
        value,
        frameStart: null,
        frameEnd: null,
      });
      await loadComposer();
      showAddElementModal = false;
    } catch (e) {
      error = `Failed to add element: ${e}`;
    }
  }

  async function generateAll() {
    if (!composerData || isGenerating) return;
    isGenerating = true;
    error = null;
    try {
      await invoke('generate_from_composer', {
        sessionId,
        composerId: composerData.id,
      });
      setTimeout(async () => {
        isGenerating = false;
        await loadComposer();
      }, 3000);
    } catch (e) {
      error = `Generation failed: ${e}`;
      isGenerating = false;
    }
  }

  async function updateResolution(resolution: '480p' | '720p' | '1080p') {
    try {
      const result = await invoke('update_session_settings', { sessionId, resolution });
      settings = { ...settings, ...result };
    } catch (e) {
      error = `Failed to update resolution: ${e}`;
    }
  }

  async function updateAspectRatio(ratio: '16:9' | '9:16' | '1:1') {
    try {
      const result = await invoke('update_session_settings', { sessionId, aspectRatio: ratio });
      settings = { ...settings, ...result };
    } catch (e) {
      error = `Failed to update aspect ratio: ${e}`;
    }
  }

  async function updateTotalFrames(frames: number) {
    if ((frames - 1) % 8 !== 0) {
      error = 'Frame count must satisfy 8n+1';
      return;
    }
    if (frames > settings.max_frames) {
      error = `Exceeds max frames (${settings.max_frames}) for ${settings.resolution}`;
      return;
    }
    try {
      await invoke('update_session_settings', { sessionId, totalFrames: frames });
      settings.total_frames = frames;
      error = null;
    } catch (e) {
      error = `Failed to update frames: ${e}`;
    }
  }

  async function removeNode(nodeId: string) {
    try {
      await invoke('remove_prompt_node', { nodeId });
      await loadComposer();
    } catch (e) {
      error = `Failed to remove node: ${e}`;
    }
  }

  function formatFrameCount(frames: number): string {
    const seconds = Math.round((frames / settings.fps) * 10) / 10;
    return `${frames}f (${seconds}s)`;
  }

  function getQualityLabel(steps: number): string {
    if (steps <= 10) return 'Fast';
    if (steps <= 20) return 'Balanced';
    return 'High Quality';
  }

  function getCreativityLabel(cfg: number): string {
    if (cfg <= 3) return 'Dreamy';
    if (cfg <= 7) return 'Creative';
    if (cfg <= 10) return 'Balanced';
    return 'Strict';
  }
</script>

<div class="composer-section">
  <!-- Header -->
  <div class="composer-header">
    <h2>🎬 Composer</h2>
    <div class="header-controls">
      <select bind:value={settings.resolution} on:change={(e) => updateResolution(e.target.value)}>
        {#each ['480p', '720p', '1080p'] as res}
          <option value={res}>{res}</option>
        {/each}
      </select>
      <select bind:value={settings.aspect_ratio} on:change={(e) => updateAspectRatio(e.target.value)}>
        {#each ['16:9', '9:16', '1:1'] as ratio}
          <option value={ratio}>{ratio}</option>
        {/each}
      </select>
      <button 
        class="generate-btn" 
        on:click={generateAll}
        disabled={isGenerating || pipes.length === 0}
      >
        {isGenerating ? '⏳ Generating...' : '▶ Generate All'}
      </button>
    </div>
  </div>
  
  <!-- Error display -->
  {#if error}
    <div class="error-banner">{error}</div>
  {/if}
  
  <!-- Settings bar -->
  <div class="settings-bar">
    <label>
      Frames:
      <input 
        type="number" 
        value={settings.total_frames}
        on:input={(e) => updateTotalFrames(parseInt(e.target.value))}
        min="1" 
        max={settings.max_frames}
        step="8"
      />
      <span class="frame-hint">(max {settings.max_frames}, formula: 8n+1)</span>
    </label>
    <span class="resolution-info">{settings.resolution} · {settings.aspect_ratio} · {settings.fps}fps</span>
  </div>
  
  <!-- Pipes Container -->
  <div class="pipes-container">
    {#each pipes as pipe (pipe.id)}
      <div class="pipe-row {pipe.status}">
        <!-- Pipe Header: Keyframes + Sliders -->
        <div class="pipe-header">
          <!-- Keyframes -->
          <div class="keyframes-row">
            {#each [1, 2, 3] as slot}
              <div class="keyframe-slot {slot}">
                {#if pipe.keyframes[slot - 1]?.has_image}
                  <div class="keyframe-preview">
                    <img src={pipe.keyframes[slot - 1].source_value} alt="K{slot}" />
                    <button class="clear-kf" on:click={() => clearKeyframe(pipe.id, slot)}>×</button>
                  </div>
                {:else}
                  <div 
                    class="keyframe-placeholder"
                    on:click={() => openKeyframeModal(pipe.id, slot)}
                  >
                    <span class="plus-icon">+</span>
                    <span class="slot-label">K{slot}</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          
          <!-- Quality & Creativity Sliders -->
          <div class="sliders-group">
            <div class="slider-item">
              <span class="slider-name">Q</span>
              <span class="slider-value">{pipe.num_inference_steps}</span>
              <span class="slider-desc">{getQualityLabel(pipe.num_inference_steps)}</span>
              <input 
                type="range" 
                min="5" 
                max="30" 
                step="1"
                bind:value={pipe.num_inference_steps}
                on:input={(e) => updatePipeConfig(pipe.id, 'num_inference_steps', parseInt(e.target.value))}
                class="range-slider"
              />
            </div>
            <div class="slider-item">
              <span class="slider-name">C</span>
              <span class="slider-value">{pipe.cfg_scale.toFixed(1)}</span>
              <span class="slider-desc">{getCreativityLabel(pipe.cfg_scale)}</span>
              <input 
                type="range" 
                min="0.5" 
                max="15" 
                step="0.5"
                bind:value={pipe.cfg_scale}
                on:input={(e) => updatePipeConfig(pipe.id, 'cfg_scale', parseFloat(e.target.value))}
                class="range-slider"
              />
            </div>
          </div>
          
          <!-- Status & Remove -->
          <div class="pipe-meta">
            <span class="pipe-status">{pipe.status}</span>
            {#if pipe.task_id}
              <span class="task-id">Task: {pipe.task_id.slice(0, 8)}...</span>
            {/if}
            <button class="remove-btn" on:click={() => removePipe(pipe.id)}>×</button>
          </div>
        </div>
        
        <!-- Frame Ruler -->
        <FrameRuler 
          totalFrames={pipe.target_frames || settings.total_frames}
          maxFrames={settings.max_frames}
        />
        
        <!-- Prompt Tree - One-Type-Per-Row Visualization -->
        <div class="prompt-tree">
          {#each TAG_ORDER as tagType}
            {#let nodesOfType = pipe.prompt_nodes.filter(n => n.tag === tagType)}
              {#if nodesOfType.length > 0}
                <div class="prompt-row {tagType}">
                  <div class="row-header">
                    <span class="row-tag-badge">
                      {TAG_CONFIG[tagType].icon} {TAG_CONFIG[tagType].label}
                    </span>
                    <button 
                      class="add-node-btn" 
                      on:click={() => {
                        // Check if we should show modal for adding to this type
                        openAddElementModal(pipe.id, tagType);
                      }}
                      title="Add new {tagType.replace('_', ' ')}"
                    >+</button>
                  </div>
                  <div class="row-nodes">
                    {#each nodesOfType as node (node.id)}
                      <div class="node-chip {node.enabled ? 'enabled' : 'disabled'}" on:dblclick={() => openAddElementModal(pipe.id, tagType)}>
                        <span class="chip-icon">{TAG_CONFIG[tagType].icon}</span>
                        <span class="chip-value">{node.value || 'untitled'}</span>
                        <button class="chip-remove" on:click={() => removeNode(node.id)}>×</button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/let}
          {/each}
        </div>
        
        <!-- Add Element Button -->
        <button class="add-element-btn" on:click={() => openAddElementModal(pipe.id)}>
          + Add Element
        </button>
      </div>
    {/each}
    
    <!-- Empty State -->
    {#if pipes.length === 0}
      <div class="empty-state">
        <p>No pipes configured yet</p>
        <p class="hint">Start by adding your first pipe and keyframes</p>
        <button class="action-btn" on:click={addPipe}>+ Add First Pipe</button>
      </div>
    {/if}
    
    <!-- Add Pipe Button -->
    <button class="add-pipe-btn" on:click={addPipe}>+ Add Pipe</button>
  </div>
  
  <!-- Keyframe Modal -->
  {#if showKeyframeModal}
    <div class="modal-overlay" on:click={(e) => { if (e.target === e.currentTarget) showKeyframeModal = false; }}>
      <div class="modal-content">
        <h3>Add Keyframe K{activeSlot}</h3>
        
        <div class="modal-section">
          <label>Image URL:</label>
          <input 
            type="text" 
            bind:value={modalSourceUrl}
            placeholder="https://example.com/image.jpg"
          />
          <button on:click={() => setKeyframe('url')}>Use URL</button>
        </div>
        
        <div class="modal-section">
          <label>Prompt for AI Generation:</label>
          <textarea 
            bind:value={modalGenPrompt}
            placeholder="Describe the image you want to generate..."
          ></textarea>
          <button on:click={() => setKeyframe('generated')}>Generate</button>
        </div>
        
        <div class="modal-section">
          <label>Or upload local file:</label>
          <input type="file" accept="image/*" />
        </div>
        
        <button class="close-btn" on:click={() => showKeyframeModal = false}>Cancel</button>
      </div>
    </div>
  {/if}
  
  <!-- Add Element Modal -->
  {#if showAddElementModal}
    <div class="modal-overlay" on:click={(e) => { if (e.target === e.currentTarget) showAddElementModal = false; }}>
      <div class="modal-content">
        <h3>Add New Element</h3>
        
        <div class="modal-section">
          <label>Type:</label>
          <select bind:value={modalElementType}>
            {#each TAG_ORDER as tag}
              <option value={tag}>{TAG_CONFIG[tag as PromptTag].icon} {TAG_CONFIG[tag as PromptTag].label}</option>
            {/each}
          </select>
          <p class="type-description">{TAG_CONFIG[modalElementType as PromptTag]?.description}</p>
        </div>
        
        <div class="modal-section">
          <label>Value:</label>
          {#if modalElementType === 'segment'}
            <input 
              type="text" 
              bind:value={modalSegmentLabel}
              placeholder="e.g., Opening Shot, Close-up, Ending"
            />
          {:else}
            <textarea 
              bind:value={modalValue}
              placeholder={`Describe the ${TAG_CONFIG[modalElementType as PromptTag]?.label.toLowerCase()}...`}
            ></textarea>
          {/if}
        </div>
        
        <button class="action-btn" on:click={addElement}>Add</button>
        <button class="close-btn" on:click={() => showAddElementModal = false}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .composer-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px;
    overflow-y: auto;
    background: #1a1a2e;
    color: #fff;
  }
  
  /* Header */
  .composer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  
  .composer-header h2 {
    margin: 0;
    color: #fff;
    font-size: 20px;
  }
  
  .header-controls {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  
  select {
    background: #2a2a3a;
    color: #fff;
    border: 1px solid #3a3a4a;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
  }
  
  .generate-btn {
    padding: 8px 20px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.2s;
  }
  
  .generate-btn:hover:not(:disabled) {
    background: #3a8eef;
  }
  
  .generate-btn:disabled {
    background: #2a2a3a;
    color: #888;
    cursor: not-allowed;
  }
  
  /* Error banner */
  .error-banner {
    background: #ef444420;
    color: #ef4444;
    padding: 10px 16px;
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 13px;
  }
  
  /* Settings bar */
  .settings-bar {
    display: flex;
    gap: 24px;
    padding: 12px 16px;
    background: #1e1e2e;
    border-radius: 8px;
    margin-bottom: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  
  .settings-bar label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ccc;
    font-size: 13px;
  }
  
  .settings-bar input[type="number"] {
    width: 70px;
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
  }
  
  .frame-hint {
    color: #888;
    font-size: 11px;
  }
  
  .resolution-info {
    color: #888;
    font-size: 12px;
    margin-left: auto;
  }
  
  /* Pipes container */
  .pipes-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  /* Pipe row */
  .pipe-row {
    background: #1e1e2e;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    padding: 16px;
    position: relative;
  }
  
  .pipe-row.generating {
    border-color: #4a9eff;
    box-shadow: 0 0 10px rgba(74, 158, 255, 0.2);
  }
  
  .pipe-row.completed {
    border-color: #4ade80;
  }
  
  .pipe-row.error {
    border-color: #ef4444;
  }
  
  /* Pipe header */
  .pipe-header {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 12px;
  }
  
  /* Keyframes */
  .keyframes-row {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  
  .keyframe-slot {
    width: 80px;
  }
  
  .keyframe-preview {
    position: relative;
    aspect-ratio: 16/9;
    background: #2a2a3a;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #3a3a4a;
  }
  
  .keyframe-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .clear-kf {
    position: absolute;
    top: 2px;
    right: 2px;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    color: #fff;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }
  
  .clear-kf:hover {
    background: #ef4444;
  }
  
  .keyframe-placeholder {
    aspect-ratio: 16/9;
    background: #2a2a3a;
    border: 2px dashed #3a3a4a;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .keyframe-placeholder:hover {
    border-color: #4a9eff;
    background: #2a2a3a80;
  }
  
  .plus-icon {
    font-size: 20px;
    color: #4a9eff;
  }
  
  .slot-label {
    font-size: 10px;
    color: #888;
    margin-top: 2px;
  }
  
  /* Sliders */
  .sliders-group {
    display: flex;
    gap: 20px;
    flex: 1;
    align-items: center;
  }
  
  .slider-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
  }
  
  .slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-size: 11px;
  }
  
  .slider-name {
    font-weight: 600;
    color: #4a9eff;
    font-size: 14px;
  }
  
  .slider-value {
    color: #fff;
    font-family: monospace;
    font-size: 12px;
  }
  
  .slider-desc {
    color: #888;
    font-size: 10px;
  }
  
  .range-slider {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: #2a2a3a;
    outline: none;
    -webkit-appearance: none;
  }
  
  .range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #4a9eff;
    cursor: pointer;
  }
  
  .range-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #4a9eff;
    cursor: pointer;
    border: none;
  }
  
  /* Pipe meta */
  .pipe-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  
  .pipe-status {
    font-size: 12px;
    padding: 4px 8px;
    background: #2a2a3a;
    border-radius: 4px;
    color: #888;
    text-transform: capitalize;
  }
  
  .pipe-row.generating .pipe-status {
    background: #4a9eff20;
    color: #4a9eff;
  }
  
  .pipe-row.completed .pipe-status {
    background: #4ade8020;
    color: #4ade80;
  }
  
  .pipe-row.error .pipe-status {
    background: #ef444420;
    color: #ef4444;
  }
  
  .task-id {
    font-size: 11px;
    color: #666;
  }
  
  .remove-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 18px;
    padding: 4px 8px;
    transition: color 0.2s;
  }
  
  .remove-btn:hover {
    color: #ef4444;
  }
  
  /* Prompt Tree - One-Type-Per-Row */
  .prompt-tree {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #2a2a3a;
  }
  
  .prompt-row {
    margin-bottom: 8px;
    padding: 8px 12px;
    background: #2a2a3a30;
    border-radius: 6px;
    border-left: 3px solid transparent;
  }
  
  .prompt-row.segment      { border-left-color: #ffc107; }
  .prompt-row.movement     { border-left-color: #17a2b8; }
  .prompt-row.rotation     { border-left-color: #28a745; }
  .prompt-row.focal_point  { border-left-color: #dc3545; }
  .prompt-row.lighting     { border-left-color: #8b5cf6; }
  .prompt-row.exposure     { border-left-color: #fd7e14; }
  .prompt-row.lens_effect  { border-left-color: #20c997; }
  .prompt-row.global_style { border-left-color: #a855f7; }
  
  .row-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  
  .row-tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .prompt-row.segment .row-tag-badge      { background: #fff3cd; color: #856404; }
  .prompt-row.movement .row-tag-badge     { background: #d1ecf1; color: #0c5460; }
  .prompt-row.rotation .row-tag-badge     { background: #d4edda; color: #155724; }
  .prompt-row.focal_point .row-tag-badge  { background: #f8d7da; color: #721c24; }
  .prompt-row.lighting .row-tag-badge     { background: #e2d9f3; color: #5a1dcb; }
  .prompt-row.exposure .row-tag-badge     { background: #ffe5d9; color: #b34700; }
  .prompt-row.lens_effect .row-tag-badge  { background: #d1f2eb; color: #0f644d; }
  .prompt-row.global_style .row-tag-badge { background: #f5e6ff; color: #6b21a8; }
  
  .add-node-btn {
    background: none;
    border: 1px dashed #4a9eff40;
    color: #4a9eff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    transition: all 0.2s;
  }
  
  .add-node-btn:hover {
    background: #4a9eff20;
    border-color: #4a9eff;
  }
  
  .row-nodes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  
  .node-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    border: 1px solid;
    transition: all 0.2s;
    cursor: default;
  }
  
  .node-chip.enabled {
    opacity: 1;
  }
  
  .node-chip.disabled {
    opacity: 0.5;
  }
  
  .prompt-row.segment .node-chip      { background: #fff3cd; border-color: #ffc107; color: #856404; }
  .prompt-row.movement .node-chip     { background: #d1ecf1; border-color: #17a2b8; color: #0c5460; }
  .prompt-row.rotation .node-chip     { background: #d4edda; border-color: #28a745; color: #155724; }
  .prompt-row.focal_point .node-chip  { background: #f8d7da; border-color: #dc3545; color: #721c24; }
  .prompt-row.lighting .node-chip     { background: #e2d9f3; border-color: #8b5cf6; color: #5a1dcb; }
  .prompt-row.exposure .node-chip     { background: #ffe5d9; border-color: #fd7e14; color: #b34700; }
  .prompt-row.lens_effect .node-chip  { background: #d1f2eb; border-color: #20c997; color: #0f644d; }
  .prompt-row.global_style .node-chip { background: #f5e6ff; border-color: #a855f7; color: #6b21a8; }
  
  .chip-icon {
    font-size: 10px;
  }
  
  .chip-value {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .chip-remove {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.2s;
    padding: 0 2px;
  }
  
  .chip-remove:hover {
    opacity: 1;
  }
  
  .add-element-btn {
    width: 100%;
    padding: 10px;
    margin-top: 8px;
    background: transparent;
    border: 1px dashed #3a3a4a;
    border-radius: 6px;
    color: #888;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }
  
  .add-element-btn:hover {
    border-color: #4a9eff;
    color: #4a9eff;
    background: #4a9eff10;
  }
  
  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #888;
  }
  
  .empty-state p {
    margin: 0 0 8px;
  }
  
  .empty-state .hint {
    font-size: 13px;
    color: #666;
    margin-bottom: 20px;
  }
  
  /* Add pipe button */
  .add-pipe-btn {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: 2px dashed #3a3a4a;
    border-radius: 8px;
    color: #888;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }
  
  .add-pipe-btn:hover {
    border-color: #4a9eff;
    color: #4a9eff;
    background: #4a9eff10;
  }
  
  /* Modals */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal-content {
    background: #1e1e2e;
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }
  
  .modal-content h3 {
    margin: 0 0 20px;
    color: #fff;
  }
  
  .modal-section {
    margin-bottom: 16px;
  }
  
  .modal-section label {
    display: block;
    color: #ccc;
    font-size: 13px;
    margin-bottom: 8px;
  }
  
  .modal-section input[type="text"],
  .modal-section textarea,
  .modal-section select {
    width: 100%;
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    color: #fff;
    padding: 10px;
    border-radius: 6px;
    font-size: 13px;
    box-sizing: border-box;
  }
  
  .modal-section textarea {
    min-height: 100px;
    resize: vertical;
  }
  
  .type-description {
    font-size: 11px;
    color: #888;
    margin-top: 4px;
  }
  
  .modal-section button {
    margin-top: 8px;
    padding: 8px 16px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  
  .modal-section button:hover {
    background: #3a8eef;
  }
  
  .action-btn {
    padding: 10px 20px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    margin-right: 8px;
  }
  
  .action-btn:hover {
    background: #3a8eef;
  }
  
  .close-btn {
    width: 100%;
    padding: 10px;
    background: #2a2a3a;
    border: none;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
    margin-top: 16px;
  }
  
  .close-btn:hover {
    background: #3a3a4a;
  }
</style>
