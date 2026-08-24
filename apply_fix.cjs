const fs = require('fs');

// Fix ProjectsPanel.svelte - pass both projectId and sessionId
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte', 'utf8');

c = c.replace(
  'onselectsession: (sessionId: string) => void;',
  'onselectsession: (projectId: string, sessionId: string) => void;'
);

c = c.replace(
  'function handleSelectSession(sessionId: string) {\n    onselectsession(sessionId);\n  }',
  `function handleSelectSession(projectId: string, sessionId: string) {
    console.log('[ProjectsPanel] Session clicked:', projectId, sessionId);
    onselectsession(projectId, sessionId);
  }`
);

c = c.replace(
  'onclick={() => handleSelectSession(session.id)}',
  'onclick={() => handleSelectSession(project.id, session.id)}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte', c);
console.log('Fixed ProjectsPanel.svelte');

// Fix Workspace.svelte - accept projectId and sessionId in handleSessionSelect
c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

const oldHandler = `function handleSessionSelect(sessionId: string) {
		// Find the project containing this session
		const foundProject = projects.find(p => 
			p.sessions.some(s => s.id === sessionId)
		);
		
		if (foundProject) {
			// Set both atomically
			selectedProjectId = foundProject.id;
			selectedSessionId = sessionId;
			saveProjects();
		}
	}`;

const newHandler = `function handleSessionSelect(projectId: string, sessionId: string) {
		console.log('[Workspace] Session selected:', projectId, sessionId);
		
		const foundProject = projects.find(p => p.id === projectId);
		
		if (foundProject) {
			selectedProjectId = projectId;
			selectedSessionId = sessionId;
			saveProjects();
			console.log('[Workspace] Selection set - project:', selectedProjectId, 'session:', selectedSessionId);
		} else {
			console.error('[Workspace] Project not found for ID:', projectId);
		}
	}`;

c = c.replace(oldHandler, newHandler);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace.svelte');
