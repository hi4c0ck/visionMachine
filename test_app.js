const { exec } = require('child_process');
const path = require('path');

const exePath = path.join(__dirname, 'src-tauri', 'target', 'release', 'vision-machine.exe');
console.log(`Testing executable: ${exePath}`);
console.log(`Exists: ${require('fs').existsSync(exePath)}`);

// Run with output capture
const proc = exec(`"${exePath}"`);

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
  process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
  process.stderr.write(data);
});

proc.on('close', (code) => {
  console.log(`\nProcess exited with code: ${code}`);
  console.log(`Stdout length: ${stdout.length}`);
  console.log(`Stderr length: ${stderr.length}`);
  
  if (stderr) {
    console.log('\n=== ERRORS ===');
    console.log(stderr);
  }
});

// Kill after 5 seconds if still running
setTimeout(() => {
  if (proc.killed) return;
  proc.kill();
  console.log('\nKilled after 5 seconds (app likely hung or showed blank screen)');
}, 5000);
