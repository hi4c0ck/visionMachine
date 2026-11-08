<script lang="ts">
	// Scoreboard tab: Q1 tag bars (openTag) + Q2 runs ledger +
	// golden / critic / learning cards with the tab's single sparkline.
	// Presentational child of DirectorPanel: doc / flows are parent-owned;
	// openTag stays canonical in the parent and crosses via the
	// onToggleTag callback. The score helpers used ONLY here (fmtScore /
	// scoreTone) moved with their usage.
	import {
		tagBars,
		sparklinePoints,
		diffEngineRuns,
		goldenDrift,
		overall,
		type FlowDocument,
		type FlowSummary,
		type GoldenRun,
	} from '$lib/directorStore/types';
	import { loadFlow, flagGolden, listGolden } from '$lib/directorStore';
	import { sessions } from '$lib/composerStore';
	import { concernSummary, type EngineRun } from '$lib/directorStore/engine';
	import { flashToast } from '$lib/flashToast';

	let {
		doc,
		flows,
		sessionName,
		openTag,
		onToggleTag,
		onLogSignal,
	} = $props<{
		doc: FlowDocument | null;
		/** Persisted run summaries (parent-owned, newest-first). */
		flows: FlowSummary[];
		sessionName: string;
		/** Currently-open tag bar (parent-owned). */
		openTag: string | null;
		/** Toggle a tag's culprit list (parent updates openTag). */
		onToggleTag: (tag: string | null) => void;
		/** Runs-ledger annotation buttons (parent's onLogSignal sink). */
		onLogSignal: (
			kind: 'edit_diff' | 'accept' | 'reject' | 'rate',
			targetSpan: string,
			note?: string
		) => Promise<string>;
	}>();

	/** The M6 compare's session id: the slim parent doesn't thread a
	 sessionId down, so resolve it from the in-memory composer session map
	 by the session's display name (the flows ledger belongs to it).
	 First match wins. */
	function cmpSessionId(): string | null {
		for (const [id, s] of sessions) if (s.name === sessionName) return id;
		return null;
	}

	/** Number of shots across an engine run (scene-major spec count). */
	function runShotCount(e: EngineRun): number {
		return e.novel.scenes.reduce((n, sc) => n + (sc.shots.length ?? 0), 0);
	}

	// M6 "Director's cut": pick up to two persisted runs to compare side
	// by side. Pre-engine runs (engine === null, flagged unverified in the
	// summary) can't participate — their checkbox is disabled with a note.
	// Exactly two selections auto-load both docs (on-demand, cached in
	// local $state so re-renders never re-fetch) and render a RunDiff.
	let compareSel = $state<Set<number>>(new Set());
	let cmpDocs = $state<Map<number, FlowDocument>>(new Map());
	/** True while the two selected docs are being fetched. */
	let cmpLoading = $state(false);
	/** Local error note for a failed loadFlow. */
	let cmpError = $state<string | null>(null);

	function cmpToggle(v: number) {
		const next = new Set(compareSel);
		if (next.has(v)) {
			next.delete(v);
		} else {
			if (next.size >= 2) next.delete(next.values().next().value!); // keep at most 2
			next.add(v);
		}
		compareSel = next; // reassign: the derived below tracks compareSel
	}

	/** The ordered (older-first) pair when exactly two engine runs are picked. */
	const cmpPair = $derived.by(() => {
		const picked = [...compareSel]
			.filter((v) => flows.find((f: FlowSummary) => f.flowVersion === v)?.verified)
			.sort((x, y) => x - y);
		return picked.length === 2 ? ([picked[0], picked[1]] as const) : null;
	});

	// On-demand load of the two compared docs (cached in cmpDocs so a
	// re-render or re-toggle never re-fetches a doc we already have).
	$effect(() => {
		if (!cmpPair) return;
		const [va, vb] = cmpPair;
		if (cmpDocs.has(va) && cmpDocs.has(vb)) return; // both cached
		const sid = cmpSessionId();
		if (!sid) {
			cmpError = 'session not found in composer store';
			return;
		}
		let cancelled = false;
		cmpError = null;
		cmpLoading = true;
		(async () => {
			try {
				const [da, db] = await Promise.all([
					cmpDocs.has(va) ? Promise.resolve(cmpDocs.get(va)!) : loadFlow(sid, va),
					cmpDocs.has(vb) ? Promise.resolve(cmpDocs.get(vb)!) : loadFlow(sid, vb),
				]);
				if (cancelled) return;
				const next = new Map(cmpDocs);
				next.set(va, da);
				next.set(vb, db);
				cmpDocs = next;
			} catch (e) {
				if (!cancelled) cmpError = String(e);
			} finally {
				if (!cancelled) cmpLoading = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	/** The active RunDiff (null until both docs are loaded + both engine-carrying). */
	const cmpDiff = $derived.by(() => {
		if (!cmpPair) return null;
		const [va, vb] = cmpPair;
		const da = cmpDocs.get(va);
		const db = cmpDocs.get(vb);
		if (!da?.engine || !db?.engine) return null;
		return diffEngineRuns(da.engine, db.engine, va, vb);
	});

	/** True when shot i's `field` cell differs between the two compared runs. */
	function cellChanged(shotIndex: number, field: string): boolean {
		if (!cmpDiff) return false;
		return cmpDiff.changed.some((c) => c.shotIndex === shotIndex && c.field === field);
	}

	/** The 5 aligned shot fields rendered in the split view (diff field keys). */
	const CMP_FIELDS = ['clip_s', 'transition_in', 'transition_out', 'concerns', 'beats'] as const;

	/** Aligned shot indices (0-based, up to the max shot count of the two runs). */
	const cmpShotIndices = $derived.by(() => {
		if (!cmpPair) return [] as number[];
		const [va, vb] = cmpPair;
		const ea = cmpDocs.get(va)?.engine;
		const eb = cmpDocs.get(vb)?.engine;
		const n = Math.max(ea ? runShotCount(ea) : 0, eb ? runShotCount(eb) : 0);
		return Array.from({ length: n }, (_, i) => i);
	});

	/** Display value of shot i's `field` in one run (∅ when out of range). */
	function cmpValue(run: EngineRun, shotIndex: number, field: string): string {
		const sp =
			shotIndex >= 0 && shotIndex < run.specs.length ? run.specs[shotIndex] : undefined;
		if (!sp) return '∅';
		switch (field) {
			case 'clip_s':
				return `${sp.clip_s}s`;
			case 'transition_in':
				return sp.transition_in;
			case 'transition_out':
				return sp.transition_out;
			case 'concerns':
				return concernSummary(sp.concerns);
			case 'beats':
				return sp.content?.beats?.join('|') || '∅';
			default:
				return '∅';
		}
	}

	// Q1 tag bars: group the run's score leaves by plan section tags.
	// Computed in the child's own scope where it is used.
	const bars = $derived(doc ? tagBars(doc) : []);

	// Golden-set card data: the flagged baselines, and — when a run is open —
	// the LIVE drift of the active doc against its matching baseline (the Q2
	// "did the update drift quality?" number). Drift is section-index-joined
	// (the same ordinal join tagBars uses), so it stays honest when the
	// critic version changes but the section layout does not.
	const goldenByRun = $derived.by(() => {
		const m = new Map<number, GoldenRun>();
		for (const g of golden) m.set(g.flowVersion, g);
		return m;
	});
	const activeGoldenDrift = $derived.by(() => {
		if (!doc || !goldenLoaded) return null;
		const g = goldenByRun.get(doc.flowVersion);
		if (!g) return null;
		return { golden: g, deltas: goldenDrift(g, doc) };
	});

	// Q4 sparkline: overall score across persisted runs (oldest → newest).
	const sparkPoints = $derived(sparklinePoints([...flows].reverse().map((f) => f.overall)));

	function fmtScore(n: number): string {
		return n.toFixed(2);
	}
	function scoreTone(n: number): string {
		if (n < 0.25) return 'tone-danger';
		if (n < 0.4) return 'tone-warn';
		return 'tone-neutral';
	}

	// ── Golden set (Q2 quality baseline) ───────────────────────────────────
	// The session's flagged baselines (frozen per-section scores + entry text).
	// Populated on mount + after a flag, from the backend's per-session
	// golden.json. `goldenBusy` guards the in-flight flag (prevents double
	// upserts from a fast double-click). The current drift is derived: each
	// golden is diffed against the active doc's section scores (the Q2
	// "did the update drift quality?" number), so a re-run of the same text
	// with a newer critic shows its delta against the frozen baseline.
	let golden = $state<GoldenRun[]>([]);
	let goldenLoaded = $state(false);
	let goldenBusy = $state(false);

	// Resolve the session id for the flag/list invokes (the slim parent owns
	// the flows ledger; this child gets sessionName, so find the id via the
	// in-memory composer sessions map — first name match wins).
	function sessionIdFor(): string | null {
		for (const [id, s] of sessions) if (s.name === sessionName) return id;
		return null;
	}

	// Load the golden set once per session (on mount + when sessionName flips).
	$effect(() => {
		const sid = sessionIdFor();
		golden = [];
		goldenLoaded = false;
		if (!sid) {
			goldenLoaded = true;
			return;
		}
		void listGolden(sid)
			.then((g) => {
				golden = g;
				goldenLoaded = true;
			})
			.catch(() => {
				golden = [];
				goldenLoaded = true;
			});
	});

	function isGolden(flowVersion: number): boolean {
		return golden.some((g) => g.flowVersion === flowVersion);
	}

	async function toggleGolden(flowVersion: number) {
		const sid = sessionIdFor();
		if (!sid || goldenBusy) return;
		goldenBusy = true;
		try {
			await flagGolden(sid, flowVersion);
			const g = await listGolden(sid);
			golden = g;
		} catch (e) {
			flashToast(`Flag golden failed: ${String(e)}`, 'error');
		} finally {
			goldenBusy = false;
		}
	}
</script>

{#if doc}
	<h3 class="block-heading">
		Weak spots · {sessionName} run v{doc.flowVersion} · {bars.length} tags used
	</h3>
	<ul class="tag-bars">
		{#each bars as b}
			<li>
				<button
					class="bar-row"
					onclick={() => onToggleTag(openTag === b.tag ? null : b.tag)}
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

<!-- Q2 · runs ledger (S5 verified chip + per-run annotation) -->
<section class="score-card">
	<h3 class="block-heading">Runs · S5 verified</h3>
	{#if flows.length === 0}
		<p class="hint">No runs yet.</p>
	{:else}
		<ul class="run-rows">
			{#each flows as f}
				<li class:current={f.flowVersion === doc?.flowVersion}>
					<!-- M6 compare picker: only S5-verified (engine-carrying)
					     runs may join; pre-engine rows stay disabled + noted. -->
					<label class="cmp-pick" title={f.verified ? 'Pick for compare' : 'no engine data'}>
						<input
							type="checkbox"
							checked={compareSel.has(f.flowVersion)}
							disabled={!f.verified}
							onchange={() => cmpToggle(f.flowVersion)}
							aria-label="Compare v{f.flowVersion}"
						/>
						{#if !f.verified}
							<em class="cmp-no-engine">no engine data</em>
						{/if}
					</label>
					<code class="run-v">v{f.flowVersion}</code>
					<span class="run-overall {scoreTone(f.overall)}">{fmtScore(f.overall)}</span>
					<span class:run-chip={f.verified ? 'chip-ok' : 'chip-mut'}>
						{f.verified ? 'verified' : 'unverified'}
					</span>
					<span class="run-src">{f.sectionCount}s · {f.entryText.slice(0, 24)}…</span>
					<span class="run-anno">
						<button
							class="mini gold-star"
							class:gold-on={isGolden(f.flowVersion)}
							disabled={!f.verified || goldenBusy}
							title={isGolden(f.flowVersion) ? 'Flagged as quality baseline' : 'Flag this run as a quality baseline'}
							onclick={() => void toggleGolden(f.flowVersion)}>
							★
						</button>
						<button class="mini" onclick={() => void onLogSignal('accept', 'run-' + f.flowVersion, 'annotated accept')}>
							✓
						</button>
						<button class="mini" onclick={() => void onLogSignal('reject', 'run-' + f.flowVersion, 'annotated reject')}>
							✗
						</button>
					</span>
				</li>
			{/each}
		</ul>

		<!-- M6 "Director's cut": auto-compare of the two picked runs.
		     Split view = one row per (shot, field), two columns (v{a} | v{b});
		     a changed cell gets the .cmp-changed left-border accent. -->
		{#if cmpPair}
			{@const [va, vb] = cmpPair}
			<div class="cmp-block">
				<p class="cmp-head">
					<code>Compare v{va} → v{vb}</code>
					<button class="mini" onclick={() => (compareSel = new Set())}>clear</button>
				</p>
				{#if cmpLoading}
					<p class="hint">Loading runs v{va} + v{vb}…</p>
				{:else if cmpError}
					<p class="hint">Compare failed: {cmpError}</p>
				{:else if cmpDiff}
					{@const ea = cmpDocs.get(va)?.engine}
					{@const eb = cmpDocs.get(vb)?.engine}
					<p class="cmp-summary">{cmpDiff.summary}</p>
					{#if cmpShotIndices.length}
						<table class="cmp-table">
							<thead>
								<tr>
									<th class="cmp-shot-col">shot</th>
									<th>v{va}</th>
									<th>v{vb}</th>
								</tr>
							</thead>
							<tbody>
								{#each cmpShotIndices as i (i)}
									{#each CMP_FIELDS as fld (fld)}
										<tr>
											<th class="cmp-shot-col">
												{fld === 'clip_s' ? 'shot_' + String(i + 1).padStart(2, '0') : ''}
											</th>
											<td class="cmp-cell" class:cmp-changed={cellChanged(i, fld)}
												>{ea ? cmpValue(ea, i, fld) : '∅'}</td>
											<td class="cmp-cell" class:cmp-changed={cellChanged(i, fld)}
												>{eb ? cmpValue(eb, i, fld) : '∅'}</td>
										</tr>
									{/each}
								{/each}
							</tbody>
						</table>
					{:else}
						<p class="hint">No shots to align.</p>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}
</section>

<section class="score-card">
	<h3 class="block-heading">Golden set <span class="muted">· quality baselines</span></h3>
	{#if !goldenLoaded}
		<p class="hint">Loading baselines…</p>
	{:else if golden.length === 0}
		<p class="hint">
			{#if flows.length === 0}
				No runs yet.
			{:else}
				No runs flagged as golden yet — tap the ★ on a run to freeze it as a
				quality baseline.
			{/if}
		</p>
	{:else}
		<ul class="golden-list">
			{#each golden as g (g.flowVersion)}
				<li class="golden-row">
					<code class="golden-v">v{g.flowVersion}</code>
					<span class="golden-base">base {fmtScore(g.baselineOverall)}</span>
					<span class="golden-src" title={g.entryText}>
						{g.entryText.slice(0, 22)}{g.entryText.length > 22 ? '…' : ''}
					</span>
					<span class="golden-critic">critic v{g.criticModelVersion}</span>
					{#if activeGoldenDrift && activeGoldenDrift.golden.flowVersion === g.flowVersion}
						{@const d = activeGoldenDrift.deltas}
						<span class="golden-drift">
							{#if d.length}
								now {fmtScore(overall(doc!))} ·
								{d.filter((x) => x.delta !== null && Math.abs(x.delta) > 0.001).length} section(s) moved
							{:else}
								no layout change
							{/if}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="score-card">
	<h3 class="block-heading">Critic A/B</h3>
	<p class="hint">
		Flag ≥2 golden runs across two critic head versions to compare.
		{#if doc}
			Currently v{doc.regen.version.criticModelVersion}
			{doc.criticModel?.untrained ? ' (stub — real critic lands in Phase 2)' : ''}.
		{/if}
		{#if golden.length}
			{golden.length} golden baseline(s) on file — a trained critic will diff
			them here.
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

<style>
	/* Design tokens only (Template A): no new colors, hairlines, quiet.
	   Motion uses --transition-sin (additive token, design doc §6). */

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
		margin: 0;
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

	/* ── Runs ledger ── */
	.run-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.run-rows li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border: 1px solid var(--border-color);
		font-size: 12px;
	}
	.run-rows li.current {
		border-color: var(--accent-color);
	}
	.run-v {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-primary);
	}
	.run-overall {
		font-family: var(--font-mono);
	}
	.run-overall.tone-warn {
		color: var(--warning-color);
	}
	.run-overall.tone-danger {
		color: var(--danger-color);
	}
	.run-chip {
		font-family: var(--font-mono);
		font-size: 9px;
		padding: 1px 6px;
		border: 1px solid var(--border-color);
	}
	.chip-ok {
		color: var(--success-color, var(--text-secondary));
	}
	.chip-mut {
		color: var(--text-muted);
	}
	.run-src {
		flex: 1;
		font-size: 11px;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.run-anno {
		display: inline-flex;
		gap: 4px;
	}

	.mini {
		font: inherit;
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-secondary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		padding: 2px 8px;
		cursor: pointer;
		transition: border-color var(--transition-sin, 0.3s);
	}
	.mini:hover {
		border-color: var(--accent-color);
		color: var(--text-primary);
	}

	/* Golden ★ flag (Q2 quality baseline): a quiet star toggle on the run row.
	   On = accent-filled star (flagged); off = muted outline. Design: no new
	   color family, just the accent + the muted/primary states already in use. */
	.mini.gold-star {
		color: var(--text-muted);
	}
	.mini.gold-star:hover:not(:disabled) {
		border-color: var(--warning-color, var(--accent-color));
		color: var(--text-primary);
	}
	.mini.gold-star.gold-on {
		color: var(--warning-color, var(--accent-color));
		border-color: color-mix(in srgb, var(--warning-color, var(--accent-color)) 50%, var(--border-color));
		background: color-mix(in srgb, var(--warning-color, var(--accent-color)) 10%, var(--bg-tertiary));
	}

	/* Golden-set card rows: a frozen baseline with its live drift readout. */
	.golden-list {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.golden-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 4px 8px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 11px;
	}
	.golden-v {
		font-family: var(--font-mono);
		color: var(--text-primary);
	}
	.golden-base {
		font-family: var(--font-mono);
		color: var(--text-secondary);
	}
	.golden-src {
		flex: 1;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.golden-critic {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}
	.golden-drift {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--accent-color);
	}
	.block-heading .muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	/* ── M6 side-by-side compare (additive block under the runs ledger) ── */
	.cmp-pick {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.cmp-pick input {
		margin: 0;
		accent-color: var(--accent-color);
	}
	.cmp-pick input:disabled {
		opacity: 0.45;
	}
	.cmp-no-engine {
		font-style: normal;
		font-size: 9px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.cmp-block {
		margin-top: 8px;
		border: 1px solid var(--border-color);
		border-left: 2px solid var(--accent-color);
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cmp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-secondary);
	}
	.cmp-head code {
		font-family: var(--font-mono);
	}
	.cmp-summary {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-primary);
	}
	.cmp-table {
		border-collapse: collapse;
		width: 100%;
	}
	.cmp-table th,
	.cmp-table td {
		border: 1px solid var(--border-color);
		padding: 3px 6px;
		font-weight: normal;
		text-align: left;
	}
	.cmp-table thead th {
		font-size: 10px;
		color: var(--text-muted);
	}
	.cmp-shot-col {
		width: 64px;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-secondary);
	}
	.cmp-cell {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-secondary);
	}
	/* Changed cell: a subtle 2px accent left border (readable in the dense
	   mono table where a full 1px ring would read as noise). */
	.cmp-cell.cmp-changed {
		border-left: 2px solid var(--accent-color);
		color: var(--text-primary);
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

	/* ── Keyboard focus: one quiet accent ring across every interactive
	   affordance (buttons already have it via :focus-visible; cover the
	   bars and mini toggles here). ── */
	.mini:focus-visible,
	.bar-row:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
		border-radius: 4px;
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
