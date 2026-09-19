<script lang="ts">
	// Renders one glyph from the video-prompt icon atlas. On mount, the shared
	// sprite (icons/prompt-sprite.svg) is fetched ONCE and injected into
	// document.body as an inline SVG — <use href="#id"> then resolves against
	// the local DOM. This works reliably in both the Vite dev server and the
	// Tauri bundled webview, whereas cross-file <use href="./...svg#id">
	// references fail in some WebView2 configurations.
	// Shared state lives in the module scope so N <PromptIcon> instances
	// share a single sprite injection.
	let {
		id,
		size = 24,
		class: cls = '',
		ariaLabel,
	} = $props<{
		/** sprite symbol id, e.g. "cam-pan-left" */
		id: string;
		/** rendered square size in px (default 24) */
		size?: number;
		class?: string;
		ariaLabel?: string;
	}>();

	const href = $derived('#' + id);

	// Module-scope singleton: fetch + inject the sprite once for all icons.
	let spriteReady = false;
	if (typeof document !== 'undefined' && !spriteReady) {
		spriteReady = true;
		const url = (import.meta.env.BASE_URL || './') + 'icons/prompt-sprite.svg';
		fetch(url)
			.then((r) => r.text())
			.then((svg) => {
				const host = document.createElement('div');
				// The sprite root carries display:none so it occupies no layout
				// space; its <symbol> children stay referenceable via <use>.
				host.setAttribute('aria-hidden', 'true');
				host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
				host.innerHTML = svg;
				document.body.appendChild(host);
			})
			.catch(() => {}); // sprite is decorative; icons degrade gracefully
	}
</script>

<svg
	class={cls}
	width={size}
	height={size}
	viewBox="0 0 28 28"
	fill="none"
	role="img"
	aria-label={ariaLabel}
>
	<use {href} />
</svg>
