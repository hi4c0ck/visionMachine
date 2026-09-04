import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import type { PluginOption } from 'vite';

export default defineConfig({
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svelte({ compilerOptions: { dev: false } }) as any,
  ],
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
