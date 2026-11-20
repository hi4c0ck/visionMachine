// M6: unit tests for the pure diffEngineRuns helper (types.ts).
// Two small EngineRun fixtures differing in exactly one transition and one
// lighting value → assert the exact `changed` rows + the summary string.
import { describe, expect, it } from 'vitest';
import {
	concernSummary,
	type Concerns,
	type EngineRun,
	type SceneSpec,
	type ShotSpec,
} from '../engine';
import { diffEngineRuns } from '../types';

function concernsWith(tempK: number): Concerns {
	return {
		camera: { size: 'wide', angle: 'eye' },
		lens: { focal_mm: 50 },
		motion: { move: 'static', zoom: 'static', speed: 'normal' },
		lighting: { key: 'soft', contrast: 'low', color_temp_K: tempK },
		grade: {
			palette: 'neutral',
			saturation: 'neutral',
			contrast: 'low',
			film_stock: 'neutral',
		},
		effects: ['none'],
		audio: { foley: '', sfx: '', music_cue: '', silence: true },
	};
}

function spec(id: string, transitionIn: string, tempK: number): ShotSpec {
	return {
		shot_id: id,
		novel_ref: id,
		content: { prose: id, beats: ['beat 1', 'beat 2'] },
		clip_s: 8,
		transition_in: transitionIn,
		transition_out: 'hard_cut',
		concerns: concernsWith(tempK),
		sub_timeline: [],
	};
}

/**
 * Layout: `sceneCount` scenes × 2 shots. Shot index 1 (the second shot of
 * scene 1) carries the `transitionIn` / `tempK` delta; every other shot is
 * fixed at hard_cut / 5600K so only that one shot can differ between runs.
 */
function makeRun(transitionIn: string, tempK: number, sceneCount = 1): EngineRun {
	const scenes: SceneSpec[] = Array.from({ length: sceneCount }, (_, s) => ({
		scene_id: `sc_${s + 1}`,
		time_of_day: 'midday',
		weather: 'clear',
		light: concernsWith(tempK).lighting,
		grade: concernsWith(tempK).grade,
		ambience: '',
		tempo: 'medium',
		effects_base: [],
	}));
	const specs: ShotSpec[] = [];
	for (let s = 0; s < sceneCount; s++) {
		for (let j = 0; j < 2; j++) {
			const differing = s === 0 && j === 1; // shot index 1 only
			const tIn = differing ? transitionIn : 'hard_cut';
			const t = differing ? tempK : 5600;
			specs.push(spec(`sc_${s + 1}.s${j + 1}`, tIn, t));
		}
	}
	return {
		seed: {
			title: 'T',
			idea: 'I',
			genre: { name: 'Cinematic', style: 'cinematic natural light' },
			ratio: '16:9',
			scale: { scenes: sceneCount, shots_per_scene: 2, clip_s: [8, 10] },
		},
		novel: {
			film: {
				title: 'T',
				logline: 'L',
				style: 'cinematic natural light',
				world: 'W',
				palette: 'P',
				time_of_day: 'midday',
				weather: 'clear',
			},
			scenes: Array.from({ length: sceneCount }, (_, s) => ({
				title: `Scene ${s + 1}`,
				prose: '',
				shots: [
					{ prose: 'shot a', beats: ['beat 1', 'beat 2'] },
					{ prose: 'shot b', beats: ['beat 3', 'beat 4'] },
				],
			})),
		},
		scenes,
		specs,
		molecules: [],
		timeline: { timeline_id: 'tl', total_s: 0, scenes: [] },
		verify: { verified: true, issues: [], frames: [], total_frames: 0 },
		gates: [],
	};
}

describe('diffEngineRuns (M6 side-by-side compare)', () => {
	it('records exactly the two changed rows (one transition + one lighting) and builds the summary', () => {
		const a = makeRun('hard_cut', 5600);
		const b = makeRun('crossfade', 3200);
		const d = diffEngineRuns(a, b, 3, 4);

		expect(d.a).toBe(3);
		expect(d.b).toBe(4);
		expect(d.addedScenes).toBe(0);
		expect(d.removedScenes).toBe(0);

		// The concernSummary of the differing shot (shot index 1).
		const sumA = concernSummary(a.specs[1].concerns);
		const sumB = concernSummary(b.specs[1].concerns);
		expect(sumA).toBe('wide · 50mm · 5600K · neutral');
		expect(sumB).toBe('wide · 50mm · 3200K · neutral');

		// Exactly the expected rows — no clip_s / transition_out / beats rows
		// (those fields are equal on both sides), and shot 0 is untouched.
		expect(d.changed).toEqual([
			{ shotIndex: 1, field: 'transition_in', from: 'hard_cut', to: 'crossfade' },
			{ shotIndex: 1, field: 'concerns', from: sumA, to: sumB },
		]);
		expect(d.summary).toBe(
			`shot_02 transition_in hard_cut→crossfade · shot_02 concerns ${sumA}→${sumB}`
		);
	});

	it('reports the net scene delta with no per-shot changes', () => {
		const a = makeRun('hard_cut', 5600, 1);
		const b = makeRun('hard_cut', 5600, 2);
		const d = diffEngineRuns(a, b, 1, 2);
		expect(d.addedScenes).toBe(1);
		expect(d.removedScenes).toBe(0);
		expect(d.changed).toEqual([]);
		expect(d.summary).toBe('+1 scene');
	});

	it('is total: out-of-range shots never throw, identical runs read "identical"', () => {
		const a = makeRun('hard_cut', 5600);
		const b = makeRun('hard_cut', 5600);
		expect(() => diffEngineRuns(a, b)).not.toThrow();
		const d = diffEngineRuns(a, b);
		expect(d.changed).toEqual([]);
		expect(d.summary).toBe('identical');
	});
});
