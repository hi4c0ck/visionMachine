// Director scratch payload helpers (bug batch nov19, item 11).
//
// The scratch file (director_scratch.json) is UI-owned opaque JSON; these
// pure helpers own its shape so the persist/hydrate semantics are unit-
// testable without mounting the panel. Additive by design: payloads gained
// `extractedPrompt` + `runDurationMs` (the memory-only run UI state that
// died on restart); OLD payloads without those keys parse unchanged.

import type { EngineEntryInput } from './engine';
import type { EditedSection } from './index';

export interface ScratchData {
	entry?: EngineEntryInput | null;
	edits: EditedSection[];
	/** The extracted pipe-prompt text shown under ① DIRECTION (was $state-only). */
	extractedPrompt: string;
	/** Wall-clock ms of the last run (was $state-only). */
	runDurationMs: number | null;
}

/** Tolerant parse: empty/corrupt → null (the caller falls back to defaults).
 *  Missing additive fields read as empty — old payloads never break. */
export function parseScratch(raw: string): ScratchData | null {
	if (!raw || !raw.trim()) return null;
	try {
		const p = JSON.parse(raw) as Record<string, unknown>;
		if (!p || typeof p !== 'object') return null;
		return {
			entry: (p.entry as EngineEntryInput | null | undefined) ?? null,
			edits: Array.isArray(p.edits) ? (p.edits as EditedSection[]) : [],
			extractedPrompt: typeof p.extractedPrompt === 'string' ? p.extractedPrompt : '',
			runDurationMs: typeof p.runDurationMs === 'number' ? p.runDurationMs : null,
		};
	} catch {
		return null;
	}
}

/** Build the persist payload. Returns '' when nothing is worth keeping
 *  (the caller clears the file so a stale draft never resurfaces). The
 *  entry rides only with a non-empty idea; edits only when non-empty;
 *  the additive fields only when present — absent keys stay absent so a
 *  legacy reader sees the exact old shape. */
export function buildScratchPayload(opts: {
	entry: EngineEntryInput;
	edits: EditedSection[];
	extractedPrompt: string;
	runDurationMs: number | null;
}): string {
	const hasEdits = opts.edits.length > 0;
	const hasEntry = opts.entry.idea.trim().length > 0;
	const hasExtract = opts.extractedPrompt.trim().length > 0;
	const hasDuration = opts.runDurationMs != null;
	if (!hasEdits && !hasEntry && !hasExtract && !hasDuration) return '';
	return JSON.stringify({
		entry: hasEntry ? opts.entry : null,
		edits: hasEdits ? opts.edits : [],
		...(hasExtract ? { extractedPrompt: opts.extractedPrompt } : {}),
		...(hasDuration ? { runDurationMs: opts.runDurationMs } : {}),
	});
}