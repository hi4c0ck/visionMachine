<script lang="ts">
  // Composer Section Component - Main working area
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let textures = $state([
    {
      id: 1,
      name: 'Nebula Texture',
      previewUrl: null,
      intensity: 75,
      opacity: 90,
      blendMode: 'multiply',
      scale: 1.0,
      rotation: 0,
      xOffset: 0,
      yOffset: 0,
      blur: 0,
      brightness: 0,
      contrast: 0,
    },
    {
      id: 2,
      name: 'Grain Overlay',
      previewUrl: null,
      intensity: 45,
      opacity: 60,
      blendMode: 'overlay',
      scale: 1.5,
      rotation: 15,
      xOffset: 10,
      yOffset: -5,
      blur: 2,
      brightness: 5,
      contrast: 10,
    },
    {
      id: 3,
      name: 'Light Leak',
      previewUrl: null,
      intensity: 60,
      opacity: 75,
      blendMode: 'screen',
      scale: 1.2,
      rotation: -30,
      xOffset: -20,
      yOffset: 15,
      blur: 5,
      brightness: 15,
      contrast: -5,
    },
  ]);
  
  let activeTab = $state('textures');
  let selectedTextureId = $state<number | null>(null);
  
  const tabs = [
    { id: 'textures', label: 'Textures', count: 10 },
    { id: 'layers', label: 'Layers', count: 3 },
    { id: 'effects', label: 'Effects', count: 8 },
  ];
  
  function addTexture() {
    dispatch('add-texture');
  }
  
  function selectTexture(id: number) {
    selectedTextureId = id;
  }
  
  function updateTexture(id: number, updates: any) {
    textures = textures.map(t => t.id === id ? { ...t, ...updates } : t);
  }
</script>

<div class="composer-section">
  <ComposerHeader>
    <TabGroup bind:activeTab>
      {#each tabs as tab (tab.id)}
        <button 
          class="tab" 
          class:active={activeTab === tab.id}
          onclick={() => activeTab = tab.id}
        >
          <span>{tab.label}</span>
          <span class="tab-count">{tab.count}</span>
        </button>
      {/each}
    </TabGroup>
    
    <div class="composer-actions">
      <button class="btn" onclick={addTexture} primary>
        <span>＋</span>
        <span>Add Texture</span>
      </button>
      <button class="btn">
        <span>↕</span>
        <span>Collapse All</span>
      </button>
    </div>
  </ComposerHeader>
  
  <div class="texture-grid">
    {#each textures as texture (texture.id)}
      <div 
        class="texture-entry" 
        class:selected={selectedTextureId === texture.id}
        onclick={() => selectTexture(texture.id)}
      >
        <!-- Preview Area (120px) -->
        <div class="preview-container">
          <div class="preview-image">
            {texture.previewUrl ? <img src={texture.previewUrl} /> : <span>🎨</span>}
          </div>
          {#if selectedTextureId === texture.id}
            <div class="preview-overlay">
              <div class="icon-group">
                <button class="icon-btn primary" title="Use">✓</button>
                <button class="icon-btn" title="Edit">✏</button>
                <button class="icon-btn danger" title="Delete">🗑</button>
                <button class="icon-btn" title="Replace">⇄</button>
                <button class="icon-btn" title="Duplicate">⧉</button>
                <button class="icon-btn" title="Settings">⚙</button>
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Parameter Sliders (10 sliders) -->
        <div class="parameter-sliders">
          <Slider label="Intensity" bind:value={texture.intensity} min="0" max="100" />
          <Slider label="Opacity" bind:value={texture.opacity} min="0" max="100" />
          <Slider label="Blend Mode" type="select" bind:value={texture.blendMode} options="normal,multiply,screen,overlay" />
          <Slider label="Scale" bind:value={texture.scale} min="0.1" max="3" step="0.1" />
          <Slider label="Rotation" bind:value={texture.rotation} min="0" max="360" />
          <Slider label="X Offset" bind:value={texture.xOffset} min="-100" max="100" />
          <Slider label="Y Offset" bind:value={texture.yOffset} min="-100" max="100" />
          <Slider label="Blur" bind:value={texture.blur} min="0" max="50" step="0.5" />
          <Slider label="Brightness" bind:value={texture.brightness} min="-100" max="100" />
          <Slider label="Contrast" bind:value={texture.contrast} min="-100" max="100" />
        </div>
      </div>
    {/each}
  </div>
  
  <!-- Empty State -->
  {#if textures.length === 0}
    <div class="empty-state">
      <span class="empty-icon">🎨</span>
      <h3 class="empty-title">No textures yet</h3>
      <p class="empty-description">Add your first texture to start composing</p>
      <button class="btn primary" onclick={addTexture}>
        <span>＋</span>
        <span>Add Texture</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .composer-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg-primary);
  }
  
  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  
  .tab-group {
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
  
  .tab-count {
    padding: 1px 5px;
    background: var(--color-bg-tertiary);
    border-radius: 10px;
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .composer-actions {
    display: flex;
    gap: 8px;
  }
  
  .texture-grid {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .texture-entry {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    transition: all 0.15s;
  }
  
  .texture-entry:hover {
    border-color: var(--color-border-hover);
  }
  
  .texture-entry.selected {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }
  
  .preview-container {
    position: relative;
    width: 120px;
    height: 120px;
    margin-bottom: 12px;
  }
  
  .preview-image {
    width: 100%;
    height: 100%;
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 24px;
    overflow: hidden;
  }
  
  .preview-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
  }
  
  .preview-container:hover .preview-overlay {
    opacity: 1;
  }
  
  .icon-group {
    display: flex;
    gap: 4px;
  }
  
  .icon-btn {
    width: 28px;
    height: 28px;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  
  .icon-btn:hover {
    background: var(--color-accent);
  }
  
  .icon-btn.danger:hover {
    background: var(--color-error);
  }
  
  .icon-btn.primary {
    background: var(--color-success);
  }
  
  .parameter-sliders {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  
  .slider {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .slider-label {
    font-size: 9px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  input[type="range"] {
    width: 100%;
    height: 4px;
    background: var(--color-bg-tertiary);
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
  }
  
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: var(--color-accent);
    border-radius: 50%;
    cursor: pointer;
  }
  
  select.slider-select {
    width: 100%;
    padding: 4px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 10px;
  }
  
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--color-text-muted);
  }
  
  .empty-icon {
    font-size: 48px;
  }
  
  .empty-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  
  .btn {
    padding: 6px 12px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-secondary);
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
  }
  
  .btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .btn[primary] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }
  
  .btn[primary]:hover {
    background: var(--color-accent-hover);
  }
</style>
