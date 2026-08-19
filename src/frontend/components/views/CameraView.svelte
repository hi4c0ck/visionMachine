<script lang="ts">
  // Camera View - Capture scenes for AI generation
  import { onMount, onDestroy } from 'svelte';
  
  let activeSources = [
    { id: 'default', label: 'Default Camera', selected: true },
    { id: 'webcam', label: 'External Webcam', selected: false },
  ];
  let selectedSource = $state('default');
  
  let isCapturing = $state(false);
  let captureHistory = $state([
    { id: 1, timestamp: '2024-01-15 14:30', preview: null },
    { id: 2, timestamp: '2024-01-15 14:28', preview: null },
    { id: 3, timestamp: '2024-01-15 14:25', preview: null },
  ]);
  
  // Simulated face detection data
  let faceDetection = $state({ x: 100, y: 80, width: 60, height: 80 });
  let boundingBox = $state({ x: 90, y: 70, width: 80, height: 100 });
  let sceneLabel = 'Indoor';
  
  let stream = null;
  let videoElement: HTMLVideoElement;
  
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      if (videoElement) {
        videoElement.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  }
  
  async function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }
  
  function captureFrame() {
    isCapturing = !isCapturing;
    // Simulate capture
    setTimeout(() => {
      isCapturing = false;
      captureHistory = [{ id: Date.now(), timestamp: new Date().toLocaleString(), preview: null }, ...captureHistory.slice(0, 9)];
    }, 500);
  }
  
  onMount(() => {
    startCamera();
  });
  
  onDestroy(() => {
    stopCamera();
  });
</script>

<div class="camera-view">
  <header class="view-header">
    <h1 class="view-title">Camera</h1>
    <div class="header-actions">
      <select bind:value={selectedSource} class="source-select">
        {#each activeSources as source}
          <option value={source.id}>{source.label}</option>
        {/each}
      </select>
    </div>
  </header>
  
  <div class="camera-layout">
    <!-- Main Preview Area -->
    <div class="preview-panel">
      <div class="video-container">
        <video 
          ref={videoElement}
          autoplay 
          muted 
          playsinline
          width="640" 
          height="480"
          class="video-feed"
        ></video>
        
        <!-- Detection Overlays -->
        <div class="overlay-layer">
          {#if faceDetection}
            <div class="face-marker" style:top={`${faceDetection.y}px`} style:left={`${faceDetection.x}px`} style:width={`${faceDetection.width}px`} style:height={`${faceDetection.height}px`}>
              <span class="marker-label">Face</span>
            </div>
          {/if}
          
          {#if boundingBox}
            <div class="bounding-box" style:top={`${boundingBox.y}px`} style:left={`${boundingBox.x}px`} style:width={`${boundingBox.width}px`} style:height={`${boundingBox.height}px`}></div>
          {/if}
          
          <div class="scene-label">{sceneLabel}</div>
        </div>
        
        <!-- Capture Flash Effect -->
        {#if isCapturing}
          <div class="capture-flash"></div>
        {/if}
      </div>
      
      <div class="capture-controls">
        <button 
          class="capture-btn" 
          class:active={isCapturing}
          onclick={captureFrame}
        >
          <span class="capture-icon">●</span>
          <span>{isCapturing ? 'Capturing...' : 'Capture Frame'}</span>
        </button>
        
        <button class="btn btn-secondary">Settings</button>
      </div>
    </div>
    
    <!-- Side Panel - History -->
    <div class="history-panel">
      <h2 class="panel-title">Recent Captures</h2>
      <div class="thumbnail-grid">
        {#each captureHistory as capture (capture.id)}
          <div class="thumbnail-item">
            <div class="thumbnail-placeholder">
              <span>📷</span>
            </div>
            <span class="thumbnail-time">{capture.timestamp}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .camera-view {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .view-title {
    font-size: 24px;
    font-weight: 600;
  }
  
  .source-select {
    padding: 8px 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
  }
  
  .camera-layout {
    display: flex;
    gap: 20px;
    flex: 1;
    min-height: 0;
  }
  
  .preview-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .video-container {
    position: relative;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    aspect-ratio: 4/3;
  }
  
  .video-feed {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .overlay-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }
  
  .face-marker {
    position: absolute;
    border: 2px solid var(--accent);
    border-radius: 4px;
  }
  
  .marker-label {
    position: absolute;
    top: -18px;
    left: 0;
    background: var(--accent);
    color: white;
    padding: 2px 6px;
    font-size: 10px;
    border-radius: 2px;
  }
  
  .bounding-box {
    position: absolute;
    border: 1px dashed var(--warning);
    border-radius: 2px;
  }
  
  .scene-label {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: rgba(0,0,0,0.7);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    color: white;
  }
  
  .capture-flash {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: white;
    opacity: 0;
    animation: flash 0.3s ease-out;
  }
  
  @keyframes flash {
    0% { opacity: 0.8; }
    100% { opacity: 0; }
  }
  
  .capture-controls {
    display: flex;
    gap: 12px;
    margin-top: 16px;
    align-items: center;
  }
  
  .capture-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .capture-btn:hover {
    background: var(--accent-hover);
  }
  
  .capture-btn.active {
    background: var(--error);
  }
  
  .capture-icon {
    font-size: 12px;
  }
  
  .history-panel {
    width: 200px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    overflow-y: auto;
  }
  
  .panel-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  
  .thumbnail-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .thumbnail-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--bg-tertiary);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .thumbnail-item:hover {
    background: var(--border);
  }
  
  .thumbnail-placeholder {
    width: 48px;
    height: 32px;
    background: var(--bg-primary);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
  
  .thumbnail-time {
    font-size: 10px;
    color: var(--text-secondary);
  }
  
  .btn {
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .btn-secondary {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    color: var(--text-primary);
  }
  
  .btn-secondary:hover {
    background: var(--border);
  }
  
  @media (max-width: 900px) {
    .camera-layout {
      flex-direction: column;
    }
    
    .history-panel {
      width: 100%;
    }
  }
</style>
