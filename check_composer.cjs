const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Show what's actually in the file around line 84-90
console.log('Lines 80-95:');
const lines = c.split('\n');
for (let i = 79; i < 95 && i < lines.length; i++) {
  console.log(i + 1 + ': ' + lines[i]);
}
