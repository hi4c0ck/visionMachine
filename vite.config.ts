import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    alias: {
      '$types': resolve(__dirname, 'src/types'),
      '$constants': resolve(__dirname, 'src/constants'),
      '$lib': resolve(__dirname, 'src/lib'),
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
