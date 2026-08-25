const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ToolsPanel.svelte', 'utf8');

// Fix unsafe pipes access in ToolsPanel
c = c.replace(
  'pipes: session.pipes.length',
  'pipes: session?.pipes?.length ?? 0'
);
c = c.replace(
  'frames: session.pipes.reduce((acc, p) => acc + p.lengthFrames, 0)',
  'frames: (session?.pipes ?? []).reduce((acc, p) => acc + (p?.lengthFrames || 0), 0)'
);
c = c.replace(
  '<p class="preview-meta">{session.pipes.length} pipes',
  '<p class="preview-meta">{session?.pipes?.length ?? 0} pipes'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ToolsPanel.svelte', c);
console.log('Fixed ToolsPanel.svelte unsafe pipes access');
