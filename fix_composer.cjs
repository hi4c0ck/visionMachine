const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Add safe pipe access checks throughout
c = c.replace(
  '<div class="scene-meta">',
  `<div class="scene-meta">\n        {#if session?.pipes && session.pipes.length > 0}\n          {session.pipes[0]?.lengthFrames || 121}f @ {session.fps}fps\n        {:else}\n          121f @ {session?.fps || 24}fps (no pipes)\n        {/if}`
);

// Remove the closing tag that was added
c = c.replace(
  /{session\.pipes\[0\]\?\.lengthFrames \|\| 121}f @ \{session\.fps\}fps\s*<\/span>/,
  '</span>'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed ComposerPanel for empty pipes');
