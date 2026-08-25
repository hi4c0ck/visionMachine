const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix: Change $derived(() => ...) to $derived.by(() => ...)
c = c.replace(
  'let selectedSession = $derived(() => {',
  'let selectedSession = $derived.by(() => {'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed derived.by usage');
