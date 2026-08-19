<script lang="ts">
  // App Root Component - Svelte 5 with Runes
  import { state, store } from 'svelte/store';
  
  import Sidebar from '$components/layout/Sidebar.svelte';
  import StatusBar from '$components/layout/StatusBar.svelte';
  import DashboardView from '$components/views/DashboardView.svelte';
  import GenerationsView from '$components/views/GenerationsView.svelte';
  import CameraView from '$components/views/CameraView.svelte';
  import StatusView from '$components/views/StatusView.svelte';
  
  // App State
  let currentView = $state<'dashboard' | 'generations' | 'camera' | 'status'>('dashboard');
  let isDarkMode = $state(false);
  
  // Window controls (Tauri)
  async function minimizeWindow() {
    const { listen } = await import('@tauri-apps/api/event');
    const { minimize } = await import('@tauri-apps/plugin-shell');
    minimize();
  }
  
  async function maximizeWindow() {
    const { getCurrent } = await import('@tauri-apps/api/window');
    const win = getCurrent();
    const isMaximized = await win.isMaximized();
    if (isMaximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }
  
  async function closeWindow() {
    const { getCurrent } = await import('@tauri-apps/api/window');
    await getCurrent().close();
  }
</script>

<div class="app-container" class:dark={isDarkMode}>
  <!-- Tauri Titlebar Area -->
  <div class="titlebar">
    <div class="titlebar-drag-region">
      <span class="app-title">VisionMachine</span>
    </div>
    <div class="titlebar-buttons">
      <button class="titlebar-btn" onclick={minimizeWindow} aria-label="Minimize">─</button>
      <button class="titlebar-btn" onclick={maximizeWindow} aria-label="Maximize">□</button>
      <button class="titlebar-btn close" onclick={closeWindow} aria-label="Close">✕</button>
    </div>
  </div>
  
  <!-- Main Layout -->
  <div class="main-layout">
    <Sidebar bind:currentView />
    
    <main class="content-area">
      {#if currentView === 'dashboard'}
        <DashboardView />
      {:else if currentView === 'generations'}
        <GenerationsView />
      {:else if currentView === 'camera'}
        <CameraView />
      {:else if currentView === 'status'}
        <StatusView />
      {/if}
    </main>
  </div>
  
  <StatusBar />
</div>

<style>
  :root {
    --bg-primary: #0f0f0f;
    --bg-secondary: #1a1a1a;
    --bg-tertiary: #252525;
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
    --accent: #6366f1;
    --accent-hover: #4f46e5;
    --border: #333333;
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #ef4444;
  }
  
  .dark {
    --bg-primary: #0a0a0a;
    --bg-secondary: #141414;
    --bg-tertiary: #1e1e1e;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    overflow: hidden;
  }
  
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }
  
  .titlebar {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
  }
  
  .titlebar-drag-region {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 0 12px;
  }
  
  .app-title {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 500;
  }
  
  .titlebar-buttons {
    display: flex;
    -webkit-app-region: no-drag;
  }
  
  .titlebar-btn {
    width: 46px;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 10px;
    transition: background 0.2s;
  }
  
  .titlebar-btn:hover {
    background: var(--bg-tertiary);
  }
  
  .titlebar-btn.close:hover {
    background: var(--error);
    color: white;
  }
  
  .main-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .content-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
</style>
