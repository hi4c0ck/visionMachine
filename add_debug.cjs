const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Add detailed logging BEFORE any pipes access
c = c.replace(
  '{#if selectedSession && selectedProject}',
  `{#if selectedSession && selectedProject}
    {@debug selectedSession selectedProject}`
);

c = c.replace(
  '<ComposerPanel',
  `<ComposerPanel
      onerror={(e) => console.error('[Workspace] ComposerPanel error:', e)}`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Added debug logging');
