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

// Fix Workspace.svelte - accept projectId and sessionId
c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

c = c.replace(
  'onselectsession={handleSessionSelect}',
  'onselectsession={handleSessionSelect}'
);

// Update handleSessionSelect signature and implementation
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

// Update derived state to use functions (Svelte 5 proper reactive syntax)
c = c.replace(
  'let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);',
  'let selectedProject = $derived(() => projects.find(p => p.id === selectedProjectId) || null);'
);

c = c.replace(
  'let selectedSession = $derived(selectedProject?.sessions.find(s => s.id === selectedSessionId) || null);',
  'let selectedSession = $derived.by(() => {\n\t\tconst proj = selectedProject();\n\t\tif (!proj) return null;\n\t\treturn proj.sessions.find(s => String(s.id) === String(selectedSessionId)) || null;\n\t});'
);

// Update the template to call selectedProject() and selectedSession() as functions
c = c.replace(
  '{#if selectedSession && selectedProject}',
  '{#if selectedSession() && selectedProject()}'
);

c = c.replace(
  '{selectedSession}',
  '{selectedSession()}'
);

c = c.replace(
  '{selectedProject}',
  '{selectedProject()}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace.svelte');