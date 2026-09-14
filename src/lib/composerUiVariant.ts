// Composer UI variant — presentation-layer A/B switch.
//
// 'current' = the CURRENT/CLEAN variant: existing layout (Header / Keyframes
// row / Subject Refs row / Timeline), cosmetic cleanup only.
// 'fixed'   = the FIXED/REFERENCE variant: tabbed aux panel
// (Keyframes ⇄ Subject Refs, mutually exclusive, each collapsible) +
// a live drag-following frame pin.
//
// The variants differ ONLY in presentation: the same composerStore actions,
// services, PipeRow data model, FrameGeometry, and dragMath power both.
// Persisted per browser so the choice survives reloads.
//
// Default: 'fixed' — the reference variant is the one to ship as the main
// layout; 'current' stays available as an A/B comparison. First run falls
// through to DEFAULT_VARIANT when nothing is stored (or the value is
// unknown/legacy), so a clean install opens the Fixed UI.

export type ComposerUiVariant = 'current' | 'fixed';

const STORAGE_KEY = 'vm-composer-ui-variant';
const DEFAULT_VARIANT: ComposerUiVariant = 'fixed';

export function getComposerUiVariant(): ComposerUiVariant {
	if (typeof localStorage === 'undefined') return DEFAULT_VARIANT;
	const v = localStorage.getItem(STORAGE_KEY);
	if (v === 'fixed' || v === 'current') return v;
	// Unknown/legacy/absent → ship the reference variant.
	return DEFAULT_VARIANT;
}

export function setComposerUiVariant(v: ComposerUiVariant): void {
	try {
		localStorage.setItem(STORAGE_KEY, v);
	} catch {
		// private mode / sandboxed iframe — session-only choice is fine
	}
}
