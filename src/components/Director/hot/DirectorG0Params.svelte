<script lang="ts">
	// Front-loaded G0 seed parameters (the knobs that STEER a generation).
	// Presentational child of DirectorHotPath — all state is parent-owned via
	// the $bindable `entry`; this component only renders the controls and
	// writes back through the binding. Disabled while a run is in flight.
	//
	// These used to live INSIDE the Advanced disclosure (engine-gated), so
	// they were only reachable AFTER a run completed. Several of them are
	// pre-generation specific (they shape the next run), so the panel now
	// front-loads them into the hot path, always visible.
	import {
		GENRE_PRESETS,
		RATIOS,
		VOCAB,
		type EngineEntryInput,
	} from '$lib/directorStore/engine';
	import MoodSlider from '../adv/MoodSlider.svelte';

	let {
		entry = $bindable(),
		disabled = false,
	} = $props<{
		/** The G0 entry (parent-owned; every control writes back here). */
		entry: EngineEntryInput;
		/** While a run is in flight the seed params are read-only. */
		disabled?: boolean;
	}>();
</script>

<!-- ── ② DIRECTION PARAMETERS — the pre-generation knobs, front-loaded ──
	     Always visible (not engine-gated): mood, format, scale, time & weather
	     all shape the NEXT run, so they must be reachable before it finishes. -->
<section class="stage params" aria-label="Direction parameters" class:is-disabled={disabled}>
	<h3 class="block-heading">
		② DIRECTION PARAMETERS <span class="muted">· steer the next run</span>
	</h3>
	<div class="g0-grid">
		<!-- Mood: one 0..100 control that reshapes clips / transitions /
		     motion / effects + contrast in a single move. Spans the row. -->
		<MoodSlider bind:mood={entry.mood} />

		<label class="field grow">
			<span class="field-label">title</span>
			<input bind:value={entry.title} placeholder="optional film title (defaults from the idea)" disabled={disabled} />
		</label>
		<label class="field">
			<span class="field-label">genre</span>
			<select bind:value={entry.genre.name} disabled={disabled}>
				{#each GENRE_PRESETS as g}<option value={g.name}>{g.name}</option>{/each}
			</select>
		</label>
		<label class="field grow">
			<span class="field-label">style</span>
			<input bind:value={entry.genre.style} placeholder="visual style string" disabled={disabled} />
		</label>
		<label class="field">
			<span class="field-label">ratio</span>
			<select bind:value={entry.ratio} disabled={disabled}>
				{#each RATIOS as r}<option value={r}>{r}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span class="field-label">scenes</span>
			<input type="number" min="1" max="24" bind:value={entry.scale.scenes} disabled={disabled} />
		</label>
		<label class="field">
			<span class="field-label">shots/scene</span>
			<input type="number" min="1" max="5" bind:value={entry.scale.shots_per_scene} disabled={disabled} />
		</label>
		<label class="field">
			<span class="field-label">clip_s</span>
			<span class="clip-range">
				<input type="number" min="4" max="12" bind:value={entry.scale.clip_s[0]} disabled={disabled} />–
				<input type="number" min="4" max="12" bind:value={entry.scale.clip_s[1]} disabled={disabled} />
			</span>
		</label>
		<label class="field">
			<span class="field-label">time of day</span>
			<select bind:value={entry.time_of_day} disabled={disabled}>
				{#each VOCAB.time_of_day as t}<option value={t}>{t}</option>{/each}
			</select>
		</label>
		<label class="field grow">
			<span class="field-label">weather</span>
			<input bind:value={entry.weather} placeholder="clear, brief clouds, …" disabled={disabled} />
		</label>
	</div>
</section>

<style>
	/* Template A: continuous surface, hairlines, quiet, no new color families.
	   The parameter panel reads as one tidy card in the hot path. */
	.params {
		border-top: none;
		border: 1px solid var(--border-color);
		border-radius: 12px;
		background: var(--bg-secondary);
		padding: 14px 16px;
		gap: 10px;
		box-shadow: var(--shadow-sm, none);
	}
	.params.is-disabled {
		opacity: 0.6;
	}
	.params.is-disabled .field input,
	.params.is-disabled .field select {
		pointer-events: none;
	}

	/* Section heading: quiet hairline text + the theme's accent tick. */
	.block-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		margin: 0;
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
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}

	/* The parameter grid: auto-wrapping, responsive, tidy. Mood slider spans
	   the full row; `.grow` fields span two columns on wide layouts. */
	.g0-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px 12px;
	}
	/* The mood slider's own scoped .mood-field rule already spans the full
	   grid row (grid-column: 1 / -1) inside its markup. */
	.g0-grid > .field {
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.field.grow {
		/* Two-column span on wide grids (falls back to one column when the
		   auto-fit track is narrow). */
		min-width: 0;
	}
	.field-label {
		font-family: var(--font-mono, monospace);
		font-size: 10px;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}
	.field select,
	.field input {
		font: inherit;
		font-size: 12px;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		padding: 5px 7px;
		width: 100%;
		box-sizing: border-box;
		transition: border-color var(--transition-sin, 0.3s),
			box-shadow var(--transition-sin, 0.3s);
	}
	.field select:hover:not(:disabled),
	.field input:hover:not(:disabled) {
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
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23808080' stroke-width='1.2'/%3E%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 8px center;
		padding-right: 24px;
		cursor: pointer;
	}
	.field input:disabled,
	.field select:disabled {
		opacity: 0.6;
	}
	.field input[type='number'] {
		width: 100%;
	}
	.clip-range {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		color: var(--text-muted);
	}
	.clip-range input {
		width: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			transition-duration: 0.001ms !important;
		}
	}
</style>
