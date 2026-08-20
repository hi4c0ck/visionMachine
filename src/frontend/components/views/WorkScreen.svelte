<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  export let userName;
  
  // State management
  let currentScreen = 'idle'; // 'idle' | 'generating' | 'loading' | 'error'
  let currentModal = null; // 'theme' | 'settings' | 'new-project' | 'generate' | 'export' | 'delete-confirm'
  let modalData = {};
  let errorMessage = '';
  
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
            <NewProjectForm onSubmit={(data) => { closeModal(); openModal('generate'); }} />
          {:else if currentModal === 'generate'}
            <GenerateForm 
              userName={userName} 
              onSubmit={generateVideo}
              onCancel={closeModal}
            />
          {:else if currentModal === 'settings'}
            <SettingsForm userName={userName} />
          {:else if currentModal === 'theme'}
            <ThemeSelector onClose={closeModal} />
          {:else if currentModal === 'delete-confirm'}
            <DeleteConfirm 
              item={modalData.item}
              onConfirm={() => { closeModal(); /* Handle deletion */ }}
              onCancel={closeModal}
            />
          {:else}
            <GenericModal type={currentModal} data={modalData} onClose={closeModal} />
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
  }
</style>

<!-- Sub-components would be imported here -->
<script context="module">
  import NewProjectForm from './forms/NewProjectForm.svelte';
  import GenerateForm from './forms/GenerateForm.svelte';
  import SettingsForm from './forms/SettingsForm.svelte';
  import ThemeSelector from './components/ThemeSelector.svelte';
  import DeleteConfirm from './components/DeleteConfirm.svelte';
  import GenericModal from './components/GenericModal.svelte';
  
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
