<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  
  interface Project {
    id: string;
    name: string;
    description?: string;
    created_at: string;
  }
  
  export let projects: Project[] = [];
  export let selectedProject: string | null = null;
  
  let expandedProjects = new Set<string>();
  
  function toggleExpand(projectId: string) {
    if (expandedProjects.has(projectId)) {
      expandedProjects.delete(projectId);
    } else {
      expandedProjects.add(projectId);
    }
  }
  
  async function selectProject(projectId: string) {
    selectedProject = projectId;
    // Emit event to parent
  }
</script>

<div class="sidebar">
  <div class="sidebar-header">
    <h3>Projects</h3>
    <button class="new-project-btn">+ New</button>
  </div>
  
  <div class="project-list">
    {#each projects as project (project.id)}
      <div 
        class="project-item {selectedProject === project.id ? 'selected' : ''}"
        on:click={() => selectProject(project.id)}
      >
        <div class="project-icon">🎬</div>
        <div class="project-info">
          <div class="project-name">{project.name}</div>
          <div class="project-meta">
            {new Date(project.created_at).toLocaleDateString()}
          </div>
        </div>
        <button class="expand-btn" on:click={(e) => { e.stopPropagation(); toggleExpand(project.id); }}>
          {expandedProjects.has(project.id) ? '▲' : '▼'}
        </button>
      </div>
      
      {#if expandedProjects.has(project.id)}
        <div class="sessions-list">
          <!-- Sessions would be loaded here -->
          <div class="session-placeholder">Sessions will appear here...</div>
        </div>
      {/if}
    {/each}
    
    {#if projects.length === 0}
      <div class="empty-state">
        <p>No projects yet</p>
        <button class="create-first">Create your first project</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .sidebar {
    width: 280px;
    height: 100%;
    background: #16161e;
    border-right: 1px solid #2a2a3a;
    display: flex;
    flex-direction: column;
  }
  
  .sidebar-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2a3a;
  }
  
  .sidebar-header h3 {
    margin: 0;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }
  
  .new-project-btn {
    padding: 6px 12px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  
  .new-project-btn:hover {
    background: #3a8eef;
  }
  
  .project-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  .project-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
    margin-bottom: 4px;
  }
  
  .project-item:hover {
    background: #2a2a3a;
  }
  
  .project-item.selected {
    background: #4a9eff20;
    border-left: 3px solid #4a9eff;
  }
  
  .project-icon {
    font-size: 20px;
  }
  
  .project-info {
    flex: 1;
    min-width: 0;
  }
  
  .project-name {
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .project-meta {
    color: #888;
    font-size: 11px;
    margin-top: 2px;
  }
  
  .expand-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 10px;
    padding: 4px;
  }
  
  .sessions-list {
    margin-left: 32px;
    padding: 4px 0;
  }
  
  .session-placeholder {
    color: #666;
    font-size: 12px;
    padding: 8px;
    font-style: italic;
  }
  
  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: #888;
  }
  
  .empty-state p {
    margin: 0 0 16px;
    font-size: 14px;
  }
  
  .create-first {
    padding: 10px 20px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  
  .create-first:hover {
    background: #3a8eef;
  }
</style>
