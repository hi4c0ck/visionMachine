/**
 * Bound an async operation with a hard deadline.
 *
 * Why this exists (Session-8 freeze, "non-blocking UI even under a blocking
 * operation" invariant): on a session switch the UI fires switch-path Tauri
 * IPCs (`get_composer`, `get_latest_session_generation_group`, …). The renderer
 * `await`s each one; if the Rust side is wedged (a poisoned / never-released
 * DB lock, a stuck task) the `invoke` never resolves. A pending `await` burns
 * **zero CPU** (0%-CPU + frozen-event-loop signature — the main thread is
 * idle-waiting, not busy-spinning) but the async continuation that would
 * re-render the UI never fires, so the interface pins with flat memory. This
 * helper makes that impossible: a wedged call is rejected at the deadline and
 * the caller falls back (e.g. `handleSessionSelect` hydrates from the local
 * tree shell) instead of leaving the UI dead.
 *
 * The deadline promise is created fresh per call, so there is no shared-timer
 * reuse bug and no leak (the timer is unref'd when the call settles).
 */
export function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label = 'operation',
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)),
			timeoutMs,
		);
	});
	// Race the real work against the deadline. When either settles, cancel the
	// pending timer so we don't keep a dead session-scoped timer alive.
	return Promise.race([promise, timeout]).finally(() => {
		if (timer !== undefined) clearTimeout(timer);
	});
}

/**
 * Default hard bound for a switch-path backend read. Generous enough for a
 * healthy DB read over WebView2 IPC (~ms–few-hundred-ms) but hard enough that
 * a wedged lock can never pin the main thread beyond one UI tick.
 */
export const SWITCH_PATH_IPC_TIMEOUT_MS = 4000;
