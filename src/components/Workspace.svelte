<script lang="ts">
  import { createEmptyProject, createEmptySession, generateSessionFolderName } from '$types';
  import type { ProjectData, SessionData } from '$types';
  import ProjectsPanel from './ProjectsPanel.svelte';
  import ComposerPanel from './ComposerPanel.svelte';
  import ToolsPanel from './ToolsPanel.svelte';

  let { userName }: { userName: string } = $props();

  // Application state
  let projects = $state<ProjectData[]>([]);
  let selectedProjectId = $state<string | null>(null);
  let selectedSessionId = $state<string | null>(null);

  // Derived state
  let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);
  let selectedSession = $derived(
    selectedProject?.sessions.find(s => s.id === selectedSessionId) || null
  );

  // Handle project selection
  function handleSelectProject(projectId: string) {
    selectedProjectId = projectId;
    selectedSessionId = null;
  }

  // Handle session selection
  function handleSelectSession(sessionId: string) {
    selectedSessionId = sessionId;
  }

  // Handle project creation
  function handleCreateProject(input: { name: string; path?: string }) {
    const basePath = input.path || `${getHomeDir()}\\VisionMachine\\Projects`;
    const projectPath = `${basePath}\\${input.name}`;
    
    const project = createEmptyProject(input.name, projectPath);
    projects = [...projects, project];
    selectedProjectId = project.id;
  }

  // Handle session creation
  function handleCreateSession(projectId: string) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const sessionName = `Session ${project.sessions.length + 1}`;
    const folderName = generateSessionFolderName(sessionName);
    const sessionPath = `${project.directoryPath}\\${folderName}`;
    
    const session = createEmptySession(project.name, sessionPath);
    const updatedSessions = [...project.sessions, session];
    const updatedProject = { ...project, sessions: updatedSessions };
    
    projects = projects.map(p => 
      p.id === projectId ? updatedProject : p
    );
    
    selectedSessionId = session.id;
  }

  // Handle session update (from composer)
  function handleSessionUpdate(updatedSession: SessionData) {
    if (!selectedProject || !selectedSession) return;
    
    const updatedSessions = selectedProject.sessions.map(s =>
      s.id === updatedSession.id ? updatedSession : s
    );
    
    const updatedProject = { ...selectedProject, sessions: updatedSessions };
    projects = projects.map(p =>
      p.id === selectedProject.id ? updatedProject : p
    );
  }

  // Handle generation
  function handleGenerate(sessionId: string) {
    console.log('Generating session:', sessionId);
    // TODO: Implement generation logic
  }

  // Get user home directory
  function getHomeDir(): string {
    if (typeof window !== 'undefined') {
      const user = (window as any).userName || 'User';
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
