import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'child_process';
import * as path from 'path';

// Generate build number
const buildNumber = generateBuildNumber();
const buildTimestamp = new Date().toISOString();

console.log('\n' + '='.repeat(60));
console.log(`VISIONMACHINE BUILD ${buildNumber}`);
console.log(`Timestamp: ${buildTimestamp}`);
console.log('='.repeat(60) + '\n');

export default defineConfig({
  plugins: [svelte()],
  
  server: {
    port: 5173,
    strictPort: true,
  },
  
  build: {
    outDir: '../../src-tauri/dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});

function generateBuildNumber() {
  try {
    const result = execSync('git rev-list --count HEAD 2>nul || echo 0', { 
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      shell: 'cmd'
    }).trim();
    
    const count = parseInt(result);
    if (!isNaN(count) && count > 0) {
      return `0.1.${count}`;
    }
  } catch (e) {
    // Git not available
  }
  
  // Fallback: date-based
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `0.1.${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
