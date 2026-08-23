<script lang="ts">
  import type { ProjectData, SessionData } from '$types';
  import { APP_CONSTANTS } from '$constants';

  let { projects, selectedProjectId, selectedSessionId, onselectproject, onselectsession, oncreateproject, oncreatesession } = $props();

  let showCreateProjectModal = $state(false);
  let newProjectName = $state('');
  let specifyPath = $state(false);
  let customPath = $state('');

  function openCreateProject() {
    showCreateProjectModal = true;
    newProjectName = '';
    specifyPath = false;
    customPath = '';
  }

  function closeCreateProjectModal() {
    showCreateProjectModal = false;
  }

  function confirmCreateProject() {
    if (!newProjectName.trim()) return;
    
    oncreateproject({
      name: newProjectName.trim(),
      path: specifyPath ? customPath : undefined,
    });
    closeCreateProjectModal();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      confirmCreateProject();
    }
  }
</script>

<div class="projects-panel">
  <div class="panel-header">
    <span class="panel-title">{APP_CONSTANTS.strings.project}</span>
    <button class="add-btn" onclick={openCreateProject} title="Create Project">+</button>
  </div>

  {#if projects.length === 0}
    <div class="empty-state">
      <p>No projects yet</p>
      <button class="btn-create" onclick={openCreateProject}>
        {APP_CONSTANTS.strings.createProject}
      </button>
    </div>
  {:else}
    <div class="projects-list">
      {#each projects as project (project.id)}
        <div 
          class="project-item {selectedProjectId === project.id ? 'selected' : ''}"
          onclick={() => onselectproject(project.id)}
        >
          <span class="project-icon">📁</span>
          <span class="project-name">{project.name}</span>
          <span class="session-count">{project.sessions.length} {APP_CONSTANTS.strings.sessions}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Create Project Modal -->
  {#if showCreateProjectModal}
    <div class="modal-backdrop" onclick={closeCreateProjectModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">Create New Project</span>
          <button class="modal-close" onclick={closeCreateProjectModal}>×</button>
        </div>
        
        <div class="modal-body">
          <label class="form-label">Project Name</label>
          <input 
            type="text" 
            class="modal-input"
            bind:value={newProjectName}
            placeholder="Enter project name..."
            onkeydown={handleKeyDown}
            autofocus
          />
          
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={specifyPath} />
            <span>{APP_CONSTANTS.strings.specifyPath}</span>
          </label>
          
          {#if specifyPath}
            <div class="path-section">
              <label class="form-label">Custom Path</label>
              <input 
                type="text" 
                class="modal-input path-input"
                bind:value={customPath}
                placeholder="C:\Projects\MyProject"
              />
            </div>
          {/if}
        </div>
        
        <div class="modal-footer">
          <button class="btn-cancel" onclick={closeCreateProjectModal}>Cancel</button>
          <button 
            class="btn-confirm" 
            disabled={!newProjectName.trim()}
            onclick={confirmCreateProject}
          >
            {APP_CONSTANTS.strings.create}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Sessions List -->
  {#if selectedProjectId}
    {#each projects as project (project.id)}
      {#if project.id === selectedProjectId}
        <div class="sessions-section">
          <div class="panel-header sessions-header">
            <span class="panel-title">{project.name} / Sessions</span>
            <button class="add-btn" onclick={() => oncreatesession(project.id)} title="Add Session">+</button>
          </div>
          
          <div class="sessions-list">
            {#each project.sessions as session (session.id)}
              <div 
                class="session-item {selectedSessionId === session.id ? 'selected' : ''}"
                onclick={() => onselectsession(session.id)}
              >
                <span class="session-icon">🎬</span>
                <span class="session-name">{session.name}</span>
              </div>
            {/each}
            
            {#if project.sessions.length === 0}
              <div class="empty-state">
                <p>No sessions</p>
                <button class="btn-create" onclick={() => oncreatesession(project.id)}>
                  + Add Session
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .projects-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary, #2A2A2E);
    border-right: 1px solid var(--border-color, #4E525A);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .panel-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #808080);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .add-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: var(--accent-primary, #59B5FF);
    color: #fff;
    border: none;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .add-btn:hover {
    background: var(--accent-primary-hover, #7EC8FF);
  }

  /* Projects List */
  .projects-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: all 0.15s;
  }

  .project-item:hover {
    background: var(--bg-hover, #3A3A3F);
  }

  .project-item.selected {
    background: rgba(89, 181, 255, 0.15);
    border-left: 3px solid var(--accent-primary, #59B5FF);
  }

  .project-icon {
    font-size: 14px;
  }

  .project-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary, #EEEEEE);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-count {
    font-size: 10px;
    color: var(--text-muted, #606060);
  }

  /* Sessions Section */
  .sessions-section {
    border-top: 1px solid var(--border-color, #3A3A3F);
  }

  .sessions-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: all 0.15s;
  }

  .session-item:hover {
    background: var(--bg-hover, #3A3A3F);
  }

  .session-item.selected {
    background: rgba(89, 181, 255, 0.15);
    border-left: 3px solid var(--accent-primary, #59B5FF);
  }

  .session-icon {
    font-size: 14px;
  }

  .session-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary, #EEEEEE);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Empty State */
  .empty-state {
    padding: 20px;
    text-align: center;
  }

  .empty-state p {
    font-size: 12px;
    color: var(--text-muted, #606060);
    margin-bottom: 12px;
  }

  .btn-create {
    padding: 8px 16px;
    background: var(--accent-primary, #59B5FF);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .btn-create:hover {
    background: var(--accent-primary-hover, #7EC8FF);
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
    width: 400px;
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
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-label {
    font-size: 11px;
    color: var(--text-muted, #808080);
    font-weight: 600;
    text-transform: uppercase;
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

  .path-input {
    font-family: monospace;
    font-size: 12px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary, #BFBFBF);
  }

  .path-section {
    margin-top: 8px;
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
