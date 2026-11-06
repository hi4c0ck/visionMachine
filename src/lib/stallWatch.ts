// In-app renderer-stall instrumentation v2 — answers "WHEN and WHERE did the
// main thread get pinned?" without a debugger or PowerShell.
//
// Design v2 (the v1 flaw it fixes): the freeze record is written by the
// WORKER, not the main thread. v1 could only record on *recovery*, so a
// freeze the user force-killed the app mid-hang never left any evidence.
// Workers keep running while the main thread is pinned, so the worker:
//   1. pings main every PING_MS;
//   2. if a reply is missing past FREEZE_MS it persists "frozen since T"
//      to localStorage itself (survives force-close);
//   3. on recovery the main thread stamps end + a stack sample and the
//      worker clears its own frozen flag.
// RamMonitor flushes the persisted record to the backend log
// (log_stall_report) at the next healthy moment, so even an un-recovered
// freeze is diagnosable from VisionMachine.log.

const PING_MS = 500; // worker ping period
const FREEZE_MS = 3000; // main-thread block above this = a "freeze"
const LS_KEY = 'vm-freeze-record';
/** Which session select the current (possibly frozen) window belongs to —
 *  set by `resetStallMeter(sessionId)` on every session select, so a later
 *  persisted freeze record can be tied to that action. */
const LS_CONTEXT_KEY = 'vm-freeze-context';

/** The session id the last session-select targeted (empty = unknown). */
export function getStallContext(): string {
	try {
		return localStorage.getItem(LS_CONTEXT_KEY) ?? '';
	} catch {
		return '';
	}
}

export interface StallSnapshot {
	/** Number of long tasks (>50 ms main-thread block) since the meter
	 *  started (or the last `resetStallMeter`). */
	longtask_count: number;
	/** The single worst (longest) long task in ms since the last reset. */
	longtask_max_ms: number;
	/** Sum of all long-task durations since the last reset, ms. */
	longtask_total_ms: number;
	/** Unix ms of the most recent long task (0 = none yet). */
	longtask_last_at: number;
	/** Unix ms the current window started. */
	window_start_ms: number;
	/** true when the longtask entry type is available (false = silent no-op). */
	supported: boolean;
}

/**
 * A main-thread structure snapshot carried into the freeze record by the
 * worker. The main thread posts the LATEST one to the worker via
 * `updateFreezeSnapshot` (the RamMonitor tick, plus any heartbeat it
 * schedules); the worker keeps it and attaches it to a freeze record the
 * moment it detects a freeze. This is the "which structure was pinned at
 * the instant the UI died" answer — the main thread can't report at that
 * moment, but the worker can.
 */
export type FreezeSnapshot = {
	timestamp_ms: number;
	heap_used_bytes: number | null;
	[key: string]: unknown;
} & Record<string, unknown>;

export interface FreezeRecord {
	/** Unix ms the freeze STARTED (worker-observed). */
	started_at: number;
	/** Unix ms the freeze ENDED (main-thread recovery), 0 = still frozen /
	 *  app was force-closed mid-freeze. */
	ended_at: number;
	/** Main-thread stack sample captured at the instant of recovery — the
	 *  call chain that owned the event loop while the UI was pinned. */
	recovery_stack: string;
	/** True when the record was flushed to the backend log already. */
	flushed: boolean;
	/** Session id the user was selecting when the freeze window started
	 *  (empty = unknown / not a session-select window). */
	context: string;
	/** The LATEST main-thread structure snapshot the worker saw before the
	 *  freeze (structure sizes + JS heap + pipeline ledger, pushed by the
	 *  reporter tick). Attached by the worker at freeze onset — the one
	 *  reading the main thread can never produce itself while pinned. */
	snapshot?: unknown;
	/** True for "soft" records: the main thread kept responding but SLOW
	 *  (rtt > 1 s on ~12 consecutive pings ≈ 6 s of sustained degradation)
	 *  — the "hangs / eats memory" state that is NOT a hard pin. */
	soft?: boolean;
	/** Record kind: 'busy' = ≥30 % of a 30 s window spent in slow replies —
	 *  the distributed churn-loop shape (many medium blocks, no single 3 s
	 *  pin) that neither the hard-freeze nor the slow-streak detector
	 *  catches. */
	mode?: string;
	/** Fraction (0..1) of the 30 s window the main thread spent busy
	 *  (set on `mode: 'busy'` records). */
	busy_fraction?: number;
}

interface Meter {
	observer: PerformanceObserver | null;
	count: number;
	max: number;
	total: number;
	lastAt: number;
	windowStart: number;
	supported: boolean;
}

let meter: Meter | null = null;
let watcherRunning = false;
let watcher: Worker | null = null;

function readRecord(): FreezeRecord {
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (raw) {
			const r = JSON.parse(raw) as Partial<FreezeRecord>;
			return {
				started_at: r.started_at ?? 0,
				ended_at: r.ended_at ?? 0,
				recovery_stack: r.recovery_stack ?? '',
				flushed: r.flushed === true,
				context: r.context ?? getStallContext(),
				snapshot: r.snapshot,
				soft: r.soft === true,
				mode: r.mode,
				busy_fraction: r.busy_fraction,
			};
		}
	} catch {
		/* storage unavailable */
	}
	return { started_at: 0, ended_at: 0, recovery_stack: '', flushed: false, context: '' };
}

function writeRecord(rec: FreezeRecord): void {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify(rec));
	} catch {
		/* storage full / unavailable */
	}
}

function newMeter(): Meter {
	const po: unknown = PerformanceObserver;
	const supported =
		typeof po !== 'undefined' &&
		(!!(po as { supportedEntryTypes?: string[] })?.supportedEntryTypes?.includes('longtask') ||
			!('supportedEntryTypes' in (po as object)));
	return {
		observer: null,
		count: 0,
		max: 0,
		total: 0,
		lastAt: 0,
		windowStart: Date.now(),
		supported,
	};
}

function installMeter(): void {
	if (meter?.observer) meter.observer.disconnect();
	meter = newMeter();
	if (!meter.supported) return;
	try {
		const o = new PerformanceObserver((list) => {
			for (const e of list.getEntries()) {
				const d = e.duration;
				meter!.count += 1;
				meter!.total += d;
				if (d > meter!.max) meter!.max = d;
				meter!.lastAt = Date.now();
			}
		});
		o.observe({ entryTypes: ['longtask'] });
		meter.observer = o;
	} catch {
		meter.supported = false;
		meter.observer = null;
	}
}

/**
 * The worker source, built with the constants inlined. The worker does the
 * critical thing v1 couldn't: it detects a MISSING main-thread reply (the
 * main thread is exactly what's pinned) and persists the freeze onset itself,
 * so a force-killed frozen app still leaves a record on disk.
 */
function buildWorkerSource(): string {
	return `
		const PING = ${PING_MS};
		const FREEZE = ${FREEZE_MS};
		const DEGRAD_RT = 1000;      // rtt above this = "degraded" main thread
		const DEGRAD_STREAK = 12;     // 12 consecutive degraded pings (~6s) = sustained pin
		const LS_KEY = ${JSON.stringify(LS_KEY)};
		let seq = 0;
		let lastPingAt = 0;
		let pending = null;      // the last unanswered ping { t, seq, t0 }
		let frozenSince = 0;     // Date.now() when the worker declared a freeze
		let lastSnap = null;     // the LATEST main-thread structure snapshot
		// (main thread stops posting during a freeze, but the worker keeps
		// the last one it saw = the state at the freeze's onset)
		let degradedStreak = 0;  // consecutive pings with rtt > DEGRAD_RT
		// BUSY-WINDOW DETECTION (the distributed churn shape): many medium
		// main-thread blocks (each well under the 3 s hard-freeze and never
		// 12 consecutive >1 s replies) keep the UI feeling dead without
		// tripping either detector above. Track cumulative main-thread busy
		// time (sum of reply RTTs) over a rolling 30 s window; ≥30 % busy
		// persists a soft record tagged mode:'busy'.
		const BUSY_WIN = 30000;    // rolling window, ms
		const BUSY_RATIO = 0.30;   // ≥30 % of the window busy = a hang
		const BUSY_COOLDOWN = 60000; // one record per 60 s while it persists
		let busyLog = [];          // recent { t, rtt } pings
		let lastBusyRec = 0;
		function busyFraction() {
			const now = performance.now();
			while (busyLog.length && now - busyLog[0].t > BUSY_WIN) busyLog.shift();
			if (busyLog.length < 20) return 0; // need ~10 s of data
			let total = 0;
			for (const e of busyLog) total += Math.min(e.rtt, BUSY_WIN);
			return Math.min(1, total / BUSY_WIN);
		}
		function readRec() {
			try {
				const raw = localStorage.getItem(LS_KEY);
				if (raw) { const r = JSON.parse(raw); if (r && r.started_at) return r; }
			} catch (e) {}
			return null;
		}
		function writeRec(rec) {
			try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (e) {}
		}
		function tick() {
			const now = performance.now();
			if (now - lastPingAt >= PING) {
				lastPingAt = now;
				seq += 1;
				pending = { t: now, seq };
				postMessage({ type: 'ping', t: now, seq });
			}
			// FREEZE DETECTION (worker side): if a ping has been unanswered
			// for FREEZE_MS, the main thread is blocked (workers keep
			// running, so THIS runs even while the UI is frozen).
			if (pending && !frozenSince && now - pending.t >= FREEZE) {
				frozenSince = Date.now() - Math.round(now - pending.t);
				const rec = readRec() || {};
				rec.started_at = frozenSince;
				rec.ended_at = 0; // still frozen (or will be, if force-killed)
				rec.recovery_stack = rec.recovery_stack || '';
				rec.flushed = false;
				rec.snapshot = lastSnap; // state at freeze onset (worker-held)
				writeRec(rec);
			}
			// DEGRADED DETECTION: the main thread is STILL responding, but
			// slowly (rtt > DEGRAD_RT). A streak of DEGRAD_STREAK consecutive
			// slow pings (~6 s of sustained slowness) = the "hangs / eats
			// memory" state that is NOT a hard pin — the hard-freeze detector
			// above never fires for it. Persist a SOFT record (same snapshot
			// payload) so the next flush tells us structure sizes during a
			// degraded run.
			if (pending && !pending.stalled && now - pending.t >= DEGRAD_RT) {
				pending.stalled = true;
				degradedStreak += 1;
				if (degradedStreak >= DEGRAD_STREAK && !frozenSince) {
					frozenSince = Date.now() - Math.round(now - pending.t);
					const rec = readRec() || {};
					rec.started_at = frozenSince;
					rec.ended_at = 0;
					rec.soft = true;
					rec.flushed = false;
					rec.snapshot = lastSnap;
					writeRec(rec);
				}
			}
			// BUSY DETECTION: a rolling-window cumulative fraction of the main
			// thread's time spent replying (== blocked) over the last 30 s.
			// This catches the DISTRIBUTED churn shape: many medium blocks
			// that each stay under the 3 s hard-freeze and never 12 in a row
			// exceed 1 s, but whose total pins the UI. Persist a soft record
			// (mode:'busy') with the same snapshot payload; one per 60 s.
			if (!frozenSince && performance.now() - lastBusyRec >= BUSY_COOLDOWN) {
				const frac = busyFraction();
				if (frac >= BUSY_RATIO) {
					lastBusyRec = performance.now();
					const rec = readRec() || {};
					rec.started_at = rec.started_at || Date.now() - BUSY_WIN;
					if (!rec.ended_at) rec.ended_at = 0; // still busy
					rec.soft = true;
					rec.mode = 'busy';
					rec.busy_fraction = Math.round(frac * 100) / 100;
					rec.flushed = false;
					rec.snapshot = lastSnap;
					writeRec(rec);
				}
			}
			setTimeout(tick, PING);
		}
		onmessage = (e) => {
			const m = e.data;
			if (m.type === 'reply' && pending && m.seq === pending.seq) {
				const rtt = performance.now() - pending.t;
				// Main answered → healthy. A FAST reply resets the degraded
				// streak; only a SLOW one counts toward it.
				if (rtt <= DEGRAD_RT) degradedStreak = 0;
				busyLog.push({ t: performance.now(), rtt }); // busy-window feed
				if (busyLog.length > 400) busyLog.shift();
				pending = null;
				if (frozenSince) {
					// RECOVERED: stamp the end + the recovery stack (captured
					// on the main thread in the same turn that freed up) and
					// hand the longtask window stats along for the record.
					const rec = readRec() || { started_at: frozenSince };
					rec.ended_at = Date.now();
					rec.recovery_stack = m.stack || rec.recovery_stack || '';
					rec.longtask_count = m.longtask_count ?? 0;
					rec.longtask_max_ms = m.longtask_max_ms ?? 0;
					rec.flushed = false;
					writeRec(rec);
					frozenSince = 0;
					postMessage({ type: 'recovered', started_at: rec.started_at, ended_at: rec.ended_at, stack: rec.recovery_stack });
				}
				return;
			}
			if (m.type === 'snapshot') {
				// Main thread pushed its current structure snapshot. Keep it —
				// when a freeze is detected later, the record carries this
				// state (the last one posted before the main thread stopped
				// responding).
				if (m.data && typeof m.data === 'object') lastSnap = m.data;
				return;
			}
			if (m.type === 'clear') {
				// Main thread explicitly cleared (e.g. a flushed record): reset
				// local frozen state so the next freeze is recorded fresh.
				pending = null;
				frozenSince = 0;
				degradedStreak = 0;
				busyLog = [];
				lastBusyRec = 0;
			}
		};
		tick();
	`;
}

/**
 * Push the current structure snapshot to the freeze-detecting worker. The
 * worker holds only the LATEST one and attaches it to a freeze record the
 * moment it declares a freeze — so the record carries "which structure was
 * big at the freeze onset" even though the main thread is (by definition)
 * unable to report it during the freeze itself. Callers: dashStore.reportTo
 * Dashboard (the 8 s tick). Cheap: one structured-clone postMessage.
 */
export function updateFreezeSnapshot(snap: unknown): void {
	if (!snap || !watcher) return;
	try {
		watcher.postMessage({ type: 'snapshot', data: snap });
	} catch {
		/* worker gone */
	}
}

/**
 * Start (or restart) the global stall meter + worker freeze watchdog.
 * Idempotent; safe in the browser; silently degrades when unsupported.
 */
export function initStallWatch(): void {
	installMeter();
	if (watcherRunning) return;
	watcherRunning = true;
	try {
		const src = buildWorkerSource();
		watcher = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
		// Main side: answer every ping. The reply carries the longtask window
		// stats (so the worker can stamp them on a recovery) and — critically
		// on the healthy-ping-after-a-freeze case — a fresh Error stack
		// sampled at the instant the main thread got control back, which is
		// the call chain that owned the loop.
		watcher.onmessage = (e: MessageEvent) => {
			const m = e.data as { type: string; t?: number; seq?: number; stack?: string };
			if (m.type === 'ping') {
				const rtt = performance.now() - (m.t ?? 0);
				const snap = getStallSnapshot();
				// Sample the stack only when the round-trip was long (i.e.
				// the main thread had been pinned just before this reply);
				// a healthy <FREEZE_MS reply skips the (relatively) expensive
				// stack capture.
				const stack = rtt >= FREEZE_MS ? (new Error('[stallWatch recovery sample]').stack ?? '') : '';
				watcher?.postMessage({
					type: 'reply',
					seq: m.seq,
					stack,
					longtask_count: snap.longtask_count,
					longtask_max_ms: snap.longtask_max_ms,
				});
				// A worker-side recovery just happened: surface it to the
				// console so the user (or the dev console) sees it live.
				const rec = readRecord();
				if (rec.started_at > 0 && rec.ended_at > 0 && rec.ended_at - rec.started_at > 0) {
					console.warn(
						`[stallWatch] main thread was blocked ~${Math.round((rec.ended_at - rec.started_at) / 1000)}s; recovery stack:`,
						(rec.recovery_stack || '(none)').split('\n').slice(0, 10).join('\n'),
					);
				}
			}
		};
	} catch {
		// No Worker support → the longtask meter still works; the freeze
		// record just never gets its worker-side onset timestamp.
		watcherRunning = false;
		watcher = null;
	}
}

/**
 * Read (and optionally clear-flush) the persisted freeze record. RamMonitor
 * calls this on mount: an unflushed record gets handed to the backend log via
 * `log_stall_report` and marked flushed, so a frozen run (even a force-killed
 * one, since the worker persists the onset) is diagnosable from
 * VisionMachine.log.
 */
export function consumeFreezeRecord(): FreezeRecord | null {
	const rec = readRecord();
	if (rec.started_at === 0) return null;
	return rec;
}

/** Mark the current record as flushed (after a successful log_stall_report). */
export function markFreezeRecordFlushed(): void {
	const rec = readRecord();
	if (rec.started_at === 0) return;
	rec.flushed = true;
	writeRecord(rec);
	// Tell the worker to clear its local frozen state so the next freeze is
	// recorded fresh.
	try {
		watcher?.postMessage({ type: 'clear' });
	} catch {
		/* worker gone */
	}
}

/**
 * Clear the persisted record entirely (used when the user wants a clean
 * slate, e.g. after the stall is diagnosed).
 */
export function clearFreezeRecord(): void {
	try {
		localStorage.removeItem(LS_KEY);
	} catch {
		/* storage unavailable */
	}
	try {
		watcher?.postMessage({ type: 'clear' });
	} catch {
		/* worker gone */
	}
}

/** Reset the longtask window on session select. `context` (the session id
 *  being selected) is persisted alongside the record so a later freeze
 *  record can be tied to the action that pinned the UI ("selecting Session
 *  8") without a debugger. */
export function resetStallMeter(context?: string): void {
	installMeter();
	if (context) {
		try {
			localStorage.setItem(LS_CONTEXT_KEY, context);
		} catch {
			/* storage unavailable — attribution simply absent */
		}
	}
}

/** Cheap read of the current longtask window. */
export function getStallSnapshot(): StallSnapshot {
	if (!meter) {
		return {
			longtask_count: 0,
			longtask_max_ms: 0,
			longtask_total_ms: 0,
			longtask_last_at: 0,
			window_start_ms: 0,
			supported: false,
		};
	}
	return {
		longtask_count: meter.count,
		longtask_max_ms: Math.round(meter.max),
		longtask_total_ms: Math.round(meter.total),
		longtask_last_at: meter.lastAt,
		window_start_ms: meter.windowStart,
		supported: meter.supported,
	};
}
