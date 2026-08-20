const { execSync } = require('child_process');

console.log('=== VisionMachine Environment Verification ===\n');

try {
  // Check Python
  const pyVersion = execSync('.venv\\Scripts\\python.exe --version', { encoding: 'utf8' }).trim();
  console.log(`✅ ${pyVersion}`);
} catch (e) {
  console.log('❌ Python not available');
}

// Run test suite
try {
  console.log('\nRunning tests...');
  const testResult = execSync('.venv\\Scripts\\python.exe -m pytest tests/ -v', { 
    encoding: 'utf8',
    cwd: 'D:/work/horizonsMachine/VisionMachine'
  });
  console.log(testResult);
} catch (e) {
  console.log('Tests completed (some may have failed):');
  console.log(e.stdout || e.message);
}

console.log('\n=== Repository Contents ===');
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(f => f);
files.forEach(f => console.log(`  ${f}`));

console.log('\n✅ Setup complete!');
