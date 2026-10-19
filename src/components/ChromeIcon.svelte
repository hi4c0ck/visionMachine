<script lang="ts">
	// Renders one glyph from the app-chrome icon atlas. On mount, the shared
	// sprite (icons/app-chrome-sprite.svg) is fetched ONCE and injected into
	// document.body as an inline SVG — <use href="#id"> then resolves against
	// the local DOM. Same mechanism as PromptIcon.svelte, different sprite.
	//
	// The atlas is authored in matte gold (#CBB27F). At injection time the
	// stroke color is rewritten to `currentColor` so each instance can be
	// themed via CSS `color` on its own <svg>. Filled accent dots become
	// currentColor too; the two themed exception fills map to the app's
	// bg-primary / text-inverse tokens so they stay correct across themes.
	//
	// Shared state lives in the module scope so N <ChromeIcon> instances
	// share a single sprite injection (separate from PromptIcon's sprite).

	let {
		id,
		size = 18,
		class: cls = '',
		ariaLabel,
		color,
	} = $props<{
		/** sprite symbol id, e.g. "play", "regen", "open-folder" */
		id: string;
		/** rendered square size in px (default 18 — chrome icons are small) */
		size?: number;
		class?: string;
		ariaLabel?: string;
		/** stroke color for this instance (default: currentColor) */
		color?: string;
	}>();

	const href = $derived('#chrome-' + id);
	const svgStyle = $derived(color ? `color:${color}` : '');

	// Module-scope singleton: fetch + inject the chrome sprite once.
	let spriteReady = false;
	if (typeof document !== 'undefined' && !spriteReady) {
		spriteReady = true;
		const url = (import.meta.env.BASE_URL || './') + 'icons/app-chrome-sprite.svg';
		fetch(url)
			.then((r) => r.text())
			.then((raw) => {
				let svg = raw
					// stroke authoring color → themeable
					.split('stroke="#CBB27F"')
					.join('stroke="currentColor"')
					// filled gold dots → themeable
					.split('fill="#CBB27F"')
					.join('fill="currentColor"');
				// Prefix all symbol ids with "chrome-" to avoid collisions
				// with the video-prompt atlas (prompt-sprite.svg).
				svg = svg.replace(/<symbol id="([^"]+)"/g, '<symbol id="chrome-$1"');
				const host = document.createElement('div');
				host.setAttribute('aria-hidden', 'true');
				host.id = 'chrome-sprite-host';
				host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
				host.innerHTML = svg;
				document.body.appendChild(host);
			})
			.catch(() => {}); // sprite is decorative; icons degrade gracefully
	}
</script>

<svg
	class={cls}
	style={`display:inline-block;vertical-align:middle;flex-shrink:0;${svgStyle}`}
	width={size}
	height={size}
	viewBox="0 0 28 28"
	fill="none"
	role="img"
	aria-label={ariaLabel}
>
	<use {href} />
</svg>
