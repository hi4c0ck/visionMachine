// M2 seed card — "one file = one reproducible film plan".
//
// A compact, shareable snapshot of a Director G0 entry (plus an optional
// novel preview), serialized to a single JSON file via path-in / path-out
// dialogs. No session keying, no versioning beyond the fixed `v: 1`
// discriminator. The wire shape here is the source of truth; the Rust side
// mirrors it 1:1 in src-tauri/src/commands/director.rs (`SeedCard`).
//
// Pure + dependency-free: no Tauri import, no I/O. The backend owns the
// file read/write (`director_save_seed_card` / `director_load_seed_card`);
// the UI owns the shape (`toSeedCard` / `fromSeedCard` / `parseSeedCard`).

import type { EngineEntryInput, TreeOverrides } from './engine';

/** Card genre (mirror of engine's `Genre`). */
export interface SeedGenre {
	name: string;
	style: string;
}

/** Card scale (mirror of engine's `SeedScale`; G0 grid: scenes 1..24,
 * shots 1..5, clip 4..12 s). */
export interface SeedCardScale {
	scenes: number;
	shots_per_scene: number;
	/** [min, max] clip seconds. */
	clip_s: [number, number];
}

export interface SeedCard {
	/** 1 = the original G0 card; 2 = the S0.5 structural-tree card (carries
	 * `overrides` + the tree's pinned shape). `v` absent parses as 1. */
	v: 1 | 2;
	title: string;
	idea: string;
	genre: SeedGenre;
	/** Optional mood passthrough, clamped 0..100 (defaults to 50 when
	 * omitted; M4 makes it first-class). Kept a bare number — no mood-type
	 * import — so M4 can enrich it without breaking this file. */
	mood?: number;
	ratio: string;
	scale: SeedCardScale;
	time_of_day: string;
	weather: string;
	/** Phase 3: the S0.5 tree's manual-override pins (the "always give the
	 * user a manual opportunity" rule). Absent on v:1 cards + when the
	 * entry carries no pins; the tree's auto values win where a pin is
	 * missing. */
	overrides?: TreeOverrides;
	/** First novel scene prose, trimmed to <= 280 chars (no ellipsis
	 * unless truncation happened; the caller supplies it). */
	preview?: string;
}

/** `EngineEntryInput` plus the optional mood + overrides passthrough
 * (M4 + Phase 3 make them first-class; until then they round-trip
 * without polluting the G0 type). */
export type SeedCardEntry = EngineEntryInput & { mood?: number; overrides?: TreeOverrides };

/** Named error thrown by the seed-card guards. */
export class SeedCardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SeedCardError';
	}
}

/** Hard cap on the card's preview prose (M2 design). */
export const SEED_CARD_PREVIEW_MAX = 280;

// G0 grid ranges (mirror of the Rust engine's `SeedScale` schema).
const SCENES_RANGE = [1, 24] as const;
const SHOTS_RANGE = [1, 5] as const;
const CLIP_RANGE = [4, 12] as const;

// Same fallbacks as Rust's `default_engine_entry` when the G0 look axes
// are absent.
const DEFAULT_TIME_OF_DAY = 'midday';
const DEFAULT_WEATHER = 'clear';

/** Map a G0 entry to a shareable card. `mood` is omitted unless the entry
 * carries one (M4); `novelPreview` is trimmed + capped, never ellipsized
 * by us (the caller decides truncation). Phase 3: when the entry carries
 * the S0.5 tree's `overrides` pins, the card bumps to `v: 2` and carries
 * them, so a shared card reproduces the same structural shape. */
export function toSeedCard(entry: EngineEntryInput, novelPreview?: string): SeedCard {
	const overrides = (entry as { overrides?: TreeOverrides }).overrides;
	const hasOverrides = hasAnyPin(overrides);
	const card: SeedCard = {
		v: hasOverrides ? 2 : 1,
		title: entry.title,
		idea: entry.idea,
		genre: { name: entry.genre.name, style: entry.genre.style },
		ratio: entry.ratio,
		scale: {
			scenes: entry.scale.scenes,
			shots_per_scene: entry.scale.shots_per_scene,
			clip_s: [entry.scale.clip_s[0], entry.scale.clip_s[1]],
		},
		time_of_day: entry.time_of_day ?? DEFAULT_TIME_OF_DAY,
		weather: entry.weather ?? DEFAULT_WEATHER,
	};
	// Mood is a bare-number passthrough: `EngineEntryInput` has no mood
	// field yet, so it stays omitted — picked up automatically when M4
	// adds it, with no signature change here.
	const mood = (entry as { mood?: unknown }).mood;
	if (typeof mood === 'number' && Number.isFinite(mood)) {
		card.mood = Math.min(100, Math.max(0, Math.round(mood)));
	}
	// Phase 3: carry the tree's override pins (the "manual override" rule
	// survives sharing).
	if (hasOverrides) {
		card.overrides = overrides;
	}
	if (typeof novelPreview === 'string') {
		const trimmed = novelPreview.trim();
		if (trimmed !== '') {
			card.preview = trimmed.slice(0, SEED_CARD_PREVIEW_MAX);
		}
	}
	return card;
}

/** Inverse of `toSeedCard`: coerce a parsed card back into a G0 entry.
 * `mood` absent -> dropped; present -> carried on `SeedCardEntry`. */
export function fromSeedCard(c: SeedCard): SeedCardEntry {
	const out: SeedCardEntry = {
		title: c.title,
		idea: c.idea,
		genre: { name: c.genre.name, style: c.genre.style },
		ratio: c.ratio,
		scale: {
			scenes: c.scale.scenes,
			shots_per_scene: c.scale.shots_per_scene,
			clip_s: [c.scale.clip_s[0], c.scale.clip_s[1]],
		},
		time_of_day: c.time_of_day,
		weather: c.weather,
	};
	if (c.mood !== undefined) out.mood = c.mood;
	// Phase 3: restore the S0.5 tree's override pins (absent on v:1 cards).
	if (c.overrides !== undefined && hasAnyPin(c.overrides)) {
		out.overrides = c.overrides;
	}
	return out;
}

/** Serialize a card to compact JSON (the backend re-prettifies on save). */
export function seedCardToJson(c: SeedCard): string {
	return JSON.stringify(c);
}

/** Parse + validate a raw seed-card JSON string (the UI half of
 * `director_load_seed_card`, which returns the raw file text). */
export function parseSeedCard(raw: string): SeedCard {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		throw new SeedCardError(`seed card is not valid JSON: ${String(e)}`);
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new SeedCardError('seed card must be a JSON object');
	}
	const o = parsed as Record<string, unknown>;

	// `v` is the version discriminator: 1 = original G0 card, 2 = the S0.5
	// structural-tree card (carries `overrides`). Absent parses as 1.
	if (o.v !== undefined && o.v !== 1 && o.v !== 2) {
		throw new SeedCardError(`unsupported seed card version ${String(o.v)} (expected 1 or 2)`);
	}

	const title = requireString(o.title, 'title');
	const idea = requireString(o.idea, 'idea'); // a card with no idea is useless
	const genre = requireObject(o.genre, 'genre') as Record<string, unknown>;
	const genreName = requireString(genre.name, 'genre.name');
	const genreStyle = requireString(genre.style, 'genre.style');
	const ratio = requireString(o.ratio, 'ratio');
	const timeOfDay = requireString(o.time_of_day, 'time_of_day');
	const weather = requireString(o.weather, 'weather');

	// Scale: finite numbers within the G0 grid ranges.
	const scale = requireObject(o.scale, 'scale') as Record<string, unknown>;
	const assertGrid = (n: number, [lo, hi]: readonly [number, number], field: string): number => {
		if (n < lo || n > hi) {
			throw new SeedCardError(`seed card ${field} = ${n} is out of range ${lo}..${hi}`);
		}
		return n;
	};
	const scenes = assertGrid(
		requireNumber(scale.scenes, 'scale.scenes'),
		SCENES_RANGE,
		'scale.scenes'
	);
	const shots = assertGrid(
		requireNumber(scale.shots_per_scene, 'scale.shots_per_scene'),
		SHOTS_RANGE,
		'scale.shots_per_scene'
	);
	if (!Array.isArray(scale.clip_s) || scale.clip_s.length !== 2) {
		throw new SeedCardError('seed card scale.clip_s must be [min, max]');
	}
	const clipMin = assertGrid(
		requireNumber(scale.clip_s[0], 'scale.clip_s[0]'),
		CLIP_RANGE,
		'scale.clip_s[0]'
	);
	const clipMax = assertGrid(
		requireNumber(scale.clip_s[1], 'scale.clip_s[1]'),
		CLIP_RANGE,
		'scale.clip_s[1]'
	);

	const card: SeedCard = {
		v: o.v === 2 ? 2 : 1,
		title,
		idea,
		genre: { name: genreName, style: genreStyle },
		ratio,
		scale: {
			scenes,
			shots_per_scene: shots,
			clip_s: [clipMin, clipMax],
		},
		time_of_day: timeOfDay,
		weather,
	};

	if (o.mood !== undefined) {
		// Clamp into 0..100 when present (bare number, not a mood type).
		const mood = requireNumber(o.mood, 'mood');
		card.mood = Math.min(100, Math.max(0, mood));
	}

	// Phase 3: the S0.5 tree's override pins (only meaningful on v:2 cards,
	// but accepted on any card that carries them).
	if (o.overrides !== undefined) {
		const ov = parseOverrides(o.overrides);
		if (hasAnyPin(ov)) {
			card.overrides = ov;
		}
	}

	if (o.preview !== undefined) {
		if (typeof o.preview !== 'string') {
			throw new SeedCardError('seed card preview must be a string');
		}
		const trimmed = o.preview.trim();
		if (trimmed !== '') {
			card.preview = trimmed.slice(0, SEED_CARD_PREVIEW_MAX);
		}
	}

	return card;
}

// ── Small validation guards (named errors, no silent fallbacks) ───────────

function requireString(v: unknown, field: string): string {
	if (typeof v !== 'string') {
		throw new SeedCardError(`seed card ${field} is missing or not a string`);
	}
	return v;
}

function requireNumber(v: unknown, field: string): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new SeedCardError(`seed card ${field} is missing or not a finite number`);
	}
	return v;
}

function requireObject(v: unknown, field: string): object {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) {
		throw new SeedCardError(`seed card ${field} is missing or not an object`);
	}
	return v;
}

// ── Phase 3: the S0.5 tree's override pins ─────────────────────────────────

/** True when an override set carries at least one concrete pin. The auto
 * shape is "all fields absent/empty" — a pin is any non-null scalar or a
 * non-empty per-branch array slot. */
export function hasAnyPin(o: TreeOverrides | undefined | null): boolean {
	if (!o || typeof o !== 'object') return false;
	const numericPinned =
		o.scenes !== undefined && o.scenes !== null ||
		o.shots_per_scene !== undefined && o.shots_per_scene !== null ||
		o.target_duration_s !== undefined && o.target_duration_s !== null ||
		(o.driver !== undefined && o.driver !== null && o.driver.trim() !== '');
	const transitionsPinned = (o.transitions ?? []).some((t) => t !== null && t !== undefined);
	const tempPinned = (o.temp_arc ?? []).some((t) => t !== null && t !== undefined);
	return numericPinned || transitionsPinned || tempPinned;
}

/** Parse + loosely validate the `overrides` object (no range enforcement —
 * the engine clamps on build; the card only keeps the pin shape sound). */
function parseOverrides(raw: unknown): TreeOverrides {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw new SeedCardError('seed card overrides must be an object');
	}
	const o = raw as Record<string, unknown>;
	const num = (v: unknown, field: string): number | undefined => {
		if (v === undefined || v === null) return undefined;
		return requireNumber(v, `overrides.${field}`);
	};
	const out: TreeOverrides = {
		scenes: num(o.scenes, 'scenes'),
		shots_per_scene: num(o.shots_per_scene, 'shots_per_scene'),
		target_duration_s: num(o.target_duration_s, 'target_duration_s'),
		driver:
			typeof o.driver === 'string' && o.driver.trim() !== '' ? o.driver.trim() : undefined,
	};
	if (Array.isArray(o.transitions)) {
		out.transitions = o.transitions.map((t, i) => {
			if (t === undefined || t === null) return null;
			if (typeof t !== 'string') {
				throw new SeedCardError(`seed card overrides.transitions[${i}] must be a string`);
			}
			return t;
		});
	}
	if (Array.isArray(o.temp_arc)) {
		out.temp_arc = o.temp_arc.map((t, i) => {
			if (t === undefined || t === null) return null;
			if (!Array.isArray(t) || t.length !== 2) {
				throw new SeedCardError(`seed card overrides.temp_arc[${i}] must be [open_K, close_K]`);
			}
			return [requireNumber(t[0], `overrides.temp_arc[${i}][0]`), requireNumber(t[1], `overrides.temp_arc[${i}][1]`)] as [
				number,
				number,
			];
		});
	}
	return out;
}
