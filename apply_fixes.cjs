const fs = require('fs');

// 1. Fix ProjectsPanel.svelte - pass projectId to session click
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte', 'utf8');

// Update handleSelectSession to accept projectId
c = c.replace(
  'function handleSelectSession(sessionId: string) {\n    console.log(\'[ProjectsPanel] Session clicked:\', sessionId);\n    onselectsession(sessionId);\n  }',
  `function handleSelectSession(projectId: string, sessionId: string) {
    console.log('[ProjectsPanel] Session clicked:', projectId, sessionId);
    onselectsession(projectId, sessionId);
  }`
);

// Update the onclick handler to pass project.id and session.id
c = c.replace(
  'onclick={() => handleSelectSession(session.id)}',
  'onclick={() => handleSelectSession(project.id, session.id)}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte', c);
console.log('Fixed ProjectsPanel.svelte');

// 2. Fix Workspace.svelte
c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix derived state - use functions
c = c.replace(
  'let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);',
  'let selectedProject = $derived(() => projects.find(p => p.id === selectedProjectId) || null);'
);

c = c.replace(
  'let selectedSession = $derived(selectedProject?.sessions.find(s => s.id === selectedSessionId) || null);',
  'let selectedSession = $derived.by(() => {\n\t\tif (!selectedProject) return null;\n\t\treturn selectedProject.sessions.find(s => String(s.id) === String(selectedSessionId)) || null;\n\t});'
);

// Fix handleSessionSelect to accept projectId
c = c.replace(
  'function handleSessionSelect(sessionId: string) {\n\t\t// Find the project containing this session\n\t\tconst foundProject = projects.find(p => \n\t\t\tp.sessions.some(s => String(s.id) === String(sessionId))\n\t\t);\n\t\t\n\t\tif (foundProject) {\n\t\t\t// Set both atomically\n\t\t\tselectedProjectId = foundProject.id;\n\t\t\tselectedSessionId = sessionId;\n\t\t\tsaveProjects();\n\t\t}\n\t}',
  `function handleSessionSelect(projectId: string, sessionId: string) {
    console.log('[Workspace] handleSessionSelect called:', projectId, sessionId);
    console.log('[Workspace] Current selectedProjectId:', selectedProjectId, 'selectedSessionId:', selectedSessionId);
    
    const foundProject = projects.find(p => p.id === projectId);
    
    console.log('[Workspace] Found project by ID:', foundProject ? foundProject.id : 'NOT FOUND');
    
    if (foundProject) {
      selectedProjectId = projectId;
      selectedSessionId = sessionId;
      saveProjects();
      console.log('[Workspace] After update - selectedProjectId:', selectedProjectId, 'selectedSessionId:', selectedSessionId);
      console.log('[Workspace] selectedProject:', selectedProject() ? selectedProject().id : 'null');
      console.log('[Workspace] selectedSession:', selectedSession() ? selectedSession().id : 'null');
    } else {
      console.error('[Workspace] Project not found for ID:', projectId);
    }
  }`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace.svelte');
