import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: { 
    port: 1420, 
    strictPort: true,
    host: true,
    cors: true
  },
  build: { 
    outDir: 'dist', 
    emptyOutDir: true 
  }
});
