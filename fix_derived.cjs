const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Change $derived to proper syntax - don't wrap in function
c = c.replace(
  /let selectedProject = \$derived\(\(\) => \{[\s\S]*?\}\);/,
  `let selectedProject = $derived.by(() => {
    return projects.find(p => p.id === selectedProjectId) || null;
  });`
);

c = c.replace(
  /let selectedSession = \$derived\(\(\) => \{[\s\S]*?return ensurePipes\(sess\);\n\t\}\);/,
  `let selectedSession = $derived.by(() => {
    const proj = projects.find(p => p.id === selectedProjectId);
    if (!proj || !selectedSessionId) return null;
    const sess = proj.sessions.find(s => s.id === selectedSessionId);
    return sess ? ensurePipes(sess) : null;
  });`
);

// Fix template to not call as function - just use the value
c = c.replace('{selectedSession}', '{selectedSession}');
c = c.replace('{selectedProject}', '{selectedProject}');

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace.svelte');
