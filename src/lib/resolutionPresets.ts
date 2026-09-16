// Placeholder generation-size presets per orientation.
//
// These defaults stand in until the provider settings expose the sizes each
// provider actually supports (sourced from the provider API docs). They are
// only applied when a session is missing a resolution value (normalizeSession);
// size is otherwise an independent session-level setting the user controls —
// changing orientation never rewrites it.

import type { ResolutionPreset } from '$types';

export const ORIENTATION_DEFAULT_RESOLUTION: Record<string, ResolutionPreset> = {
	horizontal: '720p', // 16:9 widescreen default
	vertical: '1080p', // 9:16 short-form default
};

/** The default generation size for an orientation (undefined when unknown). */
export function defaultResolutionFor(orientation: string | null | undefined): ResolutionPreset | undefined {
	return orientation ? ORIENTATION_DEFAULT_RESOLUTION[orientation] : undefined;
}
