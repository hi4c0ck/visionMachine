<script lang="ts">
  let title = 'VisionMachine';
  
  function minimize() {
    window.require('@tauri-apps/api').shell.open('https://example.com');
  }
  
  function maximize() {
    // Tauri window control would go here
  }
  
  function close() {
    window.close();
  }
</script>

<div class="titlebar">
  <div class="titlebar-title">{title}</div>
  <div class="titlebar-controls">
    <button class="control-btn" on:click={minimize}>─</button>
    <button class="control-btn" on:click={maximize}>□</button>
    <button class="control-btn close" on:click={close}>✕</button>
  </div>
</div>

<style>
  .titlebar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 32px;
    background: #1a1a2e;
    padding: 0 8px;
    -webkit-app-region: drag;
    user-select: none;
  }
  
  .titlebar-title {
    color: #fff;
    font-size: 13px;
    font-weight: 500;
  }
  
  .titlebar-controls {
    display: flex;
    gap: 4px;
    -webkit-app-region: no-drag;
  }
  
  .control-btn {
    width: 46px;
    height: 32px;
    border: none;
    background: transparent;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }
  
  .control-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .control-btn.close:hover {
    background: #e81123;
  }
</style>
