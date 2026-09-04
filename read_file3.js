const fs = require('fs');
const path = 'src/components/Frame.svelte';
console.log(fs.readFileSync(path, 'utf8'));
