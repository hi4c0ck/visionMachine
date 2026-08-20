import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  
  // Server configuration for development
  server: {
    port: 5173,
    strictPort: true,
  },
  
  // Build configuration
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
