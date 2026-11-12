<script lang="ts">
	// Phase-1 hot path of the Director tab. Presentational child of
	// DirectorPanel — all shared state (entry, doc, engine, stepChain,
	// runError, runDurationMs, feedback) is parent-owned; this component
	// only renders and writes back via $bindable (entry) / callbacks.
	//
	// Layout (2026-11-11 "front-load advanced options + fix the collapse"):
	//   ① DIRECTION      — idea block (always open in-flight) + Run CTA + lock
	//   ② PARAMETERS     — G0 seed knobs, FRONT-LOADED (steer the next run)
	//   ③ STRUCTURE      — S0.5 structural tree
	//   ④ NOVEL / ⑤ STEP CHAIN — the run's result + watch-it-think log
	// The G0 params used to hide behind a completed run; now they sit in the
	// hot path so the pre-generation knobs are reachable up front.
	import {
		expansionLabel,
		type EngineEntryInput,
		type EngineRun,
		type NovelScene,
		type NovelShot,
	} from '$lib/directorStore/engine';
	import { timelineRows } from '$lib/directorStore/engine';
	import { onRunProgress, type RunProgressEvent } from '$lib/directorStore/runProgress';
	import type { FlowDocument } from '$lib/directorStore/types';
	import TextBlock from '../TextBlock.svelte';
	import DirectorG0Params from './DirectorG0Params.svelte';
	import RunLog from './RunLog.svelte';
	import TimelinePreview from './TimelinePreview.svelte';
	import StructurePanel from './StructurePanel.svelte';

	type StepRow = {
		name: string;
		ver: string;
		src: string;
		state: string;
		stateClass: string;
	};

	let {
		engine,
		doc,
		running,
		entry = $bindable(),
		stepChain,
		runDurationMs,
		runError,
		pipeCount,
		applyWorking,
		feedback,
		seedWorking,
		canExportSeed,
		onRun,
		onAnnotate,
		onApply,
		onExtractPipes,
		extractedPrompt = $bindable(''),
		onCopyExtracted,
		onClearExtracted,
		onExportSeed,
		onImportSeed,
	} = $props<{
		engine: EngineRun | null;
		doc: FlowDocument | null;
		running: boolean;
		/** G0 entry (parent-owned canonical state; TextBlock writes back
		 via this $bindable prop — the parent persists it per session). */
		entry: EngineEntryInput;
		/** The 4-row step chain (parent-derived; null before a run). */
		stepChain: StepRow[] | null;
		/** Wall-clock ms for the last run (M1's RunLog will consume it). */
		runDurationMs: number | null;
		runError: string | null;
		pipeCount: number;
		applyWorking: boolean;
		feedback: { text: string; tone: string } | null;
		/** M2: seed-card export/import in-flight flag. */
		seedWorking: boolean;
		/** M2: whether the G0 idea is non-empty (export enabled). */
		canExportSeed: boolean;
		/** Run S0→S5 (parent's handleRun). */
		onRun: () => void;
		/** Accept / Reject run annotation (parent's annotateRun). */
		onAnnotate: (kind: 'accept' | 'reject') => Promise<void>;
		/** Destructive regenerate pipes (parent's applyPipes). */
		onApply: (replace: boolean) => Promise<void>;
		/** Extract the session's composer pipes into prompt text (parent's handler). */
		onExtractPipes?: () => void;
		/** The last-extracted prompt text (parent-owned, bindable — the user
		 can edit it in the panel; re-extracting replaces it). */
		extractedPrompt: string;
		/** Copy the on-screen extracted text to the clipboard. */
		onCopyExtracted?: () => void;
		/** Clear the on-screen extracted text. */
		onClearExtracted?: () => void;
		/** M2: export the G0 entry to a .vmseed.json (parent's exportSeedCard). */
		onExportSeed?: () => Promise<void>;
		/** M2: import a .vmseed.json into the G0 controls (parent's importSeedCard). */
		onImportSeed?: () => Promise<void>;
	}>();

	// ── M1 "watch it think": local run-progress log + timeline preview ──
	// logLines accumulates events from the backend's director_run_progress
	// channel (see runProgress.ts). Cap at last 40 to keep the DOM light.
	let logLines = $state<RunProgressEvent[]>([]);
	// The S4-verified shot strip (derived from the engine after a run).
	let previewRows = $derived(engine ? timelineRows(engine) : []);
	// Label for the extracted-prompt block (the pipe count it came from).
	let extractedPipeLabel = $derived(
		extractedPrompt ? `${pipeCount} pipe${pipeCount !== 1 ? 's' : ''}` : '',
	);

	// Reset the log when a new run starts (running: false → true).
	// prevRunning is deliberately NON-reactive bookkeeping: the effect's
	// only tracked dependency is `running`, so it re-runs exactly when
	// the run state flips — not on the bookkeeping write itself.
	let prevRunning = false;
	$effect(() => {
		if (running && !prevRunning) logLines = [];
		prevRunning = running;
	});

	// Subscribe once on mount; accumulate events into logLines.
	$effect(() => {
		const unsub = onRunProgress((e) => {
			logLines = [...logLines, e].slice(-40);
		});
		return unsub;
	});
</script>

<!-- ── Phase 1 hot path: ① DIRECTION · ② NOVEL · ③ STEP CHAIN ──
	     The creator's primary control flow is three blocks. All the
	     expert-level detail (gate strip, G0 grid, S2/S3/S4, timeline, S5)
	     is demoted into the Advanced disclosure at the bottom of this tab
	     so the hot path never shows it. -->

	<!-- ① DIRECTION — the idea (primary control). The block stays OPEN while a
	     run is in flight (generating={running}), so its progress ring + the
	     live "watch it think" log below are always visible; it never
	     auto-collapses on a run start or completion — that was the
	     "instantly minimized, can't see progress" bug. The idea is the
	     *source* of the flow, so it is never auto-locked: after a run you can
	     tweak it and re-run freely. The Run button is the always-available
	     primary trigger; ◉ inside the block is a secondary trigger. -->
	<section class="stage hot dir-direction">
		<div class="dir-direction-head">
			<h3 class="block-heading">① DIRECTION <span class="muted">· idea</span></h3>
			<div class="dir-direction-actions">
				<button
					class="btn"
					disabled={pipeCount === 0}
					title={pipeCount ? `Copy ${pipeCount} composer pipe(s) as prompt text` : 'Add pipes in the Pipes tab first'}
					onclick={onExtractPipes}>
					Extract pipes to prompt
				</button>
				<button
					class="btn primary dir-run"
					disabled={running || !entry.idea.trim()}
					title={!entry.idea.trim() ? 'Write the idea first' : 'Build the S0→S5 flow'}
					onclick={onRun}>
					{running ? 'Running…' : 'Run S0→S5'}
				</button>
			</div>
		</div>
		<TextBlock
			label="Idea"
			bind:value={entry.idea}
			generating={running}
			locked={false}
			onRun={onRun}
		/>
		{#if extractedPrompt}
			<!-- The extracted pipe-prompt text is VISIBLE, editable and
			     copyable — extraction is not a silent clipboard-only op. -->
			<div class="extracted-prompt">
				<header class="extracted-head">
					<span class="k">Extracted prompt ({extractedPipeLabel})</span>
					<div class="extracted-actions">
						<button class="btn" disabled={!extractedPrompt.trim()} onclick={onCopyExtracted}>Copy</button>
						<button class="btn" onclick={onClearExtracted}>Clear</button>
					</div>
				</header>
				<textarea
					class="extracted-text"
					rows="8"
					bind:value={extractedPrompt}
					oninput={() => { /* bindable write-back only */ }}
				></textarea>
			</div>
		{/if}
	</section>

	<!-- ② PARAMETERS — the G0 seed knobs, FRONT-LOADED and always visible.
	     They steer the NEXT run (mood / format / scale / time / weather), so
	     they live in the hot path instead of hidden behind a completed run.
	     Read-only while a run is in flight. -->
	<DirectorG0Params bind:entry disabled={running} />

	<!-- ③ STRUCTURE — the S0.5 structural tree ("brief, not a cage").
	     The manual-override pins write back into entry.overrides so the next
	     run re-derives the tree WITH the user's pins. -->
	<StructurePanel tree={engine?.tree ?? null} bind:overrides={entry.overrides} disabled={running} />

	{#if engine}
		<!-- ④ NOVEL — read-only collapsed rows (the S1 visual novel state). -->
		<section class="stage hot">
			<h3 class="block-heading">
				④ NOVEL
				<span class="muted chip {engine.expansion === 'llm' ? 'chip-llm' : 'chip-fallback'}"
					title={engine.expansion_note ?? ''}>
					{expansionLabel(engine)}
				</span>
			</h3>
			<ul class="novel-rows">
				<li>
					<code class="nr-id">primary</code>
					<span class="nr-text">{engine.novel.scenes.map((s: NovelScene) => s.prose).join(' · ')}</span>
				</li>
				<li>
					<code class="nr-id">secondary</code>
					<span class="nr-text">
						{engine.novel.scenes.map((s: NovelScene) => s.shots.map((sh: NovelShot) => sh.prose).join(' · ')).join(' · ')}
					</span>
				</li>
				<li>
					<code class="nr-id">ambient</code>
					<span class="nr-text">{engine.novel.film.logline}</span>
				</li>
			</ul>
		</section>

		<!-- ⑤ STEP CHAIN — the 4 rows + annotation / seed actions.
		     The primary Run button lives at ① DIRECTION now (always visible),
		     so this row keeps only the secondary post-run actions. -->
		<section class="stage hot">
			<h3 class="block-heading">⑤ STEP CHAIN <span class="muted">· {doc?.flowVersion ?? '—'}</span></h3>
			<!-- M1 "watch it think": the run-progress log + shot timeline strip
			     are ADDITIVE to the step chain below (not a replacement).
			     RunLog accumulates backend director_run_progress events;
			     TimelinePreview builds in from the S4-verified rows. -->
			<RunLog lines={logLines} {running} />
			<TimelinePreview rows={previewRows} active={!!engine} />
			<ul class="step-chain">
				{#if stepChain}
					{#each stepChain as row}
						<li class="step {row.stateClass} {runError ? 'step-fail' : ''}">
							<code class="step-name">{row.name}</code>
							<code class="step-ver">{row.ver}</code>
							<span class="step-src">{row.src}</span>
							<span class="step-state">{row.state}</span>
						</li>
					{/each}
				{:else}
					<li class="hint">No run yet — type an idea and press Run.</li>
				{/if}
			</ul>
			{#if runError}
				<p class="flow-error" role="alert">{runError}</p>
			{/if}
			<div class="step-actions">
				{#if doc}
					<button class="btn" onclick={() => void onAnnotate('accept')}>Accept</button>
					<button class="btn" onclick={() => void onAnnotate('reject')}>Reject</button>
				{:else}
					<span class="hint step-actions-hint">No run yet — type an idea and press <b>Run S0→S5</b> above.</span>
				{/if}
				<!-- M2 seed card: export / import the G0 entry + novel preview. -->
				<div class="seed-actions">
					<button
						class="btn"
						disabled={seedWorking || !canExportSeed}
						title={canExportSeed ? 'Export the G0 entry as a shareable seed file' : 'Write the idea first'}
						onclick={() => onExportSeed?.()}>
						{seedWorking ? 'Working…' : 'Export seed'}
					</button>
					<button
						class="btn"
						disabled={seedWorking}
						title="Import a .vmseed.json into the G0 controls"
						onclick={() => onImportSeed?.()}>
						Import seed
					</button>
				</div>
			</div>
		</section>

		<!-- Advanced disclosure (gate strip + G0 grid + S2–S5): injected by
		     the parent via this slot so DOM order stays exactly as the
		     monolith had it (details sits between ③ and the action row). -->
		<slot />
	{:else if doc}
		<div class="phase0-notice">
			<span class="muted">This run predates the engine — rebuild it below with one click to see the S0→S5 flow.</span>
		</div>
	{/if}

	<!-- Destructive apply (I9, design §4): materialize the flow's
	     structured plan into composer pipes via save_composer.
	     replace vs append, gated by a confirm dialog. -->
	{#if doc}
		<section class="stage actions">
			<button class="btn danger" disabled={applyWorking} onclick={() => void onApply(true)}>
				Regenerate pipes
				<span class="btn-note">replace · no fallback · replay v{doc.regen.version.flowVersion}</span>
			</button>
			<button class="btn danger" disabled={applyWorking} onclick={() => void onApply(false)}>
				<span class="btn-note">append</span>
			</button>
		</section>
	{/if}

	{#if feedback}
		<p class="action-feedback {feedback.tone}" role="status">{feedback.text}</p>
	{/if}

<style>
	/* Design tokens only (Template A): no new colors, hairlines, quiet.
	   Motion uses --transition-sin (additive token, design doc §6). */

	.phase0-notice {
		padding: 8px 10px;
		border: 1px dashed var(--border-color);
		font-size: 12px;
	}

	/* Section heading: quiet hairline text + the theme's accent tick, so a
	   theme switch is visible at the panel level (steel's orange vs
	   jetbrains' blue accent shows up here first). */
	.block-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		margin: 4px 0 2px;
	}
	.block-heading::before {
		content: '';
		flex-shrink: 0;
		width: 3px;
		height: 12px;
		border-radius: 2px;
		background: var(--gradient-accent, var(--accent-color));
	}
	.block-heading .muted {
		font-weight: 400;
	}
	.block-heading .muted {
		color: var(--text-muted);
		font-weight: 400;
	}
	.muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	/* S1 expansion-source chip: LLM (green tint) vs template fallback
		(neutral). Design: quiet template-a, hairline, no new color families. */
	.block-heading .chip {
		display: inline-block;
		margin-left: 0.35rem;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--border-color);
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		max-width: 24rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		vertical-align: baseline;
		background: var(--bg-tertiary);
	}
	.chip-llm {
		color: var(--success-color, var(--text-secondary));
		border-color: color-mix(in srgb, var(--success-color, #4ade80) 45%, transparent);
		background: color-mix(in srgb, var(--success-color, #4ade80) 10%, transparent);
	}
	.chip-fallback {
		color: var(--text-muted);
	}

	.flow-error {
		color: var(--danger-color);
		background: var(--danger-bg);
		padding: 8px 10px;
		font-size: 12px;
		border-left: 2px solid var(--danger-color);
	}

	/* Transient action feedback (confirm / accept / reject / apply) so a
		click is never silent. Quiet template-a: hairline left border, tone. */
	.action-feedback {
		font-size: 12px;
		padding: 6px 10px;
		border-left: 2px solid var(--border-color);
		color: var(--text-secondary);
	}
	.action-feedback.tone-ok {
		color: var(--text-primary);
		border-left-color: var(--success-color, var(--accent-color));
	}
	.action-feedback.tone-warn {
		color: var(--text-primary);
		border-left-color: var(--warning-color, #e0a34e);
	}
	.action-feedback.tone-danger {
		color: var(--danger-color);
		border-left-color: var(--danger-color);
	}
	.action-feedback.tone-neutral {
		color: var(--text-muted);
	}

	/* ── Stages ── */
	.stage {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-top: 1px solid var(--border-color);
		padding-top: 12px;
	}
	.stage:first-of-type {
		border-top: none;
		padding-top: 0;
	}

	/* ── Phase-1 hot path (① DIRECTION · ② NOVEL · ③ STEP CHAIN) ──
	   The primary control flow is elevated into a card surface, so it reads
	   as "the thing you do first" and stays visually distinct from the
	   demoted Advanced hairline rows below it. */
	.stage.hot {
		border-top: none;
		gap: 10px;
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 14px 16px;
		box-shadow: var(--shadow-sm, none);
	}
	/* Consistent vertical rhythm between the stacked section cards: the parent
	   `.director-root` supplies the inter-card gap, so no per-card margin. */
	.stage.hot .block-heading {
		margin: 0;
	}
	.stage.hot .block-heading .muted {
		letter-spacing: 0.04em;
	}

	.novel-rows {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.novel-rows li {
		display: flex;
		gap: 8px;
		align-items: baseline;
		padding: 4px 6px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		background: var(--bg-elevated);
		cursor: default;
	}
	.nr-id {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		color: var(--text-secondary);
		min-width: 72px;
	}
	.nr-text {
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-primary);
	}

	.step-chain {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.step {
		display: grid;
		grid-template-columns: 72px 44px 1fr auto;
		gap: 8px;
		align-items: center;
		padding: 6px 8px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
	}
	.step-name, .step-ver, .step-src, .step-state {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
	}
	.step-ver { color: var(--text-secondary); }
	.step-src { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.step-name, .step-state { color: var(--text-primary); }
	.step-ok { border-left: 3px solid var(--success-color, #22c55e); }
	.step-mut { border-left: 3px solid var(--border-color); }
	.step-fail { border-left: 3px solid var(--danger-color, #ef4444); }

	.step-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
		align-items: center;
		flex-wrap: wrap;
	}
	.step-actions-hint {
		font-size: 11px;
		color: var(--text-muted);
	}
	.step-actions-hint b {
		color: var(--text-secondary);
		font-weight: 600;
	}

	/* ── ① DIRECTION head: the idea label + the always-available Run CTA.
	   The block below it never auto-collapses while a run is in flight —
	   the Run button is the primary trigger; the secondary trigger (◉)
	   lives inside the TextBlock. */
	.dir-direction-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.dir-direction-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.dir-run {
		white-space: nowrap;
	}

	/* ── Extracted pipe-prompt block (visible + editable, not clipboard-only) ── */
	.extracted-prompt {
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: var(--bg-tertiary);
		overflow: hidden;
	}
	.extracted-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border-color);
		background: var(--bg-elevated);
	}
	.extracted-head .k {
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.extracted-actions {
		display: flex;
		gap: 6px;
	}
	.extracted-text {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 8px 10px;
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		line-height: 1.5;
		border: none;
		outline: none;
		resize: vertical;
		min-height: 96px;
		background: transparent;
		color: var(--text-primary);
	}

	/* ── Run + destructive apply ── */
	.actions {
		flex-direction: row;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.btn {
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-primary);
		background: var(--bg-elevated);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 6px 12px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition: border-color var(--transition-fast, 0.15s ease),
			background var(--transition-fast, 0.15s ease),
			box-shadow var(--transition-fast, 0.15s ease);
	}
	.btn:hover:not(:disabled) {
		border-color: var(--accent-color);
	}
	.btn:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn.primary {
		background: var(--gradient-btn, var(--accent-color));
		color: var(--text-inverse);
		border-color: transparent;
		box-shadow: 0 2px 10px var(--accent-glow, var(--shadow-sm, none));
	}
	.btn.primary:hover:not(:disabled) {
		background: var(--gradient-btn-hover, var(--accent-hover, var(--accent-color)));
		border-color: transparent;
		box-shadow: 0 3px 14px var(--accent-glow, var(--shadow-sm, none));
	}
	.btn.danger {
		color: var(--danger-color);
		border-color: color-mix(in srgb, var(--danger-color) 50%, var(--border-color));
		background: var(--danger-bg, transparent);
	}
	.btn.danger:hover:not(:disabled) {
		border-color: var(--danger-color);
		background: var(--danger-bg, var(--bg-hover));
	}
	.btn-note {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-muted);
		font-family: var(--font-mono);
		letter-spacing: 0.01em;
	}
	.hint {
		color: var(--text-muted);
		font-size: 11px;
	}

	/* Respect the user's motion preference: drop the sine tweens, keep the
	   state changes instant (design doc §6 motion is additive, not load-bearing). */
	@media (prefers-reduced-motion: reduce) {
		* {
			transition-duration: 0.001ms !important;
			transition-timing-function: linear !important;
		}
	}
</style>
