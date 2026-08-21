<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  
  // Version info
  const VERSION = '0.1.0';
  const BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER || 'dev';
  
  // Auth state
  let currentView = $state('welcome'); // 'welcome' | 'main'
  let currentUser = $state(null);
  let userName = $state('');
  let loginError = $state(null);
  let loading = $state(false);
  
  // Main app state
  let profiles = $state([]);
  let projects = $state([]);
  let sessions = $state([]);
  let currentProfileId = $state(null);
  let currentProjectId = $state(null);
  let currentSessionId = $state(null);
  let pipes = $state([]);
  let artifacts = $state([]);
  let appError = $state(null);
  
  onMount(async () => {
    console.log(`VisionMachine v${VERSION} (Build ${BUILD_NUMBER})`);
    await checkAuth();
  });
  
  async function checkAuth() {
    try {
      const profile = await invoke('get_current_profile');
      if (profile) {
        currentUser = profile;
        currentView = 'main';
        await loadProfiles();
      } else {
        currentView = 'welcome';
      }
    } catch (e) {
      console.error('Auth check failed:', e);
      currentView = 'welcome';
    }
  }
  
  async function handleLogin() {
    if (!userName.trim()) return;
    
    loading = true;
    loginError = null;
    
    try {
      // Try to find existing profile by name
      const allProfiles = await invoke('list_profiles');
      let profile = allProfiles.find(p => p.name === userName.trim());
      
      if (!profile) {
        // Create new profile
        profile = await invoke('create_profile', { 
          name: userName.trim(), 
          email: null 
        });
      }
      
      // Login
      currentUser = await invoke('login_profile', { profileId: profile.id });
      currentView = 'main';
      userName = '';
      await loadProfiles();
    } catch (e) {
      loginError = `Login failed: ${e}`;
    } finally {
      loading = false;
    }
  }
  
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }
  
  async function handleLogout() {
    try {
      await invoke('logout_profile');
      currentUser = null;
      currentView = 'welcome';
      profiles = [];
      projects = [];
      sessions = [];
      currentProfileId = null;
      currentProjectId = null;
      currentSessionId = null;
      pipes = [];
      artifacts = [];
      appError = null;
    } catch (e) {
      appError = `Logout failed: ${e}`;
    }
  }
  
  async function loadProfiles() {
    loading = true;
    appError = null;
    
    try {
      profiles = await invoke('list_profiles');
      if (profiles.length > 0 && !currentProfileId) {
        selectProfile(profiles[0].id);
      }
    } catch (e) {
      appError = `Failed to load profiles: ${e}`;
    } finally {
      loading = false;
    }
  }
  
  async function selectProfile(profileId) {
    currentProfileId = profileId;
    try {
      projects = await invoke('list_projects', { profileId });
      projects = projects || [];
    } catch (e) {
      console.error('Failed to load projects:', e);
      appError = `Failed to load projects: ${e}`;
    }
  }
  
  async function createProfile() {
    const name = prompt('Enter profile name:');
    if (!name) return;
    
    try {
      const profile = await invoke('create_profile', { name, email: null });
      profiles.push(profile);
      await selectProfile(profile.id);
    } catch (e) {
      appError = `Failed to create profile: ${e}`;
    }
  }
  
  async function createProject() {
    if (!currentProfileId) return;
    const name = prompt('Enter project name:');
    if (!name) return;
    
    try {
      const project = await invoke('create_project', { 
        profileId: currentProfileId, 
        name,
        description: '' 
      });
      projects.push(project);
    } catch (e) {
      appError = `Failed to create project: ${e}`;
    }
  }
  
  async function selectProject(projectId) {
    currentProjectId = projectId;
    try {
      sessions = await invoke('list_sessions', { projectId });
      sessions = sessions || [];
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }
  
  async function createSession(projectId) {
    const name = prompt('Enter session name:');
    if (!name) return;
    
    try {
      const session = await invoke('create_session', { projectId, name });
      sessions.push(session);
      await selectSession(session.id);
    } catch (e) {
      appError = `Failed to create session: ${e}`;
    }
  }
  
  async function selectSession(sessionId) {
    currentSessionId = sessionId;
    try {
      const composer = await invoke('get_composer', { sessionId });
      if (composer && composer.config_json) {
        const config = JSON.parse(composer.config_json);
        pipes = config.pipes || [];
      } else {
        pipes = [];
      }
      await loadArtifacts(sessionId);
    } catch (e) {
      console.error('Failed to load composer:', e);
    }
  }
  
  async function loadArtifacts(sessionId) {
    try {
      artifacts = await invoke('list_artifacts_by_session', { sessionId });
      artifacts = artifacts || [];
    } catch (e) {
      console.error('Failed to load artifacts:', e);
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
    pipes = [...pipes, pipe];
    await saveComposer();
  }
  
  async function removePipe(id) {
    pipes = pipes.filter(p => p.id !== id);
    await saveComposer();
  }
  
  async function saveComposer() {
    if (!currentSessionId) return;
    
    const config = JSON.stringify({ pipes, state: 'ready' });
    try {
      await invoke('update_composer', { 
        sessionId: currentSessionId, 
        configJson: config 
      });
    } catch (e) {
      console.error('Failed to save composer:', e);
      appError = `Failed to save composer: ${e}`;
    }
  }
  
  async function generateFrame(pipeId) {
    const pipeIndex = pipes.findIndex(p => p.id === pipeId);
    if (pipeIndex === -1 || pipes[pipeIndex].status === 'generating') return;
    
    const updatedPipes = [...pipes];
    updatedPipes[pipeIndex] = { ...updatedPipes[pipeIndex], status: 'generating' };
    pipes = updatedPipes;
    
    // Simulate generation delay
    await new Promise(r => setTimeout(r, 2000));
    
    const completedPipe = { ...updatedPipes[pipeIndex], status: 'completed' };
    pipes = [...pipes.slice(0, pipeIndex), completedPipe, ...pipes.slice(pipeIndex + 1)];
    
    // Add artifact
    const artifact = {
      id: crypto.randomUUID(),
      type: 'video',
      path: `/output/frame_${Date.now()}.mp4`,
      created_at: new Date().toISOString()
    };
    artifacts = [artifact, ...artifacts];
    
    await saveComposer();
  }
  
  async function generateAll() {
    for (const pipe of [...pipes]) {
      await generateFrame(pipe.id);
    }
  }
</script>

{#if currentView === 'welcome'}
  <div class="welcome-screen">
    <div class="logo">
      <div class="logo-icon">V</div>
      <h1>VisionMachine</h1>
      <p class="version">v{VERSION} (Build {BUILD_NUMBER})</p>
    </div>
    
    <div class="login-form">
      <h2>Welcome</h2>
      <p>Enter your name to continue</p>
      
      {#if loginError}
        <div class="error">{loginError}</div>
      {/if}
      
      <div class="input-group">
        <input 
          type="text" 
          bind:value={userName}
          on:keydown={handleKeyDown}
          placeholder="Your name..."
          disabled={loading}
        >
        <button 
          class="btn-primary" 
          on:click={handleLogin}
          disabled={loading || !userName.trim()}
        >
          {loading ? 'Signing in...' : 'Continue'}
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="app">
    <!-- Titlebar -->
    <div class="titlebar">
      <div class="title">VisionMachine v{VERSION}</div>
      <div class="user-info">
        <span class="username">👤 {currentUser?.name}</span>
        <button class="btn-logout" on:click={handleLogout}>Logout</button>
      </div>
      <div class="controls">
        <button class="btn-control">─</button>
        <button class="btn-control">□</button>
        <button class="btn-control close">✕</button>
      </div>
    </div>
    
    <!-- Error Banner -->
    {#if appError}
      <div class="error-banner">{appError}</div>
    {/if}
    
    <!-- Main Layout -->
    <div class="main">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3>Profiles ({profiles.length})</h3>
          <button class="btn-primary" on:click={createProfile}>+ New</button>
        </div>
        
        {#if loading}
          <div class="loading">Loading...</div>
        {:else}
          <div class="profile-list">
            {#each profiles as profile (profile.id)}
              <div 
                class="profile-item {currentProfileId === profile.id ? 'selected' : ''}" 
                on:click={() => selectProfile(profile.id)}
              >
                <span class="avatar">👤</span>
                <span class="name">{profile.name}</span>
              </div>
            {/each}
            
            {#if profiles.length === 0}
              <div class="empty">No profiles yet</div>
            {/if}
          </div>
        {/if}
        
        {#if currentProfileId}
          <div class="sidebar-section">
            <div class="section-header">
              <h3>Projects ({projects.length})</h3>
              <button class="btn-small" on:click={createProject}>+ New</button>
            </div>
            <div class="project-list">
              {#each projects as project (project.id)}
                <div class="project-item" on:click={() => selectProject(project.id)}>
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
        
        {#if currentProjectId}
          <div class="sidebar-section">
            <div class="section-header">
              <h3>Sessions ({sessions.length})</h3>
              <button class="btn-small" on:click={() => createSession(currentProjectId)}>+ New</button>
            </div>
            <div class="session-list">
              {#each sessions as session (session.id)}
                <div 
                  class="session-item {currentSessionId === session.id ? 'selected' : ''}" 
                  on:click={() => selectSession(session.id)}
                >
                  <span class="icon">📁</span>
                  <span class="name">{session.name}</span>
                </div>
              {/each}
              
              {#if sessions.length === 0}
                <div class="empty">No sessions</div>
              {/if}
            </div>
          </div>
        {/if}
      </aside>
      
      <!-- Content Area -->
      <main class="content">
        {#if currentSessionId}
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
                  <span class="status">
                    {pipe.status === 'generating' ? '⏳ Generating...' : 
                     pipe.status === 'completed' ? '✅ Done' : '⏳ Idle'}
                  </span>
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
        {:else}
          <div class="empty-state">
            <p>Select or create a session to begin composing</p>
          </div>
        {/if}
      </main>
      
      <!-- Artifacts Panel -->
      <aside class="panel">
        <div class="panel-header">
          <h3>Artifacts ({artifacts.length})</h3>
          <span class="badge">Build {BUILD_NUMBER}</span>
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
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f1a;
    color: #fff;
    overflow: hidden;
  }
  
  /* Welcome Screen */
  .welcome-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
  }
  
  .logo {
    text-align: center;
    margin-bottom: 40px;
  }
  
  .logo-icon {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #4a9eff 0%, #1a56db 100%);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    font-weight: bold;
    margin: 0 auto 20px;
  }
  
  .logo h1 {
    font-size: 32px;
    font-weight: 600;
    margin: 0 0 8px;
  }
  
  .logo .version {
    font-size: 14px;
    color: #888;
  }
  
  .login-form {
    background: #16161e;
    padding: 40px;
    border-radius: 16px;
    border: 1px solid #2a2a3a;
    width: 100%;
    max-width: 400px;
  }
  
  .login-form h2 {
    margin: 0 0 8px;
    font-size: 24px;
  }
  
  .login-form p {
    color: #888;
    margin: 0 0 24px;
  }
  
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .input-group input {
    padding: 14px 16px;
    background: #0f0f1a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    color: #fff;
    font-size: 16px;
  }
  
  .input-group input:focus {
    outline: none;
    border-color: #4a9eff;
  }
  
  .input-group input:disabled {
    opacity: 0.5;
  }
  
  /* App Layout */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  
  /* Titlebar */
  .titlebar {
    height: 40px;
    background: #16161e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid #2a2a3a;
    -webkit-app-region: drag;
  }
  
  .title { font-size: 13px; font-weight: 500; }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
    -webkit-app-region: no-drag;
  }
  
  .username {
    font-size: 13px;
    color: #888;
  }
  
  .btn-logout {
    padding: 4px 12px;
    background: transparent;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
  }
  
  .btn-logout:hover {
    background: #ef4444;
    border-color: #ef4444;
  }
  
  .controls { display: flex; gap: 4px; -webkit-app-region: no-drag; }
  
  .btn-control {
    width: 46px;
    height: 40px;
    border: none;
    background: transparent;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
  }
  
  .btn-control:hover { background: rgba(255,255,255,0.1); }
  .btn-control.close:hover { background: #e81123; }
  
  /* Error Banner */
  .error-banner {
    padding: 12px 20px;
    background: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid #ef4444;
    color: #ef4444;
    font-size: 13px;
  }
  
  /* Main Layout */
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  /* Sidebar */
  .sidebar {
    width: 280px;
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
  
  .profile-list, .project-list, .session-list {
    padding: 8px;
  }
  
  .profile-item, .project-item, .session-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .profile-item:hover, .project-item:hover, .session-item:hover {
    background: #1e1e2e;
  }
  
  .profile-item.selected {
    background: rgba(74,158,255,0.15);
    border-left: 3px solid #4a9eff;
  }
  
  .profile-item .avatar, .project-item .icon, .session-item .icon {
    font-size: 18px;
  }
  
  .profile-item .name, .project-item .name, .session-item .name {
    font-size: 13px;
  }
  
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
  
  /* Content */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
    width: 280px;
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
  
  .badge {
    background: #2a2a3a;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    color: #888;
  }
  
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
  
  .btn-primary:hover:not(:disabled) { background: #3a8eef; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  
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
  .error { padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; color: #ef4444; font-size: 13px; margin-bottom: 16px; }
  .empty { color: #666; font-size: 13px; padding: 12px; text-align: center; }
  
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    color: #888;
  }
  
  .empty-state p { margin-bottom: 20px; }
  
  /* Scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #16161e; }
  ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a4a; }
</style>
