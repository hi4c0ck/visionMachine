const fs = require('fs');
const files = [
  'src/components/ComposerPanel.svelte',
  'src/types/app.ts',
  'src/components/Frame.svelte',
  'public/css/design-system.css'
];
files.forEach(f => {
  console.log('\n=== ' + f + ' ===');
  console.log(fs.readFileSync(f, 'utf8'));
});
