<script>
  import { createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  export let userName;
  
  // Layout modes
  export let layoutMode = 'landscape'; // 'landscape' | 'portrait' | 'single'
  
  // Panel visibility states
  let showProjects = true;
  let showProfile = false;
  let showTools = true;
  
  // Resize state
  let projectsWidth = 240;
  let toolsWidth = 280;
  let isResizing = false;
  let resizeHandle = null;
  
  // Modal state
  let showModal = false;
  let modalType = '';
  let modalData = {};
  
  // Theme options
  const themes = [
    { id: 'jetbrains-dark', name: 'JetBrains Dark', colors: ['#1e1e2e', '#313244'] },
    { id: 'jetbrains-light', name: 'JetBrains Light', colors: ['#f6f8fa', '#eef0f4'] },
    { id: 'steel-dark', name: 'Steel Dark', colors: ['#1a1d23', '#2a2d35'] },
    { id: 'steel-light', name: 'Steel Light', colors: ['#e8eaf0', '#f5f6f8'] }
  ];
  let currentTheme = localStorage.getItem('vm-theme') || 'jetbrains-dark';
  
  // Language options
  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' }
  ];
  let currentLang = localStorage.getItem('vm-lang') || 'en';
  
  // Load saved preferences
  import { onMount } from 'svelte';
  onMount(() => {
    applyTheme(currentTheme);
  });
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    currentTheme = theme;
  }
  
  function selectLanguage(lang) {
    localStorage.setItem('vm-lang', lang);
    currentLang = lang;
  }
  
  // Layout controls
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
  
  function togglePanel(panel) {
    switch(panel) {
      case 'projects':
        showProjects = !showProjects;
        break;
      case 'profile':
        showProfile = !showProfile;
        break;
      case 'tools':
        showTools = !showTools;
        break;
    }
  }
  
  // Modal controls
  function openModal(type, data = {}) {
    modalType = type;
    modalData = data;
    showModal = true;
  }
  
  function closeModal() {
    showModal = false;
    modalType = '';
    modalData = {};
  }
  
  // Resize handlers
  function startResize(e, handle) {
    isResizing = true;
    resizeHandle = handle;
    e.preventDefault();
  }
  
  function handleMouseMove(e) {
    if (!isResizing) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    
    if (resizeHandle === 'projects') {
      projectsWidth = Math.max(180, Math.min(400, clientX));
    } else if (resizeHandle === 'tools') {
      toolsWidth = Math.max(200, Math.min(500, window.innerWidth - clientX));
    }
  }
  
  function stopResize() {
    isResizing = false;
    resizeHandle = null;
  }
  
  // Global event listeners
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', handleMouseMove);
    document.removeEventListener('touchend', stopResize);
  });
  
  // Actions
  function generateVideo() {
    openModal('generate');
  }
  
  function newProject() {
    openModal('new-project');
  }
  
  function exportProject() {
    openModal('export');
  }
  
  function showSettings() {
    openModal('settings');
  }
  
  function logout() {
    dispatch('logout');
  }
</script>

<div class="app-container">
  <!-- TOP FRAME -->
  <header class="frame">
    <div class="frame-left">
      <div class="logo">
        <span class="logo-icon">🎬</span>
        <span class="logo-text">VisionMachine</span>
      </div>
      
      <div class="layout-controls">
        <button 
          class="btn-icon {layoutMode === 'landscape' ? 'active' : ''}" 
          on:click={() => setLayout('landscape')}
          title="Landscape view"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
        </button>
        <button 
          class="btn-icon {layoutMode === 'portrait' ? 'active' : ''}" 
          on:click={() => setLayout('portrait')}
          title="Portrait view"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
          </svg>
        </button>
        <button 
          class="btn-icon {layoutMode === 'single' ? 'active' : ''}" 
          on:click={() => setLayout('single')}
          title="Single panel"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        </button>
      </div>
    </div>
    
    <div class="frame-center">
      <h1 class="app-title">VisionMachine</h1>
    </div>
    
    <div class="frame-right">
      <!-- Theme Selector -->
      <div class="dropdown">
        <button class="btn btn-ghost" on:click={() => document.getElementById('theme-dropdown').classList.toggle('show')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0 1 0 20"/>
          </svg>
          Theme
        </button>
        <div id="theme-dropdown" class="dropdown-menu">
          {#each themes as theme}
            <button 
              class="dropdown-item {currentTheme === theme.id ? 'active' : ''}"
              on:click={() => applyTheme(theme.id)}
            >
              <div class="theme-preview">
                {#each theme.colors as color}
                  <span class="color-dot" style="background: {color}"></span>
                {/each}
              </div>
              <span>{theme.name}</span>
            </button>
          {/each}
        </div>
      </div>
      
      <!-- Language Selector -->
      <div class="dropdown">
        <button class="btn btn-ghost" on:click={() => document.getElementById('lang-dropdown').classList.toggle('show')}>
          <span class="lang-flag">{languages.find(l => l.code === currentLang)?.flag}</span>
          <span>{languages.find(l => l.code === currentLang)?.name}</span>
        </button>
        <div id="lang-dropdown" class="dropdown-menu">
          {#each languages as lang}
            <button 
              class="dropdown-item {currentLang === lang.code ? 'active' : ''}"
              on:click={() => selectLanguage(lang.code)}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          {/each}
        </div>
      </div>
      
      <button class="btn btn-ghost" on:click={showSettings}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
      </button>
      
      <button class="btn btn-ghost" on:click={logout} title="Logout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Logout
      </button>
    </div>
  </header>

  <!-- MAIN CONTENT AREA -->
  <main class="content" on:mousemove={handleMouseMove} on:mouseup={stopResize} ontouchmove={handleMouseMove} ontouchend={stopResize}>
    
    {/* PROJECTS PANEL */}
    {#if showProjects}
      <aside class="panel projects-panel" style="width: {projectsWidth}px">
        <div class="panel-header">
          <span>Projects</span>
          <button class="btn-icon" on:click={newProject} title="New Project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <div class="panel-content">
          <div class="project-list">
            <div class="project-item active">
              <div class="project-icon">🎬</div>
              <div class="project-info">
                <div class="project-name">My First Video</div>
                <div class="project-meta">Created today</div>
              </div>
            </div>
            <div class="project-item">
              <div class="project-icon">🎥</div>
              <div class="project-info">
                <div class="project-name">Product Demo</div>
                <div class="project-meta">2 days ago</div>
              </div>
            </div>
            <div class="project-item">
              <div class="project-icon">🎞️</div>
              <div class="project-info">
                <div class="project-name">Tutorial Series</div>
                <div class="project-meta">1 week ago</div>
              </div>
            </div>
          </div>
        </div>
        <div class="resize-handle" on:mousedown={(e) => startResize(e, 'projects')} ontouchstart={(e) => startResize(e, 'projects')} />
      </aside>
    {/if}

    {/* PROFILE PANEL */}
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
          <div class="quick-actions">
            <button class="btn-block" on:click={showSettings}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
            <button class="btn-block" on:click={() => openModal('credits')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v2m0 8v2"/>
                <path d="M8 10h8M8 14h8"/>
              </svg>
              Credits: 150
            </button>
          </div>
        </div>
      </aside>
    {/if}

    {/* COMPOSER (MAIN WORKSPACE) */}
    <section class="composer">
      <div class="composer-header">
        <div class="composer-title">
          <h2>Main Composer</h2>
          <span class="badge">Active Project</span>
        </div>
        <div class="composer-actions">
          <button class="btn" on:click={generateVideo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate
          </button>
          <button class="btn btn-secondary" on:click={exportProject}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
        </div>
      </div>
      
      <div class="composer-canvas">
        <div class="empty-state">
          <div class="empty-icon">🎬</div>
          <h3>Ready to Create</h3>
          <p>Click "Generate" to create your first AI-powered video</p>
          <button class="btn btn-primary" on:click={generateVideo}>
            Create Video
          </button>
        </div>
      </div>
      
      <div class="composer-timeline">
        <div class="timeline-track">
          <div class="track-label">Timeline</div>
          <div class="track-content">
            <div class="clip" style="left: 0%; width: 33%">
              <span>Shot 1</span>
            </div>
            <div class="clip" style="left: 33%; width: 33%">
              <span>Shot 2</span>
            </div>
            <div class="clip" style="left: 66%; width: 33%">
              <span>Shot 3</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* TOOLS PANEL */}
    {#if showTools}
      <aside class="panel tools-panel" style="width: {toolsWidth}px">
        <div class="panel-header">
          <span>Tools</span>
          <button class="btn-icon" title="Add Tool">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <div class="panel-content">
          <div class="tool-group">
            <div class="tool-item active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              <span>Generator</span>
            </div>
            <div class="tool-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-5-5L5 21"/>
              </svg>
              <span>Image</span>
            </div>
            <div class="tool-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span>Edit</span>
            </div>
            <div class="tool-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              <span>3D</span>
            </div>
          </div>
        </div>
        <div class="resize-handle" on:mousedown={(e) => startResize(e, 'tools')} ontouchstart={(e) => startResize(e, 'tools')} />
      </aside>
    {/if}
  </main>

  {/* MODAL OVERLAY */}
  {#if showModal}
    <div class="modal-overlay" on:click={closeModal} transition:fade={{duration: 200}}>
      <div class="modal" on:click={(e) => e.stopPropagation()} transition:fly={{y: 20, duration: 200}}>
        <div class="modal-header">
          <h3>{getModalTitle()}</h3>
          <button class="btn-icon" on:click={closeModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          {#if modalType === 'generate'}
            <div class="form-group">
              <label>Prompt</label>
              <textarea placeholder="Describe your video..." class="input" rows="4"></textarea>
            </div>
            <div class="form-group">
              <label>Duration (seconds)</label>
              <input type="number" min="3" max="60" value="30" class="input" />
            </div>
            <div class="form-group">
              <label>Style</label>
              <select class="input">
                <option>Cinematic</option>
                <option>Anime</option>
                <option>Realistic</option>
                <option>Artistic</option>
              </select>
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" on:click={closeModal}>Cancel</button>
              <button class="btn btn-primary" on:click={() => { closeModal(); generateVideo(); }}>Generate</button>
            </div>
          {:else if modalType === 'new-project'}
            <div class="form-group">
              <label>Project Name</label>
              <input type="text" placeholder="Enter project name..." class="input" />
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" on:click={closeModal}>Cancel</button>
              <button class="btn btn-primary" on:click={closeModal}>Create</button>
            </div>
          {:else if modalType === 'settings'}
            <div class="settings-grid">
              <div class="setting-item">
                <span>Theme</span>
                <select class="select" on:change={(e) => applyTheme(e.target.value)}>
                  {#each themes as theme}
                    <option value={theme.id} selected={currentTheme === theme.id}>{theme.name}</option>
                  {/each}
                </select>
              </div>
              <div class="setting-item">
                <span>Language</span>
                <select class="select" on:change={(e) => selectLanguage(e.target.value)}>
                  {#each languages as lang}
                    <option value={lang.code} selected={currentLang === lang.code}>{lang.name}</option>
                  {/each}
                </select>
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" on:click={closeModal}>Save</button>
            </div>
          {:else}
            <p>Modal content for {modalType}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ==================== ROOT LAYOUT ==================== */
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg-primary);
  }
  
  /* ==================== FRAME (HEADER) ==================== */
  .frame {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    min-height: 52px;
    flex-shrink: 0;
    z-index: 100;
  }
  
  .frame-left {
    display: flex;
    align-items: center;
    gap: var(--space-lg);
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .logo-icon {
    font-size: 1.5rem;
  }
  
  .logo-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .layout-controls {
    display: flex;
    gap: var(--space-xs);
    padding: var(--space-xs);
    background: var(--bg-tertiary);
    border-radius: var(--radius-md);
  }
  
  .frame-center {
    flex: 1;
    text-align: center;
  }
  
  .app-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted);
    margin: 0;
  }
  
  .frame-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  /* ==================== DROPDOWNS ==================== */
  .dropdown {
    position: relative;
  }
  
  .dropdown-menu {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: var(--surface-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
  }
  
  .dropdown.show .dropdown-menu {
    display: block;
  }
  
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md);
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    transition: background var(--transition-fast);
    text-align: left;
  }
  
  .dropdown-item:hover {
    background: var(--bg-hover);
  }
  
  .dropdown-item.active {
    background: var(--bg-tertiary);
    color: var(--accent-primary);
  }
  
  .theme-preview {
    display: flex;
    gap: 2px;
  }
  
  .color-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border-color);
  }
  
  /* ==================== MAIN CONTENT ==================== */
  .content {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  
  /* ==================== PANELS ==================== */
  .panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    overflow: hidden;
    transition: all var(--transition-normal);
    position: relative;
  }
  
  .tools-panel {
    border-right: none;
    border-left: 1px solid var(--border-color);
  }
  
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--border-color);
    font-weight: 600;
    font-size: 0.875rem;
    flex-shrink: 0;
    background: var(--bg-tertiary);
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm);
  }
  
  /* Resize Handles */
  .resize-handle {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    background: transparent;
    transition: background var(--transition-fast);
    z-index: 10;
  }
  
  .resize-handle:hover,
  .resize-handle.active {
    background: var(--accent-primary);
  }
  
  .tools-panel .resize-handle {
    left: 0;
    right: auto;
  }
  
  /* ==================== PROJECTS PANEL ==================== */
  .projects-panel {
    width: 240px;
    min-width: 180px;
    max-width: 400px;
  }
  
  .project-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  
  .project-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  
  .project-item:hover {
    background: var(--bg-hover);
  }
  
  .project-item.active {
    background: var(--accent-primary);
    color: white;
  }
  
  .project-icon {
    font-size: 1.25rem;
  }
  
  .project-info {
    flex: 1;
    min-width: 0;
  }
  
  .project-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .project-meta {
    font-size: 0.75rem;
    opacity: 0.7;
  }
  
  /* ==================== PROFILE PANEL ==================== */
  .profile-panel {
    width: 220px;
  }
  
  .user-profile {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    margin-bottom: var(--space-md);
  }
  
  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--accent-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 600;
    color: white;
    flex-shrink: 0;
  }
  
  .user-info {
    flex: 1;
    min-width: 0;
  }
  
  .user-name {
    font-weight: 600;
    font-size: 1rem;
  }
  
  .user-role {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  
  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  
  /* ==================== COMPOSER ==================== */
  .composer {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
    min-width: 0;
  }
  
  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
  }
  
  .composer-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .composer-title h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  
  .badge {
    display: inline-flex;
    padding: 2px 8px;
    background: var(--accent-success);
    color: white;
    border-radius: var(--radius-full);
    font-size: 0.625rem;
    font-weight: 500;
  }
  
  .composer-actions {
    display: flex;
    gap: var(--space-sm);
  }
  
  .composer-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    overflow: auto;
  }
  
  .composer-timeline {
    height: 100px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }
  
  /* Empty State */
  .empty-state {
    text-align: center;
    color: var(--text-muted);
  }
  
  .empty-icon {
    font-size: 4rem;
    margin-bottom: var(--space-md);
    opacity: 0.5;
  }
  
  .empty-state h3 {
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }
  
  .empty-state p {
    margin-bottom: var(--space-lg);
  }
  
  /* Timeline */
  .timeline-track {
    display: flex;
    height: 100%;
  }
  
  .track-label {
    width: 80px;
    padding: var(--space-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid var(--border-color);
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
  }
  
  .track-content {
    flex: 1;
    position: relative;
    padding: var(--space-sm);
  }
  
  .clip {
    position: absolute;
    height: 40px;
    background: var(--accent-primary);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }
  
  .clip:hover {
    opacity: 0.8;
  }
  
  /* ==================== TOOLS PANEL ==================== */
  .tools-panel {
    width: 280px;
    min-width: 200px;
    max-width: 500px;
  }
  
  .tool-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  
  .tool-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  
  .tool-item:hover {
    background: var(--bg-hover);
  }
  
  .tool-item.active {
    background: var(--accent-primary);
    color: white;
  }
  
  .tool-item svg {
    width: 18px;
    height: 18px;
  }
  
  /* ==================== BUTTONS ==================== */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border-color);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    transition: all var(--transition-fast);
  }
  
  .btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-focus);
  }
  
  .btn-primary {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }
  
  .btn-primary:hover {
    background: var(--accent-primary-hover);
    border-color: var(--accent-primary-hover);
  }
  
  .btn-secondary {
    background: transparent;
  }
  
  .btn-icon {
    padding: var(--space-sm);
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .btn-block {
    width: 100%;
    justify-content: center;
  }
  
  .btn-ghost {
    background: transparent;
    border: none;
  }
  
  .btn-ghost:hover {
    background: var(--bg-hover);
  }
  
  /* ==================== INPUTS ==================== */
  .input, .select {
    width: 100%;
    padding: var(--space-sm);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .input:focus, .select:focus {
    outline: none;
    border-color: var(--accent-primary);
  }
  
  textarea.input {
    resize: vertical;
    min-height: 80px;
  }
  
  /* ==================== FORMS ==================== */
  .form-group {
    margin-bottom: var(--space-md);
  }
  
  .form-group label {
    display: block;
    margin-bottom: var(--space-sm);
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }
  
  .modal-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    margin-top: var(--space-lg);
  }
  
  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .setting-item span {
    font-weight: 500;
  }
  
  .setting-item select {
    width: auto;
    min-width: 150px;
  }
  
  /* ==================== MODALS ==================== */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-xl);
  }
  
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    border-bottom: 1px solid var(--border-color);
  }
  
  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }
  
  /* ==================== UTILITIES ==================== */
  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  
  .btn-icon svg {
    width: 18px;
    height: 18px;
  }
  
  /* Layout mode adjustments */
  .content.landscape .profile-panel {
    display: none;
  }
  
  .content.portrait .projects-panel {
    width: 60px !important;
  }
  
  .content.single .projects-panel,
  .content.single .profile-panel,
  .content.single .tools-panel {
    display: none;
  }
  
  /* ==================== RESPONSIVE ==================== */
  @media (max-width: 768px) {
    .projects-panel,
    .profile-panel,
    .tools-panel {
      position: absolute;
      z-index: 100;
      height: calc(100% - 52px);
      top: 52px;
    }
    
    .projects-panel {
      left: 0;
    }
    
    .profile-panel {
      right: 0;
    }
    
    .tools-panel {
      right: 0;
    }
  }
</style>

<script context="module">
  // Helper functions for modal titles
  export function getModalTitle() {
    const titles = {
      'generate': 'Generate Video',
      'new-project': 'New Project',
      'settings': 'Settings',
      'credits': 'Credits',
      'export': 'Export Project'
    };
    return titles[modalType] || 'Modal';
  }
</script>
