const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix the derived state to be proper $derived (not $derived.by)
c = c.replace(
  /let selectedProject = \$derived\.by\(\(\) => \{\n\t\treturn projects\.find\(p => p\.id === selectedProjectId\) \|\| null;\n\t\}\);/,
  `let selectedProject = $derived(projects.find(p => p.id === selectedProjectId) || null);`
);

c = c.replace(
  /let selectedSession = \$derived\.by\(\(\) => \{\n\t\tconst proj = projects\.find\(p => p\.id === selectedProjectId\);\n\t\tif \(!proj \|\| !selectedSessionId\) return null;\n\t\tconst sess = proj\.sessions\.find\(s => s\.id === selectedSessionId\);\n\t\treturn sess \? ensurePipes\(sess\) : null;\n\t\}\);/,
  `let selectedSession = $derived(() => {
    const proj = projects.find(p => p.id === selectedProjectId);
    if (!proj || !selectedSessionId) return null;
    const sess = proj.sessions.find(s => s.id === selectedSessionId);
    return sess ? ensurePipes(sess) : null;
  });`
);

// In template, call selectedSession() and selectedProject() as functions
c = c.replace(
  '{#if selectedSession() && selectedProject()}',
  '{#if selectedSession && selectedProject}'
);

c = c.replace(
  '{selectedSession}',
  '{selectedSession()}'
);

c = c.replace(
  '{selectedProject}',
  '{selectedProject()}'
);

// Add safe pipe access in ComposerPanel template if needed
c = c.replace(
  'selectedSession?.pipes',
  'selectedSession()?.pipes'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed');
