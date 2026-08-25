const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Replace ALL unsafe session.pipes with session?.pipes
c = c.replace(/session\.pipes/g, 'session?.pipes');
c = c.replace(/session\.fps/g, 'session?.fps');
c = c.replace(/session\.name/g, 'session?.name');
c = c.replace(/session\.resolution/g, 'session?.resolution');

// Fix the template conditional that checks for pipes
c = c.replace(
  '{#if session?.pipes && session.pipes.length > 0}',
  '{#if session?.pipes && session.pipes.length > 0}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed all session.pipes to use optional chaining');
