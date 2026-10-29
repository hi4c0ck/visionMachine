<script lang="ts">
	// Director's-harness tab bodies. Design: docs/director-harness-ui-system.md
	// (tabbed composer, grill-verified). Safe slice: Run + read + signals are
	// live; destructive apply + golden set render honest empty states.
	import { flashToast } from '$lib/flashToast';
	import { runFlow, listFlows, loadFlow, type DirectorTab } from '$lib/directorStore';
	import {
		tagBars,
		type FlowDocument,
		type FlowSummary,
	} from '$lib/directorStore/types';
	import { sparklinePoints } from '$lib/directorStore/types';
	import TextBlock from './TextBlock.svelte';

	let {
		activeTab,
		sessionId,
		sessionName,
		pipeCount,
		onLogSignal,
		onRunningChange,
	} = $props<{
		activeTab: DirectorTab;
		sessionId: string;
		sessionName: string;
		pipeCount: number;
		/** Signal capture sink (Workspace forwards to directorStore.logSignal). */
		onLogSignal: (
			kind: 'edit_diff' | 'accept' | 'reject' | 'rate',
			targetSpan: string,
			note?: string
		) => Promise<string>;
		/** Run-liveness sink so the strip's Director badge (design §1 guard)
		 stays honest while the user sits on another tab. */
		onRunningChange?: (running: boolean) => void;
	}>();

	let direction = $state('');
	// Explicit $state generics (canonical Svelte 5 form): avoids the checker
	// collapsing `FlowDocument | null` to `never` when the annotation and the
	// `$state(null)` value are merged implicitly.
	let doc = $state<FlowDocument | null>(null);
	let flows = $state<FlowSummary[]>([]);
	let running = $state(false);
	let runError = $state<string | null>(null);
	let activeRun = $state<number | null>(null);
	let openTag = $state<string | null>(null);

	$effect(() => {
		if (activeTab === 'scoreboard') void refreshFlows();
	});

	let lastSession = $state(sessionId);
	// Per-session isolation: when the session prop changes, reset in-tab state
	// so a switched session never carries the previous session's run. (The
	// store already keys run-state by session id; this covers the panel's
	// own doc/direction/flows.) Declared before the seed effect so the seed
	// sees the cleared `doc` and reloads the new session's newest run.
	$effect(() => {
		if (sessionId !== lastSession) {
			lastSession = sessionId;
			doc = null;
			direction = '';
			flows = [];
			activeRun = null;
			runError = null;
			openTag = null;
		}
	});

	// Seed the active document from the newest persisted run so Extract /
	// Scoreboard reflect saved data, not just the in-tab run. Runs only when
	// no document is live yet (a fresh run in the Director tab wins).
	$effect(() => {
		if (doc) return;
		void (async () => {
			try {
				const listed = await listFlows(sessionId);
				if (listed.length > 0) {
					flows = listed;
					const newest = listed[0];
					doc = await loadFlow(sessionId, newest.flowVersion);
					activeRun = newest.flowVersion;
				}
			} catch (e) {
				console.warn('director load_latest', e);
			}
		})();
	});

	async function refreshFlows() {
		try {
			flows = await listFlows(sessionId);
		} catch (e) {
			console.warn('director list_flows', e);
			flows = [];
		}
	}

	async function handleRun() {
		running = true;
		onRunningChange?.(true);
		runError = null;
		try {
			const result = await runFlow(sessionId, direction);
			doc = result;
			activeRun = result.flowVersion;
			await refreshFlows();
		} catch (e) {
			runError = String(e);
			flashToast(runError);
		} finally {
			running = false;
			onRunningChange?.(false);
		}
	}

	function fmtScore(n: number): string {
		return n.toFixed(2);
	}

	function scoreTone(n: number): string {
		if (n < 0.25) return 'tone-danger';
		if (n < 0.4) return 'tone-warn';
		return 'tone-neutral';
	}

	function copyExtract() {
		if (!doc) return;
		const lines = (doc.structured.pipes[0]?.sections ?? []).map((s) => {
			// Plain structural text (design §4): tag word + mono range + prompt.
			// Provenance prints `source: —` while from: [] is unpopulated.
			const src = s.from.length ? s.from.join(' · ') : '—';
			return `--- ${s.tag} ${s.frameStart}–${s.frameEnd} ---\n${s.prompt}\nsource: ${src}`;
		});
		void navigator.clipboard
			.writeText(lines.join('\n\n'))
			.then(() => flashToast('Structural text copied', 'success'))
			.catch(() => flashToast('Copy failed'));
	}

	const sections = $derived(doc?.structured.pipes[0]?.sections ?? []);
	// Q4 sparkline: overall score across persisted runs (oldest → newest).
	// Data is real (FlowSummary.overall from each saved doc), not invented;
	// the honest empty state is "no chart" when <2 runs.
	const sparkPoints = $derived(sparklinePoints([...flows].reverse().map((f) => f.overall)));
</script>

<div class="director-root" data-tab={activeTab}>
	{#if activeTab === 'director'}
		<section class="director-section">
			<TextBlock
				label="Direction"
				bind:value={direction}
				generating={running}
				locked={running || doc !== null}
				onRun={handleRun}
			/>
		</section>

		{#if runError}
			<p class="flow-error" role="alert">{runError}</p>
		{/if}

		{#if doc}
			<section class="director-section">
				<h3 class="block-heading">
					Novel <span class="muted">· auto-locked</span>
				</h3>
				<div class="novel-layers">
					<div class="novel-layer" title={doc.novel.primary.text}>
						<span class="layer-name">primary</span>
						<span class="layer-text">{doc.novel.primary.text}</span>
					</div>
					{#each doc.novel.secondary as l, i}
						<div class="novel-layer" title={l.text}>
							<span class="layer-name">secondary {i + 1}</span>
							<span class="layer-text">{l.text}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="director-section">
				<h3 class="block-heading">Step chain</h3>
				<ul class="step-chain">
					<li>expand · v{doc.novel.stepVersion} · {doc.novel.primary.text.trim().split(/\s+/).filter(Boolean).length} words · ok</li>
					<li>structure · v{doc.regen.version.structureVersion} · {sections.length} sections · ok</li>
					<li>critic · v{doc.regen.version.criticVersion} · {doc.criticModel?.untrained ? 'untrained stub' : 'head v' + ((doc.criticModel?.spec.modelVersion) ?? 0)} · ok</li>
					<li>lower · v{doc.regen.version.flowVersion} · {doc.lowered.elements.length} elements · ok</li>
				</ul>
			</section>

			<section class="director-section actions">
				<button
					class="btn primary"
					disabled={running}
					onclick={() => void onLogSignal('accept', 'root', 'run ' + activeRun)}
				>
					Accept
				</button>
				<button
					class="btn"
					onclick={() => void onLogSignal('reject', 'root', runError ?? 'run rejected')}
				>
					Reject
				</button>
				<!-- Destructive apply is a sharp edge (I9 materialize adapter,
				     later phase): rendered disabled with the fixed "no fallback"
				     copy from design §4, not wired to a command. -->
				<button class="btn danger" disabled>
					Regenerate pipes
					<span class="btn-note">not wired yet · no fallback · replay v{doc.regen.version.flowVersion}</span>
				</button>
			</section>
		{/if}
	{/if}

	{#if activeTab === 'extract'}
		{#if doc}
			<div class="extract-head">
				<span class="muted">{sessionName} · v{doc.flowVersion} · {sections.length} sections · {pipeCount} pipes in composer</span>
				<button class="btn" onclick={copyExtract}>Copy all</button>
			</div>
			{#each sections as s, i}
				<article class="extract-block">
					<header class="extract-meta">
						<span class="tag-word">{s.tag}</span>
						<code class="range">{String(s.frameStart).padStart(2, '0')}–{s.frameEnd}</code>
						<span class="provenance" class:active={s.from.length > 0}>
							{#if s.from.length > 0}
								source: {s.from.join(' · ')}
							{:else}
								source: —
							{/if}
						</span>
					</header>
					<p class="extract-prompt">{s.prompt || '—'}</p>
				</article>
			{/each}
			<p class="hint">
				This text is self-sufficient: it can be used to regenerate pipes later (I4).
			</p>
		{:else}
			<p class="hint">Run the Director tab first — the final structural text appears here.</p>
		{/if}
	{/if}

	{#if activeTab === 'scoreboard'}
		{#if doc}
			<h3 class="block-heading">
				Weak spots · {sessionName} run v{doc.flowVersion} · {tagBars(doc).length} tags used
			</h3>
			<ul class="tag-bars">
				{#each tagBars(doc) as b}
					<li>
						<button
							class="bar-row"
							onclick={() => (openTag = openTag === b.tag ? null : b.tag)}
						>
							<span class="bar-label">{b.tag}</span>
							<span class="bar">
								<span
									class="bar-fill {scoreTone(b.avg)}"
									style="width: {Math.round(b.avg * 100)}%"
								></span>
							</span>
							<code class="bar-score {scoreTone(b.avg)}">{fmtScore(b.avg)}</code>
						</button>
						{#if openTag === b.tag}
							<ul class="culprits">
								{#each b.sections as cs}
									<li>
										<code>{cs.frameStart}–{cs.frameEnd}</code> {cs.prompt}
										<em class="score {scoreTone(cs.score)}">{fmtScore(cs.score)}</em>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<section class="score-card">
			<h3 class="block-heading">Golden set</h3>
			<p class="hint">
				{#if flows.length === 0}
					No runs yet.
				{:else}
					No runs flagged as golden yet — golden-set schema pending.
				{/if}
			</p>
		</section>

		<section class="score-card">
			<h3 class="block-heading">Critic A/B</h3>
			<p class="hint">
				Flag ≥2 golden runs across two critic head versions to compare.
				{#if doc}
					Currently v{doc.regen.version.criticModelVersion}
					{doc.criticModel?.untrained ? ' (stub)' : ''}.
				{/if}
			</p>
		</section>

		<section class="score-card">
			<h3 class="block-heading">Learning strip</h3>
			<div class="learning-row">
				<p class="hint">
					{flows.length} run{flows.length === 1 ? '' : 's'} recorded · critic
					{#if doc?.criticModel?.untrained}
						untrained (stub)
					{:else}
						v{(doc?.regen.version.criticModelVersion) ?? 0}
					{/if} · signals wired
				</p>
				{#if sparkPoints}
					<svg
						class="sparkline"
						viewBox="0 0 120 24"
						width="120"
						height="24"
						role="img"
						aria-label="Overall score across runs"
					>
						<!-- gridline at 0.5 (the stub-critic neutral line) -->
						<line x1="0" y1="12.5" x2="120" y2="12.5" class="spark-grid" />
						<polyline
							points={sparkPoints}
							fill="none"
							stroke="var(--accent-color)"
							stroke-width="1.5"
						/>
					</svg>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	/* Design tokens only (Template A): no new colors, hairlines, quiet.
	   Motion uses --transition-sin (additive token, design doc §6). */

	.director-root {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 12px 14px 40px;
		min-height: 100%;
	}

	.director-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.block-heading {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		margin: 4px 0 2px;
	}

	.muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	.flow-error {
		color: var(--danger-color);
		background: var(--danger-bg);
		padding: 8px 10px;
		font-size: 12px;
		border-left: 2px solid var(--danger-color);
	}

	/* ── Novel layers (auto-locked, collapsed to 1 line each) ── */

	.novel-layers {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.novel-layer {
		display: flex;
		gap: 10px;
		align-items: baseline;
		padding: 4px 8px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		overflow: hidden;
	}

	.layer-name {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
		flex-shrink: 0;
		min-width: 74px;
	}

	.layer-text {
		font-size: 12px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Step chain (4 quiet rows, mono versions) ── */

	.step-chain {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-secondary);
	}

	.step-chain li {
		padding: 3px 6px;
		border-left: 1px solid var(--border-color);
	}

	/* ── Action row ── */

	.actions {
		flex-direction: row;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	.btn {
		font: inherit;
		font-size: 12px;
		color: var(--text-primary);
		background: var(--bg-elevated);
		border: 1px solid var(--border-color);
		padding: 6px 12px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition: border-color var(--transition-sin, 0.25s),
			background var(--transition-sin, 0.25s);
	}

	.btn:hover:not(:disabled) {
		border-color: var(--accent-color);
	}

	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn.primary {
		background: var(--accent-color);
		color: var(--text-inverse);
		border-color: transparent;
	}

	.btn.danger {
		color: var(--danger-color);
		border-color: var(--danger-color);
	}

	.btn-note {
		font-size: 10px;
		color: var(--text-muted);
		font-family: var(--font-mono);
	}

	/* ── Extract: plain structural text (design §4) ── */

	.extract-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.extract-block {
		border-top: 1px solid var(--border-color);
		padding: 10px 2px;
	}

	.extract-meta {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 6px;
	}

	/* Tag = a plain word. No color, no chip (design §4 corrected). */
	.tag-word {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 500;
	}

	.range {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-primary);
	}

	.provenance {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}

	.provenance.active {
		color: var(--text-secondary);
	}

	.extract-prompt {
		font-size: 13px;
		color: var(--text-primary);
		white-space: pre-wrap;
	}

	.hint {
		color: var(--text-muted);
		font-size: 11px;
	}

	/* ── Scoreboard Q1: tag bars, neutral fill, threshold colors only ── */

	.tag-bars {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.bar-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		background: none;
		border: none;
		padding: 4px 6px;
		cursor: pointer;
		color: var(--text-primary);
		font: inherit;
	}

	.bar-row:hover {
		background: var(--bg-hover);
	}

	.bar-label {
		width: 84px;
		font-size: 12px;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.bar {
		flex: 1;
		height: 6px;
		background: var(--bg-elevated);
		overflow: hidden;
	}

	.bar-fill {
		display: block;
		height: 100%;
		background: var(--accent-color);
		transition: width var(--transition-sin, 0.5s);
	}

	.bar-fill.tone-warn {
		background: var(--warning-color);
	}

	.bar-fill.tone-danger {
		background: var(--danger-color);
	}

	.bar-score {
		font-family: var(--font-mono);
		font-size: 11px;
		width: 44px;
		text-align: right;
		color: var(--text-secondary);
	}

	.bar-score.tone-warn {
		color: var(--warning-color);
	}

	.bar-score.tone-danger {
		color: var(--danger-color);
	}

	.culprits {
		list-style: none;
		margin: 4px 0 6px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.culprits li {
		font-size: 11px;
		color: var(--text-secondary);
		display: flex;
		gap: 8px;
		align-items: baseline;
	}

	.culprits code {
		font-family: var(--font-mono);
		color: var(--text-muted);
	}

	.score {
		font-family: var(--font-mono);
	}

	.score.tone-warn {
		color: var(--warning-color);
	}

	.score.tone-danger {
		color: var(--danger-color);
	}

	.score-card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		border-top: 1px solid var(--border-color);
		padding-top: 10px;
	}

	/* ── Q4 learning strip + the tab's single sparkline ── */
	.learning-row {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.learning-row .hint {
		flex: 1;
	}

	.sparkline {
		flex-shrink: 0;
		opacity: 0.9;
	}

	.spark-grid {
		stroke: var(--text-muted);
		stroke-width: 0.5;
		stroke-dasharray: 2 2;
		opacity: 0.5;
	}
</style>
