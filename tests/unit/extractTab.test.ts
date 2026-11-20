/**
 * Extract tab density batch A (A1–A5) — view-layer assertions:
 *  A1 · clean sections render zero <textarea>s (clamped static text);
 *       row click materializes the editor; blur with no change → static.
 *  A2 · singleton zones drop the header band; ≥2-section zones keep it.
 *  A3 · clean sections say nothing — the "unchanged" label is gone.
 *  A4 · one-line head (v · § · pipes · edited), Copy ▾ menu over the
 *       two copy handlers, standalone danger regenerate with fixed copy.
 *  A5 · zone labels are seconds-primary; the frame window lives in the
 *       label's tooltip.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';

// ExtractTab imports $lib/directorStore (thin invoke layer) — keep the
// mount offline-friendly the way the KeyframeModal test does.
vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn().mockResolvedValue(null),
	isTauri: vi.fn(() => false),
}));

import ExtractTab from '$components/Director/ext/ExtractTab.svelte';
import type { FlowDocument } from '$lib/directorStore/types';
import type { EngineRun } from '$lib/directorStore/engine';

function makeDoc(): FlowDocument {
	return {
		flowVersion: 19,
		structured: { pipes: [] },
		regen: {
			version: { flowVersion: 19, expandVersion: 1, structureVersion: 1, criticVersion: 1, criticModelVersion: 0 },
		},
	} as unknown as FlowDocument;
}

/** LocalSection-shaped row. The en dash (U+2013) is the seed's range sep. */
function sec(pipeIndex: number, tag: string, occurrence: number, range: string, prompt: string, source = prompt) {
	return { pipeIndex, tag, occurrence, range, prompt, source };
}

// Default fixture: zone @24f holds 2 sections (header kept), zone @48f
// holds 1 section (flattened). All pristine unless noted.
function defaultSections() {
	return [
		sec(0, 'scene', 0, '24\u201348', 'a river town at dawn'),
		sec(0, 'camera', 0, '24\u201348', 'static wide, 24mm'),
		sec(0, 'lighting', 0, '48\u201396', 'dawn through the pines'),
	];
}

function open(overrides: Record<string, unknown> = {}) {
	const onCopyExtract = vi.fn();
	const onCopyEngineSheet = vi.fn();
	const onRegenerate = vi.fn().mockResolvedValue(undefined);
	const ui = render(ExtractTab, {
		props: {
			doc: makeDoc(),
			engine: null,
			sessionId: 's1',
			sessionName: 'Session 8',
			pipeCount: 6,
			localExtract: defaultSections(),
			dirtyCount: 0,
			extractPipeCount: 1,
			applyWorking: false,
			feedback: null,
			onCopyExtract,
			onCopyEngineSheet,
			onRegenerate,
			...overrides,
		} as Record<string, unknown>,
	});
	return { ui, onCopyExtract, onCopyEngineSheet, onRegenerate };
}

afterEach(cleanup);

describe('Extract tab — batch A (view layer)', () => {
	// ── A1 · edit-on-focus ─────────────────────────────────────────────
	it('A1: a 0-edit doc renders zero <textarea> elements (clamped static rows)', () => {
		const { ui } = open();
		expect(ui.container.querySelectorAll('textarea')).toHaveLength(0);
		// The static rows are real buttons (keyboard-native, same text).
		expect(ui.getByRole('button', { name: 'a river town at dawn' })).toBeTruthy();
	});

	it('A1: clicking the row materializes the editor; blur with no change goes back', () => {
		const { ui } = open();
		fireEvent.click(ui.getByRole('button', { name: 'static wide, 24mm' }));
		const ta = ui.container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta).toBeTruthy();
		expect(ta.value).toBe('static wide, 24mm');
		// Blur with no change → back to the static text.
		fireEvent.blur(ta);
		expect(ui.container.querySelectorAll('textarea')).toHaveLength(0);
		expect(ui.getByRole('button', { name: 'static wide, 24mm' })).toBeTruthy();
	});

	it('A1: a dirty section keeps its materialized editor + ● + warning border', () => {
		const { ui } = open({
			localExtract: [sec(0, 'camera', 0, '24\u201348', 'edited text', 'static wide, 24mm')],
			dirtyCount: 1,
		});
		const ta = ui.container.querySelector('textarea') as HTMLTextAreaElement;
		expect(ta).toBeTruthy();
		expect(ta.value).toBe('edited text');
		expect(ui.container.querySelector('.extract-block.dirty')).toBeTruthy();
		expect(ui.container.textContent).toContain('●');
	});

	// ── A2 · flattened singleton zones ─────────────────────────────────
	it('A2: a 1-section zone drops the header band; a 2-section zone keeps it', () => {
		const { ui } = open();
		// Exactly one zone holds ≥2 sections (the @24f zone) → one header.
		expect(ui.container.querySelectorAll('.tz-zone-head')).toHaveLength(1);
		// The singleton @48f zone is flattened: no band, no indent.
		const flat = ui.container.querySelector('.tz-zone-flat');
		expect(flat).toBeTruthy();
		expect(flat!.textContent).toContain('dawn through the pines');
		expect(flat!.querySelector('.tz-zone-head')).toBeNull();
	});

	// ── A3 · silent clean state ────────────────────────────────────────
	it('A3: the word "unchanged" no longer renders on clean sections', () => {
		const { ui } = open();
		expect(ui.container.textContent).not.toContain('unchanged');
	});

	// ── A4 · compressed head row ───────────────────────────────────────
	it('A4: head is one mono line `v19 · N§ · M pipes · X edited`', () => {
		const { ui } = open();
		expect(ui.container.textContent).toContain('v19 · 3§ · 6 pipes · 0 edited');
		// No session-name / "concrete section(s)" prose in the head anymore.
		expect(ui.container.querySelector('.extract-head')!.textContent).not.toContain('concrete section');
	});

	it('A4: Copy ▾ folds both copy handlers into one menu', () => {
		const { ui, onCopyExtract } = open();
		// Menu is closed by default — the old standalone buttons are gone.
		expect(ui.queryByRole('button', { name: 'Copy sections' })).toBeNull();
		fireEvent.click(ui.getByRole('button', { name: 'Copy' }));
		const item = ui.getByRole('menuitem', { name: 'Copy sections' });
		fireEvent.click(item);
		expect(onCopyExtract).toHaveBeenCalledTimes(1);
		// The item click closes the menu.
		expect(ui.queryByRole('menuitem', { name: 'Copy sections' })).toBeNull();
	});

	it('A4: the "Copy engine sheet" item only exists with an engine, same handler', () => {
		const engine = { novel: { film: { logline: 'l', world: 'w', palette: 'p' } } } as unknown as EngineRun;
		const { ui, onCopyEngineSheet } = open({ engine });
		fireEvent.click(ui.getByRole('button', { name: 'Copy' }));
		const item = ui.getByRole('menuitem', { name: 'Copy engine sheet' });
		fireEvent.click(item);
		expect(onCopyEngineSheet).toHaveBeenCalledTimes(1);

		// No engine → the item is absent (as with today's conditional button).
		cleanup();
		const ui2 = render(ExtractTab, {
			props: {
				doc: makeDoc(),
				engine: null,
				sessionId: 's1',
				sessionName: 'Session 8',
				pipeCount: 6,
				localExtract: defaultSections(),
				dirtyCount: 0,
				extractPipeCount: 1,
				applyWorking: false,
				feedback: null,
				onCopyExtract: vi.fn(),
				onCopyEngineSheet: vi.fn(),
				onRegenerate: vi.fn(),
			} as Record<string, unknown>,
		});
		fireEvent.click(ui2.getByRole('button', { name: 'Copy' }));
		expect(ui2.queryByRole('menuitem', { name: 'Copy engine sheet' })).toBeNull();
	});

	it('A4: regenerate stays standalone with the fixed edge copy', () => {
		const { ui, onRegenerate } = open();
		const btn = ui.getByRole('button', { name: /Regenerate pipes/ });
		expect(btn.className).toContain('danger');
		expect(btn.textContent).toContain('replace · no fallback · replay v19');
		fireEvent.click(btn);
		expect(onRegenerate).toHaveBeenCalledTimes(1);
	});

	it('A4: "N edited" renders in the warning lane when > 0', () => {
		const { ui } = open({
			localExtract: [sec(0, 'camera', 0, '24\u201348', 'edited text', 'static wide, 24mm')],
			dirtyCount: 1,
		});
		const edited = ui.container.querySelector('.head-edited') as HTMLElement;
		expect(edited.textContent).toBe('1 edited');
		expect(edited.className).toContain('edited');
	});

	// ── A5 · humanized zone labels ─────────────────────────────────────
	it('A5: zone labels are seconds-primary with the frame window in the tooltip', () => {
		const { ui } = open();
		const label = ui.container.querySelector('.tz-zone-label') as HTMLElement;
		expect(label.textContent).toBe('t1.0s'); // 24f / 24fps
		expect(label.title).toBe('24–48f'); // frames live in the tooltip
		// No raw-frame zone label remains.
		expect(ui.container.textContent).not.toContain('t24f');
	});
});
