const fs = require('fs');
const path = 'src/types/app.ts';
console.log(fs.readFileSync(path, 'utf8'));
