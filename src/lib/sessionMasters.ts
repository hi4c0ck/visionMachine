// Session-modal master toggles (bug batch nov19, item 9).
//
// "Force last frame — all" and "8f boundary trim — all" check/uncheck every
// ELIGIBLE pipe at once. Pure helpers so the all/none/mixed semantics are
// unit-testable without mounting the modal. The per-pipe diff maps, the
// onConfirm wire shape and the Rust force_last_frames / trim_boundary maps
// are unchanged — a master is just a bulk edit of the same local state.

/** Checkbox state for a master over an eligible set: `all` = every eligible
 *  id is ticked; `mixed` = some (but not all) → the indeterminate cue. An
 *  empty eligible set reads as neither (the control is hidden). */
export function masterState(
	eligible: ReadonlySet<string>,
	local: Readonly<Record<string, boolean>>,
): { all: boolean; mixed: boolean } {
	if (eligible.size === 0) return { all: false, mixed: false };
	let on = 0;
	for (const id of eligible) if (local[id]) on += 1;
	return { all: on === eligible.size, mixed: on > 0 && on < eligible.size };
}

/** Bulk-set every eligible id; ineligible ids keep their stored value
 *  (they never ride the wire — the diff maps filter on eligibility). */
export function setMaster(
	eligible: ReadonlySet<string>,
	local: Readonly<Record<string, boolean>>,
	on: boolean,
): Record<string, boolean> {
	const next = { ...local };
	for (const id of eligible) next[id] = on;
	return next;
}