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
import type { FlowDocument, FlowSummary, RunFlowResult } from './types';
import type { EngineEntryInput } from './engine';

export type DirectorTab = 'pipes' | 'director' | 'extract' | 'scoreboard';

export interface RunState {
	running: boolean;
	error: string | null; // FlowError display text when the last run failed
}

// Per-session run state (the §1 guard: switching sessions never carries an
// in-flight run into the new session). Keyed by session id.
const runStates = new Map<string, RunState>();

export function getRunState(sessionId: string): RunState {
	let r = runStates.get(sessionId);
	if (!r) {
		r = { running: false, error: null };
		runStates.set(sessionId, r);
	}
	return r;
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
export interface EditedSection {
	pipeIndex: number;
	sectionIndex: number;
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
