import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  // verbatim static assets (favicon + icon mipmap set) — copied unchanged to /icons/...
  // so both dev (root=public) and build (outDir=dist) serve the same paths, no hashing.
  // NOTE: publicDir is resolved relative to `root` (public/), so use an absolute path
  // pointing to the public-static folder that sits next to public/ at the project root.
  publicDir: resolve(__dirname, 'public-static'),
  plugins: [svelte()],
  resolve: {
    alias: {
      '/src/main.ts': resolve(__dirname, 'src/main.ts'),
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
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'public/index.html'),
    },
  },
});
