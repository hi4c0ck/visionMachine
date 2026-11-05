// G0 entry draft persistence (Director tab).
//
// The DirectorPanel unmounts when the user is on another composer tab
// (`composerTab === 'pipes'` swaps out the whole panel), so any G0 state
// held in component locals would die with it — the "text doesn't save
// when I leave the Director tab" bug. This module keeps the *current* G0
// entry (idea + look params) per session in memory + localStorage, so a
// re-mount restores exactly what was typed. A new run (buildRun) is a
// committed flow document and takes precedence on load (see the panel's
// load effect); this is only the in-progress draft layer underneath.

import type { EngineEntryInput } from './engine';

const NS = 'vm-director-g0-entry.v1.';

export function loadEntryDraft(sessionId: string): EngineEntryInput | null {
	try {
		const raw = localStorage.getItem(NS + sessionId);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<EngineEntryInput> | null;
		if (!parsed || typeof parsed !== 'object') return null;
		if (typeof parsed.idea !== 'string') return null; // no idea = no draft
		return {
			title: typeof parsed.title === 'string' ? parsed.title : '',
			idea: parsed.idea,
			input_text: typeof parsed.input_text === 'string' ? parsed.input_text : null,
			genre: {
				name: parsed.genre?.name ?? 'Cinematic',
				style: parsed.genre?.style ?? 'cinematic natural light',
			},
			ratio: typeof parsed.ratio === 'string' ? parsed.ratio : '16:9',
			scale: {
				scenes: parsed.scale?.scenes ?? 1,
				shots_per_scene: parsed.scale?.shots_per_scene ?? 2,
				clip_s:
					Array.isArray(parsed.scale?.clip_s) &&
					typeof parsed.scale?.clip_s[0] === 'number' &&
					typeof parsed.scale?.clip_s[1] === 'number'
						? ([parsed.scale!.clip_s![0], parsed.scale!.clip_s![1]] as [number, number])
						: ([8, 10] as [number, number]),
			},
			time_of_day: typeof parsed.time_of_day === 'string' ? parsed.time_of_day : 'midday',
			weather: typeof parsed.weather === 'string' ? parsed.weather : 'clear',
			// M4: mood is optional on the wire; absent (pre-M4 drafts) defaults
			// to 50 ("balanced" band, the pre-M4 pinned structure).
			mood: typeof parsed.mood === 'number' && Number.isFinite(parsed.mood) ? parsed.mood : 50,
			// Phase 3: the S0.5 tree's manual-override pins survive a
			// re-mount (absent / pre-Phase-3 drafts load as no-pins, so the
			// tree's auto values win). MUST be a stable object — never
			// `undefined`: the StructurePanel binds into it and a missing
			// object crashes the panel's deriveds (`undefined.driver`) into
			// a Svelte re-render loop.
			overrides:
				parsed.overrides && typeof parsed.overrides === 'object'
					? (parsed.overrides as import('./engine').TreeOverrides)
					: {},
		};
	} catch {
		return null;
	}
}

export function saveEntryDraft(sessionId: string, entry: EngineEntryInput): void {
	try {
		// A draft only means something once the user typed an idea;
		// otherwise don't write an empty default blob.
		if (entry.idea.trim() === '') {
			localStorage.removeItem(NS + sessionId);
			return;
		}
		localStorage.setItem(NS + sessionId, JSON.stringify(entry));
	} catch {
		// localStorage unavailable (private mode / quota) — in-memory-only.
	}
}

export function clearEntryDraft(sessionId: string): void {
	try {
		localStorage.removeItem(NS + sessionId);
	} catch {
		// ignore
	}
}
