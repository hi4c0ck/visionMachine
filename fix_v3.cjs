const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix: Change $derived(() => ...) to return the value directly, not a function
c = c.replace(
  /let selectedSession = \$derived\(\(\) => \{[\s\S]*?\}\);/,
  `let selectedSession = $derived(
    selectedProject?.sessions.find(s => s.id === selectedSessionId) || null
  );`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed derived syntax');