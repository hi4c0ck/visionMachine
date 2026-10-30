// ── Engine wire mirrors (snake_case — exact `#[serde(rename_all = "snake_case")]`
// of the Rust engine submodule). These are separate from the camelCase Phase-0
// `FlowDocument` mirrors above; an `EngineRun` nests inside `FlowDocument` as
// `engine: EngineRun | null`.
//
// Source of truth: src-tauri/src/generation/video_flow/engine/{types,seed,gates}.rs

// ── S0 entry ───────────────────────────────────────────────────────────────

export interface Genre {
	name: string;
	style: string;
}

export interface SeedScale {
	scenes: number;
	shots_per_scene: number;
	/** [min, max] clip seconds. */
	clip_s: [number, number];
}

export interface FilmSeed {
	title: string;
	idea: string;
	input_text?: string | null;
	genre: Genre;
	ratio: string;
	scale: SeedScale;
}

/** The S0 input the UI submits (Director G0 controls). */
export interface EngineEntryInput {
	title: string;
	idea: string;
	input_text?: string | null;
	genre: Genre;
	ratio: string;
	scale: SeedScale;
	/** G0 look axes (feed S1/S2 seeding). */
	time_of_day?: string;
	weather?: string;
}

// ── S1 visual novel ────────────────────────────────────────────────────────

export interface FilmLook {
	title: string;
	logline: string;
	style: string;
	world: string;
	palette: string;
	time_of_day: string;
	weather: string;
}

export interface NovelShot {
	prose: string;
	beats: string[];
}

export interface NovelScene {
	title: string;
	prose: string;
	shots: NovelShot[];
}

export interface VisualNovel {
	film: FilmLook;
	scenes: NovelScene[];
}

// ── S2 scene base + timeline ───────────────────────────────────────────────

export interface CameraConcern {
	size?: string;
	angle?: string;
	framing?: string;
	dof?: string;
}

export interface LensConcern {
	focal_mm?: number;
	distortion?: string | null;
}

export interface MotionConcern {
	zoom?: string;
	move?: string;
	speed?: string;
}

export interface LightingConcern {
	key?: string;
	contrast?: string;
	color_temp_K: number;
	pattern?: string | null;
}

export interface GradeConcern {
	palette?: string;
	saturation?: string;
	contrast?: string;
	film_stock?: string;
}

export interface AudioConcern {
	foley?: string;
	sfx?: string;
	music_cue?: string;
	silence: boolean;
}

export interface Concerns {
	camera: CameraConcern;
	lens: LensConcern;
	motion: MotionConcern;
	lighting: LightingConcern;
	grade: GradeConcern;
	effects: string[];
	audio: AudioConcern;
}

export interface SceneSpec {
	scene_id: string;
	time_of_day: string;
	weather: string;
	light: LightingConcern;
	grade: GradeConcern;
	ambience: string;
	tempo: string;
	effects_base: string[];
}

export interface TimelineShot {
	shot_id: string;
	novel_ref: string;
	clip_s: number;
	transition_out: string;
	transition_note: string;
}

export interface TimelineScene {
	scene_id: string;
	title: string;
	transition_in: string;
	transition_note: string;
	time_of_day: string;
	weather: string;
	shots: TimelineShot[];
}

export interface SceneTimeline {
	timeline_id: string;
	total_s: number;
	scenes: TimelineScene[];
}

// ── S3 shot spec + S3′/S4 molecule ─────────────────────────────────────────

export interface ShotContent {
	prose: string;
	beats: string[];
}

export interface PartialConcerns {
	camera?: CameraConcern | null;
	lens?: LensConcern | null;
	motion?: MotionConcern | null;
	lighting?: LightingConcern | null;
	grade?: GradeConcern | null;
	effects?: string[] | null;
	audio?: AudioConcern | null;
}

export interface SubSlice {
	from_s: number;
	to_s: number;
	note: string;
	state?: PartialConcerns | null;
}

export interface ShotSpec {
	shot_id: string;
	novel_ref: string;
	content: ShotContent;
	clip_s: number;
	transition_in: string;
	transition_out: string;
	concerns: Concerns;
	sub_timeline: SubSlice[];
}

export interface Prompts {
	image: string;
	video: string;
}

export interface ShotMolecule {
	inherit: string;
	subject: string;
	composition: CameraConcern;
	lens: LensConcern;
	motion: MotionConcern;
	effects_delta: string[];
	audio: AudioConcern;
	transition_in: string;
	transition_out: string;
	clip_s: number;
	prompts: Prompts;
}

// ── Gates + S5 verify ──────────────────────────────────────────────────────

export type GateId =
	| 'g0_entry'
	| 'g1_novel_review'
	| 'g2_spec_review'
	| 'g3_clip_review'
	| 'g4_final_review';

export type Step = 'node_a' | 'scene_divide' | 'spec' | 'media_generation' | 'assembly';

export interface GateState {
	gate: GateId;
	status: 'confirmed' | 'pending' | 'auto';
	acquirable: string[];
	backtrack: Step[];
	confirm: string;
}

/** Where the S1 novel came from (mirror of Rust `ExpansionSource`). */
export type ExpansionSource = 'template' | 'llm';

export interface VerifyReport {
	verified: boolean;
	issues: string[];
	frames: number[];
	total_frames: number;
}

export interface EngineRun {
	seed: FilmSeed;
	novel: VisualNovel;
	scenes: SceneSpec[];
	specs: ShotSpec[];
	molecules: ShotMolecule[];
	timeline: SceneTimeline;
	verify: VerifyReport;
	gates: GateState[];
	/** Template by default (old docs load verbatim). */
	expansion?: ExpansionSource;
	/** LLM model id (when `expansion === 'llm'`) or the named fallback
	 * "template · LLM ({model}) failed: {reason}". */
	expansion_note?: string | null;
}

/** S1 source chip for the panel: 'LLM · {model}' / 'template' /
 * 'template · LLM failed: {reason}' (truncated). */
export function expansionLabel(run: EngineRun): string {
	if (run.expansion === 'llm') {
		return run.expansion_note ? `LLM · ${run.expansion_note}` : 'LLM';
	}
	if (run.expansion_note) {
		return run.expansion_note;
	}
	return 'template';
}

// ── Closed tag vocabularies (mirror of tag_vocabulary.rs) ─────────────────

export const VOCAB = {
	size: ['wide', 'medium', 'close-up', 'over-the-shoulder'],
	angle: ['eye', 'low', 'high', 'dutch', 'overhead', 'worm', 'bird'],
	framing: ['rule_of_thirds', 'centered', 'symmetrical', 'fill_frame', 'negative_space'],
	dof: ['shallow', 'medium', 'deep'],
	lens_focal: [14, 24, 35, 50, 85, 135],
	zoom: ['static', 'in', 'out', 'crash', 'rack_focus', 'push', 'pull'],
	move: ['static', 'pan', 'tilt', 'track', 'dolly', 'crane', 'handheld', 'steadicam', 'orbit', 'drone', 'zoom'],
	speed: ['slow', 'normal', 'fast', 'speed_ramp'],
	light_key: ['soft', 'hard', 'low-key', 'high-key', 'backlit'],
	light_contrast: ['low', 'medium', 'high'],
	grade_saturation: ['saturated', 'desaturated', 'neutral'],
	grade_contrast: ['low', 'medium', 'high'],
	film_stock: ['kodak_250d', 'kodak_5219', 'kodak_5207', 'fuji_super_35', 'fuji_velvia', 'cine_organic', 'neutral', 'custom'],
	effects: ['fog', 'rain', 'smoke', 'lens_flare', 'bokeh', 'sparks', 'dust', 'snow', 'fire', 'magic_glow', 'glitch', 'none'],
	tempo: ['slow', 'medium', 'fast', 'staccato', 'sustained'],
	transition: ['hard_cut', 'crossfade', 'dissolve', 'wipe', 'match_cut', 'jump_cut', 'whip_pan', 'l_cut', 'j_cut', 'cut_on_action'],
	time_of_day: ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'],
} as const;

export const GENRE_PRESETS: Array<{ name: string; style: string }> = [
	{ name: 'Documentary', style: 'warm nature documentary, natural available light, golden hour to dusk' },
	{ name: 'Thriller', style: 'tense thriller, low-key lighting, cold teal tones' },
	{ name: 'Horror', style: 'atmospheric horror, deep shadows, desaturated' },
	{ name: 'Sci-fi', style: 'visionary sci-fi, vast futuristic scale, clean cold light' },
	{ name: 'Fantasy', style: 'epic fantasy, painterly landscapes, golden hour' },
	{ name: 'Film noir', style: 'black and white film noir, hard shadows, rain' },
	{ name: 'Romance', style: 'soft romantic cinema, warm bokeh, pastel light' },
	{ name: 'Action', style: 'kinetic action, high contrast, motion energy' },
];

export const RATIOS: readonly string[] = ['16:9', '9:16', '1:1'];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** 720p engine frame rate (mirror of `derive::FRAME_RATE`). */
export const FRAME_RATE = 24;

export function framesOf(clip_s: number): number {
	return Math.max(0, clip_s) * FRAME_RATE;
}

/** A compact concern summary string for shot-sheet headers. */
export function concernSummary(c: Concerns): string {
	const bits: string[] = [];
	const cam = [c.camera?.size, c.camera?.angle].filter((x) => x && x !== 'eye').join('/');
	if (cam) bits.push(cam);
	if (c.lens?.focal_mm) bits.push(`${c.lens.focal_mm}mm`);
	const mv = [c.motion?.move, c.motion?.zoom].filter((x) => x && x !== 'static').join(',');
	if (mv) bits.push(mv);
	if (c.lighting?.color_temp_K) bits.push(`${c.lighting.color_temp_K}K`);
	if (c.grade?.film_stock) bits.push(c.grade.film_stock);
	const fx = (c.effects ?? []).filter((e) => e && e !== 'none');
	if (fx.length) bits.push(`fx:${fx.join(',')}`);
	if ((c.audio?.music_cue ?? '') !== '' && c.audio?.music_cue !== 'none') bits.push(`♫ ${c.audio.music_cue}`);
	return bits.length ? bits.join(' · ') : '—';
}

/** The S3 shot specs grouped by scene (order matches `timeline.scenes`). */
export function specsByScene(run: EngineRun): Array<{ scene: SceneSpec; specs: ShotSpec[]; molecules: ShotMolecule[] }> {
	// specs + molecules are scene-major (si, ki), 1:1 by index.
	let i = 0;
	return run.scenes.map((scene, si) => {
		const n = run.novel.scenes[si]?.shots.length ?? 0;
		const specs = run.specs.slice(i, i + n);
		const molecules = run.molecules.slice(i, i + n);
		i += n;
		void si;
		return { scene, specs, molecules };
	});
}

/** The verified timeline as flat shot rows with cumulative time. */
export function timelineRows(run: EngineRun): Array<{
	shot_id: string;
	novel_ref: string;
	from_s: number;
	to_s: number;
	transition_out: string;
	frames: number;
}> {
	let t = 0;
	const rows: ReturnType<typeof timelineRows> = [];
	for (const m of run.molecules) {
		rows.push({
			shot_id: m.inherit,
			novel_ref: m.inherit,
			from_s: t,
			to_s: t + m.clip_s,
			transition_out: m.transition_out,
			frames: framesOf(m.clip_s),
		});
		t += m.clip_s;
	}
	return rows;
}

// ── Sub-timeline folding + diffing (mirror of axes.fold / axes.diff) ─────

/** Carry a base concern state forward over a sparse slice → full state. */
function carryForward(base: Concerns, slice: PartialConcerns | null | undefined): Concerns {
	const pick = <T>(o: T | undefined, b: T): T => (o !== undefined && o !== null ? o : b);
	return {
		camera: {
			size: pick(slice?.camera?.size, base.camera.size),
			angle: pick(slice?.camera?.angle, base.camera.angle),
			framing: pick(slice?.camera?.framing, base.camera.framing),
			dof: pick(slice?.camera?.dof, base.camera.dof),
		},
		lens: {
			focal_mm: pick(slice?.lens?.focal_mm, base.lens.focal_mm),
			distortion: slice?.lens?.distortion ?? base.lens.distortion,
		},
		motion: {
			zoom: pick(slice?.motion?.zoom, base.motion.zoom),
			move: pick(slice?.motion?.move, base.motion.move),
			speed: pick(slice?.motion?.speed, base.motion.speed),
		},
		lighting: {
			key: pick(slice?.lighting?.key, base.lighting.key),
			contrast: pick(slice?.lighting?.contrast, base.lighting.contrast),
			color_temp_K: pick(slice?.lighting?.color_temp_K, base.lighting.color_temp_K),
			pattern: slice?.lighting?.pattern ?? base.lighting.pattern,
		},
		grade: {
			palette: pick(slice?.grade?.palette, base.grade.palette),
			saturation: pick(slice?.grade?.saturation, base.grade.saturation),
			contrast: pick(slice?.grade?.contrast, base.grade.contrast),
			film_stock: pick(slice?.grade?.film_stock, base.grade.film_stock),
		},
		effects: slice?.effects ?? base.effects,
		audio: {
			foley: pick(slice?.audio?.foley, base.audio.foley),
			sfx: pick(slice?.audio?.sfx, base.audio.sfx),
			music_cue: pick(slice?.audio?.music_cue, base.audio.music_cue),
			silence: pick(slice?.audio?.silence, base.audio.silence),
		},
	};
}

const showVal = (v?: string | number | boolean) =>
	v === undefined || v === null || v === '' ? '∅' : String(v);

/** DIFF two concern states → "field: a -> b" lines (the computed sub-timeline delta). */
export function concernsDiff(a: Concerns, b: Concerns): string[] {
	const out: string[] = [];
	const fd = (f: string, va: string | number | boolean | undefined, vb: string | number | boolean | undefined) => {
		if (va !== vb) out.push(`${f}: ${showVal(va)} -> ${showVal(vb)}`);
	};
	(['size', 'angle', 'framing', 'dof'] as const).forEach((k) => fd(`camera.${k}`, a.camera?.[k], b.camera?.[k]));
	fd('lens.focal_mm', a.lens?.focal_mm, b.lens?.focal_mm);
	(['zoom', 'move', 'speed'] as const).forEach((k) => fd(`motion.${k}`, a.motion?.[k], b.motion?.[k]));
	(['key', 'contrast'] as const).forEach((k) => fd(`lighting.${k}`, a.lighting?.[k], b.lighting?.[k]));
	fd('lighting.color_temp_K', a.lighting?.color_temp_K, b.lighting?.color_temp_K);
	(['saturation', 'contrast', 'film_stock', 'palette'] as const).forEach((k) =>
		fd(`grade.${k}`, a.grade?.[k], b.grade?.[k]),
	);
	if (JSON.stringify(a.effects ?? []) !== JSON.stringify(b.effects ?? []))
		out.push(`effects: [${(a.effects ?? []).join(', ')}] -> [${(b.effects ?? []).join(', ')}]`);
	fd('audio.silence', a.audio?.silence, b.audio?.silence);
	return out;
}

export interface SliceEffective {
	from_s: number;
	to_s: number;
	note: string;
	state: Concerns;
	deltas: string[];
}

/** Fold a shot's sub-slices over its base concerns → effective states + computed deltas. */
export function foldSlices(spec: ShotSpec): SliceEffective[] {
	let prev = spec.concerns;
	const out: SliceEffective[] = [];
	for (const sl of spec.sub_timeline) {
		const cur = carryForward(prev, sl.state ?? null);
		out.push({
			from_s: sl.from_s,
			to_s: sl.to_s,
			note: sl.note,
			state: cur,
			deltas: concernsDiff(prev, cur),
		});
		prev = cur;
	}
	return out;
}

