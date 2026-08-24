const fs = require('fs');
const path = 'D:/work/horizonsMachine/VisionMachine/src/components/ProjectsPanel.svelte';

let c = fs.readFileSync(path, 'utf8');

// Add logging to handleSelectSession
c = c.replace(
  'function handleSelectSession(sessionId: string) {\n    onselectsession(sessionId);\n  }',
  `function handleSelectSession(sessionId: string) {
    console.log('[ProjectsPanel] Session clicked:', sessionId);
    onselectsession(sessionId);
  }`
);

fs.writeFileSync(path, c);
console.log('Updated ProjectsPanel.svelte');
