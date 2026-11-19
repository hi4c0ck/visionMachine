/**
 * Director scratch payload helpers (bug batch nov19, item 11).
 *
 * The scratch file gained additive run-UI fields (extractedPrompt,
 * runDurationMs) that were memory-only $state and died on restart. These
 * tests pin: old payloads parse unchanged, corrupt payloads never crash,
 * the persist payload clears only when NOTHING is worth keeping, and
 * absent additive keys stay absent (legacy readers see the old shape).
 */
import { describe, it, expect } from 'vitest';
import { parseScratch, buildScratchPayload } from '$lib/directorStore/scratch';
import type { EngineEntryInput } from '$lib/directorStore/engine';

const entry = (idea: string) => ({ idea, title: '', overrides: {} }) as unknown as EngineEntryInput;
const edit = { pipeIndex: 0, tag: 'scene', occurrence: 0, prompt: 'edited' };

describe('parseScratch', () => {
	it('empty / whitespace / corrupt → null (never throws)', () => {
		expect(parseScratch('')).toBeNull();
		expect(parseScratch('   ')).toBeNull();
		expect(parseScratch('{torn json')).toBeNull();
		expect(parseScratch('"a string"')).toBeNull();
	});

	it('OLD payload (entry + edits only) parses with additive defaults', () => {
		const raw = JSON.stringify({ entry: { idea: 'a fox' }, edits: [edit] });
		const out = parseScratch(raw)!;
		expect(out.entry?.idea).toBe('a fox');
		expect(out.edits).toHaveLength(1);
		expect(out.extractedPrompt).toBe('');
		expect(out.runDurationMs).toBeNull();
	});

	it('NEW payload round-trips the additive fields', () => {
		const raw = JSON.stringify({
			entry: null,
			edits: [],
			extractedPrompt: '<timeline>…</timeline>',
			runDurationMs: 4321,
		});
		const out = parseScratch(raw)!;
		expect(out.extractedPrompt).toBe('<timeline>…</timeline>');
		expect(out.runDurationMs).toBe(4321);
	});

	it('wrong-typed additive fields fall back, never crash', () => {
		const out = parseScratch(JSON.stringify({ edits: 'nope', extractedPrompt: 5, runDurationMs: 'x' }))!;
		expect(out.edits).toEqual([]);
		expect(out.extractedPrompt).toBe('');
		expect(out.runDurationMs).toBeNull();
	});
});

describe('buildScratchPayload', () => {
	it('nothing worth keeping → empty string (the caller clears the file)', () => {
		expect(
			buildScratchPayload({ entry: entry('  '), edits: [], extractedPrompt: '', runDurationMs: null }),
		).toBe('');
	});

	it('entry rides only with a non-empty idea; edits only when present', () => {
		const p = JSON.parse(buildScratchPayload({ entry: entry('a fox'), edits: [edit], extractedPrompt: '', runDurationMs: null }));
		expect(p.entry.idea).toBe('a fox');
		expect(p.edits).toHaveLength(1);
		// Absent additive keys stay ABSENT — legacy shape preserved.
		expect('extractedPrompt' in p).toBe(false);
		expect('runDurationMs' in p).toBe(false);

		const q = JSON.parse(buildScratchPayload({ entry: entry(''), edits: [], extractedPrompt: 'text', runDurationMs: null }));
		expect(q.entry).toBeNull();
		expect(q.edits).toEqual([]);
		expect(q.extractedPrompt).toBe('text');
	});

	it('run-UI fields alone keep the file alive (restart restore)', () => {
		const p = JSON.parse(buildScratchPayload({ entry: entry(''), edits: [], extractedPrompt: '', runDurationMs: 900 }));
		expect(p.runDurationMs).toBe(900);
		expect(p.entry).toBeNull();
	});

	it('build → parse is a round-trip', () => {
		const raw = buildScratchPayload({ entry: entry('a fox'), edits: [edit], extractedPrompt: 'prompt', runDurationMs: 123 });
		const out = parseScratch(raw)!;
		expect(out.entry?.idea).toBe('a fox');
		expect(out.edits).toEqual([edit]);
		expect(out.extractedPrompt).toBe('prompt');
		expect(out.runDurationMs).toBe(123);
	});
});