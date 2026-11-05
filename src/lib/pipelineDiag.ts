// Renderer-side frame-pipeline ledger — the "more logging" half of the
// leak diagnosis. It quantifies, live and per-app-run, the three concrete
// growth mechanisms in the thumbnail/decode pipeline:
//
//   1. CLONE BUDGET — every LRU-miss in FrameSource.frame() hands the UI an
//      INDEPENDENT ImageBitmap clone whose teardown is a no-op
//      (the canvas action `destroy: () => {}`), so `clonesCreated -
//      clonesClosed` growing without bound = the texture-leak signature.
//   2. SOURCE LIFECYCLE — `sourcesActive` must be ~1 while a video shows;
//      >1 or never returning to 0/1 after a session switch = un-disposed
//      FrameSource instances (each carrying a capture <video> + decoder + LRU).
//   3. POLL BURN — the group poller's armed/disarmed lines (logged by
//      Workspace) show whether a stale "running" group row keeps the 2 s
//      poll + listener alive at idle.
//
// The counters are O(1) per event; the only recurring cost is pruning the
// 60 s frame-call window, which is a bounded array scan. RamMonitor flushes
// a one-line summary to the backend `log_pipeline_diag` command (throttled,
// only when something is notable), so a leak run is diagnosable from
// VisionMachine.log with zero devtools.

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface PipelineSnapshot {
	sourcesCreated: number;
	sourcesActive: number;
	cacheSets: number;
	cacheClosed: number;
	lruEvictions: number;
	frameCalls: number;
	frameCallsPerMin: number;
	decodeHits: number;
	decodeMisses: number;
	clonesCreated: number;
	clonesClosed: number;
	inflightPeak: number;
	outputQueuePeak: number;
	/** Unreleased clone bitmaps — the primary leak metric. */
	clonesOutstanding: number;
	/** Recent notable pipeline events (decode/capture broken, source dispose). */
	events: string[];
}

const state = {
	sourcesCreated: 0,
	active: new Set<string>(),
	cacheSets: 0,
	cacheClosed: 0,
	lruEvictions: 0,
	frameCalls: 0,
	decodeHits: 0,
	decodeMisses: 0,
	clonesCreated: 0,
	clonesClosed: 0,
	inflightPeak: 0,
	outputQueuePeak: 0,
	// Rolling 60 s window of frame() call times (pruned lazily).
	calls: [] as number[],
	events: [] as string[],
};

const EVENTS_CAP = 40;

function ts(): string {
	return new Date().toTimeString().slice(0, 8);
}

function note(msg: string): void {
	state.events.push(`${ts()} ${msg}`);
	if (state.events.length > EVENTS_CAP) state.events.shift();
}

/** Record a frame() request + keep the rolling window bounded. */
export function pipeFrameCall(): void {
	state.frameCalls += 1;
	const now = Date.now();
	state.calls.push(now);
	// Prune >60 s old; cap the array so the ledger itself can't grow.
	while (state.calls.length && now - state.calls[0] > 60_000) state.calls.shift();
	if (state.calls.length > 4000) state.calls.splice(0, state.calls.length - 2000);
}

let sourceSeq = 0;
/** Register a new FrameSource; returns the id the caller stores and passes to
 *  `pipeSourceDisposed` on teardown. */
export function pipeSourceCreated(): number {
	state.sourcesCreated += 1;
	const id = ++sourceSeq;
	state.active.add(String(id));
	note(`source#${id} created (active=${state.active.size})`);
	return id;
}

export function pipeSourceDisposed(id: number): void {
	state.active.delete(String(id));
	note(`source#${id} disposed (active=${state.active.size})`);
}

export function pipeFrameHit(): void {
	state.decodeHits += 1;
}

export function pipeFrameMiss(): void {
	state.decodeMisses += 1;
}

export function pipeCacheSet(): void {
	state.cacheSets += 1;
}

export function pipeCacheClosed(n: number): void {
	// The LRU cache owns the RAW decode bitmaps (createImageBitmap of the
	// decoded frame / the capture canvas) — a DISTINCT population from the
	// carousel CLONES (cloneImageBitmap). Track it in its own counter so
	// `clonesOutstanding` (clonesCreated - clonesClosed) measures ONLY the
	// carousel-owned clones that the leak actually ratchets. Mixing the two
	// here used to make the counter go negative.
	state.cacheClosed += n;
}

export function pipeLruEvict(): void {
	state.lruEvictions += 1;
}

export function pipeCloneCreated(): void {
	state.clonesCreated += 1;
}

/** Record that `n` carousel-owned clone bitmaps were closed (released their
 *  GPU texture). FrameSource.close() closes its LRU bitmaps via
 *  `pipeCacheClosed`; the carousel closes ITS OWN clones here. Together they
 *  keep `clonesOutstanding = clonesCreated - clonesClosed` equal to the TRUE
 *  number of live unclosed bitmaps (the leak metric the dashboard shows). */
export function pipeCloneClosed(n: number): void {
	state.clonesClosed += n;
}

export function pipeInflight(n: number): void {
	if (n > state.inflightPeak) state.inflightPeak = n;
}

export function pipeOutputQueue(n: number): void {
	if (n > state.outputQueuePeak) state.outputQueuePeak = n;
}

export function pipeEvent(msg: string): void {
	note(msg);
}

export function getPipelineSnapshot(): PipelineSnapshot {
	const now = Date.now();
	let perMin = state.calls.length;
	for (const c of state.calls) if (now - c > 60_000) perMin -= 1;
	return {
		sourcesCreated: state.sourcesCreated,
		sourcesActive: state.active.size,
		cacheSets: state.cacheSets,
		cacheClosed: state.cacheClosed,
		lruEvictions: state.lruEvictions,
		frameCalls: state.frameCalls,
		frameCallsPerMin: perMin,
		decodeHits: state.decodeHits,
		decodeMisses: state.decodeMisses,
		clonesCreated: state.clonesCreated,
		clonesClosed: state.clonesClosed,
		inflightPeak: state.inflightPeak,
		outputQueuePeak: state.outputQueuePeak,
		clonesOutstanding: state.clonesCreated - state.clonesClosed,
		events: state.events.slice(-8),
	};
}

/** One compact line for the backend log. */
export function pipelineDiagLine(): string {
	const s = getPipelineSnapshot();
	return (
		`src ${s.sourcesCreated}c/${s.sourcesActive}a · frames ${s.frameCalls} (${s.frameCallsPerMin}/min) ` +
		`miss ${s.decodeMisses} · lru ${s.lruEvictions}ev · inflightPeak ${s.inflightPeak} · outQPeak ${s.outputQueuePeak} · ` +
		`clones ${s.clonesCreated}-${s.clonesClosed}=${s.clonesOutstanding}outstanding`
	);
}

// ── Effect tripwires ─────────────────────────────────────────────────────
// The session-select freeze class is a runaway Svelte $effect: an effect that
// (re)writes one of the values it tracks re-runs on every write, re-writes, …
// forever — a busy main-thread loop. It may never hold the event loop long
// enough for longtask / the worker watchdog to register a freeze (each turn is
// short; the LOOP is what burns CPU + churns allocations). The only way to
// catch that from a persisted log is to COUNT effect runs: any effect that
// legitimately runs more than ~5 times in 10 s is a loop. tripEffect(key) is
// O(1) (a counter + a bounded stamp array) and fires a one-shot backend log
// every 60 s while a key stays above the limit.
const TRIP_WINDOW_MS = 10_000;
const TRIP_LIMIT = 5;
const TRIP_ALARM_COOLDOWN_MS = 60_000;
const TRIP_LEDGER_CAP = 64;

interface TripCounter {
	stamps: number[];
	total: number;
	lastAlarmAt: number;
}
const tripLedger = new Map<string, TripCounter>();

/** Count one run of a (named) reactive effect; log a [TRIPWIRE] line to the
 *  backend when the key crosses TRIP_LIMIT runs in TRIP_WINDOW_MS (at most
 *  one alarm per TRIP_ALARM_COOLDOWN_MS per key). Call at the top of the
 *  effect body, AFTER its terminal guard, so a correctly latched effect
 *  counts exactly once per session and never alarms. */
export function tripEffect(key: string): void {
	const now = Date.now();
	let c = tripLedger.get(key);
	if (!c) {
		c = { stamps: [], total: 0, lastAlarmAt: 0 };
		tripLedger.set(key, c);
	}
	c.total += 1;
	c.stamps.push(now);
	while (c.stamps.length && now - c.stamps[0] > TRIP_WINDOW_MS) c.stamps.shift();
	// Keep the ledger itself bounded (keys are usually per-session).
	if (tripLedger.size > TRIP_LEDGER_CAP) {
		const staleBefore = now - 5 * 60_000;
		for (const [k, v] of tripLedger) if (v.stamps[v.stamps.length - 1] < staleBefore) tripLedger.delete(k);
	}
	if (c.stamps.length >= TRIP_LIMIT && now - c.lastAlarmAt >= TRIP_ALARM_COOLDOWN_MS) {
		c.lastAlarmAt = now;
		const msg =
			`[TRIPWIRE] ${key}: ${c.stamps.length} effect runs in ${Math.round(now - c.stamps[0])}ms ` +
			`(total ${c.total}) — runaway reactive loop suspected`;
		note(msg);
		if (isTauri()) void invoke('log_pipeline_diag', { message: msg }).catch(() => {});
	}
}

let lastFlushTs = 0;
let lastFlushLine = '';
// Heap baseline + last sample: the "eats in a loop" signal is a MONOTONIC
// rise, so the flush line carries the trend, not just a snapshot.
let heapBaselineMb = 0;
let heapLastMb = 0;

/** Record a renderer JS-heap sample (RamMonitor's tick already reads
 *  performance.memory) so the flush line can show the growth trend. */
export function noteHeapSample(heapNowBytes: number): void {
	const mb = Math.round(heapNowBytes / 1024 / 1024);
	if (heapBaselineMb === 0) heapBaselineMb = mb;
	heapLastMb = mb;
}

/** The renderer-heap trend: baseline → last, and the delta since baseline. */
export function heapTrendMb(): { baseline: number; last: number; delta: number } {
	return { baseline: heapBaselineMb, last: heapLastMb, delta: heapLastMb - heapBaselineMb };
}

/**
 * Flush a snapshot to the backend log, throttled: at most once per 15 s and
 * only when the line changed since the last flush. `extra` (usually the
 * renderer-heap trend) is prepended so one line answers "what is eating
 * memory and is it growing monotonically?". Cheap no-op in browser.
 */
export function flushPipelineDiag(extra = '', force = false): void {
	if (!isTauri()) return;
	const now = Date.now();
	const line = pipelineDiagLine();
	const full = extra ? `${extra} · ${line}` : line;
	const notable = force || full !== lastFlushLine;
	if (!notable || now - lastFlushTs < 15_000) return;
	lastFlushTs = now;
	lastFlushLine = full;
	const s = getPipelineSnapshot();
	const tail = s.events.length ? ` · recent: ${s.events.join(' | ')}` : '';
	void invoke('log_pipeline_diag', { message: `${full}${tail}` }).catch(() => {});
}
