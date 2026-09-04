const { execSync } = require('child_process');
try {
  const result = execSync('npm test -- --run', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  console.log(result);
} catch (e) {
  console.log(e.stdout);
  console.log(e.stderr);
  process.exit(1);
}
