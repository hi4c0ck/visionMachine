<script lang="ts">
	// Renders one glyph from the video-prompt icon atlas. On mount, the shared
	// sprite (icons/prompt-sprite.svg) is fetched ONCE and injected into
	// document.body as an inline SVG — <use href="#id"> then resolves against
	// the local DOM. This works reliably in both the Vite dev server and the
	// Tauri bundled webview, whereas cross-file <use href="./...svg#id">
	// references fail in some WebView2 configurations.
	//
	// The atlas is authored in matte gold (#CBB27F). At injection time the
	// stroke color is rewritten to `currentColor` so each instance can be
	// themed via CSS `color` on its own <svg>. Fills that were the same gold
	// become currentColor too; the two themed exception fills (dip to
	// black/white) map to the app's bg-primary/text-inverse tokens so they
	// stay correct across themes.
	//
	// Shared state lives in the module scope so N <PromptIcon> instances
	// share a single sprite injection.
	let {
		id,
		size = 24,
		class: cls = '',
		ariaLabel,
		color,
	} = $props<{
		/** sprite symbol id, e.g. "cam-pan-left" */
		id: string;
		/** rendered square size in px (default 24) */
		size?: number;
		class?: string;
		ariaLabel?: string;
		/** stroke color for this instance (default: the atlas gold) */
		color?: string;
	}>();

	const href = $derived('#' + id);
	const svgStyle = $derived(color ? `color:${color}` : '');

	// Module-scope singleton: fetch + inject the sprite once for all icons.
	let spriteReady = false;
	if (typeof document !== 'undefined' && !spriteReady) {
		spriteReady = true;
		const url = (import.meta.env.BASE_URL || './') + 'icons/prompt-sprite.svg';
		fetch(url)
			.then((r) => r.text())
			.then((raw) => {
				const svg = raw
					// stroke authoring color → themeable
					.split('stroke="#CBB27F"')
					.join('stroke="currentColor"')
					// filled gold dots → themeable
					.split('fill="#CBB27F"')
					.join('fill="currentColor"')
					// themed exception fills (dip-to-black / dip-to-white wedges)
					.split('fill="#1c1810"')
					.join('fill="var(--bg-primary, #0a0a0f)"')
					.split('fill="#F4ECD8"')
					.join('fill="var(--text-inverse, #fff)"');
				const host = document.createElement('div');
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
	style={svgStyle}
	width={size}
	height={size}
	viewBox="0 0 28 28"
	fill="none"
	role="img"
	aria-label={ariaLabel}
>
	<use {href} />
</svg>
