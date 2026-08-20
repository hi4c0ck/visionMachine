import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Set up PATH for Rust and Node
const env = { ...process.env };
env.PATH = `C:\\Users\\user\\.cargo\\bin;C:\\Program Files\\nodejs;${env.PATH}`;

const tests = [
  { name: 'Environment Check', fn: () => {
    const cmds = ['rustc --version', 'cargo --version', 'node --version', 'npm --version'];
    cmds.forEach(cmd => {
      try {
        execSync(cmd, { stdio: 'pipe', env });
        console.log(`  ✓ ${cmd.split(' ')[0]}`);
      } catch (e) {
        console.log(`  ✗ ${cmd.split(' ')[0]} not found`);
        process.exit(1);
      }
    });
  }},
  { name: 'App Structure', fn: () => {
    const files = [
      'src-tauri/tauri.conf.json',
      'src-tauri/Cargo.toml',
      'src/frontend/package.json',
      'src/frontend/vite.config.ts',
      'src/frontend/App.svelte',
    ];
    files.forEach(f => {
      if (existsSync(join(rootDir, f))) {
        console.log(`  ✓ ${f}`);
      } else {
        console.log(`  ✗ Missing: ${f}`);
        process.exit(1);
      }
    });
  }},
  { name: 'Tauri Config', fn: () => {
    const configPath = join(rootDir, 'src-tauri/tauri.conf.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (config.build.frontendDist === '../src/frontend/dist') {
      console.log('  ✓ frontendDist points to built output');
    } else {
      console.log('  ✗ frontendDist misconfigured');
      process.exit(1);
    }
  }},
  { name: 'Frontend Build', fn: () => {
    try {
      execSync('npm run build', { cwd: join(rootDir, 'src/frontend'), stdio: 'pipe', env });
      console.log('  ✓ Frontend builds successfully');
    } catch (e) {
      console.log('  ✗ Frontend build failed');
      process.exit(1);
    }
  }},
  { name: 'Build Output', fn: () => {
    const distPath = join(rootDir, 'src/frontend/dist');
    if (existsSync(distPath)) {
      console.log('  ✓ dist folder exists');
      const indexHtml = join(distPath, 'index.html');
      if (existsSync(indexHtml)) {
        console.log('  ✓ index.html in dist');
      } else {
        console.log('  ✗ index.html missing from dist');
        process.exit(1);
      }
    } else {
      console.log('  ✗ dist folder missing');
      process.exit(1);
    }
  }},
  { name: 'Rust Binary', fn: () => {
    const exePath = join(rootDir, 'src-tauri/target/release/visionmachine.exe');
    if (existsSync(exePath)) {
      console.log('  ✓ Release binary exists');
    } else {
      console.log('  ✗ Release binary missing (run: npm run tauri:build)');
      process.exit(1);
    }
  }}
];

console.log('\n=== VisionMachine Test Suite ===\n');

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\n${test.name}:`);
  try {
    test.fn();
    passed++;
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
    failed++;
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
