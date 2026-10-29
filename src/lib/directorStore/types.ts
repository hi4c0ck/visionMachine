// TS mirrors of the video-flow Rust wire types (camelCase serde).
// One conversion layer, no transforms: the field names match
// #[serde(rename_all = "camelCase")] on the Rust side exactly.
// Source of truth: src-tauri/src/generation/video_flow/

import type { EngineRun } from './engine';

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

/** The element-id shape regen.rs mints: p{idx}:{tag}:{start}..{end}. */
export function sectionTargetSpan(index: number, s: PlanSection, pipeIndex = 0): string {
	// index (section ordinal) is informational; the id itself is content-derived.
	void index;
	return `p${pipeIndex}:${s.tag}:${s.frameStart}..${s.frameEnd}`;
}
