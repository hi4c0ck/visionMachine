/**
 * VisionMachine - Build Verification Script
 * Verifies compilation, build, and startup readiness
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'src/frontend');
const TAURI_DIR = path.join(PROJECT_ROOT, 'src-tauri');

function runCommand(cmd, cwd = PROJECT_ROOT) {
  try {
    const result = execSync(cmd, { 
      cwd, 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function checkStep(name, testFn) {
  console.log(`\n[${name}]`);
  const result = testFn();
  if (result.success) {
    console.log('  ✓ PASSED');
    return true;
  } else {
    console.log(`  ✗ FAILED: ${result.error}`);
    return false;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('VisionMachine - Build Verification');
  console.log('========================================\n');
  
  const results = [];
  
  // Test 1: Environment
  results.push(checkStep(
    'Environment Check',
    () => {
      const checks = [
        { name: 'Rust', cmd: 'rustc --version' },
        { name: 'Cargo', cmd: 'cargo --version' },
        { name: 'Node', cmd: 'node --version' },
        { name: 'npm', cmd: 'npm --version' }
      ];
      
      for (const check of checks) {
        const result = runCommand(check.cmd);
        if (!result.success) {
          return { success: false, error: `${check.name} not found` };
        }
      }
      return { success: true };
    }
  ));
  
  // Test 2: App Structure
  results.push(checkStep(
    'App Structure',
    () => {
      const files = [
        'src-tauri/Cargo.toml',
        'src-tauri/src/main.rs',
        'src-tauri/tauri.conf.json',
        'src/frontend/App.svelte',
        'src/frontend/index.html',
        'src/frontend/main.ts'
      ];
      
      const missing = files.filter(f => !fs.existsSync(path.join(PROJECT_ROOT, f)));
      if (missing.length > 0) {
        return { success: false, error: `Missing: ${missing.join(', ')}` };
      }
      return { success: true };
    }
  ));
  
  // Test 3: Tauri Config
  results.push(checkStep(
    'Tauri Configuration',
    () => {
      const configPath = path.join(TAURI_DIR, 'tauri.conf.json');
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!config.build?.frontendDist) {
          return { success: false, error: 'Missing build.frontendDist' };
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: `Invalid JSON: ${error.message}` };
      }
    }
  ));
  
  // Test 4: Rust Compilation
  results.push(checkStep(
    'Rust Compilation',
    () => {
      return runCommand('cargo check --manifest-path src-tauri/Cargo.toml');
    }
  ));
  
  // Test 5: Frontend Build
  results.push(checkStep(
    'Frontend Build',
    () => {
      const installResult = runCommand('npm install', FRONTEND_DIR);
      if (!installResult.success) {
        return { success: false, error: 'Failed to install npm dependencies' };
      }
      
      return runCommand('npm run build', FRONTEND_DIR);
    }
  ));
  
  // Test 6: Dist Output
  results.push(checkStep(
    'Build Output',
    () => {
      const distPath = path.join(FRONTEND_DIR, 'dist');
      if (!fs.existsSync(distPath)) {
        return { success: false, error: 'dist folder not found' };
      }
      
      const indexHtml = path.join(distPath, 'index.html');
      if (!fs.existsSync(indexHtml)) {
        return { success: false, error: 'index.html not found in dist' };
      }
      
      return { success: true };
    }
  ));
  
  // Summary
  console.log('\n========================================');
  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');
  
  if (failed === 0) {
    console.log('✓ All checks passed! Application is ready to run.\n');
    console.log('To start the app:');
    console.log('  .\\launch.bat\n');
  } else {
    console.log('✗ Some checks failed. Please fix the errors above.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\nFatal error:', error.message);
  process.exit(1);
});
