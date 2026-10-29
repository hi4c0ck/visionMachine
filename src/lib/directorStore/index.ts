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
	text: string
): Promise<FlowDocument> {
	const rs = getRunState(sessionId);
	rs.running = true;
	rs.error = null;
	try {
		const out = await invoke<RunFlowResult>('director_run_flow', {
			session_id: sessionId,
			text,
		});
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
		session_id: sessionId,
	});
	return out ?? [];
}

export async function loadFlow(
	sessionId: string,
	flowVersion: number
): Promise<FlowDocument> {
	const out = await invoke<FlowDocument>('director_load_flow', {
		session_id: sessionId,
		flow_version: flowVersion,
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
		session_id: sessionId,
		kind,
		target_span: targetSpan,
		note: note ?? null,
	});
	return out;
}
