<script lang="ts">
	// Design Lab — development-only gallery for the three visual-language
	// templates. Renders the SAME shared fixture (DesignFrame) at a fixed
	// viewport, switchable between A / B / C without reloading. Optional
	// "compare all three" mode stacks the three frames at the same size for
	// side-by-side evaluation. No production state, store, or IPC is used.
	import DesignFrame from './DesignFrame.svelte';

	type Template = 'a' | 'b' | 'c';

	let active = $state<Template>('a');
	let compare = $state(false);
	let preset = $state(0);

	// Fixed evaluation viewports. Primary = 1440×900; the others test the
	// responsive behavior at 1280×800 and a narrower 1120×700.
	const VIEWPORTS = [
		{ w: 1440, h: 900, label: '1440 × 900', note: 'primary' },
		{ w: 1280, h: 800, label: '1280 × 800', note: 'medium' },
		{ w: 1120, h: 700, label: '1120 × 700', note: 'narrow' },
	] as const;
	const view = $derived(VIEWPORTS[preset]);

	const TEMPLATES: Array<{ id: Template; name: string; blurb: string }> = [
		{ id: 'a', name: 'A — Open Canvas', blurb: 'Uninterrupted workspace; hierarchy from alignment, whitespace, type and tonal difference.' },
		{ id: 'b', name: 'B — Editorial Workspace', blurb: 'Design-led; assertive typographic hierarchy, generous region spacing, imagery dominant.' },
		{ id: 'c', name: 'C — Precision Instrument', blurb: 'Controlled instrument; disciplined grid, crisper ruler measurement, organized density.' },
	];
</script>

<div class="lab">
	<header class="lab-bar">
		<div class="lab-title">
			<span class="lab-h">Design Lab</span>
			<span class="lab-sub">Visual-language templates · shared fixture · one palette</span>
		</div>

		<div class="lab-controls">
			<div class="lab-group" role="group" aria-label="Viewport">
				<span class="lab-group-label">Viewport</span>
				{#each VIEWPORTS as vp, i (vp.label)}
					<button
						class="lab-btn"
						class:is-active={preset === i}
						onclick={() => (preset = i)}
					>{vp.label}<em>{vp.note}</em></button>
				{/each}
			</div>

			<div class="lab-group" role="group" aria-label="Mode">
				<span class="lab-group-label">Mode</span>
				<button class="lab-btn" class:is-active={!compare} onclick={() => (compare = false)}>Switch</button>
				<button class="lab-btn" class:is-active={compare} onclick={() => (compare = true)}>Compare all three</button>
			</div>
		</div>
	</header>

	<!-- Simple switcher above the preview(s) -->
	{#if !compare}
		<div class="lab-switcher" role="group" aria-label="Template">
			{#each TEMPLATES as t (t.id)}
				<button
					class="lab-tab"
					class:is-active={active === t.id}
					aria-pressed={active === t.id}
					onclick={() => (active = t.id)}
				>
					<span class="lab-tab-name">{t.name}</span>
					<span class="lab-tab-blurb">{t.blurb}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Fixed-viewport stage(s). Same session, same dimensions, same state. -->
	<div class="lab-stage-wrap">
		{#if compare}
			{#each TEMPLATES as t (t.id)}
				<section class="lab-stage-block">
					<div class="lab-stage-label">
						<span class="lab-stage-name">{t.name}</span>
						<span class="lab-stage-dims">{view.label}</span>
					</div>
					<div class="lab-stage" style="width: {view.w}px; height: {view.h}px;">
						<DesignFrame template={t.id} />
					</div>
				</section>
			{/each}
		{:else}
			<section class="lab-stage-block">
				<div class="lab-stage-label">
					<span class="lab-stage-name">{TEMPLATES.find((t) => t.id === active)?.name}</span>
					<span class="lab-stage-dims">{view.label}</span>
				</div>
				<div class="lab-stage" style="width: {view.w}px; height: {view.h}px;">
					<DesignFrame template={active} />
				</div>
			</section>
		{/if}
	</div>

	<!-- In-page design rules reference (the full doc lives in design-lab.md) -->
	<details class="lab-doc">
		<summary>Design rules &amp; migration notes</summary>
		<div class="lab-doc-body">
			<p><b>Scope.</b> These are visual-language explorations only. Same content fixture, same palette, same application state. Differences are expressed through geometry, composition, typography, spacing, and surface treatment — not color, features, or data. Nothing here mutates the composer store, generation logic, or the frame→pixel coordinate invariant.</p>

			<h4>A — Open Canvas</h4>
			<p>Square region geometry, one small-radius convention for controls. Continuous workspace surface: the pipe and its rows sit directly on the canvas; thumbnail chips drop their nested card frames so imagery floats. Subtle hairline separators only where adjacent regions need a boundary. Natural capitalization; weight + spacing carry hierarchy; monospace reserved for timecodes/frames/seeds. Ruler is fine-grained and subordinate; spans are compact and nearly rectangular; the playhead is a quiet 1px line with a small cap — locatable without weight.</p>

			<h4>B — Editorial Workspace</h4>
			<p>Assertive typographic scale (larger region + selected-object headings, quiet metadata). Generous spacing between major regions, tight spacing within related control groups. Preview and keyframe imagery dominate; groupings are made by whitespace, not enclosing every group. Long spans communicate duration through geometry (lower fill opacity, taller lanes) rather than heavy color. Hairline rules separate inspector regions intentionally.</p>

			<h4>C — Precision Instrument</h4>
			<p>Disciplined grid and precise alignment; functional relationships via indentation, shared baselines, consistent labels. More visible separators than A, fewer than the current design. Compact controls, rectangular spans, minimal rounded containers, no faux-metal or shadows. Ruler has a stronger measurement structure (denser, crisper ticks + full baseline); resize handles are precise marks that brighten on hover; selected vs unselected is a crisp accent outline.</p>

			<h4>Coordinate invariant (kept intact)</h4>
			<p>Every timeline lane is full-width with zero left padding/border; absolute <code>left: Xpx</code> comes from the real <code>frameToPx()</code> measured against one shared coordinate element — exactly as in <code>TimelineSection.svelte</code>. No template may reintroduce a lane padding or box border that shifts the x-origin.</p>

			<h4>Where each rule maps (migration surface)</h4>
			<p>
				Geometry &amp; region chrome → <code>Workspace.svelte</code> (left-column / composer-area / panel borders),
				<code>ComposerPanel.svelte</code> (<code>.pipe</code> card + radius),
				<code>composer-row.css</code> (row headers).<br />
				Keyframe/subject chips → <code>ComposerRows/KeyframesRow.svelte</code>,
				<code>ComposerRows/SubjectRefsRow.svelte</code> (chip card vs float-on-canvas).<br />
				Timeline spans, pills, grips, ruler → <code>composer-timeline.css</code>
				(<code>.segment-body</code>, <code>.tag-body</code>, <code>.pill</code>, FrameRuler).<br />
				Inspector groups → <code>ToolsPanel.svelte</code> (section cards, stat cells, settings rows).<br />
				Top strip + media framing → <code>Frame.svelte</code>.
			</p>
			<p class="lab-doc-note">Full scoring, recommendation, and step-by-step migration plan: <code>src/design-lab/design-lab.md</code>.</p>
		</div>
	</details>
</div>

<style>
	.lab {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		height: 100%;
		overflow: auto;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
	}
	.lab *, .lab *::before, .lab *::after { box-sizing: border-box; }

	.lab-bar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 16px;
		padding: 12px 18px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
	}
	.lab-h { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
	.lab-sub { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
	.lab-controls { display: flex; gap: 20px; flex-wrap: wrap; }
	.lab-group { display: flex; align-items: center; gap: 6px; }
	.lab-group-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-right: 2px; }
	.lab-btn {
		padding: 6px 10px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		border-radius: 6px;
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.lab-btn em { font-style: normal; font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
	.lab-btn.is-active { background: var(--accent); border-color: transparent; color: var(--text-inverse); }
	.lab-btn.is-active em { color: var(--text-inverse); opacity: 0.8; }

	.lab-switcher {
		display: flex;
		gap: 8px;
		padding: 12px 18px;
		background: var(--bg-secondary);
		border-bottom: 1px solid var(--border);
	}
	.lab-tab {
		flex: 1;
		text-align: left;
		padding: 10px 14px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-secondary);
		cursor: pointer;
		font-family: inherit;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.lab-tab-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
	.lab-tab-blurb { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
	.lab-tab.is-active { border-color: var(--accent); background: var(--accent-bg); }
	.lab-tab.is-active .lab-tab-name { color: var(--accent); }

	.lab-stage-wrap {
		display: flex;
		flex-direction: column;
		gap: 26px;
		padding: 22px;
		align-items: center;
		overflow-x: auto;
	}
	.lab-stage-block { flex: 0 0 auto; }
	.lab-stage-label {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin: 0 2px 8px;
	}
	.lab-stage-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
	.lab-stage-dims { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); }
	.lab-stage {
		flex: 0 0 auto;
		border: 1px solid var(--border-light, var(--border));
		border-radius: 4px;
		overflow: hidden;
		background: var(--bg-primary);
		/* the DesignFrame fills this exact box, so the timeline measures a
		   real, consistent coordinate width for placement. */
	}

	.lab-doc {
		margin: 0 22px 22px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-secondary);
		overflow: hidden;
	}
	.lab-doc summary {
		padding: 10px 14px;
		font-size: 12px;
		font-weight: 700;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
	}
	.lab-doc-body { padding: 4px 16px 16px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.6; }
	.lab-doc-body h4 { color: var(--text-primary); font-size: 13px; margin: 14px 0 4px; }
	.lab-doc-body p { margin: 6px 0; }
	.lab-doc-body code { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent); }
	.lab-doc-note { color: var(--text-muted); font-size: 11px; margin-top: 12px; }
</style>
