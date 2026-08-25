const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Fix: Add null check before accessing session.pipes
c = c.replace(
  'if (!session.pipes || !Array.isArray(session.pipes)) {',
  'if (!session || !session.pipes || !Array.isArray(session.pipes)) {'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed ComposerPanel null check');
