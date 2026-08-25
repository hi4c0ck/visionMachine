const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Make sure selectedSession is properly derived with safe access
c = c.replace(
  /let selectedSession = \$derived\.by\(\(\) => \{[\s\S]*?return sess \|\| null;\n\t\}\);/,
  `let selectedSession = $derived(() => {
    if (!selectedProject || !selectedSessionId) return null;
    const sess = selectedProject.sessions.find(s => s.id === selectedSessionId);
    // Safe: ensure session has pipes property
    return sess ? { ...sess, pipes: sess.pipes || [] } : null;
  });`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace selectedSession derivation');
