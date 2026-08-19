<script lang="ts">
  // Project Sidebar Component
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let collapsed = $state(false);
  
  let projects = $state([
    { id: 1, name: 'Cyberpunk City', thumbnail: null, updatedAt: '2h ago', item: 'count' },
    { id: 2, name: 'Ocean Waves', thumbnail: null, updatedAt: '1d ago', item: 'count' },
    { id: 3, name: 'Abstract Motion', thumbnail: null, updatedAt: '3d ago', item: 'count' },
  ]);
  
  let sessions = $state([
    { id: 1, name: 'Morning Session', itemsCount: 12, totalDuration: '45m' },
    { id: 2, name: 'Afternoon Test', itemsCount: 8, totalDuration: '32m' },
  ]);
  
  function selectProject(id: number) {
    dispatch('select-project', { id });
  }
  
  function newProject() {
    dispatch('new-project');
  }
</script>

<div class="project-sidebar" class:collapsed>
  <SidebarHeader>
    <div class="sidebar-title">
      <span class="title-icon">📁</span>
      <span class="title-text">Projects</span>
    </div>
    <button class="add-btn" onclick={newProject} title="New Project">＋</button>
  </SidebarHeader>
  
  <SearchBox placeholder="Search..." />
  
  <ProjectList>
    <Section label="Recent Projects">
      {#each projects as project (project.id)}
        <ProjectItem 
          bind:project 
          onclick={() => selectProject(project.id)}
        >
          <Thumbnail placeholder="true"/>
          <ProjectInfo>
            <ProjectName text="{{project.name}}"/>
            <ProjectMeta text="{{project.updatedAt}}"/>
          </ProjectInfo>
        </ProjectItem>
      {/each}
    </Section>
    
    <Section label="Sessions">
      {#each sessions as session (session.id)}
        <SessionItem bind:session>
          <SessionIcon icon="🎬"/>
          <SessionInfo>
            <SessionName text="{{session.name}}"/>
            <SessionStats 
              items="{{session.itemsCount}}" 
              duration="{{session.totalDuration}}"
            />
          </SessionInfo>
        </SessionItem>
      {/each}
    </Section>
    
    <Section label="Templates">
      <TemplateItem name="Landscape"/>
      <TemplateItem name="Portrait"/>
      <TemplateItem name="Close-up"/>
    </Section>
  </ProjectList>
  
  <SidebarFooter>
    <StorageIndicator used="2.4GB" total="10GB"/>
  </SidebarFooter>
</div>

<style>
  .project-sidebar {
    width: 240px;
    background: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.2s;
  }
  
  .project-sidebar.collapsed {
    width: 48px;
  }
  
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
  }
  
  .sidebar-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .title-icon {
    font-size: 14px;
  }
  
  .add-btn {
    width: 24px;
    height: 24px;
    background: var(--color-accent);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .search-box {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border);
  }
  
  .search-input {
    width: 100%;
    padding: 6px 10px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 11px;
  }
  
  .search-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  .project-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  .section {
    margin-bottom: 16px;
  }
  
  .section-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    margin-bottom: 4px;
  }
  
  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }
  
  .project-item:hover {
    background: var(--color-bg-hover);
  }
  
  .thumbnail {
    width: 32px;
    height: 24px;
    background: var(--color-bg-tertiary);
    border-radius: 4px;
    flex-shrink: 0;
  }
  
  .project-info {
    flex: 1;
    min-width: 0;
  }
  
  .project-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .project-meta {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .session-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .session-item:hover {
    background: var(--color-bg-hover);
  }
  
  .session-icon {
    font-size: 14px;
  }
  
  .session-info {
    flex: 1;
    min-width: 0;
  }
  
  .session-name {
    font-size: 11px;
    color: var(--color-text-primary);
  }
  
  .session-stats {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .template-item {
    padding: 6px 8px;
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 4px;
  }
  
  .template-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--color-border);
  }
  
  .storage-indicator {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .storage-label {
    font-size: 10px;
    color: var(--color-text-muted);
    display: flex;
    justify-content: space-between;
  }
  
  .storage-bar {
    height: 3px;
    background: var(--color-bg-tertiary);
    border-radius: 2px;
    overflow: hidden;
  }
  
  .storage-fill {
    height: 100%;
    background: var(--color-accent);
    width: 24%;
  }
</style>
