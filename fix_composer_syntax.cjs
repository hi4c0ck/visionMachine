const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Fix the broken pattern - remove the incorrect "...(...)" part
c = c.replace(/function (confirmAdd|deleteKeyframe|updateQ|updateC|openSegmentModal|confirmSegmentUpdate|openTypePicker|addSegmentWithType|removeParam|updateParam|moveParamFrame|updatePipeLength|openGlobalPromptModal|confirmGlobalPrompt|updateFPS|updateResolution)\(\.\.\.) if \(!session\?\.pipes\) return;/g, 'function $1() {\n\t\tif (!session?.pipes) return;\n\t\t');

// Also fix any remaining patterns
c = c.replace(/\)\s+if \(!session\?\.pipes\) return;/g, ') {\n\t\tif (!session?.pipes) return;\n\t\t');

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed ComposerPanel syntax');
