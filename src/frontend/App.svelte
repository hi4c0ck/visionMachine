<script>
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { invoke } from '@tauri-apps/api/core';
  import Titlebar from './components/Titlebar.svelte';
  import ProjectSidebar from './components/ProjectSidebar.svelte';
  import ComposerSection from './components/ComposerSection.svelte';
  import ArtifactsPanel from './components/ArtifactsPanel.svelte';
  import WelcomePage from './components/WelcomePage.svelte';

  let currentView = 'welcome';
  let projectData = null;
  let composerData = null;
  let loading = false;
  let error = null;

  async function loadProjects() {
    loading = true;
    error = null;
    try {
      const result = await invoke('list_projects');
      projectData = result;
      currentView = 'project';
    } catch (e) {
      error = `Failed to load projects: ${e}`;
    } finally {
      loading = false;
    }
  }

  async function loadComposer(sessionId) {
    loading = true;
    error = null;
    try {
      const result = await invoke('get_composer', { sessionId });
      composerData = result;
      currentView = 'composer';
    } catch (e) {
      error = `Failed to load composer: ${e}`;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    console.log('VisionMachine App initialized');
    await listen('profile_updated', (event) => {
      console.log('Profile updated:', event.payload);
    });
    await listen('session_created', (event) => {
      console.log('Session created:', event.payload);
    });
  });
</script>

<div class="app">
  <div class="titlebar-wrapper">
    <Titlebar />
  </div>
  
  <div class="main-content">
    {#if currentView === 'welcome'}
      <WelcomePage on:start={loadProjects} on:load-composer={(e) => loadComposer(e.detail)} />
    {:else if currentView === 'project'}
      <ProjectSidebar />
      <ComposerSection projectData={projectData} on:load-composer={(e) => loadComposer(e.detail)} />
      <ArtifactsPanel />
    {:else if currentView === 'composer'}
      <ProjectSidebar />
      <ComposerSection composerData={composerData} />
      <ArtifactsPanel />
    {/if}
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #fff;
    overflow: hidden;
  }
  
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }
  
  .titlebar-wrapper {
    height: 32px;
    flex-shrink: 0;
  }
  
  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
</style>
