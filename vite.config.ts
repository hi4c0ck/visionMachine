import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    alias: {
      '$types': resolve(import.meta.dirname, 'src/types'),
      '$constants': resolve(import.meta.dirname, 'src/constants'),
    },
  },
  root: 'public',
  server: { 
    port: 1420, 
    strictPort: true,
    host: true,
    cors: true
  },
  build: { 
    outDir: '../dist', 
    emptyOutDir: true 
  },
});
