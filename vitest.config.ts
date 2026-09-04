import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte({
    compilerOptions: {
      dev: false,
    },
  })],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    globals: true,
  },
  resolve: {
    alias: {
      '$types': resolve(__dirname, 'src/types'),
      '$constants': resolve(__dirname, 'src/constants'),
      '$lib': resolve(__dirname, 'src/lib'),
    },
  },
});
