<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  export let userName = '';
  
  // State
  let layoutMode = 'landscape';
  let showProjects = true;
  let showProfile = false;
  let showTools = true;
  
  // Actions
  function setLayout(mode) {
    layoutMode = mode;
    switch(mode) {
      case 'landscape':
        showProjects = true;
        showProfile = false;
        showTools = true;
        break;
      case 'portrait':
        showProjects = true;
        showProfile = true;
        showTools = true;
        break;
      case 'single':
        showProjects = false;
        showProfile = false;
        showTools = false;
        break;
    }
  }
  
  function logout() {
    dispatch('logout');
  }
  
  function generateVideo() {
    alert('Generate clicked for: ' + userName);
  }
</script>

<div class="app">
  <header class="header">
    <div class="frame-left">
      <span class="logo">🎬 VisionMachine</span>
      <div class="layout-btns">
        <button class="btn {layoutMode === 'landscape' ? 'active' : ''}" onclick={() => setLayout('landscape')} title="Landscape view">▭</button>
        <button class="btn {layoutMode === 'portrait' ? 'active' : ''}" onclick={() => setLayout('portrait')} title="Portrait view">☐</button>
        <button class="btn {layoutMode === 'single' ? 'active' : ''}" onclick={() => setLayout('single')} title="Single panel">◻</button>
      </div>
    </div>
    
    <div class="frame-center">
      <h1>VisionMachine</h1>
    </div>
    
    <div class="frame-right">
      <button class="btn-ghost" onclick={logout}>Logout ({userName})</button>
    </div>
  </header>

  <main class="content" class:landscape={layoutMode === 'landscape'} class:portrait={layoutMode === 'portrait'} class:single={layoutMode === 'single'}>
    
    {#if showProjects}
      <aside class="panel projects-panel">
        <div class="panel-header">
          <span>Projects</span>
          <button class="btn-icon" title="New Project">+</button>
        </div>
        <div class="panel-content">
          <div class="project-item active">
            <span class="project-icon">🎬</span>
            <div class="project-info">
              <div class="project-name">My First Video</div>
              <div class="project-meta">Created today</div>
            </div>
          </div>
          <div class="project-item">
            <span class="project-icon">🎥</span>
            <div class="project-info">
              <div class="project-name">Product Demo</div>
              <div class="project-meta">2 days ago</div>
            </div>
          </div>
        </div>
      </aside>
    {/if}

    {#if showProfile}
      <aside class="panel profile-panel">
        <div class="panel-header">
          <span>Profile</span>
        </div>
        <div class="panel-content">
          <div class="user-profile">
            <div class="avatar">{userName.charAt(0).toUpperCase()}</div>
            <div class="user-info">
              <div class="user-name">{userName}</div>
              <div class="user-role">Pro Member</div>
            </div>
          </div>
          <button class="btn btn-block" onclick={() => alert('Settings clicked')}>
            ⚙ Settings
          </button>
        </div>
      </aside>
    {/if}

    <section class="composer">
      <div class="composer-header">
        <div class="composer-title">
          <h2>Main Composer</h2>
          <span class="badge">Active</span>
        </div>
        <div class="composer-actions">
          <button class="btn" onclick={() => alert('Export clicked')}>
            ↓ Export
          </button>
          <button class="btn btn-primary" onclick={generateVideo}>
            ▶ Generate
          </button>
        </div>
      </div>
      
      <div class="composer-canvas">
        <div class="empty-state">
          <div class="empty-icon">🎬</div>
          <h3>Welcome, {userName}!</h3>
          <p>Click "Generate" to create your first AI-powered video</p>
          <button class="btn btn-primary" onclick={generateVideo}>Create Video</button>
        </div>
      </div>
      
      <div class="composer-timeline">
        <div class="timeline-track">
          <div class="track-label">Timeline</div>
          <div class="track-content">
            <div class="clip" style="left: 0%; width: 33%">Shot 1</div>
            <div class="clip" style="left: 33%; width: 33%">Shot 2</div>
            <div class="clip" style="left: 66%; width: 33%">Shot 3</div>
          </div>
        </div>
      </div>
    </section>

    {#if showTools}
      <aside class="panel tools-panel">
        <div class="panel-header">
          <span>Tools</span>
          <button class="btn-icon" title="Add Tool">+</button>
        </div>
        <div class="panel-content">
          <div class="tool-item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Generator</span>
          </div>
          <div class="tool-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
            <span>Image</span>
          </div>
          <div class="tool-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <span>Edit</span>
          </div>
        </div>
      </aside>
    {/if}
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg-primary, #1e1e1e);
  }
  
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: var(--bg-secondary, #252526);
    border-bottom: 1px solid var(--border-color, #3e3e42);
    min-height: 52px;
    flex-shrink: 0;
  }
  
  .frame-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  
  .logo {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary, #d4d4d4);
  }
  
  .layout-btns {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--bg-tertiary, #2d2d2d);
    border-radius: 6px;
  }
  
  .frame-center {
    flex: 1;
    text-align: center;
  }
  
  .frame-center h1 {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted, #858585);
    margin: 0;
  }
  
  .frame-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .content {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  
  .panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary, #252526);
    border-right: 1px solid var(--border-color, #3e3e42);
    overflow: hidden;
    transition: all 0.25s ease;
  }
  
  .tools-panel {
    border-right: none;
    border-left: 1px solid var(--border-color, #3e3e42);
  }
  
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-color, #3e3e42);
    font-weight: 600;
    font-size: 0.8125rem;
    flex-shrink: 0;
    background: var(--bg-tertiary, #2d2d2d);
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  .projects-panel { width: 240px; }
  .profile-panel { width: 220px; }
  .tools-panel { width: 280px; }
  
  .content.landscape .profile-panel { display: none; }
  .content.portrait .projects-panel { width: 60px !important; }
  .content.single .projects-panel,
  .content.single .profile-panel,
  .content.single .tools-panel { display: none; }
  .content.single .composer { flex: 1; }
  
  .project-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .project-item:hover { background: var(--bg-hover, #2d2d2d); }
  .project-item.active { background: var(--accent-primary, #007acc); color: white; }
  
  .project-icon { font-size: 1.25rem; }
  
  .project-info { flex: 1; min-width: 0; }
  
  .project-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.875rem;
  }
  
  .project-meta {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  
  .user-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    margin-bottom: 12px;
  }
  
  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent-primary, #007acc);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 600;
    color: white;
    flex-shrink: 0;
  }
  
  .user-info { flex: 1; min-width: 0; }
  .user-name { font-weight: 600; font-size: 1rem; }
  .user-role { font-size: 0.75rem; color: var(--text-muted, #858585); }
  
  .quick-actions { display: flex; flex-direction: column; gap: 8px; }
  
  .composer {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary, #1e1e1e);
    min-width: 0;
  }
  
  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-color, #3e3e42);
    background: var(--bg-secondary, #252526);
  }
  
  .composer-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  
  .composer-title h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  
  .badge {
    display: inline-flex;
    padding: 2px 8px;
    background: var(--accent-success, #4ec9b0);
    color: white;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 500;
  }
  
  .composer-actions { display: flex; gap: 8px; }
  
  .composer-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    overflow: auto;
  }
  
  .composer-timeline {
    height: 100px;
    border-top: 1px solid var(--border-color, #3e3e42);
    background: var(--bg-secondary, #252526);
    flex-shrink: 0;
  }
  
  .empty-state {
    text-align: center;
    color: var(--text-muted, #858585);
    max-width: 400px;
  }
  
  .empty-icon {
    font-size: 4rem;
    margin-bottom: 20px;
    opacity: 0.5;
  }
  
  .empty-state h3 {
    margin-bottom: 8px;
    color: var(--text-primary, #d4d4d4);
    font-size: 1.25rem;
  }
  
  .empty-state p {
    margin-bottom: 24px;
  }
  
  .timeline-track {
    display: flex;
    height: 100%;
  }
  
  .track-label {
    width: 80px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid var(--border-color, #3e3e42);
    font-size: 0.75rem;
    color: var(--text-muted, #858585);
    font-weight: 500;
  }
  
  .track-content {
    flex: 1;
    position: relative;
    padding: 10px;
  }
  
  .clip {
    position: absolute;
    height: 40px;
    background: var(--accent-primary, #007acc);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  
  .clip:hover { opacity: 0.8; }
  
  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .tool-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .tool-item:hover { background: var(--bg-hover, #2d2d2d); }
  .tool-item.active { background: var(--accent-primary, #007acc); color: white; }
  
  .tool-item svg { width: 18px; height: 18px; flex-shrink: 0; }
  
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border-color, #3e3e42);
    background: var(--bg-tertiary, #2d2d2d);
    color: var(--text-primary, #d4d4d4);
    transition: all 0.15s ease;
  }
  
  .btn:hover { background: var(--bg-hover, #3e3e42); border-color: var(--border-focus, #5a5d63); }
  
  .btn-primary {
    background: var(--accent-primary, #007acc);
    border-color: var(--accent-primary, #007acc);
    color: white;
  }
  
  .btn-primary:hover {
    background: var(--accent-primary-hover, #1a8adb);
    border-color: var(--accent-primary-hover, #1a8adb);
  }
  
  .btn-icon {
    padding: 6px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--text-secondary, #858585);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }
  
  .btn-icon:hover { background: var(--bg-hover, #2d2d2d); color: var(--text-primary, #d4d4d4); }
  .btn-icon.active { background: var(--accent-primary, #007acc); color: white; }
  
  .btn-block { width: 100%; justify-content: center; }
  
  .btn-ghost {
    background: transparent;
    border: none;
    padding: 6px 12px;
    color: var(--text-secondary, #858585);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }
  
  .btn-ghost:hover { background: var(--bg-hover, #2d2d2d); color: var(--text-primary, #d4d4d4); }
  
  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  
  @media (max-width: 768px) {
    .projects-panel,
    .profile-panel,
    .tools-panel {
      position: absolute;
      z-index: 100;
      height: calc(100% - 52px);
      top: 52px;
    }
    
    .projects-panel { left: 0; }
    .profile-panel, .tools-panel { right: 0; }
  }
</style>
