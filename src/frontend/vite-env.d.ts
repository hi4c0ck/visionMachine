/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.svelte' {
  import type { SvelteComponent } from 'svelte';
  export default class extends SvelteComponent {}
}

interface Window {
  __TAURI__?: {
    invoke: (cmd: string, args?: any) => Promise<any>;
    event: {
      listen: (event: string, cb: any) => any;
      emit: (event: string, payload: any) => void;
    };
  };
}
