/**
 * Session-modal master toggles (bug batch nov19, item 9).
 * all/none/mixed semantics + bulk-set over the ELIGIBLE set only.
 */
import { describe, it, expect } from 'vitest';
import { masterState, setMaster } from '$lib/sessionMasters';

const eligible = new Set(['p2', 'p3', 'p4']);

describe('masterState', () => {
	it('none ticked → neither all nor mixed', () => {
		expect(masterState(eligible, {})).toEqual({ all: false, mixed: false });
	});
	it('some ticked → mixed (indeterminate)', () => {
		expect(masterState(eligible, { p2: true })).toEqual({ all: false, mixed: true });
		expect(masterState(eligible, { p2: true, p3: true })).toEqual({ all: false, mixed: true });
	});
	it('all eligible ticked → all', () => {
		expect(masterState(eligible, { p2: true, p3: true, p4: true })).toEqual({ all: true, mixed: false });
	});
	it('ineligible ticks do not count', () => {
		// p1 is the group's first pipe — never force-eligible.
		expect(masterState(eligible, { p1: true })).toEqual({ all: false, mixed: false });
		expect(masterState(eligible, { p1: true, p2: true, p3: true, p4: true })).toEqual({ all: true, mixed: false });
	});
	it('empty eligible set → neither (control hidden)', () => {
		expect(masterState(new Set(), { p1: true })).toEqual({ all: false, mixed: false });
	});
});

describe('setMaster', () => {
	it('bulk-on sets every eligible id', () => {
		const out = setMaster(eligible, {}, true);
		expect(out).toEqual({ p2: true, p3: true, p4: true });
	});
	it('bulk-off clears every eligible id', () => {
		const out = setMaster(eligible, { p2: true, p3: true, p4: true }, false);
		expect(out).toEqual({ p2: false, p3: false, p4: false });
	});
	it('ineligible ids keep their stored value (never ride the wire)', () => {
		const out = setMaster(eligible, { p1: true }, true);
		expect(out.p1).toBe(true);
		expect(out.p2).toBe(true);
	});
	it('does not mutate the input record', () => {
		const local = { p2: true };
		setMaster(eligible, local, false);
		expect(local).toEqual({ p2: true });
	});
});