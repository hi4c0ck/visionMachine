<script lang="ts">
	// Advanced disclosure of the Director hot path: gate strip + G0 grid +
	// S1 Visual Novel + S2 scene rows + S3 shot sheets + S4 prompt blocks +
	// timeline strip + S5 verify. Presentational child of DirectorPanel —
	// state (entry, openShot, confirmed gates, engine) is parent-owned;
	// entry writes back through this $bindable prop, shot-sheet toggles go
	// through onToggleShot (openShot stays canonical in the parent).
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
	import MoodSlider from './MoodSlider.svelte';

	let {
		engine,
		gatesShown,
		entry = $bindable(),
		openShot,
		onToggleShot,
	} = $props<{
		/** The saturated S0→S5 flow state (null for pre-engine docs). */
		engine: EngineRun | null;
		/** Parent-derived gate list (engine gates + in-tab confirmations). */
		gatesShown: GateState[];
		/** G0 entry (parent-owned; the grid's 8 fields write back here). */
		entry: EngineEntryInput;
		/** Currently-open shot-sheet id (parent-owned, S3). */
		openShot: string | null;
		/** Toggle a shot sheet open/closed (parent updates openShot). */
		onToggleShot: (id: string | null) => void;
	}>();

	// Single-child-only gate helpers (moved here with their usage; the
	// parent keeps no copy).
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
</script>

{#if engine}
	<!-- ── Advanced disclosure: gate strip + G0 grid + S2/S3/S4/timeline/S5 ── -->
	<details class="advanced">
		<summary class="advanced-summary">Advanced view <span class="muted">· gates · S2–S5 · timeline · verify</span></summary>

		<!-- Gate strip (G0–G4) — the flow's confirmation spine. -->
		<div class="gate-strip" role="list" aria-label="Pipeline gates">
			{#each gatesShown as g (g.gate)}
				<span class="gate {gateTone(g)}" role="listitem" title={g.confirm}>
					<code class="gate-id">{g.gate}</code>
					<span class="gate-glyph" aria-hidden="true">{gateGlyph(g)}</span>
					<span class="gate-note">
						{#if g.backtrack.length}bt:{g.backtrack.join('|')}{/if}
					</span>
				</span>
			{/each}
		</div>

		<!-- G0 grid — all 8 fields, demoted from the hot path. -->
		<section class="stage">
			<h3 class="block-heading">G0 · Entry parameters <span class="muted">· S0 seed</span></h3>
			<div class="g0-grid">
				<!-- M4 mood slider: one 0..100 control that reshapes clips,
				     transitions, motion, effects + contrast in a single move.
				     Binds entry.mood two-way (entry is $bindable in this child). -->
				<MoodSlider bind:mood={entry.mood} />
				<p class="hint mood-hint">mood reshapes clips, transitions, motion, effects + contrast in one move.</p>
				<label class="field grow">
					<span class="field-label">title</span>
					<input bind:value={entry.title} placeholder="optional film title (defaults from the idea)" />
				</label>
				<label class="field">
					<span class="field-label">genre</span>
					<select bind:value={entry.genre.name}>
						{#each GENRE_PRESETS as g}<option value={g.name}>{g.name}</option>{/each}
					</select>
				</label>
				<label class="field grow">
					<span class="field-label">style</span>
					<input bind:value={entry.genre.style} placeholder="visual style string" />
				</label>
				<label class="field">
					<span class="field-label">ratio</span>
					<select bind:value={entry.ratio}>
						{#each RATIOS as r}<option value={r}>{r}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span class="field-label">scenes</span>
					<input type="number" min="1" max="24" bind:value={entry.scale.scenes} />
				</label>
				<label class="field">
					<span class="field-label">shots/scene</span>
					<input type="number" min="1" max="5" bind:value={entry.scale.shots_per_scene} />
				</label>
				<label class="field">
					<span class="field-label">clip_s</span>
					<span class="clip-range">
						<input type="number" min="4" max="12" bind:value={entry.scale.clip_s[0]} />–
						<input type="number" min="4" max="12" bind:value={entry.scale.clip_s[1]} />
					</span>
				</label>
				<label class="field">
					<span class="field-label">time of day</span>
					<select bind:value={entry.time_of_day}>
						{#each VOCAB.time_of_day as t}<option value={t}>{t}</option>{/each}
					</select>
				</label>
				<label class="field grow">
					<span class="field-label">weather</span>
					<input bind:value={entry.weather} placeholder="clear, brief clouds, …" />
				</label>
			</div>
		</section>

		<!-- S1 · Visual Novel — full scene/shot tree. -->
		<section class="stage">
			<h3 class="block-heading">S1 · Visual Novel <span class="muted">· G1</span></h3>
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

		<!-- S2 · Scene base look. -->
		<section class="stage">
			<h3 class="block-heading">S2 · Scene base look <span class="muted">· {engine.scenes.length} spec(s)</span></h3>
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

		<!-- S3 · Shot sheets. -->
		<section class="stage">
			<h3 class="block-heading">S3 · Shot sheets <span class="muted">· {engine.specs.length} · G2</span></h3>
			{#each specsByScene(engine) as grp}
				<div class="shot-scene">
					<code class="ss-scene">{grp.scene.scene_id} · {grp.scene.time_of_day}</code>
					{#each grp.specs as sp}
						{@const slices = foldSlices(sp)}
						<article class="shot-sheet" class:open={openShot === sp.shot_id}>
							<header class="ss-head" role="button" tabindex="0"
								onclick={() => onToggleShot(openShot === sp.shot_id ? null : sp.shot_id)}
								onkeydown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onToggleShot(openShot === sp.shot_id ? null : sp.shot_id); } }}>
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
											{#each sp.content.beats as b}<li>{b}</li>{/each}
										</ul>
									{/if}
									{#if slices.length}
										<div class="ss-slices">
											{#each slices as sl}
												<div class="slice">
													<code class="slice-range">{sl.from_s}–{sl.to_s}s</code>
													<span class="slice-note">{sl.note}</span>
													<ul class="slice-deltas">
														{#each sl.deltas as d}<li><code>{d}</code></li>{/each}
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

		<!-- S4 · Prompt build (deterministic media prompts, not generated media). -->
		<section class="stage">
			<h3 class="block-heading">S4 · Prompt build
				<span class="muted">· deterministic media prompts · not generated media · {FRAME_RATE}fps</span>
			</h3>
			<p class="hint s4-note">
				Each shot's <b>image</b>/<b>video</b> text is what you feed a media model
				(base scene look + the shot's composition/lens/motion + identity-lock). It is
				derived, not generated — there are no images or clips here yet.
			</p>
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

		<!-- Timeline. -->
		<section class="stage">
			<h3 class="block-heading">Timeline <span class="muted">· verified · {engine.verify.total_frames}f</span></h3>
			<div class="tl-strip">
				{#each timelineRows(engine) as r}
					<span class="tl-cell" title={r.subject}>
						<code class="tl-id">{r.shot_id}</code>
						<span class="tl-subject">{r.subject}</span>
						<span class="tl-concern">{r.concern}</span>
						<span class="tl-frames">[{r.from_s}s–{r.to_s}s] · {r.frames}f · {r.transition_out}</span>
					</span>
				{/each}
			</div>
		</section>

		<!-- S5 · Verify. -->
		<section class="stage">
			<h3 class="block-heading">S5 · Verify</h3>
			{#if engine.verify.verified}
				<p class="verify ok">
					✓ ALL PASS — schema · tag-closure · counts · frame floor · invariants
				</p>
			{:else}
				<ul class="verify issues">
					{#each engine.verify.issues as iss}<li><code>{iss}</code></li>{/each}
				</ul>
			{/if}
		</section>
	</details>
{/if}

<style>
	/* Design tokens only (Template A): no new colors, hairlines, quiet.
	   Motion uses --transition-sin (additive token, design doc §6). */

	.muted {
		color: var(--text-muted);
		font-weight: 400;
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

	/* S4 "what is this" note (the prompts are deterministic text, not media). */
	.s4-note {
		font-size: 11px;
		color: var(--text-muted);
		margin: 0;
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

	/* ── Advanced disclosure (gates + G0 grid + S2–S5) ── */
	.advanced {
		margin-top: 8px;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		overflow: hidden;
	}
	.advanced-summary {
		position: relative;
		padding: 9px 34px 9px 12px;
		cursor: pointer;
		font-weight: 600;
		font-size: 12px;
		letter-spacing: 0.02em;
		user-select: none;
		background: var(--bg-tertiary);
		transition: background var(--transition-fast, 0.15s ease);
	}
	.advanced-summary:hover {
		background: var(--bg-hover);
	}
	.advanced-summary::after {
		content: '▸';
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		font-family: var(--font-mono);
		color: var(--text-muted);
		transition: transform var(--transition-sin, 0.4s);
	}
	.advanced[open] .advanced-summary::after {
		transform: translateY(-50%) rotate(90deg);
	}
	.advanced-summary .muted {
		font-weight: 400;
		margin-left: 8px;
		letter-spacing: 0.02em;
	}
	.advanced[open] .advanced-summary {
		border-bottom: 1px solid var(--border-color);
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
		border-radius: 5px;
		padding: 4px 6px;
		width: 100%;
		box-sizing: border-box;
		transition: border-color var(--transition-fast, 0.15s ease),
			box-shadow var(--transition-fast, 0.15s ease);
	}
	.field select:hover,
	.field input:hover {
		border-color: var(--border-light, var(--border-color));
	}
	.field select:focus,
	.field input:focus {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.2));
	}
	.field select {
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23808080' stroke-width='1.2'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 7px center;
		padding-right: 24px;
		cursor: pointer;
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
	.tl-subject {
		font-size: 10px;
		color: var(--text-primary);
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tl-concern {
		font-size: 9px;
		color: var(--text-muted);
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.hint {
		color: var(--text-muted);
		font-size: 11px;
	}

	/* ── Keyboard focus: one quiet accent ring across every interactive
	   affordance (buttons already have it via :focus-visible; cover the
	   summaries, gates, bars, and mini toggles here). ── */
	.ss-head:focus-visible,
	.gate:focus-visible,
	.advanced-summary:focus-visible {
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
