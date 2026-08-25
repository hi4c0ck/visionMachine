const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Replace ALL unsafe session.pipes with session?.pipes
c = c.replace(/session\.pipes/g, 'session?.pipes');

// Also fix template
c = c.replace('{#each session.pipes as pipe', '{#each session?.pipes as pipe');

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed all unsafe pipes access in ComposerPanel');
