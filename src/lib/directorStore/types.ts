// TS mirrors of the video-flow Rust wire types (camelCase serde).
// One conversion layer, no transforms: the field names match
// #[serde(rename_all = "camelCase")] on the Rust side exactly.
// Source of truth: src-tauri/src/generation/video_flow/

import type { EngineRun, ShotSpec } from './engine';
import { concernSummary } from './engine';

export type VideoTag =
	| 'scene'
	| 'camera'
	| 'lighting'
	| 'effect'
	| 'transition'
	| 'motion';

export type ScoreCombinator = 'mean' | 'min' | 'weighted';

export interface PlanSection {
	tag: VideoTag;
	frameStart: number;
	frameEnd: number;
	prompt: string;
	/** Provenance span ids (string[]; transparent SpanId). Empty = unpopulated. */
	from: string[];
}

export interface PlanPipe {
	index: number;
	title: string;
	globalStyle: string;
	mediaMode: string;
	sections: PlanSection[];
	/** Explicit cumulative content length (frames). 0 = legacy/sparse pipe
	 * (materialize falls back to the default floor); >0 = a concrete engine
	 * pipe lengthed to its own cumulative shot-clip content, so the
	 * generated composer pipe matches its content with no dead tail. */
	lengthFrames: number;
}

export interface StructuredVideoPlan {
	flowVersion: number;
	pipes: PlanPipe[];
}

export interface IntentClause {
	id: string;
	text: string;
}

export interface IntentSnapshot {
	entryText: string;
	clauses: IntentClause[];
	refs: Array<{ id: string; kind: string; path: string }>;
}

export interface Layer {
	kind: string;
	text: string;
	from: string[];
}

export interface Ambient {
	description: string;
	dynamics: string;
	from: string[];
}

export interface Novel {
	stepVersion: number;
	primary: Layer;
	secondary: Layer[];
	ambient: Ambient[];
}

export interface ScoreNode {
	id: string;
	kind: 'section' | 'element' | 'ambient' | 'transition';
	score: number;
	weight: number;
	children: ScoreNode[];
}

export interface ScoreTree {
	stepVersion: number;
	combinator: ScoreCombinator;
	root: ScoreNode;
}

export interface FlowElement {
	id: string;
	tag: VideoTag;
	frameStart: number;
	frameEnd: number;
	prompt: string;
	from: string[];
	pipeIndex: number;
}

export interface VersionTriple {
	flowVersion: number;
	expandVersion: number;
	structureVersion: number;
	criticVersion: number;
	/** 0 = no local critic model yet (deterministic DefaultCritic). */
	criticModelVersion: number;
}

export interface RegenerationContract {
	version: VersionTriple;
	elements: FlowElement[];
	fallback?: string | null;
}

export interface ModelBuildSpec {
	modelVersion: number;
	role: string;
	base: string;
	heads: Array<{ name: string; trainedOn?: string | null }>;
}

export interface ModelHandle {
	spec: ModelBuildSpec;
	basePath: string;
	untrained: boolean;
}

export interface FlowDocument {
	flowVersion: number;
	intent: IntentSnapshot;
	novel: Novel;
	structured: StructuredVideoPlan;
	scoretree: ScoreTree;
	lowered: {
		elements: FlowElement[];
		trace: Array<{ elementId: string; sectionId: string }>;
	};
	regen: RegenerationContract;
	criticModel: ModelHandle | null;
	/** S0→S5 engine run (absorbed from `harness/`). `null` for docs produced
	 before the engine landed, or when the run was entry-less. */
	engine: EngineRun | null;
}

/** One row of the Scoreboard run list (director_list_flows). */
export interface FlowSummary {
	flowVersion: number;
	overall: number;
	criticModelVersion: number;
	sectionCount: number;
	entryText: string;
	/** S5 verify state for this run (false when no engine was produced). */
	verified: boolean;
}

/** Response shape of director_run_flow. */
export interface RunFlowResult {
	document: FlowDocument;
	flowVersion: number;
}

// ── Golden set (design §5.2 / §7.3, the additive per-session golden.json) ──
// A run the user flagged as a quality baseline. It freezes the entry text +
// per-section scores so a later critic version can be diffed against the same
// text (Q2 "did the update drift quality?" / Q3 "keep critic head vN?").
// Mirrors the Rust `GoldenRun` in commands/director.rs (camelCase serde).
export interface GoldenSectionBaseline {
	sectionIndex: number;
	tag: VideoTag;
	frameStart: number;
	frameEnd: number;
	score: number;
}
export interface GoldenRun {
	flowVersion: number;
	/** The entry text the run was built from (the golden direction, Q2/Q3 key). */
	entryText: string;
	/** The overall score at capture time (frozen baseline, I2-derived). */
	baselineOverall: number;
	/** Per-section baseline scores, in plan.primary().sections order. */
	sections: GoldenSectionBaseline[];
	/** The critic model version that produced the baseline. */
	criticModelVersion: number;
	/** Unix-seconds the baseline was flagged. */
	starredAt: number;
}

/**
 * Q2 drift: diff a golden baseline's per-section scores against the SAME
 * section layout of a current `FlowDocument`. The join key is the section
 * ordinal (critic leaf `s{i}` ↔ section i, the same 1:1 the `tagBars`
 * helper uses), so a golden captured on an older run lines up against the
 * current doc by index. Returns, per golden, the overall delta (current −
 * baseline) + the per-section deltas. `null` when the current doc has no
 * matching section at an index (layout changed) — rendered as "n/a", never
 * a fake number. Pure + total: never throws.
 */
export function goldenDrift(
	golden: GoldenRun,
	doc: FlowDocument,
): Array<{ sectionIndex: number; tag: VideoTag; baseline: number; current: number | null; delta: number | null }> {
	const tree = doc.scoretree;
	const comb = tree.combinator;
	const leaves = tree.root.children;
	const currentAt = (i: number): number | null =>
		leaves[i] !== undefined ? collapse(leaves[i], comb) : null;
	return golden.sections.map((g) => {
		const cur = currentAt(g.sectionIndex);
		return {
			sectionIndex: g.sectionIndex,
			tag: g.tag,
			baseline: g.score,
			current: cur,
			delta: cur === null ? null : cur - g.score,
		};
	});
}

// ── Small pure helpers (mirror of critic.rs math + regen.rs id scheme) ─────

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Rust `ScoreTree::overall()` — collapse root via its combinator. */
export function collapse(node: ScoreNode, comb: ScoreCombinator): number {
	if (node.children.length === 0) return clamp01(node.score);
	const childScores = node.children.map((c) => collapse(c, comb));
	if (comb === 'min') return childScores.length ? Math.min(...childScores) : 0;
	if (comb === 'weighted') {
		const wsum = node.children.reduce((s, c) => s + clamp01(c.weight), 0);
		if (wsum === 0)
			return childScores.reduce((a, b) => a + b, 0) / childScores.length;
		const weighted = node.children.reduce(
			(s, c, i) => s + childScores[i] * clamp01(c.weight),
			0
		);
		return weighted / wsum;
	}
	return childScores.reduce((a, b) => a + b, 0) / childScores.length;
}

export function overall(doc: FlowDocument): number {
	return collapse(doc.scoretree.root, doc.scoretree.combinator);
}

/**
 * Q1 tag bars: group the run's score leaves by the plan's section tags.
 * Verified join: critic leaves are `s{i}` (mod.rs:151), 1:1 with
 * plan.pipes[0].sections[i]. Only tag types the run actually used appear;
 * result is sorted worst-first (score ascending).
 */
export function tagBars(doc: FlowDocument): Array<{
	tag: VideoTag;
	avg: number;
	sections: Array<{ sectionIndex: number; frameStart: number; frameEnd: number; prompt: string; score: number }>;
}> {
	const tree = doc.scoretree;
	const comb = tree.combinator;
	const sections = doc.structured.pipes[0]?.sections ?? [];
	// leaves in order: root.children[i] corresponds to section i (s{i})
	const leaves = tree.root.children;
	const byTag = new Map<VideoTag, number[]>();
	const byTagSections = new Map<
		VideoTag,
		Array<{ sectionIndex: number; frameStart: number; frameEnd: number; prompt: string; score: number }>
	>();
	sections.forEach((s, i) => {
		const leaf = leaves[i];
		const score = leaf ? collapse(leaf, comb) : 0.5; // missing leaf → neutral
		const arr = byTag.get(s.tag) ?? [];
		arr.push(score);
		byTag.set(s.tag, arr);
		const sArr = byTagSections.get(s.tag) ?? [];
		sArr.push({
			sectionIndex: i,
			frameStart: s.frameStart,
			frameEnd: s.frameEnd,
			prompt: s.prompt,
			score,
		});
		byTagSections.set(s.tag, sArr);
	});
	return [...byTag.keys()]
		.map((tag) => ({
			tag,
			avg: (byTag.get(tag)! as number[]).reduce((a, b) => a + b, 0) /
				(byTag.get(tag)! as number[]).length,
			sections: byTagSections.get(tag)!,
		}))
		.sort((a, b) => a.avg - b.avg);
}

/**
 * Q4 learning-strip sparkline (design §5.4): the ONLY chart in the tab.
 * Pure SVG points string for a polyline of overall scores across runs
 * (newest-last, as `list_flows` returns newest-first → reversed).
 * Honest empty state when fewer than 2 runs.
 */
export function sparklinePoints(
	overalls: number[],
	width = 120,
	height = 24
): string | null {
	if (overalls.length < 2) return null;
	const step = width / (overalls.length - 1);
	return overalls
		.map((v, i) => `${(i * step).toFixed(1)},${(height - 1 - (v * (height - 2))).toFixed(1)}`)
		.join(' ');
}

// ── M6 "Director's cut": diff two persisted runs (pure, no Svelte) ────────

/** One changed cell in the side-by-side shot diff. */
export interface RunDiffChange {
	shotIndex: number;
	field: string;
	from: string;
	to: string;
}

export interface RunDiff {
	/** The two flow versions compared (a → b). */
	a: number;
	b: number;
	addedScenes: number;
	removedScenes: number;
	changed: RunDiffChange[];
	/** Compact summary, e.g. "+2 scenes · shot_07 lighting 5600K→3200K · shot_03 transition_in hard_cut→crossfade". */
	summary: string;
}

/** Display a shot-field value (closed-value names as-is; ∅ when absent). */
function runDiffVal(v: string | number | null | undefined): string {
	if (v === null || v === undefined || v === '') return '∅';
	return String(v);
}

/**
 * M6 side-by-side compare of two persisted engine runs (pure).
 * Diffs the aligned shot sets (scene-major index, up to the max shot count):
 * - scene count (a.scenes.length vs b.scenes.length) → addedScenes /
 *   removedScenes as non-negative nets.
 * - for each shot index present in BOTH runs: compare { clip_s,
 *   transition_in, transition_out, concerns (flattened via concernSummary),
 *   content.beats.join('|') }. A `changed` row is recorded ONLY for fields
 *   that actually differ.
 * Deterministic + total: never throws; out-of-range indices guarded.
 * `changed[].shotIndex` is 0-based; the summary renders it 1-based
 * ("shot_02" = the second shot).
 */
export function diffEngineRuns(
	a: EngineRun,
	b: EngineRun,
	aVersion = 0,
	bVersion = 0
): RunDiff {
	// Scene-major shot count (specs are aligned 1:1 by scene-major index,
	// mirroring specsByScene's layout).
	const shotCount = (r: EngineRun): number =>
		r.scenes.reduce((n, _s, i) => n + (r.novel.scenes[i]?.shots.length ?? 0), 0);
	const sceneDelta = b.scenes.length - a.scenes.length;
	const addedScenes = sceneDelta > 0 ? sceneDelta : 0;
	const removedScenes = sceneDelta < 0 ? -sceneDelta : 0;

	const specAt = (r: EngineRun, shotIdx: number): ShotSpec | undefined =>
		shotIdx >= 0 && shotIdx < r.specs.length ? r.specs[shotIdx] : undefined;

	const changed: RunDiffChange[] = [];
	const rec = (
		shotIdx: number,
		field: string,
		from: string | number | null | undefined,
		to: string | number | null | undefined,
	) => {
		const f = runDiffVal(from);
		const t = runDiffVal(to);
		if (f !== t) changed.push({ shotIndex: shotIdx, field, from: f, to: t });
	};

	const nShots = Math.max(shotCount(a), shotCount(b));
	for (let i = 0; i < nShots; i++) {
		// A `changed` row only when BOTH sides carry the shot (out-of-range
		// indices are guarded, never thrown).
		const sa = specAt(a, i);
		const sb = specAt(b, i);
		if (!sa || !sb) continue;
		if (sa.clip_s !== sb.clip_s) rec(i, 'clip_s', sa.clip_s, sb.clip_s);
		if (sa.transition_in !== sb.transition_in)
			rec(i, 'transition_in', sa.transition_in, sb.transition_in);
		if (sa.transition_out !== sb.transition_out)
			rec(i, 'transition_out', sa.transition_out, sb.transition_out);
		const ca = concernSummary(sa.concerns);
		const cb = concernSummary(sb.concerns);
		if (ca !== cb) rec(i, 'concerns', ca, cb);
		const ba = sa.content?.beats?.join('|') ?? '';
		const bb = sb.content?.beats?.join('|') ?? '';
		if (ba !== bb) rec(i, 'beats', ba, bb);
	}

	// Compact summary: net scene delta (if any) + up to 3 representative
	// changed cells, "shot_{NN} {field} {from}→{to}" (NN = 1-based shot
	// ordinal; closed-value names shown verbatim).
	const parts: string[] = [];
	if (addedScenes > 0) parts.push(`+${addedScenes} scene${addedScenes === 1 ? '' : 's'}`);
	if (removedScenes > 0) parts.push(`-${removedScenes} scene${removedScenes === 1 ? '' : 's'}`);
	changed.slice(0, 3).forEach((c) =>
		parts.push(`shot_${String(c.shotIndex + 1).padStart(2, '0')} ${c.field} ${c.from}→${c.to}`),
	);
	const summary = parts.length ? parts.join(' · ') : 'identical';

	return { a: aVersion, b: bVersion, addedScenes, removedScenes, changed, summary };
}

/** The element-id shape regen.rs mints: p{idx}:{tag}:{start}..{end}. */
export function sectionTargetSpan(index: number, s: PlanSection, pipeIndex = 0): string {
	// index (section ordinal) is informational; the id itself is content-derived.
	void index;
	return `p${pipeIndex}:${s.tag}:${s.frameStart}..${s.frameEnd}`;
}
