import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

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
      '$types': '/src/types',
      '$constants': '/src/constants',
    },
  },
});
