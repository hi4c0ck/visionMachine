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
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleSelectProject(project.id)}
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
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && handleSelectSession(session.id)}
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
    <div class="modal-backdrop" onclick={closeCreateProjectModal} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <div class="modal-header">
          <span class="modal-title" id="create-project-title">{APP_CONSTANTS.strings.createProject}</span>
          <button class="modal-close" onclick={closeCreateProjectModal} aria-label="Close">×</button>
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
    background: var(--bg-secondary);
    border-right: 1px solid var(--panel-left-border);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--panel-left-border);
    background: var(--panel-left-bg);
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--panel-left-text);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .add-btn {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: var(--panel-left-border);
    color: var(--panel-left-text);
    border: 1px solid var(--panel-left-border);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .add-btn:hover {
    background: var(--panel-left-active);
    border-color: var(--panel-left-text);
    box-shadow: 0 0 8px var(--panel-left-border);
  }

  /* Projects List */
  .projects-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }

  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 2px;
    transition: all var(--transition-fast);
    position: relative;
    border: 1px solid transparent;
  }

  .project-item:hover {
    background: var(--panel-left-active);
    border-color: var(--panel-left-border);
  }

  .project-item.selected {
    background: var(--panel-left-active);
    border-left: 2px solid var(--panel-left-text);
    border-color: var(--panel-left-border);
  }

  .project-icon {
    font-size: 13px;
    opacity: 0.8;
  }

  .project-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-count {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    padding: 1px 5px;
    border-radius: 8px;
    min-width: 18px;
    text-align: center;
  }

  .delete-project-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity var(--transition-fast);
    line-height: 1;
  }

  .project-item:hover .delete-project-btn {
    opacity: 1;
  }

  .delete-project-btn:hover {
    background: rgba(220, 38, 38, 0.2);
    color: #ff6b6b;
  }

  /* Sessions Container */
  .sessions-container {
    margin-left: 12px;
    padding-left: 8px;
    border-left: 1px solid var(--panel-left-border);
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    margin-bottom: 1px;
    transition: all var(--transition-fast);
    border: 1px solid transparent;
  }

  .session-item:hover {
    background: var(--panel-left-active);
    border-color: var(--panel-left-border);
  }

  .session-item.selected {
    background: var(--panel-left-active);
    border-color: var(--panel-left-border);
  }

  .session-icon {
    font-size: 11px;
    opacity: 0.7;
  }

  .session-name-input {
    flex: 1;
    font-size: 11px;
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;
    padding: 2px 4px;
    font-family: inherit;
  }

  .session-name-input:focus {
    background: var(--bg-tertiary);
    border-radius: 3px;
  }

  .delete-session-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
    padding: 1px 3px;
    border-radius: 2px;
    opacity: 0;
    transition: opacity var(--transition-fast);
    line-height: 1;
  }

  .session-item:hover .delete-session-btn {
    opacity: 1;
  }

  .delete-session-btn:hover {
    background: rgba(220, 38, 38, 0.2);
    color: #ff6b6b;
  }

  .add-session-btn {
    width: 100%;
    padding: 5px;
    background: transparent;
    border: 1px dashed var(--panel-left-border);
    border-radius: 5px;
    color: var(--panel-left-text);
    cursor: pointer;
    font-size: 10px;
    margin-top: 4px;
    transition: all var(--transition-fast);
    font-family: inherit;
  }

  .add-session-btn:hover {
    border-color: var(--panel-left-text);
    background: var(--panel-left-active);
  }

  /* Empty State */
  .empty-state {
    padding: 24px 16px;
    text-align: center;
  }

  .empty-state p {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  .btn-create {
    padding: 8px 16px;
    background: var(--panel-left-border);
    color: var(--panel-left-text);
    border: 1px solid var(--panel-left-border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .btn-create:hover {
    background: var(--panel-left-active);
    box-shadow: 0 0 12px var(--panel-left-border);
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-elevated);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    width: 400px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }

  .modal-close:hover {
    color: var(--text-primary);
  }

  .modal-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-label {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .modal-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
  }

  .modal-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .path-input {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .path-section {
    margin-top: 4px;
  }

  .modal-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  .btn-cancel:hover {
    background: var(--bg-hover);
    border-color: var(--border-light);
  }

  .btn-confirm {
    padding: 8px 16px;
    background: var(--gradient-accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  .btn-confirm:hover:not(:disabled) {
    box-shadow: var(--shadow-glow);
    transform: translateY(-1px);
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
</style>
