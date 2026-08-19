<script lang="ts">
  // Status Bar Component
  let llmStatus = 'Online';
  let cameraStatus = 'Connected';
  let generationProgress = $state(0);
  let isGenerating = $state(false);
</script>

<footer class="status-bar">
  <div class="status-left">
    <span class="status-item">
      <span class="status-dot online"></span>
      LLM: {llmStatus}
    </span>
    <span class="status-item">
      <span class="status-dot connected"></span>
      Camera: {cameraStatus}
    </span>
  </div>
  
  {#if isGenerating}
    <div class="status-center">
      <progress value={generationProgress} max="100"></progress>
      <span class="progress-text">{generationProgress}%</span>
    </div>
  {/if}
  
  <div class="status-right">
    <span class="version">v0.1.0</span>
  </div>
</footer>

<style>
  .status-bar {
    height: 28px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  
  .status-left, .status-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  
  .status-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  
  .status-dot.online, .status-dot.connected {
    background: var(--success);
  }
  
  .status-center {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    max-width: 200px;
    margin: 0 auto;
  }
  
  progress {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--bg-tertiary);
    border-radius: 2px;
  }
  
  progress::-webkit-progress-bar {
    background: var(--bg-tertiary);
    border-radius: 2px;
  }
  
  progress::-webkit-progress-value {
    background: var(--accent);
    border-radius: 2px;
  }
  
  .progress-text {
    font-size: 10px;
    min-width: 30px;
    text-align: right;
  }
  
  .version {
    opacity: 0.6;
  }
</style>
