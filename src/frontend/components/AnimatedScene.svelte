<script lang="ts">
  // Animated Scene Component - Top 15% of app with overlay buttons
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  
  export let mode: 'project' | 'default' = 'default';
  export let sceneIndex = $state(0);
  export let isPlaying = $state(true);
  
  let videoRef: HTMLVideoElement;
  let controlsVisible = $state(true);
  let hoverTimeout: NodeJS.Timeout | null = null;
  
  // Scene controls (10-12 buttons)
  const sceneControls = [
    { id: 'prev', icon: '⏮', tooltip: 'Previous Scene' },
    { id: 'play-pause', icon: isPlaying ? '⏸' : '⏯', tooltip: isPlaying ? 'Pause' : 'Play', primary: true },
    { id: 'next', icon: '⏭', tooltip: 'Next Scene' },
    { id: 'screenshot', icon: '📷', tooltip: 'Screenshot' },
    { id: 'fullscreen', icon: '⛶', tooltip: 'Fullscreen' },
    { id: 'zoom-in', icon: '🔍+', tooltip: 'Zoom In' },
    { id: 'zoom-out', icon: '🔍-', tooltip: 'Zoom Out' },
    { id: 'settings', icon: '⚙', tooltip: 'Scene Settings' },
    { id: 'share', icon: '↗', tooltip: 'Share' },
    { id: 'download', icon: '⬇', tooltip: 'Download' },
    { id: 'loop', icon: '🔁', tooltip: 'Loop', active: true },
    { id: 'quality', icon: 'HD', tooltip: 'Quality' },
  ];
  
  async function prevScene() {
    if (sceneIndex > 0) {
      sceneIndex--;
      await loadScene(sceneIndex);
    }
  }
  
  async function nextScene() {
    const scenes = await getScenes();
    if (sceneIndex < scenes.length - 1) {
      sceneIndex++;
      await loadScene(sceneIndex);
    }
  }
  
  function togglePlay() {
    isPlaying = !isPlaying;
    if (videoRef) {
      if (isPlaying) {
        videoRef.play();
      } else {
        videoRef.pause();
      }
    }
  }
  
  async function loadScene(index: number) {
    // Load scene based on mode
    if (mode === 'project') {
      // Use last generated video
      const scenes = await getScenes();
      if (scenes[index]) {
        videoRef.src = scenes[index].url;
      }
    } else {
      // Default: ambient animation
      videoRef.src = '/assets/ambient-loop.mp4';
    }
    videoRef.play();
    isPlaying = true;
  }
  
  async function getScenes() {
    try {
      return await invoke('get_project_scenes');
    } catch {
      return [];
    }
  }
  
  function handleMouseEnter() {
    controlsVisible = true;
    if (hoverTimeout) clearTimeout(hoverTimeout);
  }
  
  function handleMouseLeave() {
    hoverTimeout = setTimeout(() => {
      controlsVisible = false;
    }, 2000);
  }
  
  onMount(async () => {
    await loadScene(sceneIndex);
  });
</script>

<div 
  class="animated-scene" 
  class:controls-hidden={!controlsVisible}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
>
  <video
    ref={videoRef}
    class="scene-video"
    loop
    autoplay
    muted
    playsinline
  ></video>
  
  <div class="scene-overlay" class:visible={controlsVisible}>
    <!-- Scene Info -->
    <div class="scene-info">
      <span class="scene-badge">{mode === 'project' ? 'Project Scene' : 'Preview'}</span>
      <span class="scene-counter">{sceneIndex + 1} / 12</span>
    </div>
    
    <!-- Controls Row -->
    <div class="controls-row">
      {#each sceneControls as control (control.id)}
        <button
          class="scene-btn"
          class:primary={control.primary}
          class:active={control.active}
          title={control.tooltip}
          onclick={
            control.id === 'prev' && prevScene() ||
            control.id === 'next' && nextScene() ||
            control.id === 'play-pause' && togglePlay()
          }
        >
          <span class="btn-icon">{control.icon}</span>
          <span class="btn-label">{control.tooltip}</span>
        </button>
      {/each}
    </div>
  </div>
  
  <!-- Progress Bar -->
  <div class="progress-bar">
    <div class="progress-fill" style:width="{(sceneIndex + 1) / 12 * 100}%"></div>
  </div>
</div>

<style>
  .animated-scene {
    position: relative;
    height: 150px;
    background: var(--color-bg-tertiary);
    overflow: hidden;
    border-bottom: 1px solid var(--color-border);
  }
  
  .scene-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .scene-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 12px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.5) 100%);
    opacity: 1;
    transition: opacity 0.3s;
  }
  
  .animated-scene.controls-hidden .scene-overlay {
    opacity: 0;
  }
  
  .scene-info {
    display: flex;
    gap: 8px;
  }
  
  .scene-badge, .scene-counter {
    padding: 4px 8px;
    background: rgba(0,0,0,0.6);
    border-radius: 4px;
    font-size: 10px;
    color: white;
    backdrop-filter: blur(4px);
  }
  
  .controls-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: center;
  }
  
  .scene-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
    background: rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.15s;
    min-width: 44px;
  }
  
  .scene-btn:hover {
    background: rgba(99, 102, 241, 0.6);
    border-color: var(--color-accent);
  }
  
  .scene-btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }
  
  .scene-btn.primary:hover {
    background: var(--color-accent-hover);
  }
  
  .scene-btn.active {
    background: rgba(34, 197, 94, 0.6);
    border-color: var(--color-success);
  }
  
  .btn-icon {
    font-size: 14px;
    line-height: 1;
  }
  
  .btn-label {
    font-size: 8px;
    opacity: 0.8;
  }
  
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(0,0,0,0.5);
  }
  
  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    transition: width 0.3s;
  }
</style>
