/// <reference types="svelte" />

declare module '*.svelte' {
	import type { SvelteComponent } from 'svelte';
	const component: typeof SvelteComponent;
	export default component;
}

interface ImportMetaEnv {
	readonly TAURI_PLATFORM?: string;
	readonly DEV?: boolean;
	readonly PROD?: boolean;
	readonly BASE_URL?: string;
	readonly [key: string]: string | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
