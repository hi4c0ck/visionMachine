<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  export let userName;
  
  // ============================================================
  // STATE MACHINE TYPES
  // ============================================================
  
  type ScreenState = 
    | { screen: 'idle' }
    | { screen: 'generating'; context: 'dashboard' | 'project' | 'camera' }
    | { screen: 'loading'; source?: string }
    | { screen: 'error'; message: string; previousScreen: ScreenState['screen'] }
    | { screen: 'camera-active' }
    | { screen: 'settings-open' };
  
  type ModalType = 
    | null
    | 'theme'
    | 'settings'
    | 'new-project'
    | 'generate'
    | 'export'
    | 'delete-confirm'
    | 'project-details'
    | 'crop-tool';
  
  // ============================================================
  // STATE STORE (reactive)
  // ============================================================
  
  let state: {
    screen: ScreenState;
    modal: ModalType;
    previousScreen: ScreenState;
    modalData: Record<string, any>;
  } = $state({
    screen: { screen: 'idle' },
    modal: null,
    previousScreen: { screen: 'idle' },
    modalData: {}
  });
  
  // Generation progress
  let generateProgress = 0;
  let generateStep = '';
  
  // Layout state
  let layoutMode = 'landscape' as 'landscape' | 'portrait' | 'single';
  let isTransitioning = false;
  
  // Panel visibility
  let showProjects = true;
  let showProfile = true;
  let showTools = true;
  
  // Resize state
  let sidebarWidth = 240;
  let toolsWidth = 280;
  let isResizing = false;
  let resizeTarget: string | null = null;
  
  // ============================================================
  // STATE MACHINE TRANSITIONS
  // ============================================================
  
  /**
   * Transition to a new screen state, recording previous for back navigation
   */
  function transitionTo(newScreen: ScreenState): void {
    state.previousScreen = state.screen;
    state.screen = newScreen;
  }
  
  /**
   * Open a modal (blocks all underlying interactions)
   */
  function openModal(modalType: ModalType, data: Record<string, any> = {}): void {
    if (state.modal !== null) return; // Block: modal already open
    state.previousScreen = state.screen;
    state.modal = modalType;
    state.modalData = data;
  }
  
  /**
   * Close modal and restore previous screen
   */
  function closeModal(): void {
    if (state.modal === null) return;
    state.modal = null;
    state.modalData = {};
  }
  
  /**
   * Start video generation
   */
  function startGeneration(context: 'dashboard' | 'project' | 'camera' = 'project'): void {
    if (isActionBlocked()) return;
    
    closeModals();
    transitionTo({ screen: 'generating', context });
    simulateGeneration();
  }
  
  /**
   * Simulate generation process with progress
   */
  function simulateGeneration(): void {
    generateProgress = 0;
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
        generateStep = steps[stepIndex].status;
        stepIndex++;
      } else {
        clearInterval(interval);
        // Return to idle after completion
        setTimeout(() => {
          transitionTo({ screen: 'idle' });
          dispatch('generation-complete');
        }, 500);
      }
    }, 800);
  }
  
  /**
   * Handle generation error
   */
  function handleError(message: string): void {
    transitionTo({ screen: 'error', message, previousScreen: state.screen });
  }
  
  /**
   * Retry from error state
   */
  function handleRetry(): void {
    const prevScreen = state.screen;
    if ('previousScreen' in prevScreen) {
      transitionTo(prevScreen.previousScreen);
    } else {
      transitionTo({ screen: 'idle' });
    }
  }
  
  /**
   * Start camera capture
   */
  function startCamera(): void {
    if (isActionBlocked()) return;
    closeModals();
    transitionTo({ screen: 'camera-active' });
  }
  
  /**
   * Stop camera
   */
  function stopCamera(): void {
    transitionTo({ screen: 'idle' });
  }
  
  /**
   * Open settings
   */
  function openSettings(): void {
    if (isActionBlocked()) return;
    closeModals();
    transitionTo({ screen: 'settings-open' });
  }
  
  /**
   * Close settings (return to previous)
   */
  function closeSettings(): void {
    if (state.screen.screen === 'settings-open') {
      transitionTo(state.previousScreen);
    }
  }
  
  /**
   * Change layout mode
   */
  function setLayout(mode: 'landscape' | 'portrait' | 'single'): void {
    if (isActionBlocked() || isTransitioning) return;
    
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
  
  /**
   * Toggle panel visibility
   */
  function togglePanel(panel: 'projects' | 'profile' | 'tools'): void {
    if (isActionBlocked()) return;
    
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
  
  /**
   * Close all modals without restoring state
   */
  function closeModals(): void {
    state.modal = null;
    state.modalData = {};
  }
  
  /**
   * Check if any action should be blocked
   */
  function isActionBlocked(): boolean {
    return state.modal !== null || 
           state.screen.screen === 'generating' || 
           state.screen.screen === 'loading';
  }
  
  /**
   * Get current blocking reason (for debugging)
   */
  function getBlockingReason(): string | null {
    if (state.modal !== null) {
      return `Modal is open: ${state.modal}`;
    }
    if (state.screen.screen === 'generating') {
      return 'Generation in progress';
    }
    if (state.screen.screen === 'loading') {
      return 'Loading data';
    }
    return null;
  }
  
  // ============================================================
  // EVENT HANDLERS
  // ============================================================
  
  function handleResize(e: MouseEvent | TouchEvent): void {
    if (!isResizing || isActionBlocked()) return;
    
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
  
  function stopResize(): void {
    isResizing = false;
    resizeTarget = null;
  }
  
  function handleKeydown(e: KeyboardEvent): void {
    // Layer 1: Modal handlers (highest priority)
    if (state.modal !== null) {
      if (e.key === 'Escape') {
        closeModal();
        e.preventDefault();
        return;
      }
      // Don't pass through to screen handlers when modal is open
      return;
    }
    
    // Layer 2: Screen-specific handlers
    switch(e.key.toLowerCase()) {
      case 'escape':
        if (state.screen.screen === 'settings-open') {
          closeSettings();
        } else if (state.screen.screen === 'camera-active') {
          stopCamera();
        }
        break;
        
      case 'l':
        if (state.screen.screen === 'idle') setLayout('landscape');
        break;
      case 'p':
        if (state.screen.screen === 'idle') setLayout('portrait');
        break;
      case 's':
        if (state.screen.screen === 'idle') setLayout('single');
        break;
        
      case 'g':
        if (state.screen.screen === 'idle') openModal('generate');
        break;
      case 't':
        if (state.screen.screen === 'idle') openModal('theme');
        break;
      case 'n':
        if (state.screen.screen === 'idle') openModal('new-project');
        break;
      case 'c':
        if (state.screen.screen === 'idle') startCamera();
        break;
      case 'h':
        if (state.screen.screen === 'idle') openSettings();
        break;
    }
  }
  
  // ============================================================
  // LIFECYCLE
  // ============================================================
  
  import { onMount, onDestroy } from 'svelte';
  
  onMount(() => {
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', handleResize);
    document.addEventListener('touchend', stopResize);
    document.addEventListener('keydown', handleKeydown);
  });
  
  onDestroy(() => {
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', handleResize);
    document.removeEventListener('touchend', stopResize);
    document.removeEventListener('keydown', handleKeydown);
  });
  
  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  
  function getModalTitle(): string {
    const titles: Record<string, string> = {
      'theme': 'Theme Settings',
      'settings': 'Application Settings',
      'new-project': 'New Project',
      'generate': 'Generate Video',
      'export': 'Export Project',
      'delete-confirm': 'Confirm Delete',
      'project-details': 'Project Details',
      'crop-tool': 'Crop Tool'
    };
    return titles[state.modal] || 'Modal';
  }
  
  function getStatusBadgeText(): string {
    switch(state.screen.screen) {
      case 'idle': return 'Ready';
      case 'generating': return 'Generating';
      case 'loading': return 'Loading';
      case 'error': return 'Error';
      case 'camera-active': return 'Recording';
      case 'settings-open': return 'Settings';
      default: return 'Idle';
    }
  }
  
  function getStatusBadgeClass(): string {
    switch(state.screen.screen) {
      case 'idle': return 'badge-ready';
      case 'generating': return 'badge-generating';
      case 'loading': return 'badge-loading';
      case 'error': return 'badge-error';
      case 'camera-active': return 'badge-recording';
      case 'settings-open': return 'badge-settings';
      default: return '';
    }
  }
</script>

<div class="work-screen" class:idle={state.screen.screen === 'idle'} 
     class:generating={state.screen.screen === 'generating'}
     class:error={state.screen.screen === 'error'}
     class:modal-open={state.modal !== null}>
  
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
      <span class="state-indicator {getStatusBadgeClass()}">{getStatusBadgeText()}</span>
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
        onclick={() => openSettings()}
        disabled={isActionBlocked()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
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
        <div class="resize-handle" on:mousedown={(e) => { isResizing = true; resizeTarget = 'projects'; e.preventDefault(); }} ontouchstart={(e) => { isResizing = true; resizeTarget = 'projects'; e.preventDefault(); }} />
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

    <!-- Composer / Active View -->
    <section class="composer">
      <div class="composer-header">
        <div class="composer-title">
          <h2>
            {#if state.screen.screen === 'camera-active'}
              Camera Capture
            {:else}
              Main Composer
            {/if}
          </h2>
          <span class="badge {getStatusBadgeClass()}">{getStatusBadgeText()}</span>
        </div>
        <div class="composer-actions">
          <button 
            class="btn btn-primary"
            onclick={() => startGeneration()}
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
          <button 
            class="btn btn-secondary"
            onclick={() => startCamera()}
            disabled={isActionBlocked()}
            title="Open Camera (C)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Camera
          </button>
        </div>
      </div>
      
      <div class="composer-canvas">
        {#if state.screen.screen === 'idle'}
          <div class="empty-state">
            <div class="empty-icon">🎬</div>
            <h3>Start Creating</h3>
            <p>Click "Generate" to create your first AI-powered video</p>
            <div class="shortcut-hints">
              <kbd>G</kbd> Generate &nbsp;
              <kbd>C</kbd> Camera &nbsp;
              <kbd>N</kbd> New Project &nbsp;
              <kbd>T</kbd> Theme
            </div>
            <button class="btn btn-primary" onclick={() => openModal('generate')}>
              Create Video
            </button>
          </div>
          
        {:else if state.screen.screen === 'generating'}
          <div class="generating-state">
            <div class="spinner"></div>
            <h3>{generateStep}</h3>
            <div class="progress-bar">
              <div class="progress-fill" style="width: {generateProgress}%"></div>
            </div>
            <p>{generateProgress}% complete</p>
          </div>
          
        {:else if state.screen.screen === 'error'}
          <div class="error-state">
            <div class="error-icon">⚠️</div>
            <h3>Error</h3>
            <p>{state.screen.message}</p>
            <button class="btn btn-primary" onclick={handleRetry}>
              Try Again
            </button>
          </div>
          
        {:else if state.screen.screen === 'camera-active'}
          <div class="camera-view">
            <video autoplay muted playsinline class="video-feed">
              Your browser does not support video capture.
            </video>
            <div class="camera-overlay">
              <div class="recording-indicator">
                <span class="rec-dot"></span>
                <span>REC</span>
              </div>
            </div>
            <button class="btn btn-danger" onclick={stopCamera}>
              Stop Recording
            </button>
          </div>
          
        {:else if state.screen.screen === 'settings-open'}
          <div class="settings-view">
            <h3>Application Settings</h3>
            <p>Configure your preferences here.</p>
            <button class="btn btn-primary" onclick={closeSettings}>
              Save & Close
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
            onclick={() => openModal('crop-tool')}
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
        <div class="resize-handle" on:mousedown={(e) => { isResizing = true; resizeTarget = 'tools'; e.preventDefault(); }} ontouchstart={(e) => { isResizing = true; resizeTarget = 'tools'; e.preventDefault(); }} />
      </aside>
    {/if}
  </main>

  <!-- Modal Overlay (blocks all underlying interactions) -->
  {#if state.modal !== null}
    <div 
      class="modal-overlay" 
      transition:fade={{duration: 200}}
      on:click={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      <div 
        class="modal" 
        transition:fly={{y: 20, duration: 200}}
        on:click={(e) => e.stopPropagation()}
      >
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
          {#if state.modal === 'generate'}
            <div class="form-group">
              <label>Prompt</label>
              <textarea placeholder="Describe your video..." rows="4"></textarea>
            </div>
            <div class="form-group">
              <label>Duration (seconds)</label>
              <input type="number" min="3" max="60" value="30" />
            </div>
            <div class="form-actions">
              <button class="btn" onclick={closeModal}>Cancel</button>
              <button class="btn btn-primary" onclick={() => startGeneration()}>Generate</button>
            </div>
          {:else if state.modal === 'settings'}
            <div class="settings-form">
              <div class="form-group">
                <label>Theme</label>
                <select>
                  <option>JetBrains Dark</option>
                  <option>JetBrains Light</option>
                  <option>Steel Dark</option>
                  <option>Steel Light</option>
                </select>
              </div>
              <div class="form-group">
                <label>Language</label>
                <select>
                  <option>English</option>
                  <option>Русский</option>
                  <option>Deutsch</option>
                  <option>日本語</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick={closeModal}>Save</button>
            </div>
          {:else if state.modal === 'new-project'}
            <div class="form-group">
              <label>Project Name</label>
              <input type="text" placeholder="Enter project name..." />
            </div>
            <div class="form-actions">
              <button class="btn" onclick={closeModal}>Cancel</button>
              <button class="btn btn-primary" onclick={() => { closeModal(); openModal('generate'); }}>Create</button>
            </div>
          {:else if state.modal === 'theme'}
            <div class="theme-grid">
              <div class="theme-option active" style="background: linear-gradient(135deg, #1e1e2e, #313244)">
                <span>JetBrains Dark</span>
              </div>
              <div class="theme-option" style="background: linear-gradient(135deg, #f6f8fa, #eef0f4)">
                <span>JetBrains Light</span>
              </div>
              <div class="theme-option" style="background: linear-gradient(135deg, #1a1d23, #2a2d35)">
                <span>Steel Dark</span>
              </div>
              <div class="theme-option" style="background: linear-gradient(135deg, #e8eaf0, #f5f6f8)">
                <span>Steel Light</span>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick={closeModal}>Apply</button>
            </div>
          {:else if state.modal === 'delete-confirm'}
            <div class="confirm-message">
              <p>Are you sure you want to delete this item?</p>
              <p class="warning">This action cannot be undone.</p>
            </div>
            <div class="form-actions">
              <button class="btn" onclick={closeModal}>Cancel</button>
              <button class="btn btn-danger" onclick={closeModal}>Delete</button>
            </div>
          {:else if state.modal === 'export'}
            <div class="form-group">
              <label>Export Format</label>
              <select>
                <option>MP4 (H.264)</option>
                <option>MOV (ProRes)</option>
                <option>WebM</option>
              </select>
            </div>
            <div class="form-actions">
              <button class="btn" onclick={closeModal}>Cancel</button>
              <button class="btn btn-primary" onclick={() => { closeModal(); startGeneration('dashboard'); }}>Export</button>
            </div>
          {:else}
            <p>Modal content for {state.modal}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- State Debug (development only) -->
  {#if import.meta.env.DEV && (state.modal !== null || state.screen.screen !== 'idle')}
    <div class="state-debug">
      <span>Screen: {state.screen.screen}</span>
      {#if 'context' in state.screen}
        <span>Context: {state.screen.context}</span>
      {/if}
      {#if state.modal !== null}
        <span>Modal: {state.modal}</span>
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
    z-index: 10;
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
  
  /* State Indicator */
  .state-indicator {
    font-size: 0.625rem;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-weight: 500;
  }
  
  .badge-ready { background: var(--accent-success); color: white; }
  .badge-generating { background: var(--accent-warning); color: white; animation: pulse 1.5s infinite; }
  .badge-loading { background: var(--accent-info); color: white; }
  .badge-error { background: var(--accent-error); color: white; }
  .badge-recording { background: var(--accent-error); color: white; animation: pulse 1s infinite; }
  .badge-settings { background: var(--accent-primary); color: white; }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  
  /* Content Area */
  .content {
    display: flex;
    flex: 1;
    overflow: hidden;
    transition: all var(--transition-normal);
    position: relative;
  }
  
  /* Panels */
  .panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    overflow: hidden;
    transition: all var(--transition-normal);
    z-index: 5;
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
    position: relative;
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
    max-width: 500px;
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
  
  .shortcut-hints {
    margin-bottom: var(--space-md);
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  
  .shortcut-hints kbd {
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    font-family: monospace;
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
    max-width: 400px;
  }
  
  .error-icon {
    font-size: 4rem;
    margin-bottom: var(--space-md);
  }
  
  /* Camera View */
  .camera-view {
    position: relative;
    width: 100%;
    max-width: 640px;
  }
  
  .video-feed {
    width: 100%;
    border-radius: var(--radius-lg);
    background: var(--bg-tertiary);
  }
  
  .camera-overlay {
    position: absolute;
    top: 16px;
    right: 16px;
  }
  
  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.7);
    padding: 8px 12px;
    border-radius: var(--radius-md);
    color: white;
    font-weight: 500;
  }
  
  .rec-dot {
    width: 10px;
    height: 10px;
    background: var(--accent-error);
    border-radius: 50%;
    animation: pulse 1s infinite;
  }
  
  /* Settings View */
  .settings-view {
    text-align: center;
    max-width: 400px;
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
  
  /* Modal Overlay (blocks all underlying interactions) */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
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
    color: var(--text-primary);
  }
  
  .form-group input,
  .form-group textarea,
  .form-group select {
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
  
  .confirm-message {
    text-align: center;
    padding: var(--space-md);
  }
  
  .confirm-message .warning {
    color: var(--accent-error);
    font-size: 0.875rem;
    margin-top: var(--space-sm);
  }
  
  /* Theme Grid */
  .theme-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }
  
  .theme-option {
    padding: var(--space-md);
    border-radius: var(--radius-md);
    cursor: pointer;
    border: 2px solid transparent;
    text-align: center;
    color: white;
    font-weight: 500;
    transition: all var(--transition-fast);
  }
  
  .theme-option:hover {
    border-color: var(--accent-primary);
  }
  
  .theme-option.active {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(var(--accent-primary-rgb), 0.2);
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
  
  .btn-secondary {
    background: var(--bg-tertiary);
    border-color: var(--border-color);
    color: var(--text-primary);
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  
  .btn-danger {
    background: var(--accent-error);
    border-color: var(--accent-error);
    color: white;
  }
  
  .btn-danger:hover:not(:disabled) {
    background: var(--accent-error-hover);
  }
  
  .btn-icon {
    padding: var(--space-sm);
    aspect-ratio: 1;
  }
  
  .btn-block {
    width: 100%;
    justify-content: center;
  }
  
  .btn-ghost {
    background: transparent;
    border: none;
    color: var(--text-secondary);
  }
  
  .btn-ghost:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
  
  /* SVG Icons */
  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
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
  
  /* State Debug (dev only) */
  .state-debug {
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: var(--bg-tertiary);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    font-size: 0.625rem;
    display: flex;
    gap: var(--space-md);
    z-index: 2000;
    border: 1px solid var(--border-color);
    font-family: monospace;
  }
  
  /* Responsive */
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
    
    .profile-panel,
    .tools-panel {
      right: 0;
    }
    
    .theme-grid {
      grid-template-columns: 1fr;
    }
  }
</style>