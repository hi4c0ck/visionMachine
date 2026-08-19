<script lang="ts">
  // Composer Section - Filmstrip layout with frame-based controls
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  // Frame/Preview items (1-3 visible at a time)
  let frames = $state([
    { id: 1, name: 'Frame 1', image: null, active: true },
    { id: 2, name: 'Frame 2', image: null, active: false },
    { id: 3, name: 'Frame 3', image: null, active: false },
    { id: 4, name: 'Frame 4', image: null, active: false },
    { id: 5, name: 'Frame 5', image: null, active: false },
  ]);
  
  let currentFrameIndex = $state(0);
  let totalFrames = $state(5);
  
  // Slider groups (sectionable)
  let activeSliderSection = $state('transform');
  
  const sliderSections = [
    { id: 'transform', label: 'Transform', icon: '↔' },
    { id: 'appearance', label: 'Appearance', icon: '◐' },
    { id: 'effect', label: 'Effect', icon: '✨' },
    { id: 'timing', label: 'Timing', icon: '⏱' },
  ];
  
  // Current frame's parameters
  let currentFrame = $derived(frames[currentFrameIndex] ?? frames[0]);
  
  // Parameter values for current frame
  let positionX = $state(0);
  let positionY = $state(0);
  let scale = $state(1.0);
  let rotation = $state(0);
  let opacity = $state(100);
  let blur = $state(0);
  let brightness = $state(0);
  let contrast = $state(0);
  let saturation = $state(0);
  let hue = $state(0);
  
  function selectFrame(index: number) {
    currentFrameIndex = index;
    frames = frames.map((f, i) => ({ ...f, active: i === index }));
  }
  
  function addFrame() {
    const newId = frames.length + 1;
    frames = [...frames, { id: newId, name: `Frame ${newId}`, image: null, active: false }];
    selectFrame(frames.length - 1);
  }
  
  function removeFrame(index: number) {
    if (frames.length <= 1) return;
    frames = frames.filter((_, i) => i !== index);
    if (currentFrameIndex >= frames.length) {
      currentFrameIndex = frames.length - 1;
    }
    selectFrame(currentFrameIndex);
  }
  
  function setActiveFrame(index: number) {
    selectFrame(index);
  }
  
  function updateParameter(name: string, value: number) {
    switch(name) {
      case 'positionX': positionX = value; break;
      case 'positionY': positionY = value; break;
      case 'scale': scale = value; break;
      case 'rotation': rotation = value; break;
      case 'opacity': opacity = value; break;
      case 'blur': blur = value; break;
      case 'brightness': brightness = value; break;
      case 'contrast': contrast = value; break;
      case 'saturation': saturation = value; break;
      case 'hue': hue = value; break;
    }
  }
</script>

<div class="composer-section">
  <!-- Header -->
  <div class="composer-header">
    <div class="header-tabs">
      <button 
        class="tab" 
        class:active={activeSliderSection === 'transform'}
        onclick={() => activeSliderSection = 'transform'}
      >
        <span>↔</span> Transform
      </button>
      <button 
        class="tab" 
        class:active={activeSliderSection === 'appearance'}
        onclick={() => activeSliderSection = 'appearance'}
      >
        <span>◐</span> Appearance
      </button>
      <button 
        class="tab" 
        class:active={activeSliderSection === 'effect'}
        onclick={() => activeSliderSection = 'effect'}
      >
        <span>✨</span> Effect
      </button>
      <button 
        class="tab" 
        class:active={activeSliderSection === 'timing'}
        onclick={() => activeSliderSection = 'timing'}
      >
        <span>⏱</span> Timing
      </button>
    </div>
    
    <div class="header-actions">
      <button class="btn btn-secondary" onclick={() => dispatch('undo')}>↩ Undo</button>
      <button class="btn btn-secondary" onclick={() => dispatch('redo')}>↪ Redo</button>
      <button class="btn btn-primary" onclick={addFrame}>＋ Add Frame</button>
    </div>
  </div>
  
  <!-- Main Preview Area -->
  <div class="preview-area">
    <div class="preview-canvas">
      <div class="canvas-content">
        {currentFrame?.image ? (
          <img src={currentFrame.image} class="preview-image" />
        ) : (
          <div class="preview-placeholder">
            <span>🖼</span>
            <span>{currentFrame?.name ?? 'No Frame'}</span>
          </div>
        )}
        
        <!-- Frame indicators overlay -->
        <div class="frame-indicators">
          <span class="frame-badge">Frame {currentFrameIndex + 1} / {frames.length}</span>
        </div>
      </div>
    </div>
    
    <!-- Filmstrip Row -->
    <div class="filmstrip-container">
      <div class="filmstrip">
        {#each frames as frame, index (frame.id)}
          <div 
            class="filmstrip-item"
            class:selected={currentFrameIndex === index}
            onclick={() => selectFrame(index)}
          >
            <!-- Thumbnail -->
            <div class="thumb">
              {frame.image ? (
                <img src={frame.image} />
              ) : (
                <div class="thumb-placeholder">{index + 1}</div>
              )}
            </div>
            
            <!-- Frame Label -->
            <div class="frame-label">F{index + 1}</div>
            
            <!-- Action Buttons -->
            <div class="frame-actions" onclick={(e) => e.stopPropagation()}>
              <!-- X button - Remove/Don't use -->
              <button 
                class="action-btn remove" 
                title="Remove frame (don't use)"
                onclick={() => removeFrame(index)}
              >
                ✕
              </button>
              
              <!-- + button - Set/Activate -->
              <button 
                class="action-btn add" 
                title="Add after this frame"
                onclick={() => insertFrameAfter(index)}
              >
                ＋
              </button>
            </div>
          </div>
        {/each}
        
        <!-- Add more frames button -->
        <button class="add-frame-btn" onclick={addFrame}>
          <span class="add-icon">＋</span>
          <span>Add</span>
        </button>
      </div>
    </div>
  </div>
  
  <!-- Sliders Panel -->
  <div class="sliders-panel">
    <!-- Master Slider (Full Width with Frame Selector) -->
    <div class="master-slider-section">
      <div class="section-header">
        <span class="section-title">Master Control</span>
        <span class="section-hint">Frame {currentFrameIndex + 1}</span>
      </div>
      
      <div class="master-slider-row">
        <!-- Frame Number Selector -->
        <div class="frame-selector">
          <button class="frame-nav-btn" onclick={() => previousFrame()} disabled={currentFrameIndex === 0}>‹</button>
          <input 
            type="number" 
            class="frame-number-input"
            value={currentFrameIndex + 1}
            min="1"
            max={frames.length}
            onchange={(e) => {
              const val = parseInt(e.currentTarget.value);
              if (val >= 1 && val <= frames.length) {
                selectFrame(val - 1);
              }
            }}
          />
          <button class="frame-nav-btn" onclick={() => nextFrame()} disabled={currentFrameIndex === frames.length - 1}>›</button>
          <span class="frame-total">/ {frames.length}</span>
        </div>
        
        <!-- Main Value Display -->
        <div class="main-value-display">
          <span class="value-label">Scale</span>
          <span class="value-number">{scale.toFixed(2)}</span>
        </div>
        
        <!-- Master Slider -->
        <div class="master-slider-container">
          <input 
            type="range" 
            class="master-slider"
            min="0.1" 
            max="3" 
            step="0.01"
            value={scale}
            oninput={(e) => updateParameter('scale', parseFloat(e.currentTarget.value))}
          />
        </div>
        
        <!-- Quick Actions -->
        <div class="quick-actions">
          <button class="quick-btn" title="Reset" onclick={() => scale = 1.0}>↺</button>
          <button class="quick-btn" title="Copy from previous" onclick={() => copyFromPrevious()}>📋</button>
          <button class="quick-btn" title="Paste" onclick={() => pasteValue()}>📌</button>
        </div>
      </div>
    </div>
    
    <!-- Sectioned Sliders -->
    <div class="sliders-grid">
      <!-- Transform Section -->
      {#if activeSliderSection === 'transform'}
        <div class="slider-group transform-group">
          <div class="group-header">
            <span class="group-title">Transform</span>
            <button class="collapse-btn" title="Collapse">−</button>
          </div>
          
          <div class="slider-row">
            <div class="slider-item">
              <label class="slider-label">Position X</label>
              <div class="slider-control">
                <input type="range" min="-500" max="500" value={positionX} oninput={(e) => updateParameter('positionX', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={positionX} onchange={(e) => updateParameter('positionX', parseInt(e.currentTarget.value))} />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Position Y</label>
              <div class="slider-control">
                <input type="range" min="-500" max="500" value={positionY} oninput={(e) => updateParameter('positionY', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={positionY} onchange={(e) => updateParameter('positionY', parseInt(e.currentTarget.value))} />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Rotation</label>
              <div class="slider-control">
                <input type="range" min="-180" max="180" value={rotation} oninput={(e) => updateParameter('rotation', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={rotation} onchange={(e) => updateParameter('rotation', parseInt(e.currentTarget.value))} />
              </div>
            </div>
          </div>
        </div>
      {/if}
      
      <!-- Appearance Section -->
      {#if activeSliderSection === 'appearance'}
        <div class="slider-group appearance-group">
          <div class="group-header">
            <span class="group-title">Appearance</span>
            <button class="collapse-btn" title="Collapse">−</button>
          </div>
          
          <div class="slider-row">
            <div class="slider-item">
              <label class="slider-label">Opacity</label>
              <div class="slider-control">
                <input type="range" min="0" max="100" value={opacity} oninput={(e) => updateParameter('opacity', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={opacity} onchange={(e) => updateParameter('opacity', parseInt(e.currentTarget.value))} />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Brightness</label>
              <div class="slider-control">
                <input type="range" min="-100" max="100" value={brightness} oninput={(e) => updateParameter('brightness', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={brightness} onchange={(e) => updateParameter('brightness', parseInt(e.currentTarget.value))} />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Contrast</label>
              <div class="slider-control">
                <input type="range" min="-100" max="100" value={contrast} oninput={(e) => updateParameter('contrast', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={contrast} onchange={(e) => updateParameter('contrast', parseInt(e.currentTarget.value))} />
              </div>
            </div>
          </div>
          
          <div class="slider-row">
            <div class="slider-item">
              <label class="slider-label">Saturation</label>
              <div class="slider-control">
                <input type="range" min="-100" max="100" value={saturation} oninput={(e) => updateParameter('saturation', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={saturation} onchange={(e) => updateParameter('saturation', parseInt(e.currentTarget.value))} />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Hue</label>
              <div class="slider-control">
                <input type="range" min="0" max="360" value={hue} oninput={(e) => updateParameter('hue', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={hue} onchange={(e) => updateParameter('hue', parseInt(e.currentTarget.value))} />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Blur</label>
              <div class="slider-control">
                <input type="range" min="0" max="50" value={blur} oninput={(e) => updateParameter('blur', parseInt(e.currentTarget.value))} />
                <input type="number" class="number-input" value={blur} onchange={(e) => updateParameter('blur', parseInt(e.currentTarget.value))} />
              </div>
            </div>
          </div>
        </div>
      {/if}
      
      <!-- Effect Section -->
      {#if activeSliderSection === 'effect'}
        <div class="slider-group effect-group">
          <div class="group-header">
            <span class="group-title">Effects</span>
            <button class="collapse-btn" title="Collapse">−</button>
          </div>
          
          <div class="slider-row">
            <div class="slider-item full-width">
              <label class="slider-label">Blend Mode</label>
              <select class="select-input">
                <option>Normal</option>
                <option>Multiply</option>
                <option>Screen</option>
                <option>Overlay</option>
                <option>Darken</option>
                <option>Lighten</option>
              </select>
            </div>
          </div>
          
          <div class="slider-row">
            <div class="slider-item">
              <label class="slider-label">Intensity</label>
              <div class="slider-control">
                <input type="range" min="0" max="100" value="75" />
                <input type="number" class="number-input" value="75" />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Feather</label>
              <div class="slider-control">
                <input type="range" min="0" max="100" value="0" />
                <input type="number" class="number-input" value="0" />
              </div>
            </div>
          </div>
        </div>
      {/if}
      
      <!-- Timing Section -->
      {#if activeSliderSection === 'timing'}
        <div class="slider-group timing-group">
          <div class="group-header">
            <span class="group-title">Timing</span>
            <button class="collapse-btn" title="Collapse">−</button>
          </div>
          
          <div class="slider-row">
            <div class="slider-item">
              <label class="slider-label">Duration</label>
              <div class="slider-control">
                <input type="range" min="0.1" max="30" step="0.1" value="2.0" />
                <input type="number" class="number-input" value="2.0" step="0.1" />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Ease In</label>
              <div class="slider-control">
                <input type="range" min="0" max="100" value="0" />
                <input type="number" class="number-input" value="0" />
              </div>
            </div>
            
            <div class="slider-item">
              <label class="slider-label">Ease Out</label>
              <div class="slider-control">
                <input type="range" min="0" max="100" value="0" />
                <input type="number" class="number-input" value="0" />
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .composer-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-primary);
  }
  
  /* Header */
  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  
  .header-tabs {
    display: flex;
    gap: 4px;
  }
  
  .tab {
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }
  
  .tab:hover {
    color: var(--color-text-primary);
  }
  
  .tab.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
  
  .header-actions {
    display: flex;
    gap: 8px;
  }
  
  /* Preview Area */
  .preview-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--color-bg-primary);
  }
  
  .preview-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    position: relative;
    overflow: hidden;
  }
  
  .canvas-content {
    position: relative;
    max-width: 100%;
    max-height: 100%;
  }
  
  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
  }
  
  .preview-placeholder {
    width: 400px;
    height: 300px;
    background: var(--color-bg-tertiary);
    border: 2px dashed var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--color-text-muted);
  }
  
  .preview-placeholder span:first-child {
    font-size: 48px;
  }
  
  .frame-indicators {
    position: absolute;
    top: 12px;
    left: 12px;
  }
  
  .frame-badge {
    padding: 4px 10px;
    background: rgba(0,0,0,0.7);
    border-radius: 4px;
    font-size: 11px;
    color: white;
    backdrop-filter: blur(4px);
  }
  
  /* Filmstrip */
  .filmstrip-container {
    padding: 12px 16px;
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
  }
  
  .filmstrip {
    display: flex;
    gap: 8px;
    align-items: center;
    overflow-x: auto;
    padding: 4px;
  }
  
  .filmstrip::-webkit-scrollbar {
    height: 6px;
  }
  
  .filmstrip::-webkit-scrollbar-track {
    background: var(--color-bg-tertiary);
    border-radius: 3px;
  }
  
  .filmstrip::-webkit-scrollbar-thumb {
    background: var(--color-border-hover);
    border-radius: 3px;
  }
  
  .filmstrip-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.15s;
    position: relative;
  }
  
  .filmstrip-item:hover {
    background: var(--color-bg-hover);
  }
  
  .filmstrip-item.selected {
    background: var(--color-accent-light);
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  
  .thumb {
    width: 80px;
    height: 60px;
    background: var(--color-bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
  }
  
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .thumb-placeholder {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  
  .filmstrip-item.selected .thumb {
    border-color: var(--color-accent);
  }
  
  .frame-label {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .filmstrip-item.selected .frame-label {
    color: var(--color-accent);
    font-weight: 600;
  }
  
  .frame-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  
  .filmstrip-item:hover .frame-actions {
    opacity: 1;
  }
  
  .action-btn {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  
  .action-btn.remove {
    background: rgba(239, 68, 68, 0.2);
    color: var(--color-error);
  }
  
  .action-btn.remove:hover {
    background: var(--color-error);
    color: white;
  }
  
  .action-btn.add {
    background: rgba(34, 197, 94, 0.2);
    color: var(--color-success);
  }
  
  .action-btn.add:hover {
    background: var(--color-success);
    color: white;
  }
  
  .add-frame-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 60px;
    height: 80px;
    background: var(--color-bg-tertiary);
    border: 2px dashed var(--color-border);
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }
  
  .add-frame-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: var(--color-accent-light);
  }
  
  .add-icon {
    font-size: 20px;
    font-weight: 300;
  }
  
  /* Sliders Panel */
  .sliders-panel {
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
    padding: 12px 16px;
  }
  
  /* Master Slider Section */
  .master-slider-section {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  
  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .section-hint {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .master-slider-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  
  .frame-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  
  .frame-nav-btn {
    width: 28px;
    height: 28px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.15s;
  }
  
  .frame-nav-btn:hover:not(:disabled) {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }
  
  .frame-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .frame-number-input {
    width: 40px;
    height: 28px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    text-align: center;
    font-size: 13px;
    font-weight: 500;
  }
  
  .frame-number-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  .frame-total {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  
  .main-value-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  
  .value-label {
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  
  .value-number {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-accent);
  }
  
  .master-slider-container {
    flex: 1;
  }
  
  .master-slider {
    width: 100%;
    height: 6px;
    background: var(--color-bg-secondary);
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
  }
  
  .master-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: var(--color-accent);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .master-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  }
  
  .quick-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  
  .quick-btn {
    width: 28px;
    height: 28px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.15s;
  }
  
  .quick-btn:hover {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }
  
  /* Sliders Grid */
  .sliders-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .slider-group {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    overflow: hidden;
  }
  
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  
  .group-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .collapse-btn {
    width: 20px;
    height: 20px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .collapse-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .slider-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 12px;
  }
  
  .slider-row.full-width {
    grid-template-columns: 1fr;
  }
  
  .slider-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .slider-label {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .slider-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .slider-control input[type="range"] {
    flex: 1;
    height: 4px;
    background: var(--color-bg-secondary);
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
  }
  
  .slider-control input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: var(--color-accent);
    border-radius: 50%;
    cursor: pointer;
  }
  
  .number-input {
    width: 50px;
    height: 24px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    text-align: center;
    font-size: 11px;
  }
  
  .number-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  .select-input {
    width: 100%;
    height: 28px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 11px;
    padding: 0 8px;
  }
  
  /* Buttons */
  .btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
    border: none;
  }
  
  .btn-secondary {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }
  
  .btn-secondary:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .btn-primary {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: white;
  }
  
  .btn-primary:hover {
    background: var(--color-accent-hover);
  }
  
  @media (max-width: 900px) {
    .master-slider-row {
      flex-wrap: wrap;
    }
    
    .slider-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
