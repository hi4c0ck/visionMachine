<script lang="ts">
	/**
	 * Fullscreen image lightbox with zoom + pan — the shared preview viewer
	 * for every image preview in the project (subject refs, keyframe /
	 * img2img piece previews).
	 *
	 *  - wheel        : zoom toward the cursor (0.2×–8×)
	 *  - drag         : pan
	 *  - double-click : toggle 1× / 2.5× at the cursor
	 *  - toolbar      : − / % / + and reset (click the % to reset)
	 *  - Esc / click anywhere outside the image : close
	 *
	 * The image is `pointer-events: auto` so drags start on top of it; a
	 * click that lands ON the image (no drag) does NOT close — but any click
	 * in the dark area around it (the transparent letterbox stage and the
	 * outer backdrop) DOES, so a double-click zoom can never lose the
	 * preview yet "click outside the picture" dismisses it as expected.
	 */
	let {
		open = $bindable(false),
		src,
		title = '',
	} = $props<{
		/** Bindable visibility. */
		open: boolean;
		/** Image source (blob URL, data URI, or remote URL). */
		src: string | null;
		/** Caption shown in the toolbar. */
		title?: string;
	}>();

	let boxEl = $state<HTMLDivElement | null>(null);
	let imgEl = $state<HTMLImageElement | null>(null);
	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let dragging = $state(false);

	function resetView() {
		scale = 1;
		tx = 0;
		ty = 0;
	}
	// A fresh open or a new image always starts at 1× centered.
	$effect(() => {
		if (open) resetView();
	});
	$effect(() => {
		if (src) resetView();
	});

	function close() {
		open = false;
	}

	/** Multiply the current scale (clamped 0.2–8). When cursor coords are
	 *  given the point under the cursor stays fixed; without them the zoom
	 *  is anchored to the center (the toolbar buttons). */
	function zoomAt(factor: number, clientX?: number, clientY?: number) {
		const next = Math.min(8, Math.max(0.2, scale * factor));
		if (clientX !== undefined && clientY !== undefined && boxEl) {
			const r = boxEl.getBoundingClientRect();
			const mx = clientX - r.left - r.width / 2;
			const my = clientY - r.top - r.height / 2;
			const k = next / scale;
			tx = mx - (mx - tx) * k;
			ty = my - (my - ty) * k;
		}
		scale = next;
	}

	// Wheel zoom toward the cursor. Native listener with passive:false so
	// preventDefault actually stops the underlying page scroll.
	$effect(() => {
		const el = boxEl;
		if (!el || !open) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	// Esc closes.
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Drag to pan: window-level move/up so a fast drag outside the box still
	// tracks; a click with no movement closes anywhere OUTSIDE the picture
	// (the dark backdrop, the letterbox stage around it, the toolbar
	// margin) but never on the image itself.
	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		dragging = true;
		const startX = e.clientX - tx;
		const startY = e.clientY - ty;
		let moved = false;
		const onMove = (ev: PointerEvent) => {
			tx = ev.clientX - startX;
			ty = ev.clientY - startY;
			moved = true;
		};
		const onUp = (ev: PointerEvent) => {
			dragging = false;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			if (moved) return;
			const target = ev.target as Node | null;
			// The close button / toolbar stop propagation themselves, so a
			// click here is on the image or on empty space around it.
			if (!(imgEl && imgEl.contains(target))) close();
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	// Double-click: toggle between fit (1×) and a readable 2.5× at the cursor.
	function onDoubleClick(e: MouseEvent) {
		e.preventDefault();
		if (scale > 1.1) resetView();
		else zoomAt(2.5, e.clientX, e.clientY);
	}
</script>

{#if open && src}
	<div
		class="lightbox"
		class:lb-dragging={dragging}
		bind:this={boxEl}
		role="dialog"
		aria-modal="true"
		aria-label={title || 'Image preview'}
		onpointerdown={onPointerDown}
	>
		<div
			class="lb-img"
			style={`transform: translate(${tx}px, ${ty}px) scale(${scale});`}
			ondblclick={onDoubleClick}
		>
			<img bind:this={imgEl} src={src} alt={title || 'Image preview'} draggable={false} />
		</div>
		<button
			class="lb-close"
			aria-label="Close preview"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={close}
		>×</button>
		<div class="lb-toolbar" onpointerdown={(e) => e.stopPropagation()}>
			{#if title}<span class="lb-title">{title}</span>{/if}
			<button class="lb-zoombtn" onclick={() => zoomAt(1 / 1.25)} aria-label="Zoom out" title="Zoom out">−</button>
			<button class="lb-zoomval" onclick={resetView} title="Reset zoom & pan">{Math.round(scale * 100)}%</button>
			<button class="lb-zoombtn" onclick={() => zoomAt(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
			<button class="lb-zoombtn" onclick={resetView} aria-label="Reset view" title="Fit to screen">⤾</button>
		</div>
	</div>
{/if}

<style>
	.lightbox {
		position: fixed;
		inset: 0;
		z-index: 3000; /* above the modal overlay (2000) */
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.lb-dragging {
		cursor: grabbing;
	}

	/* The transform is applied to the WRAPPER (translate-then-scale around the
	   box center) so the cursor-anchored math is exact; the image itself keeps
	   object-fit: contain inside its 90vw × 85vh stage. */
	.lb-img {
		width: 90vw;
		height: 85vh;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
	}

	.lb-img img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
		user-select: none;
		-webkit-user-drag: none;
	}

	/* Close button: top-right. */
	.lb-close {
		position: absolute;
		top: 16px;
		right: 20px;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: var(--text-primary, #fff);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}
	.lb-close:hover {
		border-color: var(--accent-color, #ff3e00);
		color: var(--accent-color, #ff3e00);
	}

	/* Toolbar: bottom-center pill. Caption + zoom controls. */
	.lb-toolbar {
		position: absolute;
		bottom: 18px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.55);
		max-width: 90vw;
	}

	.lb-title {
		padding: 0 6px;
		font-size: 12px;
		color: var(--text-secondary, #a1a1aa);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 40vw;
	}

	.lb-zoombtn,
	.lb-zoomval {
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary, #fff);
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.lb-zoomval {
		width: 44px;
		font-size: 11px;
		font-family: var(--font-mono, monospace);
	}
	.lb-zoombtn:hover,
	.lb-zoomval:hover {
		border-color: var(--accent-color, #ff3e00);
		color: var(--accent-color, #ff3e00);
	}
</style>
