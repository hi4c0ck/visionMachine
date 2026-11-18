// Shared "is the app backgrounded / unfocused" gate — a single source of
// truth for GPU-idle behavior.
//
// App.svelte WRITES it (window blur + visibilitychange): when the window is
// not focused or the page is hidden, it marks the root `html.vm-bg-idle`
// (bg-idle.css pauses EVERY CSS animation), pauses the display <video>
// decode surfaces, and flips this flag so the always-mounted surfaces stop
// their loops.
//
// FrameCarousel READS it to stop its auto-scroll rAF loop while backgrounded
// (a running transport that keeps seeking the live <video> in a hidden
// window is wasted GPU/CPU). It re-arms the moment focus returns.
//
// The offscreen frameDecoder capture <video> is created via
// document.createElement and never attached to the DOM, so it is excluded
// from this mechanism by construction and the frame pipeline is untouched.
type Listener = (idle: boolean) => void;

let idle = false;
const listeners = new Set<Listener>();

export function isBgIdle(): boolean {
	return idle;
}

export function setBgIdle(next: boolean): void {
	if (next === idle) return;
	idle = next;
	for (const l of listeners) {
		try {
			l(next);
		} catch {
			// a broken subscriber must not prevent the others from hearing it
		}
	}
}

/** Subscribe to bg-idle transitions. Returns an unsubscribe fn. */
export function onBgIdleChange(l: Listener): () => void {
	listeners.add(l);
	return () => {
		listeners.delete(l);
	};
}
