<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  export let userName;
  
  // State Machine Types
  type ScreenState = 
    | { screen: 'idle' }
    | { screen: 'generating'; context: 'project' | 'settings' }
    | { screen: 'loading' }
    | { screen: 'error'; message: string };
  
  type ModalType = 
    | null
    | 'theme'
    | 'settings'
    | 'new-project'
    | 'generate'
    | 'export'
    | 'delete-confirm';
  
  // State machine store
  let currentState: ScreenState = { screen: 'idle' };
  let currentModal: ModalType = null;
  let modalData = {};
  let previousScreen: ScreenState['screen'] = 'idle';
  
  // Layout state
  let layoutMode = 'landscape'; // 'landscape' | 'portrait' | 'single'
  let isTransitioning = false;
  
  // Component visibility (can be toggled)
  let showProjects = true;
  let showProfile = true;
  let showTools = true;
  
  // Drag state for resizing
  let sidebarWidth = 240;
  let toolsWidth = 280;
  let isResizing = false;
  let resizeTarget = null;
  
  // Generate progress
  let generateProgress = 0;
  let generateStatus = '';
  
  // State transitions
  function transitionTo(state: ScreenState, modal?: ModalType) {
    previousScreen = currentState.screen;
    currentState = state;
    if (modal !== undefined) {
      currentModal = modal;
    }
  }
  
  function openModal(modalType: ModalType, data = {}) {
    // Block all actions when modal is open (except closing it)
    if (currentModal !== null) return;
    
    previousScreen = currentState.screen;
    currentModal = modalType;
    modalData = data;
  }
  
  function closeModal() {
    currentModal = null;
    modalData = {};
  }
  
  function startGeneration() {
    if (currentModal !== null) return;
    transitionTo({ screen: 'generating', context: 'project' });
    closeModal();
    
    // Simulate generation process
    simulateGeneration();
  }
  
  function simulateGeneration() {
    generateProgress = 0;
    generateStatus = 'Initializing...';
    
    const steps = [
      { progress: 10, status: 'Analyzing prompt...' },
      { progress: 30, status: 'Generating frames...' },
      { progress: 50, status: 'Applying effects...' },
      { progress: 70, status: 'Rendering video...' },
      { progress: 90, status: 'Finalizing...' },
      { progress: 100, status: 'Complete!' }
    ];
    
    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        generateProgress = steps[stepIndex].progress;
        generateStatus = steps[stepIndex].status;
        stepIndex++;
      } else {
        clearInterval(interval);
        // Return to idle state after completion
        setTimeout(() => {
          transitionTo({ screen: 'idle' });
          dispatch('generation-complete');
        }, 500);
      }
    }, 800);
  }
  
  function handleError(message: string) {
    transitionTo({ screen: 'error', message });
  }
  
  function handleRetry() {
    transitionTo({ screen: 'idle' });
  }
  
  function setLayout(mode: 'landscape' | 'portrait' | 'single') {
    if (currentModal !== null || currentState.screen !== 'idle') return;
    if (isTransitioning) return;
    
    isTransitioning = true;
    layoutMode = mode;
    
    switch(mode) {
      case 'portrait':
        showProjects = true;
        showProfile = true;
        showTools = true;
        break;
      case 'landscape':
        showProjects = true;
        showProfile = false;
        showTools = true;
        break;
      case 'single':
        showProjects = false;
        showProfile = false;
        showTools = false;
        break;
    }
    
    setTimeout(() => { isTransitioning = false; }, 300);
  }
  
  function togglePanel(panel: 'projects' | 'profile' | 'tools') {
    if (currentModal !== null) return;
    
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
  
  // Resize handlers
  function startResize(e: MouseEvent | TouchEvent, target: string) {
    if (currentModal !== null) return;
    isResizing = true;
    resizeTarget = target;
    e.preventDefault();
  }
  
  function handleResize(e: MouseEvent | TouchEvent) {
    if (!isResizing || currentModal !== null) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    
    switch(resizeTarget) {
      case 'projects':
        sidebarWidth = Math.max(180, Math.min(400, clientX));
        break;
      case 'tools':
        toolsWidth = Math.max(200, Math.min(500, window.innerWidth - clientX));
        break;
    }
  }
  
  function stopResize() {
    isResizing = false;
    resizeTarget = null;
  }
  
  // Global event listeners
  import { onMount, onDestroy } from 'svelte';
  
  onMount(() => {
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', handleResize);
    document.addEventListener('touchend', stopResize);
  });
  
  onDestroy(() => {
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', handleResize);
    document.removeEventListener('touchend', stopResize);
  });
  
  // Keyboard handler
  function handleKeydown(e: KeyboardEvent) {
    // Close modal on Escape
    if (e.key === 'Escape' && currentModal !== null) {
      closeModal();
      return;
    }
    
    // Don't handle other keys when modal is open or app is busy
    if (currentModal !== null || currentState.screen !== 'idle') return;
    
    switch(e.key) {
      case 'l':
        setLayout('landscape');
        break;
      case 'p':
        setLayout('portrait');
        break;
      case 's':
        setLayout('single');
        break;
      case 'g':
        openModal('generate');
        break;
      case 't':
        openModal('theme');
        break;
      case 'n':
        openModal('new-project');
        break;
    }
  }
  
  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });
  
  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
  
  // Helper functions
  function getModalTitle(): string {
    const titles: Record<string, string> = {
      'theme': 'Theme Settings',
      'settings': 'Settings',
      'new-project': 'New Project',
      'generate': 'Generate Video',
      'export': 'Export Project',
      'delete-confirm': 'Confirm Delete'
    };
    return titles[currentModal] || 'Modal';
  }
  
  function isActionBlocked(): boolean {
    return currentModal !== null || currentState.screen !== 'idle';
  }
  
  function getBlockingReason(): string | null {
    if (currentModal !== null) {
      return `Modal is open: ${currentModal}`;
    }
    if (currentState.screen === 'generating') {
      return 'Generation in progress';
    }
    if (currentState.screen === 'loading') {
      return 'Loading data';
    }
    if (currentState.screen === 'error') {
      return 'Error state active';
    }
    return null;
  }
</script>

<div class="work-screen" class:idle={currentState.screen === 'idle'} class:generating={currentState.screen === 'generating'} class:loading={currentState.screen === 'loading'} class:error={currentState.screen === 'error'}>
  <!-- Top Frame -->
  <header class="frame">
    <div class="frame-left">
      <button 
        class="btn-icon" 
        onclick={() => setLayout('landscape')} 
        title="Landscape view (L)"
        disabled={isActionBlocked()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>
      <button 
        class="btn-icon" 
        onclick={() => setLayout('portrait')} 
        title="Portrait view (P)"
        disabled={isActionBlocked()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
        </svg>
      </button>
      <button 
        class="btn-icon" 
        onclick={() => setLayout('single')} 
        title="Single panel (S)"
        disabled={isActionBlocked()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
      </button>
    </div>
    
    <div class="frame-center">
      <h1 class="app-title">VisionMachine</h1>
      {#if currentState.screen !== 'idle'}
        <span class="state-indicator">{currentState.screen}</span>
      {/if}
    </div>
    
    <div class="frame-right">
      <button 
        class="btn-ghost" 
        onclick={() => openModal('theme')}
        disabled={isActionBlocked()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a10 10 0 0 1 0 20"/>
        </svg>
        Theme
      </button>
      <button 
        class="btn-ghost" 
        onclick={() => dispatch('logout')} 
        title="Logout"
        disabled={isActionBlocked()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Logout
      </button>
    </div>
  </header>

  <!-- Main Content Area -->
  <main class="content">
    <!-- Projects Sidebar -->
    {#if showProjects}
      <aside class="panel projects-panel" style="width: {sidebarWidth}px">
        <div class="panel-header">
          <span>Projects</span>
          <button 
            class="btn-icon" 
            onclick={() => openModal('new-project')}
            title="New Project (N)"
            disabled={isActionBlocked()}
          >
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
          </div>
        </div>
        <div class="resize-handle" on:mousedown={(e) => startResize(e, 'projects')} ontouchstart={(e) => startResize(e, 'projects')} />
      </aside>
    {/if}

    <!-- Profile Panel -->
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
            <button 
              class="btn-block" 
              onclick={() => openModal('settings')}
              disabled={isActionBlocked()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
            </button>
          </div>
        </div>
      </aside>
    {/if}

    <!-- Composer (Main Workspace) -->
    <section class="composer">
      <div class="composer-header">
        <div class="composer-title">
          <h2>Main Composer</h2>
          <span class="badge" class:idle={currentState.screen === 'idle'} class:busy={currentState.screen !== 'idle'}>
            {currentState.screen === 'idle' ? 'Ready' : currentState.screen}
          </span>
        </div>
        <div class="composer-actions">
          <button 
            class="btn btn-primary"
            onclick={startGeneration}
            disabled={isActionBlocked()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate (G)
          </button>
          <button 
            class="btn btn-secondary"
            onclick={() => openModal('export')}
            disabled={isActionBlocked()}
          >
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
        {#if currentState.screen === 'idle'}
          <div class="empty-state">
            <div class="empty-icon">🎬</div>
            <h3>Start Creating</h3>
            <p>Click "Generate" to create your first AI-powered video</p>
            <button class="btn btn-primary" onclick={() => openModal('generate')}>
              Create Video
            </button>
          </div>
        {:else if currentState.screen === 'generating'}
          <div class="generating-state">
            <div class="spinner"></div>
            <h3>{generateStatus}</h3>
            <div class="progress-bar">
              <div class="progress-fill" style="width: {generateProgress}%"></div>
            </div>
            <p>{generateProgress}% complete</p>
          </div>
        {:else if currentState.screen === 'error'}
          <div class="error-state">
            <div class="error-icon">⚠️</div>
            <h3>Error</h3>
            <p>{currentState.message}</p>
            <button class="btn btn-primary" onclick={handleRetry}>
              Retry
            </button>
          </div>
        {/if}
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

    <!-- Tools Sidebar -->
    {#if showTools}
      <aside class="panel tools-panel" style="width: {toolsWidth}px">
        <div class="panel-header">
          <span>Tools</span>
          <button 
            class="btn-icon" 
            onclick={() => openModal('add-tool')}
            title="Add Tool"
            disabled={isActionBlocked()}
          >
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
          </div>
        </div>
        <div class="resize-handle" on:mousedown={(e) => startResize(e, 'tools')} ontouchstart={(e) => startResize(e, 'tools')} />
      </aside>
    {/if}
  </main>

  <!-- Modal Overlay -->
  {#if currentModal !== null}
    <div class="modal-overlay" transition:fade={{duration: 200}} on:click={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div class="modal" transition:fly={{y: 20, duration: 200}}>
        <div class="modal-header">
          <h3>{getModalTitle()}</h3>
          <button class="btn-icon" onclick={closeModal} title="Close (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          {#if currentModal === 'generate'}
            <div class="form-group">
              <label>Prompt</label>
              <textarea placeholder="Describe your video..."></textarea>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick={startGeneration}>Generate</button>
              <button class="btn" onclick={closeModal}>Cancel</button>
            </div>
          {:else if currentModal === 'settings'}
            <div class="form-group">
              <label>Settings</label>
              <p>Configuration options would go here.</p>
            </div>
          {:else if currentModal === 'new-project'}
            <div class="form-group">
              <label>New Project Name</label>
              <input type="text" placeholder="Enter project name..." />
            </div>
            <div class="form-actions">
              <button class="btn btn-primary">Create</button>
              <button class="btn" onclick={closeModal}>Cancel</button>
            </div>
          {:else}
            <p>Modal content for {currentModal}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- State Indicator (debug) -->
  {#if currentState.screen !== 'idle' || currentModal !== null}
    <div class="state-debug">
      <span>Screen: {currentState.screen}</span>
      {#if currentModal !== null}
        <span>Modal: {currentModal}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .work-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    position: relative;
  }
  
  /* Frame Header */
  .frame {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    min-height: 48px;
    flex-shrink: 0;
  }
  
  .frame-left, .frame-right {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }
  
  .frame-center {
    flex: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  
  .app-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--text-primary);
  }
  
  .state-indicator {
    font-size: 0.625rem;
    padding: 2px 8px;
    background: var(--accent-primary);
    color: white;
    border-radius: var(--radius-full);
    font-weight: 500;
  }
  
  /* Content Area */
  .content {
    display: flex;
    flex: 1;
    overflow: hidden;
    transition: all var(--transition-normal);
  }
  
  .content.idle .profile-panel {
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
  
  .content.single .composer {
    flex: 1;
  }
  
  /* Panels */
  .panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    overflow: hidden;
    transition: all var(--transition-normal);
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
    font-weight: 500;
    flex-shrink: 0;
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
  }
  
  .resize-handle:hover,
  .resize-handle.active {
    background: var(--accent-primary);
  }
  
  .tools-panel .resize-handle {
    left: 0;
    right: auto;
    cursor: col-resize;
  }
  
  /* Composer */
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
    height: 120px;
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
  
  /* Generating State */
  .generating-state {
    text-align: center;
    color: var(--text-primary);
  }
  
  .spinner {
    width: 60px;
    height: 60px;
    border: 4px solid var(--border-color);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto var(--space-md);
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .progress-bar {
    width: 300px;
    height: 8px;
    background: var(--border-color);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin: var(--space-md) auto;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    border-radius: var(--radius-full);
    transition: width 0.3s ease;
  }
  
  /* Error State */
  .error-state {
    text-align: center;
    color: var(--text-primary);
  }
  
  .error-icon {
    font-size: 4rem;
    margin-bottom: var(--space-md);
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
  
  /* Modals */
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
  }
  
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
  }
  
  .form-group {
    margin-bottom: var(--space-md);
  }
  
  .form-group label {
    display: block;
    margin-bottom: var(--space-xs);
    font-weight: 500;
    font-size: 0.875rem;
  }
  
  .form-group textarea,
  .form-group input {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.875rem;
  }
  
  .form-group textarea {
    min-height: 100px;
    resize: vertical;
  }
  
  .form-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    margin-top: var(--space-md);
  }
  
  /* Buttons */
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
  
  .btn:hover:not(:disabled) {
    background: var(--bg-hover);
    border-color: var(--border-focus);
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-primary {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    border-color: var(--accent-primary-hover);
  }
  
  .btn-icon {
    padding: var(--space-sm);
    aspect-ratio: 1;
  }
  
  .btn-block {
    width: 100%;
    justify-content: center;
  }
  
  /* SVG Icons */
  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  
  .frame-center svg {
    width: 20px;
    height: 20px;
  }
  
  /* Tool Items */
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
  
  /* Project Items */
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
  
  /* User Profile */
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
  
  /* Quick Actions */
  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  
  /* Badge */
  .badge {
    display: inline-flex;
    padding: 2px 8px;
    background: var(--accent-success);
    color: white;
    border-radius: var(--radius-full);
    font-size: 0.625rem;
    font-weight: 500;
  }
  
  .badge.busy {
    background: var(--accent-warning);
  }
  
  /* State Debug */
  .state-debug {
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: var(--bg-tertiary);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    font-size: 0.75rem;
    display: flex;
    gap: var(--space-md);
    z-index: 100;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .projects-panel,
    .profile-panel,
    .tools-panel {
      position: absolute;
      z-index: 100;
      height: calc(100% - 48px);
      top: 48px;
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