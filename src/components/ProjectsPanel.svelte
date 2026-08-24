<script lang="ts">
  import type { ProjectData, SessionData } from '$types';
  import { APP_CONSTANTS } from '$constants';

  let { 
    projects, 
    selectedProjectId, 
    selectedSessionId,
    onselectproject,
    onselectsession,
    oncreateproject,
    ondeleteproject,
    oncreatesession,
    onrenamesession,
    ondeletesession
  } = $props<{
    projects: ProjectData[];
    selectedProjectId: string | null;
    selectedSessionId: string | null;
    onselectproject: (projectId: string) => void;
    onselectsession: (sessionId: string) => void;
    oncreateproject: (input: { name: string; path?: string }) => void;
    ondeleteproject: (projectId: string) => void;
    oncreatesession: (projectId: string) => void;
    onrenamesession: (sessionId: string, newName: string) => void;
    ondeletesession: (projectId: string, sessionId: string) => void;
  }>();

  // Modal state
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

  function handleSelectProject(projectId: string) {
    onselectproject(projectId);
  }

  function handleSelectSession(sessionId: string) {
    console.log('[ProjectsPanel] Session selected:', sessionId);
    onselectsession(sessionId);
  }

  function handleDeleteProject(projectId: string) {
    ondeleteproject(projectId);
  }

  function handleAddSession(projectId: string) {
    oncreatesession(projectId);
  }

  function handleRenameSession(sessionId: string, newName: string) {
    onrenamesession(sessionId, newName);
  }

  function handleDeleteSession(projectId: string, sessionId: string) {
    ondeletesession(projectId, sessionId);
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
          onclick={() => handleSelectProject(project.id)}
        >
          <span class="project-icon">📁</span>
          <span class="project-name">{project.name}</span>
          <span class="session-count">{project.sessions.length}</span>
          <button 
            class="delete-project-btn"
            onclick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
            title="Delete Project">×</button>
        </div>
        
        <!-- Sessions for this project -->
        {#if selectedProjectId === project.id}
          <div class="sessions-container">
            {#each project.sessions as session (session.id)}
              <div 
                class="session-item {selectedSessionId === session.id ? 'selected' : ''}"
                onclick={() => handleSelectSession(session.id)}
              >
                <span class="session-icon">🎬</span>
                <input 
                  type="text" 
                  class="session-name-input"
                  value={session.name}
                  oninput={(e) => handleRenameSession(session.id, e.currentTarget.value)}
                  placeholder="Session name"
                />
                <button 
                  class="delete-session-btn"
                  onclick={(e) => { e.stopPropagation(); handleDeleteSession(project.id, session.id); }}
                  title="Delete Session">×</button>
              </div>
            {/each}
            
            <button class="add-session-btn" onclick={() => handleAddSession(project.id)}>
              + Add Session
            </button>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Create Project Modal -->
  {#if showCreateProjectModal}
    <div class="modal-backdrop" onclick={closeCreateProjectModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">{APP_CONSTANTS.strings.createProject}</span>
          <button class="modal-close" onclick={closeCreateProjectModal}>×</button>
        </div>
        
        <div class="modal-body">
          <label class="form-label">{APP_CONSTANTS.strings.projectName}</label>
          <input 
            type="text" 
            class="modal-input"
            bind:value={newProjectName}
            placeholder={APP_CONSTANTS.strings.projectNamePlaceholder}
            onkeydown={handleKeyDown}
          />
          
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={specifyPath} />
            <span>{APP_CONSTANTS.strings.specifyPath}</span>
          </label>
          
          {#if specifyPath}
            <div class="path-section">
              <label class="form-label">{APP_CONSTANTS.strings.customPath}</label>
              <input 
                type="text" 
                class="modal-input path-input"
                bind:value={customPath}
                placeholder={APP_CONSTANTS.strings.customPathPlaceholder}
              />
            </div>
          {/if}
        </div>
        
        <div class="modal-footer">
          <button class="btn-cancel" onclick={closeCreateProjectModal}>{APP_CONSTANTS.strings.cancel}</button>
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
</div>

<style>
  .projects-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary, #2A2A2E);
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
    position: relative;
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

  .delete-project-btn {
    background: none;
    border: none;
    color: var(--text-muted, #606060);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .project-item:hover .delete-project-btn {
    opacity: 1;
  }

  .delete-project-btn:hover {
    background: rgba(220, 38, 38, 0.2);
    color: #dc2626;
  }

  /* Sessions Container */
  .sessions-container {
    margin-left: 16px;
    padding-left: 8px;
    border-left: 1px solid var(--border-color, #3A3A3F);
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 2px;
    transition: all 0.15s;
  }

  .session-item:hover {
    background: var(--bg-hover, #3A3A3F);
  }

  .session-item.selected {
    background: rgba(89, 181, 255, 0.15);
  }

  .session-icon {
    font-size: 12px;
  }

  .session-name-input {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary, #EEEEEE);
    background: transparent;
    border: none;
    outline: none;
    padding: 2px 4px;
  }

  .session-name-input:focus {
    background: var(--bg-primary, #1A1A1D);
    border-radius: 2px;
  }

  .delete-session-btn {
    background: none;
    border: none;
    color: var(--text-muted, #606060);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .session-item:hover .delete-session-btn {
    opacity: 1;
  }

  .delete-session-btn:hover {
    background: rgba(220, 38, 38, 0.2);
    color: #dc2626;
  }

  .add-session-btn {
    width: 100%;
    padding: 6px;
    background: transparent;
    border: 1px dashed var(--border-color, #3A3A3F);
    border-radius: 4px;
    color: var(--text-muted, #808080);
    cursor: pointer;
    font-size: 11px;
    margin-top: 4px;
    transition: all 0.15s;
  }

  .add-session-btn:hover {
    border-color: var(--accent-primary, #59B5FF);
    color: var(--accent-primary, #59B5FF);
    background: rgba(89, 181, 255, 0.05);
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
