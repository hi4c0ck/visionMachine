<script lang="ts">
	// Director's-harness tab bodies. Design: docs/director-harness-ui-system.md
	// (tabbed composer). The Director tab now saturates the full S0→S5 engine
	// flow (FilmSeed → VisualNovel → SceneSpec → ShotSpec → derive → VERIFY)
	// with the G0–G4 gate strip; Extract + Scoreboard read from the same doc.
	// Destructive regenerate-pipes stays a sharp edge (I9): rendered disabled.
	import { flashToast } from '$lib/flashToast';
	import { runFlow, listFlows, loadFlow, type DirectorTab } from '$lib/directorStore';
	import {
		tagBars,
		type FlowDocument,
		type FlowSummary,
	} from '$lib/directorStore/types';
	import { sparklinePoints } from '$lib/directorStore/types';
	import {
		GENRE_PRESETS,
		RATIOS,
		VOCAB,
		concernSummary,
		foldSlices,
		specsByScene,
		timelineRows,
		FRAME_RATE,
		type EngineEntryInput,
		type EngineRun,
		type GateState,
	} from '$lib/directorStore/engine';
	import TextBlock from './TextBlock.svelte';

	let {
		activeTab,
		sessionId,
		sessionName,
		pipeCount,
		onLogSignal,
		onRunningChange,
		onMetaChange,
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
		/** Strip-badge sink (design §1 "badge ownership"): the non-Pipes tab's
		 own badge shows in place of pipe-count. `extractSections` = fresh
		 structural-text sections; `stale` = a newer flow doc exists than the
		 one being scored. */
		onMetaChange?: (meta: { extractSections: number; stale: boolean }) => void;
	}>();

	// ── G0 entry state (the S0 input the UI authors) ──────────────────────
	// The idea is the single source of truth; the rest are G0 look/params.
	// On load/run, backfilled from the engine seed so controls reflect the run.
	let entry = $state<EngineEntryInput>({
		title: '',
		idea: '',
		input_text: '',
		genre: { name: 'Cinematic', style: 'cinematic natural light' },
		ratio: '16:9',
		scale: { scenes: 1, shots_per_scene: 2, clip_s: [8, 10] },
		time_of_day: 'midday',
		weather: 'clear',
	});

	let doc = $state<FlowDocument | null>(null);
	let flows = $state<FlowSummary[]>([]);
	let running = $state(false);
	let runError = $state<string | null>(null);
	let activeRun = $state<number | null>(null);
	let openTag = $state<string | null>(null);
	let openShot = $state<string | null>(null);

	// The saturated S0→S5 flow state (null for docs produced pre-engine).
	const engine = $derived<EngineRun | null>(doc?.engine ?? null);

	const sections = $derived(doc?.structured.pipes[0]?.sections ?? []);

	// Design §1 "badge ownership": push this tab's own strip badge state up
	// so the .preview-meta row shows it in place of pipe-count. Extract is
	// "n sections" once fresh structural text exists; Scoreboard is "stale"
	// when a newer persisted run outdates the doc currently being scored.
	$effect(() => {
		void onMetaChange;
		if (!onMetaChange) return;
		const newest = flows.length ? Math.max(...flows.map((f) => f.flowVersion)) : 0;
		const stale = !!doc && newest > doc.flowVersion;
		onMetaChange({
			extractSections: sections.length,
			stale,
		});
	});

	$effect(() => {
		if (activeTab === 'scoreboard') void refreshFlows();
	});

	let lastSession = $state(sessionId);
	// Per-session isolation: when the session prop changes, reset in-tab state
	// so a switched session never carries the previous session's run.
	$effect(() => {
		if (sessionId !== lastSession) {
			lastSession = sessionId;
			doc = null;
			flows = [];
			activeRun = null;
			runError = null;
			openTag = null;
			openShot = null;
		}
	});

	// Seed the active document from the newest persisted run so Extract /
	// Scoreboard reflect saved data, not just the in-tab run. When the loaded
	// doc carries an engine, backfill the G0 entry controls from its seed.
	$effect(() => {
		if (doc) return;
		void (async () => {
			try {
				const listed = await listFlows(sessionId);
				if (listed.length > 0) {
					flows = listed;
					const newest = listed[0];
					const d = await loadFlow(sessionId, newest.flowVersion);
					doc = d;
					activeRun = newest.flowVersion;
					backfillEntryFromEngine(d);
				}
			} catch (e) {
				console.warn('director load_latest', e);
			}
		})();
	});

	function backfillEntryFromEngine(d: FlowDocument) {
		const e = d.engine;
		if (!e) return;
		const s = e.seed;
		const film = e.novel.film;
		entry = {
			title: s.title,
			idea: s.idea,
			input_text: s.input_text ?? '',
			genre: { ...s.genre },
			ratio: s.ratio,
			scale: {
				scenes: s.scale.scenes,
				shots_per_scene: s.scale.shots_per_scene,
				clip_s: [...s.scale.clip_s] as [number, number],
			},
			time_of_day: film.time_of_day,
			weather: film.weather,
		};
	}

	async function refreshFlows() {
		try {
			flows = await listFlows(sessionId);
		} catch (e) {
			console.warn('director list_flows', e);
			flows = [];
		}
	}

	// The S0 entry submitted to a run: the idea + G0 look/params.
	function buildEntry(): EngineEntryInput {
		return {
			...entry,
			input_text: entry.input_text?.trim() || entry.idea,
		};
	}

	async function handleRun() {
		running = true;
		onRunningChange?.(true);
		runError = null;
		try {
			const result = await runFlow(sessionId, entry.idea || entry.input_text?.trim() || '', buildEntry());
			doc = result;
			activeRun = result.flowVersion;
			backfillEntryFromEngine(result);
			await refreshFlows();
		} catch (e) {
			runError = String(e);
			flashToast(runError);
		} finally {
			running = false;
			onRunningChange?.(false);
		}
	}

	// ── Small format helpers ───────────────────────────────────────────────
	function fmtScore(n: number): string {
		return n.toFixed(2);
	}
	function scoreTone(n: number): string {
		if (n < 0.25) return 'tone-danger';
		if (n < 0.4) return 'tone-warn';
		return 'tone-neutral';
	}
	function gateGlyph(g: GateState): string {
		switch (g.status) {
			case 'confirmed':
				return '●';
			case 'pending':
				return '◐';
			default:
				return '◇';
		}
	}
	function gateTone(g: GateState): string {
		if (g.status === 'confirmed') return 'tone-ok';
		if (g.status === 'pending') return 'tone-warn';
		return 'tone-muted';
	}

	function copyExtract() {
		if (!doc) return;
		const lines = (doc.structured.pipes[0]?.sections ?? []).map((s) => {
			const src = s.from.length ? s.from.join(' · ') : '—';
			return `--- ${s.tag} ${s.frameStart}–${s.frameEnd} ---\n${s.prompt}\nsource: ${src}`;
		});
		void navigator.clipboard
			.writeText(lines.join('\n\n'))
			.then(() => flashToast('Structural text copied', 'success'))
			.catch(() => flashToast('Copy failed'));
	}

	// The S4-derived engine sheet: shot sheets + derived image/video prompts +
	// verified timeline — the "final structural text" of the engine flow.
	function copyEngineSheet() {
		const e = engine;
		if (!e) return;
		const out: string[] = [];
		for (const grp of specsByScene(e)) {
			out.push(`## ${grp.scene.scene_id} (${grp.scene.time_of_day} · ${grp.scene.weather})`);
			grp.specs.forEach((sp, i) => {
				const mol = grp.molecules[i];
				out.push(`${sp.shot_id} ${sp.clip_s}s · ${sp.transition_in}→${sp.transition_out}`);
				out.push(`  concerns: ${concernSummary(sp.concerns)}`);
				for (const sl of sp.sub_timeline) {
					out.push(`    ${sl.from_s}–${sl.to_s}s  ${sl.note}`);
				}
				if (mol) {
					out.push(`  image: ${mol.prompts.image}`);
					out.push(`  video: ${mol.prompts.video}`);
				}
			});
		}
		const rows = timelineRows(e);
		out.push(`timeline: ${rows.map((r) => `[${r.from_s}s–${r.to_s}s] ${r.shot_id} ${r.frames}f`).join(' · ')}`);
		out.push(
			`verify: ${e.verify.verified ? 'ALL PASS' : e.verify.issues.length + ' issue(s)'}`,
		);
		void navigator.clipboard
			.writeText(out.join('\n'))
			.then(() => flashToast('Engine sheet copied', 'success'))
			.catch(() => flashToast('Copy failed'));
	}

	// Q4 sparkline: overall score across persisted runs (oldest → newest).
	const sparkPoints = $derived(sparklinePoints([...flows].reverse().map((f) => f.overall)));
</script>

<div class="director-root" data-tab={activeTab}>
	{#if activeTab === 'director'}
		<!-- ── Gate strip (G0–G4) — the flow's confirmation spine ── -->
		{#if engine}
			<div class="gate-strip" role="list" aria-label="Pipeline gates">
				{#each engine.gates as g (g.gate)}
					<span class="gate {gateTone(g)}" role="listitem" title={g.confirm}>
						<code class="gate-id">{g.gate}</code>
						<span class="gate-glyph" aria-hidden="true">{gateGlyph(g)}</span>
						<span class="gate-note">
							{#if g.backtrack.length}bt:{g.backtrack.join('|')}{/if}
						</span>
					</span>
				{/each}
			</div>
		{:else}
			<div class="phase0-notice">
				<span class="muted">This run predates the engine. Re-run to see the S0→S5 flow.</span>
			</div>
		{/if}

		{#if engine}
			<!-- ── ① G0 · Entry parameters ── -->
			<section class="stage">
				<h3 class="block-heading">① G0 · Entry parameters <span class="muted">· S0 seed</span></h3>
				<TextBlock
					label="Idea"
					bind:value={entry.idea}
					generating={running}
					locked={running}
					onRun={handleRun}
				/>
				<div class="g0-grid">
					<label class="field">
						<span class="field-label">genre</span>
						<select bind:value={entry.genre.name}>
							{#each GENRE_PRESETS as g}
								<option value={g.name}>{g.name}</option>
							{/each}
						</select>
					</label>
					<label class="field grow">
						<span class="field-label">style</span>
						<input
							bind:value={entry.genre.style}
							placeholder="visual style string"
						/>
					</label>
					<label class="field">
						<span class="field-label">ratio</span>
						<select bind:value={entry.ratio}>
							{#each RATIOS as r}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</label>
					<label class="field">
						<span class="field-label">scenes</span>
						<input
							type="number"
							min="1"
							max="24"
							bind:value={entry.scale.scenes}
						/>
					</label>
					<label class="field">
						<span class="field-label">shots/scene</span>
						<input
							type="number"
							min="1"
							max="5"
							bind:value={entry.scale.shots_per_scene}
						/>
					</label>
					<label class="field">
						<span class="field-label">clip_s</span>
						<span class="clip-range">
							<input
								type="number"
								min="4"
								max="12"
								bind:value={entry.scale.clip_s[0]}
							/>–
							<input
								type="number"
								min="4"
								max="12"
								bind:value={entry.scale.clip_s[1]}
							/>
						</span>
					</label>
					<label class="field">
						<span class="field-label">time of day</span>
						<select bind:value={entry.time_of_day}>
							{#each VOCAB.time_of_day as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</label>
					<label class="field grow">
						<span class="field-label">weather</span>
						<input bind:value={entry.weather} placeholder="clear, brief clouds, …" />
					</label>
				</div>
			</section>

			<!-- ── ② S1 · Visual Novel (G1 review point) ── -->
			<section class="stage">
				<div class="stage-head">
					<h3 class="block-heading">② S1 · Visual Novel <span class="muted">· auto-locked · G1</span></h3>
					<div class="stage-actions">
						<button class="mini" onclick={() => void onLogSignal('accept', 'G1', 'novel confirmed')}>
							confirm
						</button>
						<button class="mini" onclick={() => void onLogSignal('reject', 'G1', 'backtrack node_a')}>
							rewrite
						</button>
					</div>
				</div>
				<div class="novel-film" title={engine.novel.film.logline}>
					<code class="nf-title">{engine.novel.film.title}</code>
					<span class="nf-meta">
						{engine.novel.film.time_of_day} · {engine.novel.film.weather} ·
						{engine.novel.film.palette}
					</span>
					<p class="nf-logline">{engine.novel.film.logline}</p>
				</div>
				{#each engine.novel.scenes as sc, si}
					<details class="novel-scene" open={si === 0}>
						<summary>
							<span class="nc-title">{sc.title}</span>
							<span class="nc-meta">{sc.shots.length} shots</span>
						</summary>
						<p class="nc-prose">{sc.prose}</p>
						<ul class="nc-shots">
							{#each sc.shots as sh, ki}
								<li>
									<code class="nc-shotno">scene_{si + 1}.shot_{ki + 1}</code>
									<span class="nc-shotprose">{sh.prose}</span>
									<span class="nc-beats">{sh.beats.length} beats</span>
								</li>
							{/each}
						</ul>
					</details>
				{/each}
			</section>

			<!-- ── ③ S2 · Scene base look ── -->
			<section class="stage">
				<h3 class="block-heading">③ S2 · Scene base look <span class="muted">· {engine.scenes.length} spec(s)</span></h3>
				<ul class="scene-rows">
					{#each engine.scenes as sc}
						<li>
							<code class="sr-id">{sc.scene_id}</code>
							<span class="sr-meta">
								{sc.time_of_day} · {sc.weather} · {sc.light.key}/{sc.light.contrast}
								{sc.light.color_temp_K}K · {sc.grade.film_stock} · {sc.tempo}
							</span>
							{#if sc.effects_base.length}<span class="sr-fx">fx:{sc.effects_base.join(',')}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>

			<!-- ── ④ S3 · Shot sheets (G2 review point) ── -->
			<section class="stage">
				<div class="stage-head">
					<h3 class="block-heading">④ S3 · Shot sheets <span class="muted">· {engine.specs.length} · G2</span></h3>
					<div class="stage-actions">
						<button class="mini" onclick={() => void onLogSignal('accept', 'G2', 'specs confirmed')}>
							confirm
						</button>
						<button class="mini" onclick={() => void onLogSignal('reject', 'G2', 'backtrack spec|node_a')}>
							rewrite
						</button>
					</div>
				</div>
				{#each specsByScene(engine) as grp}
					<div class="shot-scene">
						<code class="ss-scene">{grp.scene.scene_id} · {grp.scene.time_of_day}</code>
						{#each grp.specs as sp}
							{@const slices = foldSlices(sp)}
							<article class="shot-sheet" class:open={openShot === sp.shot_id}>
								<header class="ss-head" role="button" tabindex="0"
									onclick={() => (openShot = openShot === sp.shot_id ? null : sp.shot_id)}
									onkeydown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openShot = openShot === sp.shot_id ? null : sp.shot_id; } }}>
									<code class="ss-id">{sp.shot_id}</code>
									<span class="ss-meta">
										{sp.clip_s}s · {sp.transition_in}→{sp.transition_out} · {concernSummary(sp.concerns)}
									</span>
									<span class="ss-tick">{openShot === sp.shot_id ? '▾' : '▸'}</span>
								</header>
								{#if openShot === sp.shot_id}
									<div class="ss-body">
										<p class="ss-prose">{sp.content.prose}</p>
										{#if sp.content.beats.length}
											<ul class="ss-beats">
												{#each sp.content.beats as b}
													<li>{b}</li>
												{/each}
											</ul>
										{/if}
										{#if slices.length}
											<div class="ss-slices">
												{#each slices as sl}
													<div class="slice">
														<code class="slice-range">{sl.from_s}–{sl.to_s}s</code>
														<span class="slice-note">{sl.note}</span>
														<ul class="slice-deltas">
															{#each sl.deltas as d}
																<li><code>{d}</code></li>
															{/each}
														</ul>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				{/each}
			</section>

			<!-- ── ⑤ S4 · Derived prompts (deterministic) ── -->
			<section class="stage">
				<h3 class="block-heading">⑤ S4 · Derived prompts <span class="muted">· identity-locked · {FRAME_RATE}fps</span></h3>
				{#each engine.molecules as m}
					<details class="prompt-block">
						<summary>
							<code class="pb-id">{m.inherit}</code>
							<span class="pb-meta">{m.clip_s}s · {m.transition_in}→{m.transition_out}</span>
						</summary>
						<div class="pb-rows">
							<div class="pb-row">
								<code class="pb-kind">image</code>
								<p>{m.prompts.image}</p>
							</div>
							<div class="pb-row">
								<code class="pb-kind">video</code>
								<p>{m.prompts.video}</p>
							</div>
						</div>
					</details>
				{/each}
			</section>

			<!-- ── ⑥ Verified timeline ── -->
			<section class="stage">
				<h3 class="block-heading">⑥ Timeline <span class="muted">· verified · {engine.verify.total_frames}f</span></h3>
				<div class="tl-strip">
					{#each timelineRows(engine) as r}
						<span class="tl-cell">
							<code>[{r.from_s}s–{r.to_s}s]</code>
							<span class="tl-frames">{r.frames}f · {r.transition_out}</span>
						</span>
					{/each}
				</div>
			</section>

			<!-- ── ⑦ S5 · Verify ── -->
			<section class="stage">
				<h3 class="block-heading">⑦ S5 · Verify</h3>
				{#if engine.verify.verified}
					<p class="verify ok">
						✓ ALL PASS — schema · tag-closure · counts · frame floor · invariants
					</p>
				{:else}
					<ul class="verify issues">
						{#each engine.verify.issues as iss}
							<li><code>{iss}</code></li>
						{/each}
					</ul>
				{/if}
			</section>

			<!-- ── Run + destructive apply ── -->
			<section class="stage actions">
				<button class="btn primary" disabled={running} onclick={handleRun}>
					{running ? 'Running…' : 'Run S0→S5'}
				</button>
				<button class="btn" onclick={() => void onLogSignal('accept', 'root', 'run ' + activeRun)}>
					Accept
				</button>
				<button class="btn" onclick={() => void onLogSignal('reject', 'root', runError ?? 'run rejected')}>
					Reject
				</button>
				<!-- Destructive apply is a sharp edge (I9 materialize adapter,
				     later phase): rendered disabled with the fixed "no fallback"
				     copy from design §4, not wired to a command. -->
				<button class="btn danger" disabled>
					Regenerate pipes
					<span class="btn-note">not wired yet · no fallback · replay v{doc?.regen.version.flowVersion}</span>
				</button>
			</section>
		{/if}

		{#if runError}
			<p class="flow-error" role="alert">{runError}</p>
		{/if}
	{/if}

	{#if activeTab === 'extract'}
		{#if doc}
			<div class="extract-head">
				<span class="muted">
					{sessionName} · v{doc.flowVersion} · {sections.length} sections
					{#if engine}· engine sheet{/if} · {pipeCount} pipes in composer
				</span>
				<div class="extract-head-btns">
					<button class="btn" onclick={copyExtract}>Copy sections</button>
					{#if engine}
						<button class="btn" onclick={copyEngineSheet}>Copy engine sheet</button>
					{/if}
				</div>
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
				{#if engine}
					The engine sheet adds the S4 identity-locked prompts + verified timeline.
				{/if}
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

		<!-- Q2 · runs ledger (S5 verified chip + per-run annotation) -->
		<section class="score-card">
			<h3 class="block-heading">Runs · S5 verified</h3>
			{#if flows.length === 0}
				<p class="hint">No runs yet.</p>
			{:else}
				<ul class="run-rows">
					{#each flows as f}
						<li class:current={f.flowVersion === doc?.flowVersion}>
							<code class="run-v">v{f.flowVersion}</code>
							<span class="run-overall {scoreTone(f.overall)}">{fmtScore(f.overall)}</span>
							<span class:run-chip={f.verified ? 'chip-ok' : 'chip-mut'}>
								{f.verified ? 'verified' : 'unverified'}
							</span>
							<span class="run-src">{f.sectionCount}s · {f.entryText.slice(0, 24)}…</span>
							<span class="run-anno">
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
			{/if}
		</section>

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
		gap: 18px;
		padding: 12px 14px 40px;
		min-height: 100%;
	}

	.phase0-notice {
		padding: 8px 10px;
		border: 1px dashed var(--border-color);
		font-size: 12px;
	}

	.block-heading {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		margin: 4px 0 2px;
	}
	.block-heading .muted {
		color: var(--text-muted);
		font-weight: 400;
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
	.stage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.stage-head .block-heading {
		margin: 0;
	}

	/* ── Gate strip ── */
	.gate-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 0 2px;
	}
	.gate {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		border: 1px solid var(--border-color);
		background: var(--bg-tertiary);
	}
	.gate-id {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-secondary);
	}
	.gate-glyph {
		font-size: 10px;
	}
	.gate-note {
		font-family: var(--font-mono);
		font-size: 9px;
		color: var(--text-muted);
	}
	.gate.tone-ok .gate-glyph {
		color: var(--success-color, var(--text-secondary));
	}
	.gate.tone-warn .gate-glyph {
		color: var(--warning-color);
	}
	.gate.tone-muted .gate-glyph {
		color: var(--text-muted);
	}

	/* ── G0 entry grid ── */
	.g0-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px 10px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.field.grow {
		grid-column: span 2;
	}
	.field-label {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}
	.field select,
	.field input {
		font: inherit;
		font-size: 12px;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		padding: 4px 6px;
		width: 100%;
		box-sizing: border-box;
	}
	.field input[type='number'] {
		width: 62px;
	}
	.clip-range {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.clip-range span {
		color: var(--text-muted);
	}

	/* ── S1 novel ── */
	.novel-film {
		padding: 8px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.nf-title {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-primary);
	}
	.nf-meta {
		font-size: 11px;
		color: var(--text-muted);
	}
	.nf-logline {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 2px 0 0;
	}
	.novel-scene {
		border: 1px solid var(--border-color);
	}
	.novel-scene summary {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 5px 9px;
		cursor: pointer;
		font-size: 12px;
		color: var(--text-primary);
		list-style: none;
	}
	.novel-scene summary::-webkit-details-marker {
		display: none;
	}
	.nc-meta {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}
	.nc-prose {
		font-size: 12px;
		color: var(--text-secondary);
		padding: 0 9px 6px;
		margin: 0;
	}
	.nc-shots {
		list-style: none;
		margin: 0 0 8px;
		padding: 0 9px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.nc-shots li {
		display: flex;
		gap: 8px;
		align-items: baseline;
		font-size: 11px;
	}
	.nc-shotno {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
		flex-shrink: 0;
	}
	.nc-shotprose {
		color: var(--text-secondary);
		flex: 1;
	}
	.nc-beats {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}

	/* ── S2 scene rows ── */
	.scene-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.scene-rows li {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 12px;
		padding: 4px 8px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
	}
	.sr-id {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-primary);
	}
	.sr-meta {
		color: var(--text-secondary);
		font-size: 11px;
		flex: 1;
	}
	.sr-fx {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--warning-color);
	}

	/* ── S3 shot sheets ── */
	.shot-scene {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ss-scene {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
		padding: 2px 0;
	}
	.shot-sheet {
		border: 1px solid var(--border-color);
	}
	.ss-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 9px;
		cursor: pointer;
	}
	.ss-head:hover {
		background: var(--bg-hover);
	}
	.ss-id {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-primary);
	}
	.ss-meta {
		font-size: 11px;
		color: var(--text-secondary);
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ss-tick {
		font-family: var(--font-mono);
		color: var(--text-muted);
	}
	.ss-body {
		padding: 0 9px 9px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ss-prose {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0;
	}
	.ss-beats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ss-beats li {
		font-size: 11px;
		color: var(--text-muted);
		padding-left: 10px;
		position: relative;
	}
	.ss-beats li::before {
		content: '·';
		position: absolute;
		left: 2px;
		color: var(--text-muted);
	}
	.ss-slices {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 4px;
	}
	.slice {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 5px 8px;
		background: var(--bg-tertiary);
		border-left: 2px solid var(--border-color);
	}
	.slice-range {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--accent-color);
	}
	.slice-note {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.slice-deltas {
		list-style: none;
		margin: 2px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.slice-deltas li code {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}

	/* ── S4 prompts ── */
	.prompt-block {
		border: 1px solid var(--border-color);
	}
	.prompt-block summary {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 5px 9px;
		cursor: pointer;
		font-size: 12px;
		color: var(--text-primary);
		list-style: none;
	}
	.prompt-block summary::-webkit-details-marker {
		display: none;
	}
	.pb-id {
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.pb-meta {
		font-size: 11px;
		color: var(--text-muted);
	}
	.pb-rows {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 9px 9px;
	}
	.pb-row {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.pb-kind {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--accent-color);
		min-width: 44px;
	}
	.pb-row p {
		font-size: 11px;
		color: var(--text-secondary);
		margin: 0;
		flex: 1;
		white-space: pre-wrap;
	}

	/* ── Timeline strip ── */
	.tl-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tl-cell {
		display: inline-flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px 8px;
		border: 1px solid var(--border-color);
		background: var(--bg-tertiary);
	}
	.tl-cell code {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-primary);
	}
	.tl-frames {
		font-family: var(--font-mono);
		font-size: 9px;
		color: var(--text-muted);
	}

	/* ── S5 verify ── */
	.verify {
		font-family: var(--font-mono);
		font-size: 11px;
		padding: 6px 8px;
	}
	.verify.ok {
		color: var(--success-color, var(--text-secondary));
		border-left: 2px solid var(--success-color, var(--accent-color));
	}
	.verify.issues {
		list-style: none;
		margin: 0;
		padding: 6px 8px;
		border-left: 2px solid var(--danger-color);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.verify.issues li code {
		font-size: 10px;
		color: var(--danger-color);
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
	.stage-actions {
		display: flex;
		gap: 6px;
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

	/* ── Extract: plain structural text (design §4) ── */
	.extract-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.extract-head-btns {
		display: flex;
		gap: 6px;
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
