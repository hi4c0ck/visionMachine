// Svelte 5 reactive store + ResizeObserver hook for FrameGeometry
//
// Usage in a component:
//   import { useFrameGeometry } from '$lib/useFrameGeometry';
//   const geo = useFrameGeometry(totalFrames);
//   // geo.geometry is a reactive FrameGeometry | null
//   // Call geo.setElement(el) when the coordinate-space element mounts
//
// The geometry auto-updates when the element resizes.

import { createFrameGeometry, type FrameGeometry } from './frameGeometry';

export function useFrameGeometry(totalFrames: number) {
	let element = $state<HTMLElement | null>(null);
	let geometry = $state<FrameGeometry | null>(null);

	function update() {
		if (!element) {
			geometry = null;
			return;
		}
		const rect = element.getBoundingClientRect();
		if (rect.width <= 0) {
			geometry = null;
			return;
		}
		geometry = createFrameGeometry(totalFrames, rect.width);
	}

	// Re-measure when totalFrames changes
	$effect(() => {
		update();
	});

	// Set up ResizeObserver when element is bound
	$effect(() => {
		if (!element) return;
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	});

	return {
		get geometry() {
			return geometry;
		},
		setElement(el: HTMLElement | null) {
			element = el;
		}
	};
}
