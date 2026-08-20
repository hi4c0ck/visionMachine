<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  
  // State
  let profiles = [];
  let projects = [];
  let sessions = [];
  let pipes = [];
  let artifacts = [];
  let loading = false;
  let error = null;
  let currentView = 'welcome';
  
  onMount(async () => {
    console.log('VisionMachine Desktop App Loaded');
    await loadProfiles();
  });
  
  async function loadProfiles() {
    loading = true;
    error = null;
    
    try {
      const result = await invoke('list_profiles');
      profiles = result || [];
      if (profiles.length > 0) {
        await loadProjects(profiles[0].id);
      }
    } catch (e) {
      error = `Failed to load profiles: ${e}`;
      console.error(error);
    } finally {
      loading = false;
    }
  }
  
  async function loadProjects(profileId) {
    try {
      const result = await invoke('list_projects', { profileId });
      projects = result || [];
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }
  
  async function createProfile() {
    const name = prompt('Enter profile name:');
    if (!name) return;
    
    try {
      const result = await invoke('create_profile', { name, email: null });
      profiles.push(result);
      await loadProjects(result.id);
    } catch (e) {
      error = `Failed to create profile: ${e}`;
    }
  }
  
  async function createProject(profileId) {
    const name = prompt('Enter project name:');
    if (!name) return;
    
    try {
      const result = await invoke('create_project', { 
        profileId, 
        name,
        description: '' 
      });
      projects.push(result);
    } catch (e) {
      error = `Failed to create project: ${e}`;
    }
  }
  
  async function createSession(projectId) {
    const name = prompt('Enter session name:');
    if (!name) return;
    
    try {
      const result = await invoke('create_session', { projectId, name });
      sessions.push(result);
      
      // Auto-load composer
      await loadComposer(result.id);
      
      currentView = 'composer';
    } catch (e) {
      error = `Failed to create session: ${e}`;
    }
  }
  
  async function loadComposer(sessionId) {
    try {
      const result = await invoke('get_composer', { sessionId });
      if (result && result.config_json) {
        const config = JSON.parse(result.config_json);
        pipes = config.pipes || [];
      }
    } catch (e) {
      console.error('Failed to load composer:', e);
    }
  }
  
  async function addPipe() {
    const pipe = {
      id: crypto.randomUUID(),
      name: `Pipe ${pipes.length + 1}`,
      order: pipes.length,
      status: 'idle',
      model: 'stable-video-diffusion',
      steps: 30,
      cfgScale: 7.5
    };
    pipes.push(pipe);
    await saveComposer();
  }
  
  async function removePipe(id) {
    pipes = pipes.filter(p => p.id !== id);
    await saveComposer();
  }
  
  async function saveComposer() {
    // This would save to database in real implementation
    console.log('Saving composer:', pipes);
  }
  
  async function generateFrame(pipeId) {
    const pipe = pipes.find(p => p.id === pipeId);
    if (!pipe || pipe.status === 'generating') return;
    
    pipe.status = 'generating';
    
    // Simulate generation delay
    await new Promise(r => setTimeout(r, 2000));
    
    pipe.status = 'completed';
    
    // Add artifact
    artifacts.push({
      id: crypto.randomUUID(),
      type: 'video',
      path: `/output/frame_${Date.now()}.mp4`,
      created_at: new Date().toISOString()
    });
    
    await saveComposer();
  }
  
  async function generateAll() {
    for (const pipe of [...pipes]) {
      await generateFrame(pipe.id);
    }
  }
</script>

<div class="app">
  <!-- Titlebar -->
  <div class="titlebar">
    <span class="title">VisionMachine</span>
    <div class="controls">
      <button class="btn-control">─</button>
      <button class="btn-control">□</button>
      <button class="btn-control close">✕</button>
    </div>
  </div>
  
  <!-- Main Layout -->
  <div class="main">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h3>Profiles</h3>
        <button class="btn-primary" on:click={createProfile}>+ New</button>
      </div>
      
      {#if loading}
        <div class="loading">Loading...</div>
      {:else if error}
        <div class="error">{error}</div>
      {:else}
        <div class="profile-list">
          {#each profiles as profile (profile.id)}
            <div class="profile-item" on:click={() => loadProjects(profile.id)}>
              <span class="avatar">👤</span>
              <span class="name">{profile.name}</span>
            </div>
          {/each}
          
          {#if profiles.length === 0}
            <div class="empty">No profiles yet</div>
          {/if}
        </div>
      {/if}
      
      {#if profiles.length > 0}
        <div class="sidebar-section">
          <div class="section-header">
            <h3>Projects</h3>
            <button class="btn-small" on:click={() => createProject(profiles[0].id)}>+ New</button>
          </div>
          <div class="project-list">
            {#each projects as project (project.id)}
              <div class="project-item" on:click={() => createSession(project.id)}>
                <span class="icon">🎬</span>
                <span class="name">{project.name}</span>
              </div>
            {/each}
            
            {#if projects.length === 0}
              <div class="empty">No projects</div>
            {/if}
          </div>
        </div>
      {/if}
    </aside>
    
    <!-- Content Area -->
    <main class="content">
      {#if currentView === 'welcome'}
        <div class="welcome">
          <div class="logo">🎬</div>
          <h1>VisionMachine</h1>
          <p class="tagline">AI-Powered Video Generation Desktop</p>
          
          <div class="features">
            <div class="feature">
              <div class="icon">🎨</div>
              <h3>Dual Composer</h3>
              <p>Manage multiple composition instances</p>
            </div>
            <div class="feature">
              <div class="icon">⚡</div>
              <h3>Fast Generation</h3>
              <p>Optimized pipeline for rapid frames</p>
            </div>
            <div class="feature">
              <div class="icon">🔒</div>
              <h3>Local First</h3>
              <p>All processing happens locally</p>
            </div>
          </div>
          
          <p class="hint">Create a profile to get started</p>
        </div>
        
      {:else if currentView === 'composer'}
        <div class="composer-view">
          <header class="view-header">
            <h2>Composer</h2>
            <div class="actions">
              <button class="btn-secondary" on:click={addPipe}>+ Add Pipe</button>
              <button class="btn-primary" on:click={generateAll}>Generate All</button>
            </div>
          </header>
          
          <div class="pipes-grid">
            {#each pipes as pipe (pipe.id)}
              <div class="pipe-card {pipe.status}">
                <div class="pipe-header">
                  <span class="pipe-name">{pipe.name}</span>
                  <span class="status">{pipe.status === 'generating' ? '⏳ Generating...' : pipe.status === 'completed' ? '✅ Done' : '⏳ Idle'}</span>
                  <button class="remove-btn" on:click={() => removePipe(pipe.id)}>×</button>
                </div>
                
                <div class="pipe-config">
                  <div class="field">
                    <label>Model</label>
                    <select bind:value={pipe.model}>
                      <option value="stable-video-diffusion">stable-video-diffusion</option>
                      <option value="animatediff">animatediff</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Steps</label>
                    <input type="number" bind:value={pipe.steps} min="1" max="100">
                  </div>
                  <div class="field">
                    <label>Cfg Scale</label>
                    <input type="number" bind:value={pipe.cfgScale} step="0.5" min="1" max="30">
                  </div>
                </div>
                
                <button 
                  class="generate-btn" 
                  on:click={() => generateFrame(pipe.id)}
                  disabled={pipe.status === 'generating'}
                >
                  {pipe.status === 'generating' ? 'Generating...' : 'Generate Frame'}
                </button>
              </div>
            {/each}
            
            {#if pipes.length === 0}
              <div class="empty-state">
                <p>No pipes configured</p>
                <button class="btn-primary" on:click={addPipe}>+ Add First Pipe</button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </main>
    
    <!-- Artifacts Panel -->
    <aside class="panel">
      <div class="panel-header">
        <h3>Artifacts</h3>
        <span class="count">{artifacts.length}</span>
      </div>
      
      <div class="artifacts-list">
        {#each artifacts as artifact (artifact.id)}
          <div class="artifact-item">
            <span class="icon">🎬</span>
            <div class="info">
              <div class="name">{artifact.path.split('/').pop()}</div>
              <div class="meta">{artifact.type} • {new Date(artifact.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        {/each}
        
        {#if artifacts.length === 0}
          <div class="empty">No artifacts yet</div>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f1a;
    color: #fff;
    overflow: hidden;
  }
  
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  
  /* Titlebar */
  .titlebar {
    height: 32px;
    background: #16161e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid #2a2a3a;
    -webkit-app-region: drag;
  }
  
  .title { font-size: 13px; font-weight: 500; }
  
  .controls { display: flex; gap: 4px; -webkit-app-region: no-drag; }
  
  .btn-control {
    width: 46px;
    height: 32px;
    border: none;
    background: transparent;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
  }
  
  .btn-control:hover { background: rgba(255,255,255,0.1); }
  .btn-control.close:hover { background: #e81123; }
  
  /* Main Layout */
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  /* Sidebar */
  .sidebar {
    width: 240px;
    background: #16161e;
    border-right: 1px solid #2a2a3a;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  
  .sidebar-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2a3a;
  }
  
  .sidebar-header h3 { font-size: 13px; font-weight: 600; margin: 0; }
  
  .profile-list {
    padding: 8px;
  }
  
  .profile-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .profile-item:hover { background: #1e1e2e; }
  
  .profile-item .avatar { font-size: 18px; }
  .profile-item .name { font-size: 13px; }
  
  .sidebar-section {
    border-top: 1px solid #2a2a3a;
    padding: 12px;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  
  .section-header h3 { font-size: 13px; font-weight: 600; margin: 0; }
  
  .project-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .project-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .project-item:hover { background: #1e1e2e; }
  
  .project-item .icon { font-size: 16px; }
  .project-item .name { font-size: 13px; }
  
  /* Content */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .welcome {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 40px;
  }
  
  .logo { font-size: 64px; margin-bottom: 16px; }
  .welcome h1 { font-size: 36px; font-weight: 700; margin-bottom: 12px; }
  .tagline { font-size: 16px; color: #888; margin-bottom: 40px; }
  
  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 40px;
    max-width: 600px;
  }
  
  .feature {
    padding: 20px;
    background: #1e1e2e;
    border-radius: 12px;
  }
  
  .feature .icon { font-size: 28px; margin-bottom: 10px; }
  .feature h3 { font-size: 14px; margin-bottom: 6px; }
  .feature p { font-size: 12px; color: #888; line-height: 1.4; }
  
  .hint { font-size: 13px; color: #666; }
  
  /* Composer View */
  .composer-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .view-header {
    padding: 16px 20px;
    border-bottom: 1px solid #2a2a3a;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .view-header h2 { font-size: 18px; font-weight: 600; margin: 0; }
  
  .actions { display: flex; gap: 10px; }
  
  .pipes-grid {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    align-content: start;
  }
  
  .pipe-card {
    background: #1e1e2e;
    border: 1px solid #2a2a3a;
    border-radius: 10px;
    padding: 16px;
  }
  
  .pipe-card.generating { border-color: #4a9eff; }
  .pipe-card.completed { border-color: #4ade80; }
  
  .pipe-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  
  .pipe-name { flex: 1; font-weight: 500; font-size: 14px; }
  
  .status {
    font-size: 11px;
    padding: 3px 8px;
    background: #2a2a3a;
    border-radius: 4px;
  }
  
  .remove-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 18px;
    padding: 4px 8px;
  }
  
  .remove-btn:hover { color: #ef4444; }
  
  .pipe-config {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 12px;
  }
  
  .field label {
    display: block;
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
  }
  
  .field select,
  .field input {
    width: 100%;
    padding: 6px 8px;
    background: #16161e;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
  }
  
  .generate-btn {
    width: 100%;
    padding: 10px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  
  .generate-btn:hover:not(:disabled) { background: #3a8eef; }
  .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  /* Right Panel */
  .panel {
    width: 260px;
    background: #16161e;
    border-left: 1px solid #2a2a3a;
    display: flex;
    flex-direction: column;
  }
  
  .panel-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2a3a;
  }
  
  .panel-header h3 { font-size: 13px; font-weight: 600; margin: 0; }
  .count { background: #1e1e2e; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
  
  .artifacts-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  .artifact-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: #1e1e2e;
    border-radius: 6px;
    margin-bottom: 8px;
  }
  
  .artifact-item .icon { font-size: 18px; }
  .artifact-item .info { flex: 1; min-width: 0; }
  .artifact-item .name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artifact-item .meta { font-size: 10px; color: #888; margin-top: 2px; }
  
  /* Buttons */
  .btn-primary {
    padding: 6px 12px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  
  .btn-primary:hover { background: #3a8eef; }
  
  .btn-secondary {
    padding: 6px 12px;
    background: #1e1e2e;
    color: #fff;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  }
  
  .btn-secondary:hover { background: #2a2a3a; }
  
  .btn-small {
    padding: 4px 10px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
  }
  
  /* States */
  .loading { padding: 20px; text-align: center; color: #888; }
  .error { padding: 20px; color: #ef4444; font-size: 13px; }
  .empty { color: #666; font-size: 13px; padding: 12px; text-align: center; }
  
  .empty-state {
    grid-column: 1/-1;
    text-align: center;
    padding: 60px 20px;
    color: #888;
  }
  
  .empty-state p { margin-bottom: 20px; }
  
  /* Scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #16161e; }
  ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a4a; }
</style>
