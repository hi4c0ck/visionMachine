const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix: Change $derived(() => ...) to proper $derived()
c = c.replace(
  /let selectedSession = \$derived\(\(\) => \{[\s\S]*?return ensurePipes\(sess\);\n\t\}\);/,
  `let selectedSession = $derived(() => {
    if (!selectedProject || !selectedSessionId) return null;
    const sess = selectedProject.sessions.find(s => s.id === selectedSessionId);
    return sess ? ensurePipes(sess) : null;
  });`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed selectedSession to use proper $derived syntax');
