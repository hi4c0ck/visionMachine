const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Find where session.pipes is first accessed and add guard BEFORE any access
c = c.replace(
  'if (!session.pipes || !Array.isArray(session.pipes)) {',
  '// SAFETY: Return early if session or pipes are missing\n\t\tif (!session || !session.pipes) {\n\t\t\tconsole.error(\'[ComposerPanel] Missing session data\');\n\t\t\treturn;\n\t\t}\n\t\t\n\t\tif (!session.pipes || !Array.isArray(session.pipes)) {'
);

// Also guard all pipe accesses with optional chaining
c = c.replace(/session\.pipes/g, 'session?.pipes');
c = c.replace(/session\.fps/g, 'session?.fps');
c = c.replace(/session\.name/g, 'session?.name');
c = c.replace(/session\.resolution/g, 'session?.resolution');

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed ComposerPanel safety guards');
