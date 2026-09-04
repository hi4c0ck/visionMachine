const fs = require('fs');
const path = 'public/css/design-system.css';
console.log(fs.readFileSync(path, 'utf8'));
