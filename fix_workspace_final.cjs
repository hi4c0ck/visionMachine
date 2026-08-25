const fs = require('fs');

// Fix Workspace.svelte - add safe pipe check
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

c = c.replace(
  'let selectedSession = $derived(selectedProject?.sessions.find(s => s.id === selectedSessionId) || null);',
  `let selectedSession = $derived(() => {
    const proj = selectedProject();
    if (!proj) return null;
    const sess = proj.sessions.find(s => s.id === selectedSessionId);
    if (!sess) return null;
    // Ensure session has pipes
    if (!sess.pipes || !Array.isArray(sess.pipes) || sess.pipes.length === 0) {
      sess.pipes = [{id: 'default-pipe', lengthFrames: 121, keyframes: [], qValue: 18, cValue: 7, segments: []}];
    }
    return sess;
  });`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace.svelte derived state');
