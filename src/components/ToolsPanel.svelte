<script lang="ts">
  import type { SessionData, ProjectData } from '$types';

  let { session, project, ongenerate, onrenamesession, oncreatesession, ondeleteproject } = $props();

  let showModal = $state(false);
  let newSessionName = $state('');

  function openNewSessionModal() {
    newSessionName = '';
    showModal = true;
  }

  function closeNewSessionModal() {
    showModal = false;
  }

  function confirmNewSession() {
    if (!newSessionName.trim()) return;
    if (project) {
      oncreatesession({ projectId: project.id, name: newSessionName.trim() });
    }
    closeNewSessionModal();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      confirmNewSession();
    }
  }
</script>

<div class="tools-panel">
  <!-- Session Preview -->
  <div class="preview-section">
    <div class="section-header">
      <span class="section-title">Preview</span>
    </div>
    <div class="preview-area">
      {#if session}
        <div class="preview-placeholder">
          <div class="preview-icon">🎬</div>
          <p>No preview available</p>
          <p class="hint">Generate your first video to see results here</p>
        </div>
      {:else}
        <div class="preview-empty">
          <div class="preview-icon">🎯</div>
          <p>Select a session to preview</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Session Settings -->
  {#if session}
    <div class="settings-section">
      <div class="section-header">
        <span class="section-title">Settings</span>
        <button class="rename-btn" onclick={() => alert('Rename functionality - implement as needed')} title="Rename session">✏️</button>
      </div>
      
      <div class="setting-item">
        <span class="setting-label">FPS</span>
        <select class="setting-select" value={session.fps} onchange={(e) => console.log('Update FPS:', e.currentTarget.value)}>
          <option value={18}>18 fps</option>
          <option value={24}>24 fps</option>
          <option value={30}>30 fps</option>
          <option value={48}>48 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </div>

      <div class="setting-item">
        <span class="setting-label">Resolution</span>
        <select class="setting-select" value={session.resolution} onchange={(e) => console.log('Update resolution:', e.currentTarget.value)}>
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
      </div>

      <div class="setting-item">
        <span class="setting-label">Orientation</span>
        <select class="setting-select" value={session.orientation} onchange={(e) => console.log('Update orientation:', e.currentTarget.value)}>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>

      <div class="setting-item">
        <span class="setting-label">Quality (Q)</span>
        <input type="range" min="5" max="30" value={session.pipes[0]?.qValue || 18} class="setting-range" />
        <span class="setting-value">{session.pipes[0]?.qValue || 18}</span>
      </div>

      <div class="setting-item">
        <span class="setting-label">Creativity (C)</span>
        <input type="range" min="0.5" max="15" step="0.5" value={session.pipes[0]?.cValue || 7} class="setting-range" />
        <span class="setting-value">{session.pipes[0]?.cValue || 7}</span>
      </div>
    </div>

    <!-- Generate Button -->
    <div class="generate-section">
      <button class="generate-btn" onclick={() => ongenerate(session.id)}>
        <span class="generate-icon">▶</span>
        Generate
      </button>
    </div>
  {/if}

  <!-- Stats -->
  <div class="stats-section">
    <div class="stat-item">
      <span class="stat-value">{project?.sessions.length || 0}</span>
      <span class="stat-label">Sessions</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">{session?.totalGeneratedFrames || 0}</span>
      <span class="stat-label">Frames</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">{project?.totalGenerations || 0}</span>
      <span class="stat-label">Generations</span>
    </div>
  </div>

  <!-- New Session Modal -->
  {#if showModal && project}
    <div class="modal-backdrop" onclick={closeNewSessionModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">Create New Session</span>
          <button class="modal-close" onclick={closeNewSessionModal}>×</button>
        </div>
        
        <div class="modal-body">
          <label class="form-label">Session Name</label>
          <input 
            type="text" 
            class="modal-input"
            bind:value={newSessionName}
            placeholder="Enter session name..."
            onkeydown={handleKeyDown}
            autofocus
          />
        </div>
        
        <div class="modal-footer">
          <button class="btn-cancel" onclick={closeNewSessionModal}>Cancel</button>
          <button 
            class="btn-confirm" 
            disabled={!newSessionName.trim()}
            onclick={confirmNewSession}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .tools-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary, #2A2A2E);
    border-left: 1px solid var(--border-color, #4E525A);
  }

  .preview-section, .settings-section, .generate-section, .stats-section {
    padding: 12px;
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #808080);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .rename-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .rename-btn:hover {
    opacity: 1;
  }

  .preview-area {
    min-height: 180px;
    background: var(--bg-primary, #1A1A1D);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-placeholder, .preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    text-align: center;
  }

  .preview-icon {
    font-size: 40px;
    opacity: 0.5;
  }

  .preview-placeholder p, .preview-empty p {
    font-size: 13px;
    color: var(--text-muted, #808080);
    margin: 0;
  }

  .preview-placeholder .hint {
    font-size: 11px;
    color: var(--text-muted, #606060);
  }

  /* Settings */
  .setting-item {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .setting-label {
    font-size: 11px;
    color: var(--text-muted, #808080);
    min-width: 80px;
  }

  .setting-select {
    flex: 1;
    background: var(--bg-tertiary, #3A3A3F);
    border: 1px solid var(--border-color, #3A3A3F);
    color: var(--text-primary, #EEEEEE);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .setting-range {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--bg-primary, #1A1A1D);
    border-radius: 2px;
    outline: none;
  }

  .setting-range::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary, #59B5FF);
    cursor: pointer;
  }

  .setting-value {
    font-size: 11px;
    color: var(--text-muted, #808080);
    min-width: 30px;
    text-align: right;
    font-family: monospace;
  }

  /* Generate Button */
  .generate-section {
    padding: 16px 12px;
  }

  .generate-btn {
    width: 100%;
    padding: 12px;
    background: var(--accent-primary, #59B5FF);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s;
  }

  .generate-btn:hover {
    background: var(--accent-primary-hover, #7EC8FF);
    transform: translateY(-1px);
  }

  .generate-icon {
    font-size: 16px;
  }

  /* Stats */
  .stats-section {
    display: flex;
    justify-content: space-around;
    padding: 12px;
    background: var(--bg-tertiary, #3A3A3F);
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--accent-primary, #59B5FF);
    font-family: monospace;
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-muted, #606060);
    text-transform: uppercase;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-secondary, #2A2A2E);
    border: 1px solid var(--border-color, #4E525A);
    border-radius: 8px;
    width: 360px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #EEEEEE);
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted, #808080);
    font-size: 20px;
    cursor: pointer;
  }

  .modal-body {
    padding: 14px 16px;
  }

  .form-label {
    font-size: 11px;
    color: var(--text-muted, #808080);
    font-weight: 600;
    text-transform: uppercase;
    display: block;
    margin-bottom: 8px;
  }

  .modal-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-tertiary, #3A3A3F);
    border: 1px solid var(--border-color, #3A3A3F);
    border-radius: 4px;
    color: var(--text-primary, #EEEEEE);
    font-size: 13px;
  }

  .modal-input:focus {
    outline: none;
    border-color: var(--accent-primary, #59B5FF);
  }

  .modal-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border-color, #3A3A3F);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel {
    padding: 8px 18px;
    background: var(--bg-tertiary, #3A3A3F);
    color: var(--text-secondary, #BFBFBF);
    border: 1px solid var(--border-color, #3A3A3F);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-cancel:hover {
    background: var(--bg-hover, #3A3A3F);
  }

  .btn-confirm {
    padding: 8px 18px;
    background: var(--accent-primary, #59B5FF);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-confirm:hover:not(:disabled) {
    background: var(--accent-primary-hover, #7EC8FF);
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
