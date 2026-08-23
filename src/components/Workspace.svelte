<script lang="ts">
  import { createEmptyProject, createEmptySession, generateSessionFolderName } from '$types';
  import type { ProjectData, SessionData } from '$types';
  import ProjectsPanel from './ProjectsPanel.svelte';
  import ComposerPanel from './ComposerPanel.svelte';
  import ToolsPanel from './ToolsPanel.svelte';

  let { userName }: { userName: string } = $props();

  // Use $state for all collections to ensure reactivity
  let projects = $state<ProjectData[]>([]);
  let selectedProjectId = $state<string | null>(null);
  let selectedSessionId = $state<string | null>(null);

  // Derived state - these will automatically update
  let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);
  let selectedSession = $derived(
    selectedProject?.sessions.find(s => s.id === selectedSessionId) || null
  );

  // Debug logging
  $effect(() => {
    console.log('[Workspace] State updated:', {
      projectCount: projects.length,
      selectedProjectId,
      selectedSessionId,
      hasSession: !!selectedSession,
    });
  });

  // Handle project selection
  function handleSelectProject(projectId: string) {
    console.log('[Workspace] Selecting project:', projectId);
    selectedProjectId = projectId;
    selectedSessionId = null;
  }

  // Handle session selection
  function handleSelectSession(sessionId: string) {
    console.log('[Workspace] Selecting session:', sessionId);
    selectedSessionId = sessionId;
  }

  // Handle project creation
  function handleCreateProject(input: { name: string; path?: string }) {
    console.log('[Workspace] Creating project:', input.name);
    const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
    const projectPath = `${basePath}\\${input.name}`;
    
    const project = createEmptyProject(input.name, projectPath);
    
    // Update projects array to trigger reactivity
    projects = [...projects, project];
    selectedProjectId = project.id;
    
    console.log('[Workspace] Project created:', project.id, 'Total projects:', projects.length);
  }

  // Handle session creation
  function handleCreateSession(projectId: string) {
    console.log('[Workspace] Creating session for project:', projectId);
    const project = projects.find(p => p.id === projectId);
    if (!project) {
      console.warn('[Workspace] Project not found:', projectId);
      return;
    }
    
    const sessionName = `Session ${project.sessions.length + 1}`;
    const folderName = generateSessionFolderName(sessionName);
    const sessionPath = `${project.directoryPath}\\${folderName}`;
    
    const session = createEmptySession(project.name, sessionPath);
    
    // Create new projects array to trigger reactivity
    const updatedProjects = projects.map(p => {
      if (p.id === projectId) {
        return { ...p, sessions: [...p.sessions, session] };
      }
      return p;
    });
    
    projects = updatedProjects;
    selectedSessionId = session.id;
    
    console.log('[Workspace] Session created:', session.id, 'Total sessions:', updatedProjects.find(p => p.id === projectId)?.sessions.length);
  }

  // Handle session update (from composer)
  function handleSessionUpdate(updatedSession: SessionData) {
    console.log('[Workspace] Session updated:', updatedSession.id);
    if (!selectedProject || !selectedSession) return;
    
    const updatedProjects = projects.map(p => {
      if (p.id === selectedProject.id) {
        const updatedSessions = p.sessions.map(s =>
          s.id === updatedSession.id ? updatedSession : s
        );
        return { ...p, sessions: updatedSessions };
      }
      return p;
    });
    
    projects = updatedProjects;
  }

  // Handle generation
  function handleGenerate(sessionId: string) {
    console.log('[Workspace] Generating session:', sessionId);
    // TODO: Implement generation logic with Tauri IPC
  }

  // Get user home directory
  function getHomeDir(): string {
    if (typeof window !== 'undefined') {
      const user = (window as any).userName || userName || 'User';
      return `C:\\Users\\${user}`;
    }
    return 'C:\\Users';
  }
</script>

<div class="workspace-container">
  <!-- Left: Project/Sessin Sidebar -->
  <ProjectsPanel
    {projects}
    {selectedProjectId}
    {selectedSessionId}
    onselectproject={handleSelectProject}
    onselectsession={handleSelectSession}
    oncreateproject={handleCreateProject}
    oncreatesession={handleCreateSession}
  />

  <!-- Center: Composer -->
  <div class="composer-area">
    <ComposerPanel
      {selectedSession}
      onupdate={handleSessionUpdate}
    />
  </div>

  <!-- Right: Tool Sidebar -->
  <ToolsPanel
    {selectedSession}
    {selectedProject}
    ongenerate={handleGenerate}
  />
</div>

<style>
  .workspace-container {
    display: flex;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    background: var(--bg-primary, #1A1A1D);
  }

  .composer-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #1A1A1D);
  }
</style>
