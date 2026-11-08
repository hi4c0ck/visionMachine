// Director's-harness store: thin invoke layer over the director.rs commands.
//
// Safe slice (per user directive "evade sharp edges"): wires RUN + READ +
// SIGNAL. The destructive regenerate-pipes action and golden-set schema are
// deliberately NOT here — they belong to a later phase and to a pending user
// decision respectively. The UI renders those controls as disabled with a
// "not wired yet" note, not as calls into nonexistent commands.
//
// Tab state lives in Workspace (the design doc §1 decision: one `composerTab`
// $state owns both the strip and the body), so this store only holds the
// flow data + per-session run state.

import { invoke } from '@tauri-apps/api/core';
import type { FlowDocument, FlowSummary, RunFlowResult, GoldenRun } from './types';
import type { EngineEntryInput } from './engine';

export type DirectorTab = 'pipes' | 'director' | 'extract' | 'scoreboard';

export interface RunState {
	running: boolean;
	error: string | null; // FlowError display text when the last run failed
}

// Per-session run state (the §1 guard: switching sessions never carries an
// in-flight run into the new session). Keyed by session id.
// BOUNDED: sessions swing in and out for the app lifetime, so without a
// cap this Map is the "module-level asset that outlives the {#key}
// remount and ratchets up" leak. On insert, evict oldest non-running keys
// past the bound (the value is cheap to recreate — getRunState re-seeds).
const runStates = new Map<string, RunState>();
const RUN_STATE_CAP = 32;

export function getRunState(sessionId: string): RunState {
	let r = runStates.get(sessionId);
	if (!r) {
		r = { running: false, error: null };
		runStates.set(sessionId, r);
		// Evict the oldest settled entries (insertion order = first-seen) so
		// the Map stays O(capped). Never evict a key that is mid-run: its
		// `running` flag must survive until runFlow's finally clears it.
		if (runStates.size > RUN_STATE_CAP) {
			for (const key of runStates.keys()) {
				if (runStates.size <= RUN_STATE_CAP) break;
				const cand = runStates.get(key);
				if (cand && !cand.running) runStates.delete(key);
			}
		}
	}
	return r;
}

/** Dashboard/diagnostic: current entry count of the per-session run-state
 *  Map. Lets the live dashboard (report_renderer_metrics) show whether this
 *  module-level Map that outlives the {#key} remount is pinned at its cap. */
export function runStatesSize(): number {
	return runStates.size;
}

export async function runFlow(
	sessionId: string,
	text: string,
	entry?: EngineEntryInput | null,
): Promise<FlowDocument> {
	const rs = getRunState(sessionId);
	rs.running = true;
	rs.error = null;
	try {
		const out = await invoke<RunFlowResult>('director_run_flow', {
			sessionId,
			text,
			entry: entry ? JSON.stringify(entry) : null,
		});
		// The backend returns the REAL persisted version. The document's own
		// flowVersion field is the contract FLOW_VERSION (1), so it must be
		// overwritten with the actual on-disk version — otherwise callers that
		// thread the run's version into apply/load resolve the wrong
		// flow.v{N}.json file.
		out.document.flowVersion = out.flowVersion;
		return out.document;
	} catch (e) {
		rs.error = String(e);
		throw e;
	} finally {
		rs.running = false;
	}
}

export async function listFlows(sessionId: string): Promise<FlowSummary[]> {
	const out = await invoke<FlowSummary[]>('director_list_flows', {
		sessionId,
	});
	return out ?? [];
}

export async function loadFlow(
	sessionId: string,
	flowVersion: number
): Promise<FlowDocument> {
	const out = await invoke<FlowDocument>('director_load_flow', {
		sessionId,
		flowVersion,
	});
	return out;
}

export async function logSignal(
	sessionId: string,
	kind: 'edit_diff' | 'accept' | 'reject' | 'rate',
	targetSpan: string,
	note?: string
): Promise<string> {
	const out = await invoke<string>('director_log_signal', {
		sessionId,
		kind,
		targetSpan,
		note: note ?? null,
	});
	return out;
}

/**
 * Destructive apply (I9): materialize a persisted flow's structured plan
 * into composer pipes and save it. `replace` swaps the session's composer
 * pipes for the flow's; `append` adds the flow's pipes after the existing
 * ones. Returns the resulting pipe count. The UI gates this behind a
 * confirm() dialog — it never runs silently.
 */
export async function applyFlow(
	sessionId: string,
	flowVersion: number,
	replace: boolean
): Promise<number> {
	const out = await invoke<number>('director_apply_flow', {
		sessionId,
		flowVersion,
		replace,
	});
	return out;
}

/**
 * In-memory prompt overrides (Phase 3, design §4b): load a persisted flow,
 * overwrite specific concrete sections (e.g. `@camera` / `@lighting`) with
 * the user's edited text, and materialize the resulting composer pipes.
 * One call returns the resulting pipe count. `edited` entries are
 * camelCase-mapped onto the Rust `EditedSection` struct.
 */
// Sections are addressed by TAG (the closed concern vocabulary), not by
// vector index: the concrete engine plan skips empty concern sections, so
// a shot's lighting section does NOT always sit at a fixed index. Tag is
// shared by both sides — the target is stable no matter how sections are
// ordered/skipped. Pipe index is 0-based across the plan's pipes.
// `occurrence` picks the Nth section of a tag inside the pipe (0-based,
// plan order): each shot pipe carries several `scene` story arcs, while
// the meta tags are single. Omitted = apply to every section of the tag.
export interface EditedSection {
	pipeIndex: number;
	tag: string; // scene | camera | motion | lighting | transition | effect
	occurrence?: number;
	prompt: string;
}

export async function applyFlowEdited(
	sessionId: string,
	flowVersion: number,
	replace: boolean,
	edited: EditedSection[]
): Promise<number> {
	const out = await invoke<number>('director_apply_flow_edited', {
		sessionId,
		flowVersion,
		replace,
		edited,
	});
	return out;
}

/**
 * M3 surgical apply: materialize a persisted flow into the composer, but
 * scoped to a SET OF PIPES instead of the whole session. `pipeScope` is the
 * 0-based pipe ordinal list to re-materialize (e.g. `[3]` = shot 4 only,
 * leaving every other composer pipe untouched). `edited` carries that
 * scope's per-section prompt overrides — empty means "replace these pipes
 * with their pristine engine plan". Returns the resulting composer pipe
 * count. The backend command (`director_apply_flow_scoped`) lands in a
 * later Rust wave; this store function is the TS surface the UI calls.
 */
export async function applyFlowScoped(
	sessionId: string,
	flowVersion: number,
	pipeScope: number[],
	edited: EditedSection[]
): Promise<number> {
	const out = await invoke<number>('director_apply_flow_scoped', {
		sessionId,
		flowVersion,
		pipeScope,
		edited,
	});
	return out;
}

// ── Golden set (design §5.2 / §7.3) ────────────────────────────────────────
// Flag a run as a quality baseline (upserts by flow_version, one-copy-at-a-
// time) + list the session's golden baselines for the Scoreboard's Golden-set
// card. The Rust side stores one small `golden.json` per session flow dir.
export async function flagGolden(
	sessionId: string,
	flowVersion: number
): Promise<number> {
	const out = await invoke<number>('director_flag_golden', {
		sessionId,
		flowVersion,
	});
	return out;
}

export async function listGolden(
	sessionId: string
): Promise<import('./types').GoldenRun[]> {
	const out = await invoke<import('./types').GoldenRun[]>('director_list_golden', {
		sessionId,
	});
	return out ?? [];
}
