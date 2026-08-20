<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  
  // Import sub-components
  import GenericModal from './components/GenericModal.svelte';
  import DeleteConfirm from './components/DeleteConfirm.svelte';
  
  const dispatch = createEventDispatcher();
  
  export let userName;
  
  // State management
  let currentScreen = 'idle'; // 'idle' | 'generating' | 'loading' | 'error'
  let currentModal = null; // 'theme' | 'settings' | 'new-project' | 'generate' | 'export' | 'delete-confirm'
  let modalData = {};
  let errorMessage = '';
  let previousScreen = 'idle';
  
  // Screen transitions
  function goToScreen(screen, data = {}) {
    previousScreen = currentScreen;
    currentScreen = screen;
    
    if (screen === 'error') {
      errorMessage = data.message || 'An error occurred';
    }
  }
  
  // Modal handlers
  function openModal(type, data = {}) {
    currentModal = type;
    modalData = data;
  }
  
  function closeModal() {
    currentModal = null;
    modalData = {};
  }
  
  // Actions
  function generateVideo(prompt, settings) {
    currentScreen = 'generating';
    // Simulate generation
    setTimeout(() => {
      currentScreen = 'loading';
      setTimeout(() => {
        currentScreen = 'idle';
        openModal('generate', { success: true });
      }, 2000);
    }, 1000);
  }
  
  function deleteProject(projectId) {
    openModal('delete-confirm', { id: projectId });
  }
  
  function exportProject(projectId) {
    currentScreen = 'loading';
    setTimeout(() => {
      currentScreen = 'idle';
      openModal('export', { success: true });
    }, 1500);
  }
  
  function getModalTitle() {
    const titles = {
      'new-project': 'New Project',
      'generate': 'Generate Video',
      'settings': 'Settings',
      'theme': 'Choose Theme',
      'delete-confirm': 'Confirm Delete',
      'export': 'Export Project'
    };
    return titles[currentModal] || 'Modal';
  }
</script>

<svelte:head>
  <title>Work Screen - VisionMachine</title>
</svelte:head>

<div class="work-screen">
  <!-- Main Content Area -->
  <main class="main-content">
    {#if currentScreen === 'idle'}
      <div class="empty-state">
        <div class="empty-icon">🎬</div>
        <h2>Welcome, {userName}!</h2>
        <p>Select a project or create a new one to start generating videos</p>
        <div class="actions">
          <button class="btn btn-primary" on:click={() => openModal('new-project')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
          <button class="btn" on:click={() => openModal('generate')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate Video
          </button>
        </div>
      </div>
      
    {:else if currentScreen === 'generating'}
      <div class="loading-state">
        <div class="spinner"></div>
        <h3>Generating your video...</h3>
        <p>This may take a moment</p>
      </div>
      
    {:else if currentScreen === 'loading'}
      <div class="loading-state">
        <div class="spinner"></div>
        <h3>Processing...</h3>
      </div>
      
    {:else if currentScreen === 'error'}
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error</h3>
        <p>{errorMessage}</p>
        <button class="btn btn-secondary" on:click={() => goToScreen('idle')}>
          Go Back
        </button>
      </div>
    {/if}
  </main>

  <!-- Modal Overlay -->
  {#if currentModal}
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
          {#if currentModal === 'new-project'}
            <div class="form-group">
              <label>Project Name</label>
              <input type="text" placeholder="Enter project name..." class="input" />
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" on:click={closeModal}>Cancel</button>
              <button class="btn btn-primary" on:click={() => { closeModal(); openModal('generate'); }}>Create</button>
            </div>
          {:else if currentModal === 'generate'}
            <div class="form-group">
              <label>Prompt</label>
              <textarea placeholder="Describe your video..." class="input" rows="4"></textarea>
            </div>
            <div class="form-group">
              <label>Duration (seconds)</label>
              <input type="number" min="3" max="60" value="30" class="input" />
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" on:click={closeModal}>Cancel</button>
              <button class="btn btn-primary" on:click={() => generateVideo()}>Generate</button>
            </div>
          {:else if currentModal === 'settings'}
            <div class="settings-list">
              <div class="setting-item">
                <span>Theme</span>
                <select class="select">
                  <option>JetBrains Dark</option>
                  <option>JetBrains Light</option>
                  <option>Steel Dark</option>
                  <option>Steel Light</option>
                </select>
              </div>
              <div class="setting-item">
                <span>Language</span>
                <select class="select">
                  <option>English</option>
                  <option>Русский</option>
                  <option>Deutsch</option>
                  <option>日本語</option>
                </select>
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" on:click={closeModal}>Save</button>
            </div>
          {:else if currentModal === 'theme'}
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
            <div class="modal-actions">
              <button class="btn btn-primary" on:click={closeModal}>Apply</button>
            </div>
          {:else if currentModal === 'delete-confirm'}
            <DeleteConfirm 
              item={modalData.item || {name: 'this item'}}
              onConfirm={() => { closeModal(); }}
              onCancel={closeModal}
            />
          {:else}
            <GenericModal 
              type={currentModal} 
              data={modalData} 
              onClose={closeModal}
            />
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .work-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  
  .main-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    overflow: auto;
  }
  
  /* Empty State */
  .empty-state {
    text-align: center;
    max-width: 500px;
  }
  
  .empty-icon {
    font-size: 5rem;
    margin-bottom: var(--space-lg);
    opacity: 0.6;
  }
  
  .empty-state h2 {
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }
  
  .empty-state p {
    margin-bottom: var(--space-lg);
    color: var(--text-secondary);
  }
  
  .actions {
    display: flex;
    gap: var(--space-md);
    justify-content: center;
  }
  
  /* Loading State */
  .loading-state {
    text-align: center;
  }
  
  .spinner {
    width: 60px;
    height: 60px;
    border: 4px solid var(--border-color);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto var(--space-lg);
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Error State */
  .error-state {
    text-align: center;
    max-width: 400px;
  }
  
  .error-icon {
    font-size: 4rem;
    margin-bottom: var(--space-md);
  }
  
  /* Modal */
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
  
  .modal-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    margin-top: var(--space-lg);
  }
  
  /* Forms */
  .form-group {
    margin-bottom: var(--space-md);
  }
  
  .form-group label {
    display: block;
    margin-bottom: var(--space-sm);
    font-weight: 500;
    color: var(--text-primary);
  }
  
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
    min-height: 100px;
  }
  
  /* Settings */
  .settings-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) 0;
  }
  
  .setting-item span {
    font-weight: 500;
  }
  
  .setting-item select {
    width: auto;
    min-width: 150px;
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
  }
  
  .theme-option.active {
    border-color: var(--accent-primary);
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
  
  .btn-icon {
    padding: var(--space-sm);
    aspect-ratio: 1;
  }
  
  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .actions {
      flex-direction: column;
    }
    
    .btn {
      width: 100%;
      justify-content: center;
    }
    
    .theme-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
