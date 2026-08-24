const fs = require('fs');

// Update ProjectsPanel.svelte
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte', 'utf8');
c = c.replace(
  "function handleSelectSession(sessionId: string) {\n    console.log('[ProjectsPanel] Session clicked:', sessionId);\n    onselectsession(sessionId);\n  }",
  `function handleSelectSession(sessionId: string) {
    console.log('[ProjectsPanel] handleSelectSession called with:', sessionId, 'typeof:', typeof sessionId);
    console.log('[ProjectsPanel] projects.length:', projects.length);
    console.log('[ProjectsPanel] selectedProjectId:', selectedProjectId);
    onselectsession(sessionId);
    console.log('[ProjectsPanel] onselectsession called');
  }`
);
fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte', c);
console.log('Updated ProjectsPanel.svelte');

// Update Workspace.svelte
c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');
c = c.replace(
  "function handleSessionSelect(sessionId: string) {\n\t\t// Find the project containing this session\n\t\tconst foundProject = projects.find(p => \n\t\t\tp.sessions.some(s => s.id === sessionId)\n\t\t);\n\t\t\n\t\tif (foundProject) {\n\t\t\t// Set both atomically\n\t\t\tselectedProjectId = foundProject.id;\n\t\t\tselectedSessionId = sessionId;\n\t\t\tsaveProjects();\n\t\t}\n\t}",
  `function handleSessionSelect(sessionId: string) {
    console.log('[Workspace] handleSessionSelect called with:', sessionId, 'typeof:', typeof sessionId);
    console.log('[Workspace] Before update - selectedProjectId:', selectedProjectId, 'selectedSessionId:', selectedSessionId);
    
    const foundProject = projects.find(p => 
      p.sessions.some(s => String(s.id) === String(sessionId))
    );
    
    console.log('[Workspace] Found project:', foundProject ? foundProject.id : 'NOT FOUND');
    
    if (foundProject) {
      selectedProjectId = foundProject.id;
      selectedSessionId = sessionId;
      saveProjects();
      console.log('[Workspace] After update - selectedProjectId:', selectedProjectId, 'selectedSessionId:', selectedSessionId);
      console.log('[Workspace] selectedProject:', selectedProject ? selectedProject.id : 'null');
      console.log('[Workspace] selectedSession:', selectedSession ? selectedSession.id : 'null');
    }
  }`
);
fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Updated Workspace.svelte');
