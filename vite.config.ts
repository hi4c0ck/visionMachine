import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  resolve: {
    alias: {
      $components: path.resolve('./src/frontend/components'),
      $stores: path.resolve('./src/frontend/stores'),
      $lib: path.resolve('./src/frontend/lib'),
    },
  },
});
