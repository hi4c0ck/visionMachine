<script lang="ts">
	// Renders one glyph from the video-prompt icon atlas (sprite.svg, 91 marks).
	// The atlas ships as a static asset at /icons/prompt-sprite.svg (Vite
	// publicDir), so the <use href> resolves identically in dev and in the
	// built Tauri bundle. Strokes carry the atlas gold; size/opacity left to
	// the caller.
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

	const SPRITE = './icons/prompt-sprite.svg';
	const href = $derived(SPRITE + '#' + id);
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
