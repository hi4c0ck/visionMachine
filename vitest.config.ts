import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import type { PluginOption } from 'vite';

// Svelte's package.json exports the SERVER entry under the default (node)
// condition, so vitest resolves `mount` to index-server.js and throws
// lifecycle_function_unavailable inside jsdom. Alias 'svelte' itself to the
// client build; leave svelte's own deep module ids ('svelte/src/...',
// 'svelte/internal/...') to its package.json exports map, which already picks
// the client entry under the browser condition (svelte/src/internal/client
// re-exports the client runtime, so both internal/client and internal/server
// specifiers resolve to working code).
function svelteClientAlias(): PluginOption {
  const clientEntry = resolve(__dirname, 'node_modules/svelte/src/index-client.js');
  return {
    name: 'svelte-client',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'svelte') return { id: clientEntry, external: false };
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    svelteClientAlias() as PluginOption,
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
      '$components': resolve(__dirname, 'src/components'),
    },
  },
});
