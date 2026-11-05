// Phase 3: lock the S0.5 structural-tree seed-card v2 shape + the
// manual-override pins round-trip, and the `treeSummary` run-log line.
// Pure (no Tauri / no I/O) — mirrors the Rust `seed_card_round_trips`
// test on the TS side.

import { describe, expect, it } from 'vitest';
import {
	fromSeedCard,
	hasAnyPin,
	parseSeedCard,
	seedCardToJson,
	toSeedCard,
} from '$lib/directorStore/seedCard';
import {
	branchNarrativeHint,
	treeSummary,
	type Driver,
	type EngineEntryInput,
	type StructuralTree,
	type TreeOverrides,
} from '$lib/directorStore/engine';

function entry(overrides?: TreeOverrides): EngineEntryInput {
	const e: EngineEntryInput = {
		title: 'fox',
		idea: 'a red fox darts through the tall pine forest at dusk',
		input_text: 'a red fox darts through the tall pine forest at dusk',
		genre: { name: 'Cinematic', style: 'cinematic natural light' },
		ratio: '16:9',
		scale: { scenes: 3, shots_per_scene: 2, clip_s: [8, 10] },
		time_of_day: 'evening',
		weather: 'clear',
		mood: 50,
		overrides,
	};
	return e;
}

describe('seed card v2 (S0.5 structural-tree card)', () => {
	it('bumps to v:2 and carries overrides when the entry has pins', () => {
		const ov: TreeOverrides = { scenes: 4, driver: 'action', transitions: ['hard_cut', null, null, null] };
		const card = toSeedCard(entry(ov), 'prose preview');
		expect(card.v).toBe(2);
		expect(card.overrides).toEqual(ov);
		expect(card.preview).toBe('prose preview');
	});

	it('stays v:1 when the entry has no pins', () => {
		const card = toSeedCard(entry(undefined), 'preview');
		expect(card.v).toBe(1);
		expect(card.overrides).toBeUndefined();
	});

	it('round-trips: parse(seedCardToJson(card)) == card (with pins)', () => {
		const ov: TreeOverrides = {
			scenes: 4,
			shots_per_scene: 3,
			target_duration_s: 96,
			driver: 'atmosphere',
			transitions: ['match_cut', null, 'hard_cut', null],
			temp_arc: [null, [4800, 5200]],
		};
		const card = toSeedCard(entry(ov));
		const json = seedCardToJson(card);
		const back = parseSeedCard(json);
		expect(back.v).toBe(2);
		expect(back.overrides).toEqual(ov);
		// fromSeedCard restores the pins onto the entry.
		const e = fromSeedCard(back);
		expect(e.overrides).toEqual(ov);
	});

	it('accepts a v:1 card (no overrides key) and keeps it v:1', () => {
		const json = JSON.stringify({
			v: 1,
			title: 't',
			idea: 'an idea about a fox',
			genre: { name: 'Cinematic', style: 's' },
			ratio: '16:9',
			scale: { scenes: 2, shots_per_scene: 2, clip_s: [8, 10] },
			time_of_day: 'evening',
			weather: 'clear',
		});
		const card = parseSeedCard(json);
		expect(card.v).toBe(1);
		expect(card.overrides).toBeUndefined();
	});

	it('hasAnyPin detects a pin and ignores the empty shape', () => {
		expect(hasAnyPin({})).toBe(false);
		expect(hasAnyPin(undefined)).toBe(false);
		expect(hasAnyPin({ scenes: 5 })).toBe(true);
		expect(hasAnyPin({ driver: 'action' })).toBe(true);
		expect(hasAnyPin({ transitions: [null, 'match_cut'] })).toBe(true);
		expect(hasAnyPin({ temp_arc: [null, [4800, 5200]] })).toBe(true);
		// All-null / empty arrays are NOT pins (the auto shape).
		expect(hasAnyPin({ transitions: [null, null] })).toBe(false);
		expect(hasAnyPin({ temp_arc: [null] })).toBe(false);
	});

	it('rejects an out-of-vocab seed card version', () => {
		const json = JSON.stringify({
			v: 99,
			title: 't',
			idea: 'an idea about a fox',
			genre: { name: 'C', style: 's' },
			ratio: '16:9',
			scale: { scenes: 1, shots_per_scene: 1, clip_s: [8, 10] },
			time_of_day: 'evening',
			weather: 'clear',
		});
		expect(() => parseSeedCard(json)).toThrow(/unsupported seed card version/);
	});
});

describe('treeSummary (run-log structure line)', () => {
	it('reads "no tree" for a null tree', () => {
		expect(treeSummary(null)).toBe('no tree');
		expect(treeSummary(undefined)).toBe('no tree');
	});

	it('composes driver · target · branch roles', () => {
		const tree: StructuralTree = {
			v: 1,
			root: {
				thesis: 'the fox crosses the meadow',
				driver: 'exploration',
				target_duration_s: 64,
				energy: [0.35, 0.95, 0.45],
				temp_arc: [
					[5600, 5900],
					[5900, 6200],
					[6200, 6500],
				],
				continuity_thread: 'the red fox · the low night light',
			},
			branches: [
				{
					role: 'establishing',
					shots: 2,
					narrative: 'the fox darts',
					transition_in: 'hard_cut',
					transition_out: 'crossfade',
					leaves: [],
					temp_open_k: 5600,
					temp_close_k: 5900,
					energy: 0.35,
				},
				{
					role: 'turn',
					shots: 2,
					narrative: 'light spills',
					transition_in: 'match_cut',
					transition_out: 'hard_cut',
					leaves: [],
					temp_open_k: 5900,
					temp_close_k: 6200,
					energy: 0.95,
				},
				{
					role: 'resolving',
					shots: 2,
					narrative: 'the valley settles',
					transition_in: 'hard_cut',
					transition_out: 'crossfade',
					leaves: [],
					temp_open_k: 6200,
					temp_close_k: 6500,
					energy: 0.45,
				},
			],
		};
		expect(treeSummary(tree)).toBe('tree v1 · exploration · ~64s · [establishing/turn/resolving]');
	});
});

describe('branchNarrativeHint (Phase 2.5 advisory story cue)', () => {
	it('composes the role cue + driver cue (mirrors the Rust builder)', () => {
		expect(branchNarrativeHint('establishing', 'neutral')).toBe(
			'establish the world and the principal before the story moves · follow the principal\'s thread',
		);
		expect(branchNarrativeHint('turn', 'action')).toBe(
			'bend what the audience expected: a reversal, a reveal, or an escalation · keep the principal moving; momentum carries the cut',
		);
	});

	it('is advisory, not a strict beat: different driver changes the cue', () => {
		const a = branchNarrativeHint('developing', 'action');
		const b = branchNarrativeHint('developing', 'atmosphere');
		expect(a).not.toBe(b);
		expect(a).toContain('momentum');
		expect(b).toContain('stillness');
	});

	it('falls back to the generic cue for unknown roles', () => {
		const neutral = 'neutral' as Driver;
		expect(branchNarrativeHint('mystery_role', neutral)).toBe(
			'carry the story forward and hold the thread · follow the principal\'s thread',
		);
	});
});
